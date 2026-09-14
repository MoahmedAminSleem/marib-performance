/* /api/manpower — R38 الاتزان v2 (Marib 3 structure)
   GET  (any signed-in user) → one small snapshot per session:
         { depts:[[id,name,parent,ord]…],
           emps: [[id,code,name,job,deptId,hire,vac,note,mach]…],
           req:  {nodeKey: required},          (manual overrides only)
           transfers: [[at,actor,code,name,fromDept,fromJob,toDept,toJob,kind,note]…] }
         All tree/variance math stays client-side — the server never
         gets heavy (828 rows is lighter than R37's 2005).
   POST (admin+) → one tiny action at a time:
         add / edit / fill / vacAdd / vacDel / deptAdd / deptRename /
         deptMove / req / import.
         Actual/required rule (the owner's): every row = one required
         position; a row with an empty name = a vacancy (missing).
         required(node) = rows, actual(node) = filled rows, the manual
         req value is an override on top. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requireUser, requireRoleBody } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("manpower");

function cleanStr(v: unknown, max = 120): string {
  return String(v ?? "").trim().slice(0, max);
}
function normCode(v: unknown): string {
  const t = cleanStr(v, 20);
  return t === "None" ? "" : t;
}

/* full display path of a dept node (used inside transfer rows) */
async function deptPath(id: string | null): Promise<string> {
  if (!id) return "";
  const byId = new Map<string, { name: string; parent: string | null }>();
  const all = await q("SELECT id, name, parent_id FROM marib_dept");
  for (const r of all) byId.set(r.id as string, { name: r.name as string, parent: (r.parent_id as string) || null });
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 30) {
    parts.unshift(cur.name);
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return parts.join(" - ");
}

/* one transfer record — kind: move (dept+job), dept, job, dept-move,
   dept-rename, fill, import-out */
