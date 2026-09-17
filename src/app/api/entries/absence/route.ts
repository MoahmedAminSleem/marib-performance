/* /api/entries/absence — R46-8: إدخال الغياب
   GET (?month=YYYY-MM) → list absence entries + match each to employee
   POST → create an absence entry
   POST /import → upload Excel template (code+name column), apply
   GET /template → download the absence Excel template
   DELETE → remove an entry
   R56: المنطق المشترك (مطابقة الموظف / خرائط الأقسام / تحقق الشهر
        والتاريخ) اتنقل لـ lib/marib/entries.ts — نفس السلوك بالظبط. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requireEntryRead } from "@/lib/marib/http";
import { matchEmployee, loadEmpMap, loadDeptMap, monthParam, isDayStr, deleteEntry } from "@/lib/marib/entries";
import { XBook } from "@/lib/marib/xlsx-writer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("entries:absence");

const C = {
  denim: "FF16233F",
  denim2: "FF24365C",
  gold: "FFD9A86B",
  line: "FFD5DCE8",
  txt: "FF1E2A3C",
  band: "FFF8FAFD",
  red: "FFC0392B",
};

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("template") === "1") return downloadTemplate(req);
    /* R63: حارس قراءة الإدخال — data.view أو data.upload */
    const g = await requireEntryRead(req);
    if (g.res) return g.res;

    const month = monthParam(sp);
    if (!month) return fail("month", 400);

    const rows = await q(
      `SELECT id, month_key, to_char(date, 'YYYY-MM-DD') AS date_str, emp_id, emp_code, emp_name, dept_id, reason, note, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
       FROM marib_absence WHERE month_key = $1 ORDER BY date ASC, created_at ASC`,
      [month]
    );

    const empMap = await loadEmpMap(Array.from(new Set(rows.map((r) => r.emp_id).filter(Boolean))) as string[]);
    const deptMap = await loadDeptMap(Array.from(new Set(rows.map((r) => r.dept_id).filter(Boolean))) as string[]);

    return NextResponse.json({
      month,
      entries: rows.map((r) => {
        const emp = r.emp_id ? empMap[r.emp_id as string] : undefined;
        return {
          id: r.id,
          month: r.month_key,
          date: r.date_str,
          emp_id: r.emp_id || "",
          emp_code: r.emp_code || (emp?.code || ""),
          emp_name: r.emp_name || (emp?.name || ""),
          job: emp?.job || "",
          dept_id: r.dept_id || (emp?.dept_id || ""),
          dept_name: (r.dept_id as string) ? (deptMap[r.dept_id as string] || "") : "",
          reason: r.reason || "",
          note: r.note || "",
          actor: r.actor,
          created: r.created,
          matched: !!emp,
        };
      }),
    });
  } catch (e) {
    return serverFail("entries:absence", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("action") === "import") return importTemplate(req);
    /* R64: كتابة الإدخال بمفتاحه الخاص — entry.edit */
    const g = await requirePermBody(req, "entry.edit", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const date = String(body.date || "");
    const empCode = String(body.emp_code || "").trim();
    const empName = String(body.emp_name || "").trim();
    const reason = String(body.reason || "").trim().slice(0, 100);
    const note = String(body.note || "").trim().slice(0, 200);

    if (!isDayStr(date)) return fail("date", 400);
    if (!empCode && !empName) return fail("emp", 400);

    /* match the employee by code (preferred) or name — shared helper (R56) */
    const { empId, deptId } = await matchEmployee(empCode, empName);

    const monthKey = date.slice(0, 7);
    const id = crypto.randomUUID();
    await q(
      `INSERT INTO marib_absence (id, month_key, date, emp_id, emp_code, emp_name, dept_id, reason, note, actor)
       VALUES ($1, $2, $3::date, NULLIF($4, ''), $5, $6, $7, $8, $9, $10)`,
      [id, monthKey, date, empId || null, empCode, empName, deptId || null, reason, note, me.username]
    );
    await audit(me.username, "create", "entries:absence", id, { date, emp_code: empCode, matched: !!empId });
    lg.info("absence entry created", { by: me.username, date, emp: empCode || empName, matched: !!empId });

    return NextResponse.json({ ok: true, id, matched: !!empId });
  } catch (e) {
    return serverFail("entries:absence", "POST", e);
  }
}

/* R59: جسم الـ DELETE المشترك اتنقل لـ deleteEntry (lib) — نفس السلوك */
export async function DELETE(req: NextRequest) {
  return deleteEntry(req, "absence");
}

/* R46-8: download the absence Excel template — one column for code, one
   for name. The user fills it and re-uploads. The server matches by
   code first, then by name. Unmatched rows are returned as errors. */
