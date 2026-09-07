/* /api/settings — app settings stored on the server (Neon)
   GET → { targets, groups, storage_quota }   (any signed-in user)
   PUT → { key, value }  · targets & groups: admin/dev · storage_quota: dev
         every change is audited (old → new) */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot, q, audit } from "@/lib/marib/db";
import { currentUser, sessionUser, isAdmin, isDev } from "@/lib/marib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEYS = ["targets", "groups", "storage_quota"];

async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = await q("SELECT key, value FROM marib_setting");
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key as string] = r.value;
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await ensureBoot();
    const me = sessionUser(req);
    if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });
    return NextResponse.json(await loadSettings());
  } catch (e) {
    console.error("settings GET", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureBoot();
    const me = await currentUser(req);
    if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "");
    const value = body.value;
    if (!KEYS.includes(key)) return NextResponse.json({ error: "key" }, { status: 400 });
    if (key === "storage_quota") {
      if (!isDev(me)) return NextResponse.json({ error: "dev" }, { status: 403 });
    } else if (!isAdmin(me)) {
      return NextResponse.json({ error: "admin" }, { status: 403 });
    }

    const prev = await q("SELECT value FROM marib_setting WHERE key = $1", [key]);
    const oldValue = prev[0]?.value ?? null;

    await q(
      `INSERT INTO marib_setting (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(value ?? null), me.username]
    );

    // summary of what changed for the audit trail
    let summary: unknown = null;
    if (key === "targets" && value && typeof value === "object") {
      const t = value as Record<string, Record<string, number> & { effectiveFrom?: string; retroactive?: boolean }>;
      summary = {
        achievement: t.achievement, efficiency: t.efficiency, overtime: t.overtime, attendance: t.attendance,
        effectiveFrom: t.effectiveFrom ?? null, retroactive: !!t.retroactive,
      };
    } else if (key === "groups" && value && typeof value === "object") {
      const a = (value as { assignments?: Record<string, string> }).assignments || {};
      summary = { people: Object.keys(a).length };
    } else if (key === "storage_quota") {
      summary = { quota: value };
    }
    await audit(me.username, "edit", "settings:" + key, key, { from: oldValue, to: summary ?? value });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("settings PUT", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
