/* R46-7 — Import undo system: snapshot + restore.
   Before every import, capture the full state of the manpower tables
   (emps + depts + req + transfers + meta). Store as a JSON snapshot in
   marib_undo with a 15-minute expiry. The client gets back the token +
   shows an Undo button; if pressed within 15 min, restore() reverses
   the import atomically. */

import { q, withTransaction } from "./db";
import { audit } from "./db";

const UNDO_TTL_MIN = 15;

interface Snapshot {
  emps: unknown[];
  depts: unknown[];
  req: unknown[];
  transfers: unknown[];
  meta: unknown[];
}

/** Capture the current state of all manpower tables into a JSON snapshot,
 *  store it under a fresh token, return the token. The snapshot is taken
 *  BEFORE the import mutates anything. */
export async function captureUndoSnapshot(actor: string): Promise<string> {
  const token = crypto.randomUUID();
  const [emps, depts, req, transfers, meta] = await Promise.all([
    q("SELECT id, code, name, job, dept_id, hire, vac, note, mach, ord, name_ar, job_ar FROM marib_emp"),
    q("SELECT id, name, parent_id, ord FROM marib_dept"),
    q("SELECT node_key, required, updated_at, updated_by FROM marib_req"),
    q("SELECT id, at, actor, code, name, from_dept, from_job, to_dept, to_job, kind, note FROM marib_transfer"),
    q("SELECT key, value FROM marib_meta"),
  ]);
  const snapshot: Snapshot = { emps, depts, req, transfers, meta };
  const expiresAt = new Date(Date.now() + UNDO_TTL_MIN * 60 * 1000);
  await q(
    `INSERT INTO marib_undo (token, actor, payload, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)`,
    [token, actor, JSON.stringify(snapshot), expiresAt]
  );
  return token;
}

/** Restore from a snapshot. Returns true if the restore succeeded, false
 *  if the token was not found or had expired. Atomic — either fully
 *  restores or doesn't touch anything. */