async function downloadTemplate(req: NextRequest) {
  try {
    /* R63: التيمبلت جزء من عملية الإدخال — نفس حارس القراءة */
    const g = await requireEntryRead(req);
    if (g.res) return g.res;

    const wb = new XBook();
    const sh = wb.sheet("Absence", { rtl: true, freezeRows: 1, widths: [8, 14, 30, 30], defaultRowHeight: 18 });
    /* (R48) النوع كان متصرّح غلط [string, string, align] — القيم
       فعليًا [label, align] ثنائية. اتصحح التصريح مش القيم. */
    const header: [string, "right" | "center"][] = [
      ["p", "center"],
      ["الكود", "center"],
      ["الاسم", "right"],
      ["السبب", "right"],
    ];
    /* header row */
    header.forEach(([label, h], i) => {
      sh.cell(1, i + 1, label, {
        font: { size: 11, bold: true, color: "FFFFFFFF" },
        fill: C.denim2,
        align: { h, v: "middle" },
        border: C.line,
      });
    });
    sh.row(1, { height: 22 });
    sh.filter("A1:D1");

    /* instructions sheet */
    const ins = wb.sheet("التعليمات", { rtl: true, widths: [100], defaultRowHeight: 20 });
    const nowT = new Date();
    const stampT = `${nowT.getFullYear()}-${String(nowT.getMonth() + 1).padStart(2, "0")}-${String(nowT.getDate()).padStart(2, "0")}`;
    const lines: [string, boolean][] = [
      [`تيمبلت الغياب — ${stampT}`, true],
      ["الملف ده للغياب بس. اكتب الكود أو الاسم، والسبب لو عندك، وارفع الملف تاني من نفس صفحة الغياب.", false],
      ["", false],
      ["ملاحظات مهمة:", true],
      ["· الكود هو الأول — لو كتبت الكود صح، الموقع هيلقاه على طول.", false],
      ["· الاسم اختياري — بس لو الكود فاضي، الموقع بيدور بالاسم. لو في أكتر من موظف بنفس الاسم، الموقع هيرجعلك قايمة بكل المطابقات.", false],
      ["· لو الموقع ملقاش لا الكود ولا الاسم — السجل بيتسجل كعدد في القسم بتاعه (لو حددته)، أو كعدد عام لحد ما يترفع على الاتزان.", false],
      ["· عمود p مجرد ترقيم — متغيّرهش.", false],
      ["· تقدر تمسح أي صف — الموقع هيتجاهل أي صف فاضي.", false],
    ];
    lines.forEach(([txt, bold], i) => {
      ins.cell(i + 1, 1, txt, {
        font: { size: bold ? 12 : 11, bold, color: bold ? C.gold : C.txt },
        align: { h: "right", v: "middle" },
      });
    });

    const buf = wb.build();
    /* (R48) نفس الـ cast المتبع في manpower/export — Uint8Array
       مقبول runtime كـ body، بس TS محتاج توضيح. */
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Absence-Template-${stampT}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return serverFail("entries:absence", "template", e);
  }
}

/* R46-8: import the absence template — read the Excel, parse rows,
   match each to an employee by code/name, insert into marib_absence. */
async function importTemplate(req: NextRequest) {
  try {
    /* R64: رفع التيمبلت = تعديل إدخال — entry.edit */
    const g = await requirePermBody(req, "entry.edit", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const date = String(body.date || "");
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!isDayStr(date)) return fail("date", 400);
    if (!rows.length) return fail("rows", 400);

    const monthKey = date.slice(0, 7);
    let inserted = 0, unmatched = 0;
    const unmatchedList: { code: string; name: string }[] = [];

    for (const r of rows) {
      const arr = Array.isArray(r) ? r : [];
      const empCode = String(arr[1] || "").trim();
      const empName = String(arr[2] || "").trim();
      const reason = String(arr[3] || "").trim().slice(0, 100);
      if (!empCode && !empName) continue;

      const { empId, deptId } = await matchEmployee(empCode, empName);

      if (!empId) unmatched++;
      const id = crypto.randomUUID();
      await q(
        `INSERT INTO marib_absence (id, month_key, date, emp_id, emp_code, emp_name, dept_id, reason, note, actor)
         VALUES ($1, $2, $3::date, NULLIF($4, ''), $5, $6, $7, $8, '', $9)`,
        [id, monthKey, date, empId || null, empCode, empName, deptId || null, reason, me.username]
      );
      if (!empId) unmatchedList.push({ code: empCode, name: empName });
      inserted++;
    }

    await audit(me.username, "import", "entries:absence", null, { date, inserted, unmatched });
    lg.info("absence import", { by: me.username, date, inserted, unmatched });
    return NextResponse.json({ ok: true, inserted, unmatched, unmatched_list: unmatchedList });
  } catch (e) {
    return serverFail("entries:absence", "import", e);
  }
}
