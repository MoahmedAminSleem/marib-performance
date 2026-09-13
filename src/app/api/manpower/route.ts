/* /api/manpower — R37 الاتزان (manpower balance)
   GET  (any signed-in user) → the whole snapshot in one small payload:
         { emps: [[code,name,job,dept,hire]…], req: {nodeKey: required},
           transfers: [[at,actor,code,name,fromDept,fromJob,toDept,toJob]…] }
         The tree/variance math is ALL client-side — the server only
         stores and returns flat rows (it never gets heavy).
   POST (admin+) → one tiny action at a time:
         add / edit / req / import — every dept or job change writes a
         marib_transfer row (date + who did it) so the archive builds
         itself. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requireUser, requireRoleBody } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("manpower");

function cleanStr(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}

/* one transfer record — kind: move (dept+job changed), dept, job */
async function logTransfer(
  actor: string,
  code: string,
  name: string,
  oldDept: string, oldJob: string,
  newDept: string, newJob: string
): Promise<void> {
  const kind = oldDept !== newDept && oldJob !== newJob ? "move" : oldDept !== newDept ? "dept" : "job";
  await q(
    `INSERT INTO marib_transfer (actor, code, name, from_dept, from_job, to_dept, to_job, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actor, code, name, oldDept, oldJob, newDept, newJob, kind]
  );
}

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "manpower", "GET");
    if (g.res) return g.res;

    const emps = await q(
      "SELECT code, name, job, dept, hire FROM marib_emp ORDER BY dept ASC, job ASC, name ASC"
    );
    const reqRows = await q("SELECT node_key, required FROM marib_req");
    const trs = await q(
      `SELECT at, actor, code, name, from_dept, from_job, to_dept, to_job, kind
       FROM marib_transfer ORDER BY at DESC LIMIT 2000`
    );
    return NextResponse.json({
      emps: emps.map((r) => [r.code, r.name, r.job, r.dept, r.hire]),
      req: reqRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.node_key as string] = r.required as number;
        return acc;
      }, {}),
      transfers: trs.map((t) => [
        t.at, t.actor, t.code, t.name, t.from_dept, t.from_job, t.to_dept, t.to_job, t.kind,
      ]),
    });
  } catch (e) {
    return serverFail("manpower", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    /* editing the manpower structure is an admin+ job — viewers get 403 */
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user!;
    const actor = me.username;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const action = String(body.action || "");

    /* ---------- add one employee ---------- */
    if (action === "add") {
      const code = cleanStr(body.code, 20);
      const name = cleanStr(body.name, 90);
      const job = cleanStr(body.job, 90);
      const dept = cleanStr(body.dept, 190);
      const hire = cleanStr(body.hire, 10);
      if (!code || !name) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
      if (dup.length) return fail("dup", 409);
      await q(
        `INSERT INTO marib_emp (code, name, job, dept, hire) VALUES ($1, $2, $3, $4, $5)`,
        [code, name, job, dept, hire]
      );
      await audit(actor, "create", "manpower", name, { code, dept, job });
      return NextResponse.json({ ok: true });
    }

    /* ---------- edit one employee (dept/job change ⇒ transfer row) ---------- */
    if (action === "edit") {
      const code = cleanStr(body.code, 20);
      if (!code) return fail("code", 400);
      const cur = await q("SELECT code, name, job, dept, hire FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      const name = body.name !== undefined ? cleanStr(body.name, 90) : (old.name as string);
      const job = body.job !== undefined ? cleanStr(body.job, 90) : (old.job as string);
      const dept = body.dept !== undefined ? cleanStr(body.dept, 190) : (old.dept as string);
      const hire = body.hire !== undefined ? cleanStr(body.hire, 10) : (old.hire as string);
      if (!name) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      await q(
        `UPDATE marib_emp SET name=$2, job=$3, dept=$4, hire=$5, updated_at=now() WHERE code=$1`,
        [code, name, job, dept, hire]
      );
      if ((old.job as string) !== job || (old.dept as string) !== dept) {
        await logTransfer(actor, code, name, old.dept as string, old.job as string, dept, job);
      }
      await audit(actor, "edit", "manpower", name, { code, from: old.dept + " / " + old.job, to: dept + " / " + job });
      return NextResponse.json({ ok: true });
    }

    /* ---------- set / clear a node's required count ---------- */
    if (action === "req") {
      const key = cleanStr(body.key, 260);
      if (!key) return fail("key", 400);
      if (body.required === null || body.required === undefined || body.required === "") {
        await q("DELETE FROM marib_req WHERE node_key = $1", [key]);
      } else {
        const n = Math.round(Number(body.required));
        if (!isFinite(n) || n < 0 || n > 99999) return fail("num", 400);
        await q(
          `INSERT INTO marib_req (node_key, required, updated_at, updated_by)
           VALUES ($1, $2, now(), $3)
           ON CONFLICT (node_key) DO UPDATE SET required = $2, updated_at = now(), updated_by = $3`,
          [key, n, actor]
        );
      }
      await audit(actor, "edit", "manpower-req", key, { required: body.required ?? null });
      return NextResponse.json({ ok: true });
    }

    /* ---------- bulk import (updated Employees Database Excel) ----------
       upsert by code: new rows are inserted, changed rows are updated —
       and any dept/job difference becomes a dated transfer row. Rows
       missing from the file are left untouched (nothing is deleted). */
    if (action === "import") {
      const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
      if (!rows.length || rows.length > 6000) return fail("rows", 400);
      const clean: [string, string, string, string, string][] = [];
      const seen = new Set<string>();
      for (const r0 of rows) {
        const r = Array.isArray(r0) ? (r0 as unknown[]) : [];
        const code = cleanStr(r[0], 20);
        const name = cleanStr(r[1], 90);
        if (!code || !name || seen.has(code)) continue;
        seen.add(code);
        let hire = cleanStr(r[4], 10);
        if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
        clean.push([code, name, cleanStr(r[2], 90), cleanStr(r[3], 190), hire]);
      }
      if (!clean.length) return fail("rows", 400);

      const existing = await q("SELECT code, name, job, dept FROM marib_emp");
      const byCode = new Map(existing.map((r) => [r.code as string, r]));
      let inserted = 0, updated = 0, moved = 0;

      await q("BEGIN");
      try {
        for (const [code, name, job, dept, hire] of clean) {
          const old = byCode.get(code);
          if (!old) {
            await q(
              `INSERT INTO marib_emp (code, name, job, dept, hire) VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (code) DO NOTHING`,
              [code, name, job, dept, hire]
            );
            inserted++;
          } else {
            await q(
              `UPDATE marib_emp SET name=$2, job=$3, dept=$4, hire=$5, updated_at=now() WHERE code=$1`,
              [code, name, job, dept, hire]
            );
            updated++;
            if ((old.dept as string) !== dept || (old.job as string) !== job) {
              await logTransfer(actor, code, name, old.dept as string, old.job as string, dept, job);
              moved++;
            }
          }
        }
        await q("COMMIT");
      } catch (e) {
        await q("ROLLBACK").catch(() => {});
        throw e;
      }
      await audit(actor, "upload", "manpower", null, { rows: clean.length, inserted, updated, moved });
      lg.info("manpower import", { rows: clean.length, inserted, updated, moved });
      return NextResponse.json({ ok: true, inserted, updated, moved, total: clean.length });
    }

    return fail("action", 400);
  } catch (e) {
    return serverFail("manpower", "POST", e);
  }
}
