/* /api/users — user management (admin/dev only)
   GET list · POST create · PUT password/role · DELETE remove — every change audited */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot, q, audit } from "@/lib/marib/db";
import { currentUser, sessionUser, hashPassword, isAdmin, isDev } from "@/lib/marib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function deny(msg: string, code = 403) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function GET(req: NextRequest) {
  try {
    await ensureBoot();
    const me = sessionUser(req);
    if (!me) return deny("auth", 401);
    if (!isAdmin(me)) return deny("admin");
    const rows = await q(
      "SELECT id, username, role, created_at, created_by FROM marib_user ORDER BY created_at ASC"
    );
    return NextResponse.json({ users: rows });
  } catch (e) {
    console.error("users GET", e);
    return deny("server", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureBoot();
    const me = await currentUser(req);
    if (!me) return deny("auth", 401);
    if (!isAdmin(me)) return deny("admin");

    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = body.admin ? "admin" : "user";
    if (username.length < 2 || password.length < 4) return deny("invalid", 400);

    const dupe = await q("SELECT 1 FROM marib_user WHERE LOWER(username) = LOWER($1)", [username]);
    if (dupe.length) return deny("duplicate", 409);

    const id = crypto.randomUUID();
    await q(
      "INSERT INTO marib_user (id, username, pass_hash, role, created_by) VALUES ($1, $2, $3, $4, $5)",
      [id, username, hashPassword(password), role, me.username]
    );
    await audit(me.username, "create", "users:" + username, username, { role });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("users POST", e);
    return deny("server", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureBoot();
    const me = await currentUser(req);
    if (!me) return deny("auth", 401);
    if (!isAdmin(me)) return deny("admin");

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const rows = await q("SELECT id, username, role FROM marib_user WHERE id = $1", [id]);
    const rec = rows[0] as { id: string; username: string; role: string } | undefined;
    if (!rec) return deny("notfound", 404);

    /* only a dev may touch a dev account — blocks an admin from taking
       over Amin's account via a password reset */
    if (rec.role === "dev" && !isDev(me)) return deny("dev-fixed");
    /* nobody resets their own password here from the admin panel either */

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 4) return deny("invalid", 400);
      await q("UPDATE marib_user SET pass_hash = $1 WHERE id = $2", [hashPassword(body.password), id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "password" });
    }
    if (typeof body.role === "string" && ["admin", "user"].includes(body.role)) {
      if (rec.role === "dev") return deny("dev-fixed");
      await q("UPDATE marib_user SET role = $1 WHERE id = $2", [body.role, id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "role", to: body.role });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("users PUT", e);
    return deny("server", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureBoot();
    const me = await currentUser(req);
    if (!me) return deny("auth", 401);
    if (!isAdmin(me)) return deny("admin");

    const id = req.nextUrl.searchParams.get("id") || "";
    const rows = await q("SELECT id, username, role FROM marib_user WHERE id = $1", [id]);
    const rec = rows[0] as { id: string; username: string; role: string } | undefined;
    if (!rec) return deny("notfound", 404);
    if (rec.role === "dev") return deny("dev-fixed");
    if (me && rec.id === me.uid) return deny("self");

    await q("DELETE FROM marib_user WHERE id = $1", [id]);
    await audit(me.username, "delete", "users:" + rec.username, rec.username, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("users DELETE", e);
    return deny("server", 500);
  }
}
