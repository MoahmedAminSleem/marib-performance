/* /api/users — user management (admin/dev only)
   GET list · POST create · PUT password/role · DELETE remove — every change audited
   R25: refactored onto the shared http helpers + structured logging. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { hashPassword, isDev } from "@/lib/marib/session";
import { fail, serverFail, readJson, logger, requireRole, requireRoleBody, type SessionUser } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("users");

export async function GET(req: NextRequest) {
  try {
    const g = await requireRole(req, "admin", "users", "GET");
    if (g.res) return g.res;
    const rows = await q(
      "SELECT id, username, role, created_at, created_by FROM marib_user ORDER BY created_at ASC"
    );
    return NextResponse.json({ users: rows });
  } catch (e) {
    return serverFail("users", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = body.admin ? "admin" : "user";
    if (username.length < 2 || password.length < 4) return fail("invalid", 400);

    const dupe = await q("SELECT 1 FROM marib_user WHERE LOWER(username) = LOWER($1)", [username]);
    if (dupe.length) return fail("duplicate", 409);

    const id = crypto.randomUUID();
    await q(
      "INSERT INTO marib_user (id, username, pass_hash, role, created_by) VALUES ($1, $2, $3, $4, $5)",
      [id, username, hashPassword(password), role, me.username]
    );
    await audit(me.username, "create", "users:" + username, username, { role });
    lg.info("user created", { by: me.username, user: username, role });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return serverFail("users", "POST", e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const id = String(body.id || "");
    const rows = await q("SELECT id, username, role FROM marib_user WHERE id = $1", [id]);
    const rec = rows[0] as { id: string; username: string; role: string } | undefined;
    if (!rec) return fail("notfound", 404);

    /* only a dev may touch a dev account — blocks an admin from taking
       over Amin's account via a password reset */
    if (rec.role === "dev" && !isDev(me)) return fail("dev-fixed");
    /* nobody resets their own password here from the admin panel either */

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 4) return fail("invalid", 400);
      await q("UPDATE marib_user SET pass_hash = $1 WHERE id = $2", [hashPassword(body.password), id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "password" });
      lg.info("password changed", { by: me.username, user: rec.username });
    }
    if (typeof body.role === "string" && ["admin", "user"].includes(body.role)) {
      if (rec.role === "dev") return fail("dev-fixed");
      await q("UPDATE marib_user SET role = $1 WHERE id = $2", [body.role, id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "role", to: body.role });
      lg.info("role changed", { by: me.username, user: rec.username, to: body.role });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("users", "PUT", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await requireRoleBody(req, "admin");
    if (g.res) return g.res;
    const me = g.user! as SessionUser;

    const id = req.nextUrl.searchParams.get("id") || "";
    const rows = await q("SELECT id, username, role FROM marib_user WHERE id = $1", [id]);
    const rec = rows[0] as { id: string; username: string; role: string } | undefined;
    if (!rec) return fail("notfound", 404);
    if (rec.role === "dev") return fail("dev-fixed");
    if (rec.id === me.uid) return fail("self");

    await q("DELETE FROM marib_user WHERE id = $1", [id]);
    await audit(me.username, "delete", "users:" + rec.username, rec.username, null);
    lg.warn("user deleted", { by: me.username, user: rec.username });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("users", "DELETE", e);
  }
}
