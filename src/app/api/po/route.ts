/* /api/po — R58: ريفرانس كمية العقد لكل PO (طلب المالك في الإدخال)
   GET  (بدون بارامترات)        → قائمة كل الـ POs (العقد/المصنوع/المتبقي)
   GET  ?po=PO-123[&dept=&line=] → تفاصيل PO واحد: العقد + المصنوع
        الكلي + تفصيل بالتاريخ (+ فلتر القسم/الخط للتولتيب)
   GET  ?template=1              → تنزيل تيمبلت الإكسل (PO + كمية العقد)
   POST {po, contract_qty}       → إضافة/تعديل كمية عقد (upsert)
   POST ?action=import {rows}    → رفع التيمبلت (الواجهة بتقرا الإكسل
                                   وتبعت الصفوف — نفس نمط الغياب)
   DELETE ?po=                   → حذف PO من الريفرانس (الإنتاج بيفضل)
   كل عملية كتابة بتسجل في الـ audit log. الأذونات: القراءة data.view،
   الكتابة data.upload edit — نفس أذونات الإدخال نفسه. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requirePerm } from "@/lib/marib/http";
import { XBook } from "@/lib/marib/xlsx-writer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("po");

/* ألوان التيمبلت — نفس هوية الغياب (denim/gold) */
const C = {
  denim2: "FF1D2E4C",
  gold: "FFD9A86B",
  txt: "FF1F2937",
  line: "FFB9C4D4",
};

/* ---- استعلام المصنوع لكل PO في قايمة (استعلام واحد للتجميع) ---- */
async function madeByPo(pos: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!pos.length) return out;
  const rows = await q(
    `SELECT po_number, COALESCE(SUM(qty), 0)::int AS made
     FROM marib_prod WHERE po_number = ANY($1::text[]) GROUP BY po_number`,
    [pos]
  );
  for (const r of rows) out[r.po_number as string] = r.made as number;
  return out;
}

/* فلاتر القسم/الخط بتتبني كنص + بارامترات مرتبة — مستخدمة في
   استعلامين التفاصيل عشان الترتيب يفضل واضح.
   base = أول رقم بارامتر للفلاتر ($1 بتاع الـ PO قبلها). */