async function logTransfer(
  actor: string,
  code: string,
  name: string,
  oldDept: string, oldJob: string,
  newDept: string, newJob: string,
  kind = "move",
  note: string | null = null
): Promise<void> {
  await q(
    `INSERT INTO marib_transfer (actor, code, name, from_dept, from_job, to_dept, to_job, kind, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [actor, code, name, oldDept, oldJob, newDept, newJob, kind, note]
  );
}

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "manpower", "GET");
    if (g.res) return g.res;

    const depts = await q("SELECT id, name, parent_id, ord FROM marib_dept ORDER BY ord ASC");
    const emps = await q(
      `SELECT id, code, name, job, dept_id, hire, vac, note, mach FROM marib_emp
       ORDER BY ord ASC`
    );
    const reqRows = await q("SELECT node_key, required FROM marib_req");
    const trs = await q(
      `SELECT at, actor, code, name, from_dept, from_job, to_dept, to_job, kind, note
       FROM marib_transfer ORDER BY at DESC LIMIT 2000`
    );
    return NextResponse.json({
      depts: depts.map((r) => [r.id, r.name, r.parent_id || "", r.ord]),
      emps: emps.map((r) => [r.id, r.code || "", r.name || "", r.job || "", r.dept_id || "", r.hire || "", r.vac ? 1 : 0, r.note || "", r.mach || ""]),
      req: reqRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.node_key as string] = r.required as number;
        return acc;
      }, {}),
      transfers: trs.map((t) => [
        t.at, t.actor, t.code, t.name, t.from_dept, t.from_job, t.to_dept, t.to_job, t.kind, t.note || "",
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

    /* ---------- add one employee (code optional — blank = جديد) ---------- */
    if (action === "add") {
      const code = normCode(body.code);
      const name = cleanStr(body.name, 90);
      const job = cleanStr(body.job, 90);
      const deptId = cleanStr(body.deptId, 40);
      const hire = cleanStr(body.hire, 10);
      if (!name || !deptId) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      if (code && code !== "جديد") {
        const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
        if (dup.length) return fail("dup", 409);
      }
      const ord = await q("SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_emp");
      await q(
        `INSERT INTO marib_emp (code, name, job, dept_id, hire, vac, ord)
         VALUES ($1, $2, $3, $4, $5, false, $6)`,
        [code || "جديد", name, job, deptId, hire, ord[0]?.n ?? 1]
      );
      const p = await deptPath(deptId);
      await audit(actor, "create", "manpower", name, { code: code || "جديد", dept: p, job });
      return NextResponse.json({ ok: true });
    }

    /* ---------- edit one employee (dept/job change ⇒ transfer row) ---------- */
    if (action === "edit") {
      const id = cleanStr(body.id, 40);
      const code = normCode(body.code);
      if (!id && !code) return fail("code", 400);
      const cur = await q(
        "SELECT id, code, name, job, dept_id, hire FROM marib_emp WHERE id = $1 OR code = $1 LIMIT 1",
        [id || code]
      );
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      const name = body.name !== undefined ? cleanStr(body.name, 90) : (old.name as string);
      const job = body.job !== undefined ? cleanStr(body.job, 90) : (old.job as string);
      const deptId = body.deptId !== undefined ? cleanStr(body.deptId, 40) : (old.dept_id as string);
      const hire = body.hire !== undefined ? cleanStr(body.hire, 10) : (old.hire as string);
      /* allow setting the code of a جديد row (code pending) — never steal
         a code that already belongs to someone else */
      let newCode = old.code as string | null;
      if (body.code !== undefined) {
        const c = normCode(body.code);
        if (c && c !== (old.code || "")) {
          const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 AND id <> $2 LIMIT 1", [c, old.id]);
          if (dup.length) return fail("dup", 409);
          newCode = c;
        }
      }
      if (!name || !deptId) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      await q(
        `UPDATE marib_emp SET code=$2, name=$3, job=$4, dept_id=$5, hire=$6, updated_at=now() WHERE id=$1`,
        [old.id, newCode, name, job, deptId, hire]
      );
      const oldPath = await deptPath(old.dept_id as string);
      const newPath = await deptPath(deptId);
      if (oldPath !== newPath || (old.job as string) !== job) {
        await logTransfer(actor, newCode || "جديد", name, oldPath, old.job as string, newPath, job);
      }
      await audit(actor, "edit", "manpower", name, { code: newCode, from: oldPath + " / " + old.job, to: newPath + " / " + job });
      return NextResponse.json({ ok: true });
    }

    /* ---------- delete one employee (R39: the owner manages people on
       the site, away from Excel — deletion keeps a trace: a transfer
       row kind="out" + an audit entry, so the archive answers "مين خرج
       وامتى ومين عمله") ---------- */
    if (action === "del") {
      const id = cleanStr(body.id, 40);
      if (!id) return fail("id", 400);
      const cur = await q("SELECT id, code, name, job, dept_id, vac FROM marib_emp WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      if (old.vac) return fail("vac", 400); /* vacancies have their own vacDel */
      const p = await deptPath(old.dept_id as string);
      await q("DELETE FROM marib_emp WHERE id = $1 AND vac = false", [id]);
      await logTransfer(
        actor, (old.code as string) || "جديد", old.name as string,
        p, old.job as string, "—", "—", "out", "خروج من الموقع"
      );
      await audit(actor, "delete", "manpower", old.name as string, { code: old.code, dept: p, job: old.job });
      lg.info("employee removed", { actor, name: old.name, code: old.code });
      return NextResponse.json({ ok: true });
    }

    /* ---------- fill a vacancy (turn the empty row into an employee) ---------- */
    if (action === "fill") {
      const id = cleanStr(body.id, 40);
      const code = normCode(body.code);
      const name = cleanStr(body.name, 90);
      const hire = cleanStr(body.hire, 10);
      if (!id || !name) return fail("fields", 400);
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return fail("hire", 400);
      const cur = await q("SELECT id, code, name, job, dept_id FROM marib_emp WHERE id = $1 AND vac = true LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const old = cur[0];
      if (code && code !== "جديد") {
        const dup = await q("SELECT 1 FROM marib_emp WHERE code = $1 LIMIT 1", [code]);
        if (dup.length) return fail("dup", 409);
      }
      const p = await deptPath(old.dept_id as string);
      await q(
        `UPDATE marib_emp SET code=$2, name=$3, hire=$4, vac=false, updated_at=now() WHERE id=$1`,
        [old.id, code || "جديد", name, hire]
      );
      await logTransfer(actor, code || "جديد", name, p, (old.job as string) + " (شاغر)", p, old.job as string, "fill");
      await audit(actor, "create", "manpower", name, { filled: old.job, dept: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- add a vacancy (a required, unfilled position) ---------- */
    if (action === "vacAdd") {
      const deptId = cleanStr(body.deptId, 40);
      const job = cleanStr(body.job, 90);
      if (!deptId || !job) return fail("fields", 400);
      const ord = await q("SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_emp");
      await q(
        `INSERT INTO marib_emp (code, name, job, dept_id, vac, ord) VALUES (NULL, '', $1, $2, true, $3)`,
        [job, deptId, ord[0]?.n ?? 1]
      );
      const p = await deptPath(deptId);
      await audit(actor, "create", "manpower-vac", job, { dept: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- remove a vacancy (no longer needed) ---------- */
    if (action === "vacDel") {
      const id = cleanStr(body.id, 40);
      if (!id) return fail("id", 400);
      const cur = await q("SELECT id, job, dept_id FROM marib_emp WHERE id = $1 AND vac = true LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const p = await deptPath(cur[0].dept_id as string);
      await q("DELETE FROM marib_emp WHERE id = $1 AND vac = true", [id]);
      await audit(actor, "delete", "manpower-vac", cur[0].job as string, { dept: p });
      return NextResponse.json({ ok: true });
    }

    /* ---------- add a dept node ---------- */
    if (action === "deptAdd") {
      const name = cleanStr(body.name, 90);
      const parentId = cleanStr(body.parentId, 40);
      if (!name) return fail("fields", 400);
      if (parentId) {
        const p = await q("SELECT 1 FROM marib_dept WHERE id = $1 LIMIT 1", [parentId]);
        if (!p.length) return fail("parent", 404);
      }
      const ord = await q(
        "SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_dept WHERE parent_id IS NOT DISTINCT FROM NULLIF($1,'')",
        [parentId]
      );
      const id = crypto.randomUUID();
      await q(
        `INSERT INTO marib_dept (id, name, parent_id, ord) VALUES ($1, $2, NULLIF($3,''), $4)`,
        [id, name, parentId, ord[0]?.n ?? 1]
      );
      const p = await deptPath(id);
      await audit(actor, "create", "manpower-dept", name, { path: p });
      return NextResponse.json({ ok: true, id });
    }

    /* ---------- rename a dept node (employees untouched) ---------- */
    if (action === "deptRename") {
      const id = cleanStr(body.id, 40);
      const name = cleanStr(body.name, 90);
      if (!id || !name) return fail("fields", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      const oldPath = await deptPath(id);
      await q("UPDATE marib_dept SET name = $2 WHERE id = $1", [id, name]);
      const newPath = await deptPath(id);
      const n = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE dept_id = $1", [id]);
      await logTransfer(actor, "—", cur[0].name as string, oldPath, null, newPath, null, "dept-rename");
      await audit(actor, "edit", "manpower-dept", name, { from: oldPath, to: newPath });
      void n;
      return NextResponse.json({ ok: true });
    }

    /* ---------- move a dept node (inside another / out to top) ---------- */
    if (action === "deptMove") {
      const id = cleanStr(body.id, 40);
      const parentId = cleanStr(body.parentId, 40); /* "" = top level */
      if (!id) return fail("id", 400);
      if (id === parentId) return fail("parent", 400);
      const cur = await q("SELECT id, name, parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [id]);
      if (!cur.length) return fail("none", 404);
      if (parentId) {
        const p = await q("SELECT 1 FROM marib_dept WHERE id = $1 LIMIT 1", [parentId]);
        if (!p.length) return fail("parent", 404);
        /* cycle guard: walk up from the new parent — must never reach id */
        let pid: string | null = parentId;
        let guard = 0;
        while (pid && guard++ < 60) {
          if (pid === id) return fail("cycle", 400);
          const up = await q("SELECT parent_id FROM marib_dept WHERE id = $1 LIMIT 1", [pid]);
          pid = (up[0]?.parent_id as string) || null;
        }
      }
      const oldPath = await deptPath(id);
      await q("UPDATE marib_dept SET parent_id = NULLIF($2,'') WHERE id = $1", [id, parentId]);
      const newPath = await deptPath(id);
      const n = await q("SELECT COUNT(*)::int AS n FROM marib_emp WHERE dept_id = $1", [id]);
      await logTransfer(actor, "—", cur[0].name as string, oldPath, null, newPath, null, "dept-move", (n[0]?.n ?? 0) + " موظف");
      await audit(actor, "edit", "manpower-dept", cur[0].name as string, { from: oldPath, to: newPath, employees: n[0]?.n ?? 0 });
      return NextResponse.json({ ok: true });
    }

    /* ---------- set / clear a node's manual required override ---------- */
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

    /* ---------- import: full sync from the Manpower sheet ----------
       New Database format rows: [code, name, dept, sec, sub, job, note, hire, vac, mach]
       Old Employees-DB format rows: [code, name, job, deptPath, hire]
       - dept chains are resolved/created by (name, parent)
       - numeric codes match by code; 'جديد'/blank rows match by NAME so the
         code the owner typed into the updated sheet lands on the right row
       - vacancies are fully replaced by the sheet's
       - employees NOT in the sheet are kept (never deleted) and reported
       - R40: mach (الماكينة) rides at index 9 and syncs like any other
         field — a machine typed into the sheet lands on the employee */
    if (action === "import") {
      const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
      if (!rows.length || rows.length > 6000) return fail("rows", 400);

      const byId = new Map<string, string>();            /* "parent|name" → deptId */
      const allDepts = await q("SELECT id, name, parent_id FROM marib_dept");
      for (const r of allDepts) byId.set(((r.parent_id as string) || "") + "|" + r.name, r.id as string);

      async function ensureChain(parts: string[]): Promise<string> {
        let parent = "";
        for (const raw of parts) {
          const name = cleanStr(raw, 90);
          if (!name) continue;
          const key = parent + "|" + name;
          let id = byId.get(key);
          if (!id) {
            const ord = await q(
              "SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_dept WHERE parent_id IS NOT DISTINCT FROM NULLIF($1,'')",
              [parent]
            );
            id = crypto.randomUUID();
            await q(`INSERT INTO marib_dept (id, name, parent_id, ord) VALUES ($1, $2, NULLIF($3,''), $4)`, [id, name, parent, ord[0]?.n ?? 1]);
            byId.set(key, id);
          }
          parent = id;
        }
        return parent;
      }

      /* normalize both formats → {code,name,chain,job,note,hire,vac,mach} */
      const clean: { code: string; name: string; chain: string[]; job: string; note: string; hire: string; vac: boolean; mach: string }[] = [];
      for (const r0 of rows) {
        const r = Array.isArray(r0) ? (r0 as unknown[]) : [];
        if (r.length >= 8) {
          const vac = !!(r[8] === 1 || r[8] === true || r[8] === "1");
          const name = cleanStr(r[1], 90);
          const dept = cleanStr(r[2], 90);
          const sec = cleanStr(r[3], 90);
          const sub = cleanStr(r[4], 90);
          const chain = [dept, sec, sub].filter((x) => !!x);
          if (!chain.length) continue;
          if (!name && !cleanStr(r[5], 90)) continue; /* garbage row */
          let hire = cleanStr(r[7], 10);
          if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
          clean.push({ code: normCode(r[0]), name, chain, job: cleanStr(r[5], 90), note: cleanStr(r[6], 60), hire, vac: vac || !name, mach: cleanStr(r[9], 30) });
        } else {
          /* old format: [code, name, job, deptPath, hire] */
          const code = normCode(r[0]);
          const name = cleanStr(r[1], 90);
          if (!code || !name || code === "جديد") continue;
          let hire = cleanStr(r[4], 10);
          if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) hire = "";
          const chain = cleanStr(r[3], 190).split(" - ").map((x) => x.trim()).filter(Boolean);
          if (!chain.length) continue;
          clean.push({ code, name, chain, job: cleanStr(r[2], 90), note: "", hire, vac: false, mach: "" });
        }
      }
      if (!clean.length) return fail("rows", 400);

      const existing = await q("SELECT id, code, name, job, dept_id, hire, vac FROM marib_emp");
      const byCode = new Map<string, typeof existing>();
      const byName = new Map<string, typeof existing>();
      for (const r of existing) {
        if (r.code && r.code !== "جديد") byCode.set(r.code as string, r);
        const nk = (r.name as string).trim();
        if (nk) byName.set(nk, r);
      }

      let inserted = 0, updated = 0, moved = 0, codeFilled = 0;
      const seenIds = new Set<string>();

      await q("BEGIN");
      try {
        /* vacancies: the sheet is the truth for required-but-unfilled rows */
        await q("DELETE FROM marib_emp WHERE vac = true");

        for (const c of clean) {
          if (c.vac) {
            const deptId = await ensureChain(c.chain);
            const ord = await q("SELECT COALESCE(MAX(ord),0)+1 AS n FROM marib_emp");
            await q(
              `INSERT INTO marib_emp (code, name, job, dept_id, note, hire, vac, ord, mach)
               VALUES (NULL, '', $1, $2, $3, $4, true, $5, $6)`,
              [c.job, deptId, c.note, c.hire, ord[0]?.n ?? 1, c.mach]
            );
            inserted++;
            continue;
          }
          const deptId = await ensureChain(c.chain);
          let old = undefined;
          if (c.code && c.code !== "جديد") old = byCode.get(c.code);
          if (!old) {
            /* no code match — try the same name (the جديد flow: the owner
               re-uploads the sheet with the code typed in) */
            const cand = byName.get(c.name);
            if (cand && (!cand.code || cand.code === "جديد")) old = cand;
          }
          if (!old) {
            await q(
              `INSERT INTO marib_emp (code, name, job, dept_id, note, hire, vac, ord, mach)
               VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)`,
              [c.code || "جديد", c.name, c.job, deptId, c.note, c.hire, clean.indexOf(c) + 1, c.mach]
            );
            inserted++;
          } else {
            seenIds.add(old.id as string);
            const oldPath = await deptPath(old.dept_id as string);
            const newPath = await deptPath(deptId);
            const hadNoCode = !old.code || old.code === "جديد";
            await q(
              `UPDATE marib_emp SET code=$2, name=$3, job=$4, dept_id=$5, note=$6, hire=$7, vac=false, mach=$8, updated_at=now() WHERE id=$1`,
              [
                old.id,
                c.code && c.code !== "جديد" ? c.code : (old.code as string) || "جديد",
                c.name, c.job, deptId, c.note, c.hire, c.mach,
              ]
            );
            if (hadNoCode && c.code && c.code !== "جديد") codeFilled++;
            updated++;
            if (oldPath !== newPath || (old.job as string) !== c.job) {
              await logTransfer(actor, c.code || (old.code as string) || "جديد", c.name, oldPath, old.job as string, newPath, c.job);
              moved++;
            }
          }
        }
        await q("COMMIT");
      } catch (e) {
        await q("ROLLBACK").catch(() => {});
        throw e;
      }

      const kept = existing.filter((r) => !r.vac && !seenIds.has(r.id as string) && r.code && r.code !== "جديد");
      await audit(actor, "upload", "manpower", null, { rows: clean.length, inserted, updated, moved, codeFilled, keptOut: kept.length });
      lg.info("manpower import", { rows: clean.length, inserted, updated, moved, codeFilled, keptOut: kept.length });
      return NextResponse.json({ ok: true, inserted, updated, moved, codeFilled, total: clean.length, keptOut: kept.length });
    }

    return fail("action", 400);
  } catch (e) {
    return serverFail("manpower", "POST", e);
  }
}
