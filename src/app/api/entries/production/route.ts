/* /api/entries/production — R46-8: إدخال الإنتاج بالـ PO
   GET  (?month=YYYY-MM) → list production entries for a month
   POST → create a new production entry
   PUT  → update an entry
   DELETE → remove an entry
   كل عملية بتسجل في الـ audit log. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requirePerm } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("entries:production");

export async function GET(req: NextRequest) {
  try {
    const g = await requirePerm(req, "data.view", "view");
    if (g.res) return g.res;

    const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("month", 400);

    const rows = await q(
      `SELECT id, month_key, to_char(date, 'YYYY-MM-DD') AS date_str, dept_id, line_id, po_number, qty, note, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
       FROM marib_prod WHERE month_key = $1 ORDER BY date ASC, created_at ASC`,
      [month]
    );

    /* dept + line names: pull them in one query and join client-side */
    const deptIds = Array.from(new Set(rows.map((r) => r.dept_id).filter(Boolean))) as string[];
    let deptMap: Record<string, string> = {};
    if (deptIds.length) {
      const dr = await q(`SELECT id, name FROM marib_dept WHERE id = ANY($1::text[])`, [deptIds]);
      for (const r of dr) deptMap[r.id as string] = r.name as string;
    }

    return NextResponse.json({
      month,
      entries: rows.map((r) => ({
        id: r.id,
        month: r.month_key,
        date: r.date_str,
        dept_id: r.dept_id || "",
        dept_name: r.dept_id ? (deptMap[r.dept_id as string] || "") : "",
        line_id: r.line_id || "",
        po_number: r.po_number || "",
        qty: r.qty,
        note: r.note || "",
        actor: r.actor,
        created: r.created,
      })),
    });
  } catch (e) {
    return serverFail("entries:production", "GET", e);
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
    const deptId = String(body.dept_id || "");
    const lineId = String(body.line_id || "");
    const poNumber = String(body.po_number || "").trim().slice(0, 40);
    const qty = parseInt(String(body.qty || "0"), 10);
    const note = String(body.note || "").trim().slice(0, 200);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date", 400);
    if (qty <= 0) return fail("qty", 400);

    const monthKey = date.slice(0, 7);
    const id = crypto.randomUUID();
    await q(
      `INSERT INTO marib_prod (id, month_key, date, dept_id, line_id, po_number, qty, note, actor)
       VALUES ($1, $2, $3::date, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, $9)`,
      [id, monthKey, date, deptId || null, lineId || null, poNumber, qty, note, me.username]
    );
    await audit(me.username, "create", "entries:production", id, { date, dept_id: deptId, qty });
    lg.info("prod entry created", { by: me.username, date, qty, po: poNumber });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return serverFail("entries:production", "POST", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await requirePermBody(req, "data.upload", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) return fail("id", 400);

    const rows = await q("SELECT id FROM marib_prod WHERE id = $1", [id]);
    if (!rows.length) return fail("notfound", 404);
    await q("DELETE FROM marib_prod WHERE id = $1", [id]);
    await audit(me.username, "delete", "entries:production", id, null);
    lg.info("prod entry deleted", { by: me.username, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("entries:production", "DELETE", e);
  }
}