export async function restoreFromSnapshot(token: string, actor: string): Promise<boolean> {
  const rows = await q("SELECT actor, payload, expires_at FROM marib_undo WHERE token = $1", [token]);
  if (!rows.length) return false;
  const rec = rows[0] as { actor: string; payload: unknown; expires_at: Date | string };
  const exp = typeof rec.expires_at === "string" ? new Date(rec.expires_at) : rec.expires_at;
  if (exp.getTime() < Date.now()) {
    await q("DELETE FROM marib_undo WHERE token = $1", [token]);
    return false;
  }
  const snap = rec.payload as Snapshot;
  if (!snap || !Array.isArray(snap.emps)) return false;

  await withTransaction(async (run) => {
    /* wipe the current state — KEEP marib_audit and marib_undo itself
       intact (audit is append-only; deleting it would lose the trail). */
    await run("DELETE FROM marib_emp");
    await run("DELETE FROM marib_dept");
    await run("DELETE FROM marib_req");
    await run("DELETE FROM marib_transfer");
    await run("DELETE FROM marib_meta");

    /* re-seed everything from the snapshot — batched to keep it fast
       even for the 828-row baseline. */
    if (snap.depts.length) {
      const ids: string[] = [];
      const names: (string | null)[] = [];
      const parents: (string | null)[] = [];
      const ords: number[] = [];
      for (const d of snap.depts) {
        const r = d as { id: string; name: string; parent_id: string | null; ord: number };
        ids.push(r.id);
        names.push(r.name);
        parents.push(r.parent_id);
        ords.push(r.ord);
      }
      await run(
        `INSERT INTO marib_dept (id, name, parent_id, ord)
         SELECT i, n, p, o FROM unnest($1::text[], $2::text[], $3::text[], $4::int[]) AS t(i, n, p, o)`,
        [ids, names, parents, ords]
      );
    }
    if (snap.emps.length) {
      for (let i = 0; i < snap.emps.length; i += 500) {
        const ch = snap.emps.slice(i, i + 500);
        const c: (string | null)[] = [], n: string[] = [], j: string[] = [];
        const d: (string | null)[] = [], h: string[] = [];
        const v: boolean[] = [], no: string[] = [], m: string[] = [];
        const o: number[] = [];
        const id: string[] = [];
        const nar: (string | null)[] = [], jar: (string | null)[] = [];
        for (const e of ch) {
          const r = e as { id: string; code: string | null; name: string | null; job: string; dept_id: string | null; hire: string; vac: boolean; note: string; mach: string; ord: number; name_ar: string | null; job_ar: string | null };
          id.push(r.id);
          c.push(r.code || null);
          n.push(r.name || "");
          j.push(r.job || "");
          d.push(r.dept_id || null);
          h.push(r.hire || "");
          v.push(!!r.vac);
          no.push(r.note || "");
          m.push(r.mach || "");
          o.push(r.ord || 0);
          nar.push(r.name_ar || null);
          jar.push(r.job_ar || null);
        }
        await run(
          `INSERT INTO marib_emp (id, code, name, job, dept_id, hire, vac, note, mach, ord, name_ar, job_ar)
           SELECT i, c, n, j, d, h, v, no, m, o, na, ja
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bool[], $8::text[], $9::text[], $10::int[], $11::text[], $12::text[]) AS t(i, c, n, j, d, h, v, no, m, o, na, ja)`,
          [id, c, n, j, d, h, v, no, m, o, nar, jar]
        );
      }
    }
    if (snap.req.length) {
      const k: string[] = [], r2: number[] = [];
      for (const x of snap.req) {
        const r = x as { node_key: string; required: number };
        k.push(r.node_key);
        r2.push(r.required);
      }
      await run(
        `INSERT INTO marib_req (node_key, required)
         SELECT k, r FROM unnest($1::text[], $2::int[]) AS t(k, r)`,
        [k, r2]
      );
    }
    if (snap.transfers.length) {
      const id: string[] = [], at: string[] = [], ac: string[] = [];
      const c: string[] = [], nm: string[] = [];
      const fd: (string | null)[] = [], fj: (string | null)[] = [];
      const td: (string | null)[] = [], tj: (string | null)[] = [];
      const k: string[] = [], no: (string | null)[] = [];
      for (const x of snap.transfers) {
        const r = x as { id: string; at: string; actor: string; code: string; name: string; from_dept: string | null; from_job: string | null; to_dept: string | null; to_job: string | null; kind: string; note: string | null };
        id.push(r.id); at.push(r.at); ac.push(r.actor);
        c.push(r.code); nm.push(r.name);
        fd.push(r.from_dept); fj.push(r.from_job);
        td.push(r.to_dept); tj.push(r.to_job);
        k.push(r.kind); no.push(r.note);
      }
      await run(
        `INSERT INTO marib_transfer (id, at, actor, code, name, from_dept, from_job, to_dept, to_job, kind, note)
         SELECT i, a, ac, c, n, fd, fj, td, tj, k, no
         FROM unnest($1::text[], $2::timestamptz[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
         AS t(i, a, ac, c, n, fd, fj, td, tj, k, no)`,
        [id, at, ac, c, nm, fd, fj, td, tj, k, no]
      );
    }
    if (snap.meta.length) {
      const k: string[] = [], v: string[] = [];
      for (const x of snap.meta) {
        const r = x as { key: string; value: string };
        k.push(r.key); v.push(r.value);
      }
      await run(
        `INSERT INTO marib_meta (key, value)
         SELECT k, v FROM unnest($1::text[], $2::text[]) AS t(k, v)`,
        [k, v]
      );
    }
  });

  /* remove the spent token so Undo can't be pressed twice */
  await q("DELETE FROM marib_undo WHERE token = $1", [token]);
  await audit(actor, "restore", "manpower:undo", token, { ttl_min: UNDO_TTL_MIN });
  return true;
}

/** Background cleanup — sweep expired tokens. Called opportunistically
 *  on every capture. Safe to skip if it fails. */
export async function sweepExpiredUndoTokens(): Promise<void> {
  try {
    await q("DELETE FROM marib_undo WHERE expires_at < now()");
  } catch {
    /* non-fatal */
  }
}
