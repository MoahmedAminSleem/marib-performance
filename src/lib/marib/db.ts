/* Marib DB layer — one SQL dialect (PostgreSQL), two drivers:
 *  - production (Vercel + Neon): node-postgres Pool
 *  - local dev: PGlite (real Postgres in-process, persisted at db/pglite)
 * Chosen by DATABASE_URL: starts with "postgres" → pg, otherwise PGlite. */

import path from "path";

type Row = Record<string, unknown>;

/* (R48) نوع الـ Pool من pg — الـ dynamic import بيرجّع قيمة مش نوع،
   فبنستخدم type-only import بدال استخدام Pool كنوع. */
type PgPool = import("pg").Pool;

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
    (g as unknown as { __maribPool?: PgPool }).__maribPool = pool;
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

/** R56: الـ driver الشغال دلوقتي — /api/health بيرجعه للمراقبة،
 *  عشان المالك يتأكد بعينه إن النسخة المنشورة على Vercel بتكتب
 *  على Neon (postgres URL) مش على القاعدة المحلية (pglite).
 *  نفس شرط الاختيار اللي createDriver بيستخدمه بالظبط. */
export function driverName(): "neon" | "pglite" {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://") ? "neon" : "pglite";
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
    await import("pg"); /* side-effect: make sure the driver is loaded */
    // reach the SAME pool the driver wraps
    const pool = (g as unknown as { __maribPool?: PgPool }).__maribPool!;
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
  /* R57 (perf): فلترة الأوديت بالأكشن (lastSync في /api/data بيقرأ
     كل الـ uploads، وفلاتر صفحة السجل بتسأل بالأكشن) — فهرس مركب
     يخدم الفلتر والترتيب مع بعض. */
  `CREATE INDEX IF NOT EXISTS marib_audit_action_at_idx ON marib_audit (action, at)`,
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
  /* R38 — dept transfer notes (e.g. "12 موظف ات نقلوا مع القسم") */
  `ALTER TABLE marib_transfer ADD COLUMN IF NOT EXISTS note TEXT`,
  /* R38 — الاتزان v2: the قسم tree (arbitrary depth, survives renames
     and moves without touching a single employee row) + the seed version
     gate. code becomes nullable (vacancy rows) and the uniqueness moves
     to a partial index that ignores NULLs and 'جديد' (code pending). */
  `CREATE TABLE IF NOT EXISTS marib_dept (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id TEXT,
    ord       INT  NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marib_dept_parent_idx ON marib_dept (parent_id)`,
  `CREATE TABLE IF NOT EXISTS marib_meta (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL
  )`,
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS dept_id TEXT`,
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS note TEXT`,
  /* R40 — الماكينة: the machine the employee runs (H.L / S.N / D.N / O.L.3…).
     Shown in the Power-BI-style hover tooltip on the employee name. */
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS mach TEXT`,
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS vac BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS ord INT NOT NULL DEFAULT 0`,
  `ALTER TABLE marib_emp ALTER COLUMN code DROP NOT NULL`,
  `ALTER TABLE marib_emp ALTER COLUMN name DROP NOT NULL`,
  `ALTER TABLE marib_emp DROP CONSTRAINT IF EXISTS marib_emp_code_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS marib_emp_code_uq
     ON marib_emp (code) WHERE code IS NOT NULL AND code <> 'جديد'`,
  `CREATE INDEX IF NOT EXISTS marib_emp_dept_id_idx ON marib_emp (dept_id)`,
  /* R42 — الترجمة التلقائية: cache للترجمات المجانية (أقسام ووظائف
     المستخدم المضافة من الموقع). term = الكلمة زي ما اتكتبت،
     lang = en|tr|ar، tr = الترجمة. يقرأها GET /api/manpower ويرجعها
     خريطة ترجمة للعميل — TT() بيدور فيها بعد الجلوسار. */
  `CREATE TABLE IF NOT EXISTS marib_i18n (
    term      TEXT NOT NULL,
    lang      TEXT NOT NULL,
    tr        TEXT NOT NULL,
    at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (term, lang)
  )`,
  /* R46-3: الأسماء العربية للموظفين والوظائف. nullable — لو مش متسجل،
     الـ UI بيلغي الـ toggle icon. الأسماء الإنجليزي هي الـ default في
     الـ name/job columns العادية، والـ Arabic بيتحط في الـ columns دي. */
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS name_ar TEXT`,
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS job_ar TEXT`,
  /* R46 — نظام الصلاحيات per-user × per-feature. المستخدم المطور (dev)
     بيحدد لكل يوزر صلاحية كل ميزة: inherit | hidden | view | edit.
     inherit = fallback حسب الـ role (dev:edit, admin:edit, user:view).
     مفتاح أساسي مركّب: (user_id, feature). */
  `CREATE TABLE IF NOT EXISTS marib_perm (
    user_id    TEXT NOT NULL,
    feature    TEXT NOT NULL,
    level      TEXT NOT NULL DEFAULT 'inherit',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT,
    PRIMARY KEY (user_id, feature)
  )`,
  `CREATE INDEX IF NOT EXISTS marib_perm_user_idx ON marib_perm (user_id)`,
  /* R46-7: نظام الـ undo للاستيراد. قبل أي استيراد، بناخد snapshot
     للجداول marib_emp + marib_dept + marib_req + marib_transfer + marib_meta
     ونخزنها JSON هنا مع token + 15 دقيقة expiry. لو اليوزر دوس Undo
     في خلال الـ 15 دقيقة، السيرفر بيعمل restore. لو عدى، بنحذف الـ token. */
  `CREATE TABLE IF NOT EXISTS marib_undo (
    token      TEXT NOT NULL PRIMARY KEY,
    actor      TEXT NOT NULL,
    payload    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS marib_undo_expires_idx ON marib_undo (expires_at)`,
  /* R46-8: صفحات إدخال البيانات الجديدة. بدل ما اليوزر يعتمد على
     الإكسل، بيقدر يدخل البيانات من على الموقع مباشرة. الـ dashboard
     بياخد البيانات دي ويضيفها للـ months اللي بتبني الـ model. */
  /* جدول إدخال الإنتاج بالـ PO: لكل قسم + خط + تاريخ، كمية بإسم PO. */
  `CREATE TABLE IF NOT EXISTS marib_prod (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    month_key  TEXT NOT NULL,           -- YYYY-MM
    date       DATE NOT NULL,
    dept_id    TEXT,                     -- الأقسام (mأرب 3، الإنتاج، ...)
    line_id    TEXT,                     -- الخط (خط 1، 2، 3، ...)
    po_number  TEXT NOT NULL DEFAULT '', -- رقم أمر الإنتاج
    qty        INT NOT NULL DEFAULT 0,   -- الكمية
    note       TEXT NOT NULL DEFAULT '',
    actor      TEXT NOT NULL,            -- مين اللي عمل الإدخال
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marib_prod_month_idx ON marib_prod (month_key)`,
  `CREATE INDEX IF NOT EXISTS marib_prod_date_idx ON marib_prod (date)`,
  /* R58: تجميع إنتاج الـ PO (التولتيب/الخانات في الإدخال بتسأل
     بالـ PO دايمًا) — فهرس مركب يخدم التجميع بالتاريخ. */
  `CREATE INDEX IF NOT EXISTS marib_prod_po_date_idx ON marib_prod (po_number, date)`,
  /* R58 — ريفرانس كمية العقد لكل PO (طلب المالك في الإدخال):
     لما يكتب PO أول مرة يسجل كمية عقده، والخانات والتولتيب
     بيحسبوا المصنوع/المتبقي منها. الرفع من تيمبلت إكسل أو الكتابة
     المباشرة — الاتنين upsert على نفس الجدول. */
  `CREATE TABLE IF NOT EXISTS marib_po (
    po           TEXT PRIMARY KEY,          -- رقم أمر الإنتاج
    contract_qty INT NOT NULL DEFAULT 0,   -- كمية العقد
    note         TEXT NOT NULL DEFAULT '',
    actor        TEXT NOT NULL,            -- مين سجّل العقد
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   TEXT
  )`,
  /* جدول الغياب: كل سجل = موظف + تاريخ + سبب. ممكن يكون emp_id فاضي
     لو الموظف لسه مش موجود في الاتزان (لو اليوزر رفع غياب لشخص من غير
     الكود — بيتسجل كعدد لحد ما يترفع على الاتزان). */
  `CREATE TABLE IF NOT EXISTS marib_absence (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    month_key  TEXT NOT NULL,
    date       DATE NOT NULL,
    emp_id     TEXT,                     -- nullable — لو مش موجود في marib_emp
    emp_code   TEXT NOT NULL DEFAULT '',
    emp_name   TEXT NOT NULL DEFAULT '',
    dept_id    TEXT,                     -- القسم اللي هو فيه (من marib_emp)
    reason     TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    actor      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marib_absence_month_idx ON marib_absence (month_key)`,
  `CREATE INDEX IF NOT EXISTS marib_absence_date_idx ON marib_absence (date)`,
  /* جدول الأوفر تايم: كل سجل = موظف + تاريخ + ساعات. لو الموظف مش
     موجود، بنسجله كعدد في قسم/خط معين لحد ما يترفع على الاتزان. */
  `CREATE TABLE IF NOT EXISTS marib_overtime (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    month_key  TEXT NOT NULL,
    date       DATE NOT NULL,
    emp_id     TEXT,
    emp_code   TEXT NOT NULL DEFAULT '',
    emp_name   TEXT NOT NULL DEFAULT '',
    dept_id    TEXT,
    line_id    TEXT,
    hours      NUMERIC(4,2) NOT NULL DEFAULT 0,
    note       TEXT NOT NULL DEFAULT '',
    actor      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marib_overtime_month_idx ON marib_overtime (month_key)`,
  `CREATE INDEX IF NOT EXISTS marib_overtime_date_idx ON marib_overtime (date)`,
  /* R50 — التركي من الشيت: أعمدة الترجمة اليدوية بجانب العربية.
     الاسم/الوظيفة للموظف، والاسم للقسم، والقسم النصي لسجلات الإنتاج
     والأوفر تايم (أقسام الأرضية الخمسة مش من شجرة الاتزان). */
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS name_tr TEXT`,
  `ALTER TABLE marib_emp ADD COLUMN IF NOT EXISTS job_tr TEXT`,
  `ALTER TABLE marib_dept ADD COLUMN IF NOT EXISTS label_tr TEXT`,
  `ALTER TABLE marib_prod ADD COLUMN IF NOT EXISTS dept_name TEXT`,
  `ALTER TABLE marib_overtime ADD COLUMN IF NOT EXISTS dept_name TEXT`,
];

let booting: Promise<void> | null = null;

/* ── R57 (perf): بوابة الإقلاع ──
   البوت الكامل كان بيتنفذ على كل إقلاع بارد: ~44 استعلام DDL/فحص
   (كل واحد رحلة شبكة على Neon = ثواني في السيرفرلس). دلوقتي أول
   استعلام واحد بيقرأ boot_ver من marib_meta: لو مطابق للثابت →
   النسخة دي اقلعت قبل كده بنفس الـ schema والبذر خلص → تخطي كامل.
   أي DDL جديد مستقبلًا = زوّد على الثابت وكل نسخة هتبوت كامل مرة
   واحدة بس. العلامة مش بتتكتب غير لما البذر يتأكد (mp_seed_ver=42)
   — لو البذر فشل (non-fatal) البوابة مش بتتحط والسلوك القديم
   (إعادة المحاولة كل إقلاع) بيفضل زي ما هو بالظبط. */
/* "58": فهرس marib_prod(po_number, date) + جدول marib_po (ريفرانس
   كمية العقد لكل PO — طلب المالك في صفحة الإدخال). */
const BOOT_VER = "58";

interface BootInfoShape {
  __maribBootInfo?: { ver: string; path: "fast" | "full" };
}
const bg = globalThis as unknown as BootInfoShape;

/** R57: ازاي اقلعت النسخة الحالية — /api/health بيعرضها كإثبات
 *  مرئي للمالك (fast = البوابة اتخطت باستعلام واحد، full = الـ DDL
 *  اشتغل فعليًا). pending = لسه مفيش ضمان إقلاع في العملية دي. */
export function bootInfo(): { ver: string; path: "fast" | "full" | "pending" } {
  return { ver: BOOT_VER, path: bg.__maribBootInfo?.path || "pending" };
}

export async function ensureBoot(): Promise<void> {
  if (booting) return booting;
  const attempt = (async () => {
    /* البوابة السريعة — استعلام واحد بدل ~44 */
    try {
      const v = await q("SELECT value FROM marib_meta WHERE key = 'boot_ver'");
      if (v[0]?.value === BOOT_VER) {
        bg.__maribBootInfo = { ver: BOOT_VER, path: "fast" };
        return;
      }
    } catch {
      /* قاعدة فاضية تمامًا — marib_meta لسه مش موجودة: بوت كامل */
    }
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
    // R40 — seed الاتزان from the owner's latest Manpower.xlsx "Database"
    // sheet (2026-09-14: adds the الماكينة column so names can show their
    // machine in a hover tooltip, like the owner asked). Version-gated:
    // the R39 snapshot is replaced exactly once, then the gate key
    // marib_meta.mp_seed_ver=42 keeps this block idle on every boot.
    // Users / months / settings / audit are NEVER touched.
    try {
      const ver = await q("SELECT value FROM marib_meta WHERE key = 'mp_seed_ver'");
      if ((ver[0]?.value as string) !== "42") {
        const { MANPOWER_DEPTS, MANPOWER_EMPS } = await import("../../server/seed/manpower-seed");
        await q("BEGIN");
        try {
          await q("DELETE FROM marib_emp");
          await q("DELETE FROM marib_dept");
          await q("DELETE FROM marib_req");
          await q("DELETE FROM marib_transfer");
          for (let i = 0; i < MANPOWER_DEPTS.length; i += 200) {
            const ch = MANPOWER_DEPTS.slice(i, i + 200);
            await q(
              `INSERT INTO marib_dept (id, name, parent_id, ord)
               SELECT i, n, p, o FROM unnest($1::text[], $2::text[], $3::text[], $4::int[]) AS t(i, n, p, o)`,
              [ch.map((r) => r[0]), ch.map((r) => r[1]), ch.map((r) => r[2]), ch.map((r) => r[3])]
            );
          }
          for (let i = 0; i < MANPOWER_EMPS.length; i += 500) {
            const ch = MANPOWER_EMPS.slice(i, i + 500);
            await q(
              `INSERT INTO marib_emp (code, name, job, dept_id, hire, vac, note, ord, mach)
               SELECT c, n, j, d, h, v, no, o, ma FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bool[], $7::text[], $8::int[], $9::text[]) AS t(c, n, j, d, h, v, no, o, ma)`,
              [
                ch.map((r) => r[0] || null),
                ch.map((r) => r[1] || ""),
                ch.map((r) => r[2] || ""),
                ch.map((r) => r[3] || null),
                ch.map((r) => r[4] || ""),
                ch.map((r) => !!r[5]),
                ch.map((r) => r[6] || ""),
                ch.map((r) => r[7] || 0),
                ch.map((r) => r[8] || ""),
              ]
            );
          }
          await q(
            `INSERT INTO marib_meta (key, value) VALUES ('mp_seed_ver', '42')
             ON CONFLICT (key) DO UPDATE SET value = '42'`
          );
          await q("COMMIT");
        } catch (e) {
          await q("ROLLBACK").catch(() => {});
          throw e;
        }
      }
    } catch (e) {
      console.error("manpower seed failed", e); // non-fatal: the app still boots
    }

    /* R57: كتابة علامة البوابة — بس بعد التأكد إن البذر خلص فعليًا
       (mp_seed_ver=42). لو البذر فشل العلامة مش بتتكتب، فكل إقلاع
       بيعيد المحاولة زي السلوك القديم بالظبط. */
    let seedOk = false;
    try {
      const ver2 = await q("SELECT value FROM marib_meta WHERE key = 'mp_seed_ver'");
      seedOk = ver2[0]?.value === "42";
    } catch {
      /* meta قراءة فاشلة = نفضل من غير علامة (احتياط) */
    }
    if (seedOk) {
      await q(
        `INSERT INTO marib_meta (key, value) VALUES ('boot_ver', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [BOOT_VER]
      );
    }
    bg.__maribBootInfo = { ver: BOOT_VER, path: "full" };
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
