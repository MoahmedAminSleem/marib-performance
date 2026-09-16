/* /api/perms — R46 نظام الصلاحيات
   GET  (?me=1) → صلاحيات المستخدم الحالي الفعّالة (لأي يوزر)
   GET  (افتراضي) → كل المستخدمين + كل الـ overrides (للأدمن بس)
   PUT  → set/update override لمستخدم + ميزة (للأدمن بس)
   DELETE → مسح override (للأدمن بس)
   — كل تغيير بيتسجل في الـ audit log. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { PERM_KEYS, PERM_KEY_SET, loadUserPerms, loadAllPerms, effectiveLevel, type PermLevel } from "@/lib/marib/perms";
import { fail, serverFail, readJson, logger, requireRoleBody } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("perms");

const VALID_LEVELS: PermLevel[] = ["inherit", "hidden", "view", "edit"];

export async function GET(req: NextRequest) {
  try {
    /* ?me=1 — المستخدم الحالي يقدر ياخد صلاحياته الفعّالة (أي يوزر).
       بترجع { perms: { feature: effectiveLevel } } لكل PERM_KEYS. */
    const meParam = req.nextUrl.searchParams.get("me");
    if (meParam === "1") {
      const g = await requireRoleBody(req, "user");
      if (g.res) return g.res;
      const me = g.user!;
      const overrides = await loadUserPerms(me.uid);
      const perms: Record<string, PermLevel> = {};
      for (const k of PERM_KEYS) perms[k.key] = effectiveLevel(me.role, overrides, k.key);
      return NextResponse.json({ perms });
    }

    /* default GET — admin only — كل المستخدمين + كل الـ overrides. */
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;

    const users = await q(
      "SELECT id, username, role FROM marib_user ORDER BY created_at ASC"
    );
    const allPerms = await loadAllPerms();
    const features = PERM_KEYS.map((k) => ({
      key: k.key,
      label_en: k.label_en,
      label_ar: k.label_ar,
      desc_en: k.desc_en,
      desc_ar: k.desc_ar,
      group: k.group,
    }));
    const usersOut = users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      perms: allPerms[u.id as string] || {},
    }));
    return NextResponse.json({ users: usersOut, features });
  } catch (e) {
    return serverFail("perms", "GET", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const userId = String(body.userId || "");
    const feature = String(body.feature || "");
    const level = String(body.level || "") as PermLevel;

    if (!userId) return fail("userId", 400);
    if (!PERM_KEY_SET.has(feature)) return fail("feature", 400);
    if (!VALID_LEVELS.includes(level)) return fail("level", 400);

    /* dev immunity: cannot downgrade a dev account — only dev himself
       can adjust another dev (rare, e.g., emergency). */
    const target = await q("SELECT role, username FROM marib_user WHERE id = $1", [userId]);
    if (!target.length) return fail("notfound", 404);
    if ((target[0] as { role: string }).role === "dev" && me.role !== "dev") return fail("dev-fixed");

    await q(
      `INSERT INTO marib_perm (user_id, feature, level, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, feature) DO UPDATE
         SET level = EXCLUDED.level, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [userId, feature, level, me.username]
    );

    const targetName = (target[0] as { username: string }).username;
    await audit(me.username, "edit", "perms:" + feature, targetName, { level, userId });
    lg.info("perm set", { by: me.username, user: targetName, feature, level });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("perms", "PUT", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user!;

    const userId = req.nextUrl.searchParams.get("userId") || "";
    const feature = req.nextUrl.searchParams.get("feature") || "";
    if (!userId || !feature) return fail("params", 400);
    if (!PERM_KEY_SET.has(feature)) return fail("feature", 400);

    /* dev immunity */
    const target = await q("SELECT role, username FROM marib_user WHERE id = $1", [userId]);
    if (!target.length) return fail("notfound", 404);
    if ((target[0] as { role: string }).role === "dev" && me.role !== "dev") return fail("dev-fixed");

    await q(
      "DELETE FROM marib_perm WHERE user_id = $1 AND feature = $2",
      [userId, feature]
    );
    await audit(me.username, "delete", "perms:" + feature, String((target[0] as { username: string }).username), { feature });
    lg.info("perm cleared", { by: me.username, user: (target[0] as { username: string }).username, feature });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("perms", "DELETE", e);
  }
}
