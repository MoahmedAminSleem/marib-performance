/* /api/storage — Neon database storage meter (dev/Amin only)
   Reports the real Postgres size (pg_database_size, with a
   sum-of-relations fallback) + the biggest tables, against the
   plan quota (stored in settings, default 3 GB). */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot, q } from "@/lib/marib/db";
import { sessionUser, isDev } from "@/lib/marib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_QUOTA = 3 * 1024 * 1024 * 1024; // 3 GB (Neon free plan default)

export async function GET(req: NextRequest) {
  try {
    await ensureBoot();
    const me = sessionUser(req);
    if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });
    if (!isDev(me)) return NextResponse.json({ error: "dev" }, { status: 403 });

    let bytes = 0;
    let method = "database";
    try {
      const r = await q("SELECT pg_database_size(current_database())::bigint AS bytes");
      bytes = Number((r[0]?.bytes as number) ?? 0);
    } catch {
      method = "relations";
    }
    if (!bytes) {
      const r = await q(
        `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'`
      );
      bytes = Number((r[0]?.bytes as number) ?? 0);
    }

    const tables = await q(
      `SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8`
    );

    let quota = DEFAULT_QUOTA;
    try {
      const s = await q("SELECT value FROM marib_setting WHERE key = 'storage_quota'");
      const v = (s[0]?.value as { gb?: number } | undefined) ?? undefined;
      if (v && typeof v.gb === "number" && v.gb > 0) quota = v.gb * 1024 * 1024 * 1024;
    } catch {
      /* default */
    }

    const maribRows = await q("SELECT COUNT(*)::int AS n FROM marib_data");
    const months = await q("SELECT COUNT(DISTINCT month)::int AS n FROM marib_data");

    return NextResponse.json({
      bytes,
      method,
      quota,
      tables: tables.map((t) => ({ name: t.name as string, bytes: Number(t.bytes) })),
      rows: (maribRows[0]?.n as number) ?? 0,
      months: (months[0]?.n as number) ?? 0,
    });
  } catch (e) {
    console.error("storage GET", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