function scopeFilters(dept: string, line: string, base: number): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (dept) {
    params.push(dept);
    parts.push(`COALESCE(dept_name, dept_id, '') = $${base + params.length}::text`);
  }
  if (line) {
    params.push(line);
    parts.push(`line_id = $${base + params.length}`);
  }
  return { sql: parts.length ? "AND " + parts.join(" AND ") : "", params };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    if (sp.get("template") === "1") return downloadTemplate(req);

    const g = await requirePerm(req, "data.view", "view");
    if (g.res) return g.res;

    /* تفاصيل PO واحد — الخانات والتولتيب في نموذج الإدخال */
    const po = (sp.get("po") || "").trim();
    if (po) {
      const dept = (sp.get("dept") || "").trim();
      const line = (sp.get("line") || "").trim();
      const rec = await q(
        "SELECT po, contract_qty FROM marib_po WHERE po = $1 LIMIT 1",
        [po]
      );
      /* تفصيل بالتاريخ (مع فلاتر القسم/الخط) — للتولتيب. الـ PO هو $1
         ففلاتر القسم/الخط بتبدأ من $2 (درس E2E: الإزاحة دي كانت
         ناقصة والـ bind كان بيفشل بـ "supplies 3, requires 2"). */
      const f1 = scopeFilters(dept, line, 1);
      const rows = await q(
        `SELECT to_char(date, 'YYYY-MM-DD') AS d, COALESCE(SUM(qty), 0)::int AS made
         FROM marib_prod WHERE po_number = $1 ${f1.sql}
         GROUP BY date ORDER BY date DESC LIMIT 31`,
        [po, ...f1.params]
      );
      /* إجمالي القسم/الخط المحددين (نطاق التولتيب) */
      const totals = await q(
        `SELECT COALESCE(SUM(qty), 0)::int AS made,
                COUNT(*)::int AS n,
                MIN(to_char(date, 'YYYY-MM-DD')) AS first_day,
                MAX(to_char(date, 'YYYY-MM-DD')) AS last_day
         FROM marib_prod WHERE po_number = $1 ${f1.sql}`,
        [po, ...f1.params]
      );
      /* المصنوع الكلي للـ PO (من غير فلاتر) لحساب المتبقي */
      const grand = await q(
        "SELECT COALESCE(SUM(qty), 0)::int AS made FROM marib_prod WHERE po_number = $1",
        [po]
      );
      /* R60: حراس narrow بدل القراءة المباشرة — استعلام LIMIT 1 يعني
         العنصر موجود أو مش موجود، والـ aggregate بيرجع صف واحد دايمًا */
      const po0 = rec[0];
      const t0 = totals[0];
      const contract = po0 ? (po0.contract_qty as number) : 0;
      const madeAll = (grand[0]?.made ?? 0) as number;
      return NextResponse.json({
        po,
        known: !!po0,
        contract_qty: contract,
        made_total: madeAll,
        made_scope: (t0?.made ?? 0) as number,
        scope_days: (t0?.n ?? 0) as number,
        scope_first: t0?.first_day || null,
        scope_last: t0?.last_day || null,
        left: po0 ? Math.max(0, contract - madeAll) : null,
        days: rows.map((r) => ({ date: r.d, made: r.made })),
      });
    }

    /* القايمة الكاملة — صفحة إدارة الـ POs */
    const list = await q(
      "SELECT po, contract_qty, note, actor, updated_at FROM marib_po ORDER BY po ASC"
    );
    const made = await madeByPo(list.map((r) => r.po as string));
    return NextResponse.json({
      pos: list.map((r) => ({
        po: r.po,
        contract_qty: r.contract_qty,
        made: made[r.po as string] || 0,
        left: Math.max(0, (r.contract_qty as number) - (made[r.po as string] || 0)),
        note: r.note || "",
        actor: r.actor,
      })),
    });
  } catch (e) {
    return serverFail("po", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("action") === "import") return importTemplate(req);

    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const po = String(body.po || "").trim().slice(0, 40);
    const qty = parseInt(String(body.contract_qty || "0"), 10);
    const note = String(body.note || "").trim().slice(0, 200);
    if (!po) return fail("po", 400);
    if (!(qty > 0)) return fail("qty", 400);

    /* upsert: كتابة مباشرة من الموقع أو أول مرة في نموذج الإدخال */
    const exists = await q("SELECT po FROM marib_po WHERE po = $1", [po]);
    await q(
      `INSERT INTO marib_po (po, contract_qty, note, actor, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (po) DO UPDATE
         SET contract_qty = EXCLUDED.contract_qty,
             note = EXCLUDED.note,
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
      [po, qty, note, me.username]
    );
    await audit(me.username, exists.length ? "edit" : "create", "po:" + po, po, { qty });
    lg.info("po contract saved", { by: me.username, po, qty });
    return NextResponse.json({ ok: true, po, contract_qty: qty });
  } catch (e) {
    return serverFail("po", "POST", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const po = (req.nextUrl.searchParams.get("po") || "").trim();
    if (!po) return fail("po", 400);
    const rows = await q("SELECT po FROM marib_po WHERE po = $1", [po]);
    if (!rows.length) return fail("notfound", 404);
    /* حذف الريفرانس بس — سجلات marib_prod بتفضل زي ما هي (مقدسة) */
    await q("DELETE FROM marib_po WHERE po = $1", [po]);
    await audit(me.username, "delete", "po:" + po, po, null);
    lg.info("po deleted", { by: me.username, po });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("po", "DELETE", e);
  }
}

/* ---- تيمبلت الإكسل: عمود PO + عمود كمية العقد (+ شيت تعليمات) ---- */
async function downloadTemplate(req: NextRequest) {
  try {
    const g = await requirePerm(req, "data.view", "view");
    if (g.res) return g.res;

    const wb = new XBook();
    const sh = wb.sheet("POs", { rtl: true, freezeRows: 1, widths: [10, 26, 16, 30], defaultRowHeight: 18 });
    const header: [string, "right" | "center"][] = [
      ["p", "center"],
      ["رقم PO", "center"],
      ["كمية العقد", "center"],
      ["ملاحظات", "right"],
    ];
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

    const ins = wb.sheet("التعليمات", { rtl: true, widths: [100], defaultRowHeight: 20 });
    const nowT = new Date();
    const stampT = `${nowT.getFullYear()}-${String(nowT.getMonth() + 1).padStart(2, "0")}-${String(nowT.getDate()).padStart(2, "0")}`;
    const lines: [string, boolean][] = [
      [`تيمبلت عقود الـ PO — ${stampT}`, true],
      ["اكتب رقم الـ PO وكمية العقد، وارفع الملف من نفس صفحة الإدخال (تاب الإنتاج ← رفع تيمبلت POs).", false],
      ["", false],
      ["ملاحظات مهمة:", true],
      ["· الـ PO الموجود أصلًا في الموقع: كميته هتتحدث بالقيمة الجديدة.", false],
      ["· الـ PO الجديد: هيتسجل كميزانية العقد بتاعته.", false],
      ["· عمود ملاحظات اختياري.", false],
      ["· عمود p مجرد ترقيم — متغيّرهش.", false],
      ["· أي صف فاضي بيتجاهل.", false],
    ];
    lines.forEach(([txt, bold], i) => {
      ins.cell(i + 1, 1, txt, {
        font: { size: bold ? 12 : 11, bold, color: bold ? C.gold : C.txt },
        align: { h: "right", v: "middle" },
      });
    });

    const buf = wb.build();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="PO-Template-${stampT}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return serverFail("po", "template", e);
  }
}

/* ---- رفع التيمبلت: rows = [[p, po, qty, note], ...] (نفس نمط الغياب:
       الواجهة بتقرا الإكسل بالـ XLSX وتبعت الصفوف JSON) ---- */
async function importTemplate(req: NextRequest) {
  try {
    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return fail("rows", 400);

    let inserted = 0, updated = 0, skipped = 0;
    for (const r of rows) {
      const arr = Array.isArray(r) ? r : [];
      const po = String(arr[1] || "").trim().slice(0, 40);
      const qty = parseInt(String(arr[2] ?? "").trim(), 10);
      const note = String(arr[3] || "").trim().slice(0, 200);
      if (!po) continue;
      if (!(qty > 0)) { skipped++; continue; }

      const exists = await q("SELECT po FROM marib_po WHERE po = $1", [po]);
      await q(
        `INSERT INTO marib_po (po, contract_qty, note, actor, updated_by)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (po) DO UPDATE
           SET contract_qty = EXCLUDED.contract_qty,
               note = CASE WHEN EXCLUDED.note = '' THEN marib_po.note ELSE EXCLUDED.note END,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by`,
        [po, qty, note, me.username]
      );
      if (exists.length) updated++; else inserted++;
    }

    await audit(me.username, "import", "po:template", null, { inserted, updated, skipped });
    lg.info("po template imported", { by: me.username, inserted, updated, skipped });
    return NextResponse.json({ ok: true, inserted, updated, skipped });
  } catch (e) {
    return serverFail("po", "import", e);
  }
}
