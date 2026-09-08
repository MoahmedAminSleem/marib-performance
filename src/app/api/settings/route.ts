/* /api/settings — app settings stored on the server (Neon)
   GET → { targets, groups, storage_quota, mhome }   (any signed-in user)
   PUT → { key, value }  · targets & groups: admin/dev · storage_quota: dev
         every change is audited (old → new)
   R25: refactored onto the shared http helpers + structured logging. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { isAdmin, isDev } from "@/lib/marib/session";
import { fail, serverFail, readJson, logger, requireUser, requireRoleBody } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("settings");

const KEYS = ["targets", "groups", "storage_quota", "mhome"];

async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = await q("SELECT key, value FROM marib_setting");
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key as string] = r.value;
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "settings", "GET");
    if (g.res) return g.res;
    return NextResponse.json(await loadSettings());
  } catch (e) {
    return serverFail("settings", "GET", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await requireRoleBody(req, "user");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const key = String(body.key || "");
    const value = body.value;
    if (!KEYS.includes(key)) return fail("key", 400);
    if (key === "storage_quota" || key === "mhome") {   /* R30: mhome = dev only */
      if (!isDev(me)) return fail("dev", 403);
    } else if (!isAdmin(me)) {
      return fail("admin", 403);
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
    } else if (key === "mhome") {
      const u = (value as { users?: unknown[] })?.users;
      summary = { people: Array.isArray(u) ? u.length : 0 };
    }
    await audit(me.username, "edit", "settings:" + key, key, { from: oldValue, to: summary ?? value });
    lg.info("setting saved", { key, by: me.username });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("settings", "PUT", e);
  }
}
