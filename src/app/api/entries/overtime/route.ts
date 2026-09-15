/* /api/entries/overtime — R46-8: إدخال الأوفر تايم
   GET (?month=YYYY-MM) → list overtime entries
   POST → create an entry (select employee by name, hours)
   DELETE → remove an entry */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requirePerm } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("entries:overtime");

export async function GET(req: NextRequest) {
  try {
    const g = await requirePerm(req, "data.view", "view");
    if (g.res) return g.res;

    const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("month", 400);

    const rows = await q(
      `SELECT id, month_key, to_char(date, 'YYYY-MM-DD') AS date_str, emp_id, emp_code, emp_name, dept_id, line_id, hours, note, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
       FROM marib_overtime WHERE month_key = $1 ORDER BY date ASC, created_at ASC`,
      [month]
    );

    const empIds = Array.from(new Set(rows.map((r) => r.emp_id).filter(Boolean))) as string[];
    let empMap: Record<string, { code: string; name: string; job: string; dept_id: string }> = {};
    if (empIds.length) {
      const er = await q(`SELECT id, code, name, job, dept_id FROM marib_emp WHERE id = ANY($1::text[])`, [empIds]);
      for (const r of er) empMap[r.id as string] = {
        code: r.code as string, name: r.name as string, job: r.job as string, dept_id: r.dept_id as string,
      };
    }
    const deptIds = Array.from(new Set(rows.map((r) => r.dept_id).filter(Boolean))) as string[];
    let deptMap: Record<string, string> = {};
    if (deptIds.length) {
      const dr = await q(`SELECT id, name FROM marib_dept WHERE id = ANY($1::text[])`, [deptIds]);
      for (const r of dr) deptMap[r.id as string] = r.name as string;
    }

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
    const deptId = String(body.dept_id || "");
    const lineId = String(body.line_id || "");
    const hours = parseFloat(String(body.hours || "0"));
    const note = String(body.note || "").trim().slice(0, 200);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date", 400);
    if (hours <= 0 || hours > 24) return fail("hours", 400);
    if (!empCode && !empName) return fail("emp", 400);

    /* match employee by code or name */
    let empId: string | null = null;
    let resolvedDeptId: string | null = deptId || null;
    if (empCode) {
      const er = await q("SELECT id, dept_id FROM marib_emp WHERE code = $1 LIMIT 1", [empCode]);
      if (er.length) { empId = er[0].id as string; resolvedDeptId = (er[0].dept_id as string) || resolvedDeptId; }
    }
    if (!empId && empName) {
      const er = await q("SELECT id, dept_id FROM marib_emp WHERE name = $1 LIMIT 1", [empName]);
      if (er.length) { empId = er[0].id as string; resolvedDeptId = (er[0].dept_id as string) || resolvedDeptId; }
    }

    const monthKey = date.slice(0, 7);
    const id = crypto.randomUUID();
    await q(
      `INSERT INTO marib_overtime (id, month_key, date, emp_id, emp_code, emp_name, dept_id, line_id, hours, note, actor)
       VALUES ($1, $2, $3::date, NULLIF($4, ''), $5, $6, NULLIF($7, ''), NULLIF($8, ''), $9, $10, $11)`,
      [id, monthKey, date, empId || null, empCode, empName, resolvedDeptId || null, lineId || null, hours, note, me.username]
    );
    await audit(me.username, "create", "entries:overtime", id, { date, emp: empCode || empName, hours, matched: !!empId });
    lg.info("overtime entry created", { by: me.username, date, emp: empCode || empName, hours, matched: !!empId });

    return NextResponse.json({ ok: true, id, matched: !!empId });
  } catch (e) {
    return serverFail("entries:overtime", "POST", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) return fail("id", 400);

    const rows = await q("SELECT id FROM marib_overtime WHERE id = $1", [id]);
    if (!rows.length) return fail("notfound", 404);
    await q("DELETE FROM marib_overtime WHERE id = $1", [id]);
    await audit(me.username, "delete", "entries:overtime", id, null);
    lg.info("overtime entry deleted", { by: me.username, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("entries:overtime", "DELETE", e);
  }
}
