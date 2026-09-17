/* /api/entries/overtime — R46-8: إدخال الأوفر تايم
   GET (?month=YYYY-MM) → list overtime entries
   POST → create an entry (select employee by name, hours)
   DELETE → remove an entry
   R56: المنطق المشترك (مطابقة الموظف / خرائط الأقسام / تحقق الشهر
        والتاريخ) اتنقل لـ lib/marib/entries.ts — نفس السلوك بالظبط. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requireEntryRead } from "@/lib/marib/http";
import { matchEmployee, loadEmpMap, loadDeptMap, monthParam, isDayStr, deleteEntry } from "@/lib/marib/entries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("entries:overtime");

export async function GET(req: NextRequest) {
  try {
    /* R63: حارس قراءة الإدخال — data.view أو data.upload */
    const g = await requireEntryRead(req);
    if (g.res) return g.res;

    const month = monthParam(req.nextUrl.searchParams);
    if (!month) return fail("month", 400);

    const rows = await q(
      `SELECT id, month_key, to_char(date, 'YYYY-MM-DD') AS date_str, emp_id, emp_code, emp_name, dept_id, dept_name, line_id, hours, note, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
       FROM marib_overtime WHERE month_key = $1 ORDER BY date ASC, created_at ASC`,
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
          dept_name: (r.dept_name as string) || ((r.dept_id as string) ? (deptMap[r.dept_id as string] || "") : ""),
          line_id: r.line_id || "",
          hours: r.hours,
          note: r.note || "",
          actor: r.actor,
          created: r.created,
          matched: !!emp,
        };
      }),
    });
  } catch (e) {
    return serverFail("entries:overtime", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const date = String(body.date || "");
    const empCode = String(body.emp_code || "").trim();
    const empName = String(body.emp_name || "").trim();
    /* R50: القسم والخط بقوا نص — أقسام الأرضية الخمسة وخطوط 1..5 */
    const deptId = String(body.dept_id || "");
    const deptName = String(body.dept || "").trim().slice(0, 60);
    const lineId = String(body.line || body.line_id || "").trim().slice(0, 20);
    const hours = parseFloat(String(body.hours || "0"));
    const note = String(body.note || "").trim().slice(0, 200);

    if (!isDayStr(date)) return fail("date", 400);
    if (hours <= 0 || hours > 24) return fail("hours", 400);
    if (!empCode && !empName) return fail("emp", 400);

    /* match employee by code or name — shared helper (R56). القسم
       النصي من الطلب هو fallback: بيفضل لو الموظف ملقوش أو من غير قسم. */
    const { empId, deptId: resolvedDeptId } = await matchEmployee(empCode, empName, deptId || null);

    const monthKey = date.slice(0, 7);
    const id = crypto.randomUUID();
    await q(
      `INSERT INTO marib_overtime (id, month_key, date, emp_id, emp_code, emp_name, dept_id, dept_name, line_id, hours, note, actor)
       VALUES ($1, $2, $3::date, NULLIF($4, ''), $5, $6, NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), $10, $11, $12)`,
      [id, monthKey, date, empId || null, empCode, empName, resolvedDeptId || null, deptName || null, lineId || null, hours, note, me.username]
    );
    await audit(me.username, "create", "entries:overtime", id, { date, emp: empCode || empName, hours, matched: !!empId, dept: deptName });
    lg.info("overtime entry created", { by: me.username, date, emp: empCode || empName, hours, matched: !!empId, dept: deptName });

    return NextResponse.json({ ok: true, id, matched: !!empId });
  } catch (e) {
    return serverFail("entries:overtime", "POST", e);
  }
}

/* R59: جسم الـ DELETE المشترك اتنقل لـ deleteEntry (lib) — نفس السلوك */
export async function DELETE(req: NextRequest) {
  return deleteEntry(req, "overtime");
}
