/* Marib DB layer — one SQL dialect (PostgreSQL), two drivers:
 *  - production (Vercel + Neon): node-postgres Pool
 *  - local dev: PGlite (real Postgres in-process, persisted at db/pglite)
 * Chosen by DATABASE_URL: starts with "postgres" → pg, otherwise PGlite. */

import path from "path";

type Row = Record<string, unknown>;
interface Driver {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

const g = globalThis as unknown as { __maribDriver?: Driver };

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const { Pool } = await import("pg");
    const needsSsl = /sslmode=require|neon\.tech/i.test(url);
    const pool = new Pool({
      connectionString: url,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 4,
      connectionTimeoutMillis: 15000,
    });
    (g as unknown as { __maribPool?: Pool }).__maribPool = pool;
    return {
      query: (sql, params) => pool.query(sql, params as unknown[]),
    };
  }
  // local development — PGlite keeps a real Postgres database on disk
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = path.join(process.cwd(), "db", "pglite");
  const pgl = new PGlite(dataDir);
  return {
    query: async (sql, params) => (await pgl.query(sql, params as unknown[])) as { rows: Row[] },
  };
}

/** run one SQL statement with $1.. params → rows */
export async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  if (!g.__maribDriver) g.__maribDriver = await createDriver();
  const r = await g.__maribDriver.query(sql, params);
  return r.rows || [];
}

/** run one statement without params — DDL / seeding */
export async function exec(sql: string): Promise<void> {
  await q(sql);
}

/** atomic transaction across both drivers (pg: pinned client, PGlite:
 *  single session) — a failed month sync rolls back completely, the
 *  previous data stays intact. */
export async function withTransaction(fn: (run: (sql: string, params?: unknown[]) => Promise<Row[]>) => Promise<void>): Promise<void> {
  if (!g.__maribDriver) g.__maribDriver = await createDriver();
  const url = process.env.DATABASE_URL || "";
  const isPg = url.startsWith("postgres://") || url.startsWith("postgresql://");
  if (isPg) {
    const { Pool } = await import("pg");
    // reach the SAME pool the driver wraps
    const pool = (g as unknown as { __maribPool?: Pool }).__maribPool!;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fn((sql, params) => client.query(sql, (params || []) as unknown[]).then((r) => r.rows || []));
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } else {
    // PGlite — one session, BEGIN/COMMIT around the batch
    await q("BEGIN");
    try {
      await fn((sql, params) => q(sql, params));
      await q("COMMIT");
    } catch (e) {
      await q("ROLLBACK").catch(() => {});
      throw e;
    }
  }
}

