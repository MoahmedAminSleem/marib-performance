/* /api/entries/production — R46-8: إدخال الإنتاج بالـ PO
   GET  (?month=YYYY-MM) → list production entries for a month
   POST → create a new production entry
   PUT  → update an entry
   DELETE → remove an entry
   كل عملية بتسجل في الـ audit log.
   R56: المنطق المشترك (خرائط الأقسام / تحقق الشهر والتاريخ)
        اتنقل لـ lib/marib/entries.ts — نفس السلوك بالظبط. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requireEntryRead } from "@/lib/marib/http";
import { loadDeptMap, monthParam, isDayStr, deleteEntry } from "@/lib/marib/entries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("entries:production");

export async function GET(req: NextRequest) {
  try {
    /* R63: حارس قراءة الإدخال — data.view أو data.upload (مسؤول
       الإدخال اللي اللوحة مخفية عنه يقرأ عادي) */
    const g = await requireEntryRead(req);
    if (g.res) return g.res;

    const month = monthParam(req.nextUrl.searchParams);
    if (!month) return fail("month", 400);

    const rows = await q(
      `SELECT id, month_key, to_char(date, 'YYYY-MM-DD') AS date_str, dept_id, dept_name, line_id, po_number, qty, note, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
       FROM marib_prod WHERE month_key = $1 ORDER BY date ASC, created_at ASC`,
      [month]
    );

    /* dept + line names: pull them in one query and join client-side */
    const deptMap = await loadDeptMap(Array.from(new Set(rows.map((r) => r.dept_id).filter(Boolean))) as string[]);

    return NextResponse.json({
      month,
      entries: rows.map((r) => ({
        id: r.id,
        month: r.month_key,
        date: r.date_str,
        dept_id: r.dept_id || "",
        dept_name: (r.dept_name as string) || (r.dept_id ? (deptMap[r.dept_id as string] || "") : ""),
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
    /* R64: كتابة الإدخال بمفتاحه الخاص — entry.edit */
    const g = await requirePermBody(req, "entry.edit", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const date = String(body.date || "");
    /* R50: القسم بقى نص حر (أقسام الأرضية الخمسة: الصدر/الضهر/التجميع/
       التجهيزات/البوكت) مش id من شجرة الاتزان — dept_name هو الأساس.
       dept_id لسه مقبول للتوافق مع أي كود قديم. */
    const deptId = String(body.dept_id || "");
    const deptName = String(body.dept || "").trim().slice(0, 60);
    const lineId = String(body.line || body.line_id || "").trim().slice(0, 20);
    const poNumber = String(body.po_number || "").trim().slice(0, 40);
    const qty = parseInt(String(body.qty || "0"), 10);
    const note = String(body.note || "").trim().slice(0, 200);
    /* R58: كمية عقد الـ PO — بتتبعت من نموذج الإدخال لما يكون الـ PO
       جديد (أول مرة). بتتسجل في ريفرانس marib_po مرة واحدة؛ لو الـ PO
       مسجل أصلًا الريفرانس هو الحقيقة والقيمة دي بتتجاهل. */
    const poContract = parseInt(String(body.po_contract_qty || "0"), 10);

    if (!isDayStr(date)) return fail("date", 400);
    if (qty <= 0) return fail("qty", 400);
    if (!deptName && !deptId) return fail("dept", 400);

    const monthKey = date.slice(0, 7);
    const id = crypto.randomUUID();
    await q(
      `INSERT INTO marib_prod (id, month_key, date, dept_id, dept_name, line_id, po_number, qty, note, actor)
       VALUES ($1, $2, $3::date, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10)`,
      [id, monthKey, date, deptId || null, deptName || null, lineId || null, poNumber, qty, note, me.username]
    );
    /* R58: تسجيل كمية العقد لو الـ PO جديد والمستخدم كتبها في النموذج */
    if (poNumber && poContract > 0) {
      const known = await q("SELECT po FROM marib_po WHERE po = $1", [poNumber]);
      if (!known.length) {
        await q(
          `INSERT INTO marib_po (po, contract_qty, note, actor, updated_by)
           VALUES ($1, $2, '', $3, $3)
           ON CONFLICT (po) DO NOTHING`,
          [poNumber, poContract, me.username]
        );
        await audit(me.username, "create", "po:" + poNumber, poNumber, { qty: poContract, via: "entry-form" });
      }
    }
    await audit(me.username, "create", "entries:production", id, { date, dept: deptName || deptId, qty });
    lg.info("prod entry created", { by: me.username, date, qty, po: poNumber, dept: deptName || deptId });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return serverFail("entries:production", "POST", e);
  }
}

/* R59: جسم الـ DELETE المشترك (التحقق + الحذف + الأوديت) اتنقل
   لـ deleteEntry في lib/marib/entries.ts — نفس السلوك بالظبط. */
export async function DELETE(req: NextRequest) {
  return deleteEntry(req, "production");
}