/* ---------- bootstrap: tables + default developer account ---------- */
/* PG/pglite extended protocol runs ONE statement per call — so the DDL is a list */
const BOOT_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS marib_user (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    pass_hash   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT
  )`,
  /* R26: profile photo (data URL, ~a few tens of KB, client-resized
     to 240px). IF NOT EXISTS keeps both PGlite and Neon migrations
     idempotent — the column appears on the first boot after deploy. */
  `ALTER TABLE marib_user ADD COLUMN IF NOT EXISTS photo TEXT`,
  /* R27: job title / nickname (مدير الإنتاج…) — set by an admin from
     the users modal. Additive migration only: existing rows keep
     everything, the new column just reads as NULL until filled. */
  `ALTER TABLE marib_user ADD COLUMN IF NOT EXISTS title TEXT`,
  `CREATE TABLE IF NOT EXISTS marib_data (
    id     TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    month  TEXT NOT NULL,
    sheet  TEXT NOT NULL,
    rown   INT  NOT NULL,
    data   JSONB NOT NULL,
    UNIQUE (month, sheet, rown)
  )`,
  `CREATE INDEX IF NOT EXISTS marib_data_month_idx ON marib_data (month)`,
  `CREATE TABLE IF NOT EXISTS marib_setting (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS marib_audit (
    id      TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor   TEXT NOT NULL,
    action  TEXT NOT NULL,
    entity  TEXT NOT NULL,
    label   TEXT,
    details JSONB
  )`,
  `CREATE INDEX IF NOT EXISTS marib_audit_at_idx ON marib_audit (at DESC)`,
  /* R37 — الاتزان (manpower balance): employees, per-node required
     counts, and the transfer archive. Additive only: existing tables
     are untouched; these appear on the first boot after deploy. */
  `CREATE TABLE IF NOT EXISTS marib_emp (
    id       TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    code     TEXT NOT NULL UNIQUE,
    name     TEXT NOT NULL,
    job      TEXT NOT NULL DEFAULT '',
    dept     TEXT NOT NULL DEFAULT '',
    hire     TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marib_emp_dept_idx ON marib_emp (dept)`,
  `CREATE TABLE IF NOT EXISTS marib_req (
    node_key   TEXT PRIMARY KEY,
    required   INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS marib_transfer (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor     TEXT NOT NULL,
    code      TEXT NOT NULL,
    name      TEXT NOT NULL,
    from_dept TEXT,
    from_job  TEXT,
    to_dept   TEXT,
    to_job    TEXT,
    kind      TEXT NOT NULL DEFAULT 'move'
  )`,
  `CREATE INDEX IF NOT EXISTS marib_transfer_at_idx ON marib_transfer (at DESC)`,
];

let booting: Promise<void> | null = null;

export async function ensureBoot(): Promise<void> {
  if (booting) return booting;
  const attempt = (async () => {
    for (const stmt of BOOT_SQL) await exec(stmt);
    // default developer account (Amin) — only when the users table is empty
    const u = await q("SELECT COUNT(*)::int AS n FROM marib_user");
    if ((u[0]?.n as number) === 0) {
      const { hashPassword } = await import("./session");
      const bootPw = process.env.DEV_BOOT_PASSWORD || "2872002";
      const hash = await hashPassword(bootPw);
      await q(
        `INSERT INTO marib_user (id, username, pass_hash, role, created_by)
         VALUES ($1, 'Amin', $2, 'dev', 'system')
         ON CONFLICT (username) DO NOTHING`,
        [crypto.randomUUID(), hash]
      );
    }
    // marker so the audit log starts with a creation entry
    const a = await q("SELECT COUNT(*)::int AS n FROM marib_audit");
    if ((a[0]?.n as number) === 0) {
      await audit("Amin", "create", "site", null, null);
    }
    // R37 — seed الاتزان once: the owner's Employees Database snapshot
    // (2005 people) lands automatically on the first boot after deploy.
    // Bulk insert via unnest in chunks — one statement per 500 rows.
    try {
      const m = await q("SELECT COUNT(*)::int AS n FROM marib_emp");
      if ((m[0]?.n as number) === 0) {
        const { MANPOWER_SEED } = await import("../../server/seed/manpower-seed");
        for (let i = 0; i < MANPOWER_SEED.length; i += 500) {
          const chunk = MANPOWER_SEED.slice(i, i + 500);
          const codes = chunk.map((r) => r[0]);
          const names = chunk.map((r) => r[1]);
          const jobs = chunk.map((r) => r[2]);
          const depts = chunk.map((r) => r[3]);
          const hires = chunk.map((r) => r[4]);
          await q(
            `INSERT INTO marib_emp (code, name, job, dept, hire)
             SELECT c, n, j, d, h FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(c, n, j, d, h)
             ON CONFLICT (code) DO NOTHING`,
            [codes, names, jobs, depts, hires]
          );
        }
      }
    } catch (e) {
      console.error("manpower seed failed", e); // non-fatal: the app still boots
    }
  })();
  booting = attempt;
  /* a failed first boot must not brick the instance forever — retry on
     the next request instead */
  attempt.catch(() => {
    if (booting === attempt) booting = null;
  });
  return attempt;
}

/* ---------- audit helper (safe — never throws into the caller) ---------- */
export async function audit(
  actor: string,
  action: string,
  entity: string,
  label: string | null,
  details: unknown
): Promise<void> {
  try {
    await q(
      `INSERT INTO marib_audit (actor, action, entity, label, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actor, action, entity, label, JSON.stringify(details ?? null)]
    );
  } catch (e) {
    console.error("audit insert failed", e);
  }
}
