/* /api/users — user management
   GET list · POST create · PUT password/role/photo/title · DELETE remove
   — every change audited.
   R25: refactored onto the shared http helpers + structured logging.
   R27: photo + title are ADMIN-set (for any user) from the users modal —
   the R26 self-service photo branch is gone by request; regular users
   can no longer patch anything here (403 as before).
   R55: الحارس بقى صلاحية users.manage (view للقراءة، edit للتغيير)
   بدل دور admin — الأدمن يقدر يمنح يوزر إدارة اليوزرين من اللوحة. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { hashPassword, isDev } from "@/lib/marib/session";
import { invalidateUser } from "@/lib/marib/authcache"; /* R57: إبطال كاش الدور فورًا */
import { fail, serverFail, readJson, logger, requirePermBody, type SessionUser } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("users");

/* R26/R27: max stored photo size (data-URL chars) — the client resizes
   to a 240px square JPEG with adaptive quality (~10-25KB); the cap is
   a safety net, not the norm. */
const PHOTO_MAX = 400_000;
/* R27: job title limits — kept tight so chips/rows never break layout */
const TITLE_MAX = 40;

export async function GET(req: NextRequest) {
  try {
    /* R27 review#1: live check (not just the signed cookie) — the list
       carries every user's photo+title. R55: الحارس users.manage view. */
    const g = await requirePermBody(req, "users.manage", "view");
    if (g.res) return g.res;
    const rows = await q(
      "SELECT id, username, role, photo, title, created_at, created_by FROM marib_user ORDER BY created_at ASC"
    );
    return NextResponse.json({ users: rows });
  } catch (e) {
    return serverFail("users", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    /* R55: إنشاء يوزر = users.manage edit */
    const g = await requirePermBody(req, "users.manage", "edit");
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
    /* R27: EVERY patch (photo / title / password / role) needs
       users.manage edit — a regular user gets 403. The photo no longer
       needs the self-service branch: admins set photos from the users
       modal. */
    const g = await requirePermBody(req, "users.manage", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const id = String(body.id || "");

    const rows = await q("SELECT id, username, role FROM marib_user WHERE id = $1", [id]);
    const rec = rows[0] as { id: string; username: string; role: string } | undefined;
    if (!rec) return fail("notfound", 404);

    /* only a dev may touch a dev account — blocks an admin from taking
       over Amin's account via a password reset (photo/title too: an
       admin shouldn't restyle the developer's identity) */
    if (rec.role === "dev" && !isDev(me)) return fail("dev-fixed");

    /* ---- R27: photo (admin sets ANY user's photo, incl. own) ---- */
    if (body.photo !== undefined) {
      const photo = body.photo;
      if (typeof photo !== "string" || photo.length > PHOTO_MAX) return fail("invalid", 400);
      if (photo.length > 0 && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(photo)) return fail("invalid", 400);
      await q("UPDATE marib_user SET photo = $1 WHERE id = $2", [photo || null, id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "photo", to: photo ? "set" : "cleared" });
      lg.info("photo " + (photo ? "set" : "cleared"), { by: me.username, user: rec.username });
    }

    /* ---- R27: title / لقب (admin sets, empty clears) — trim to the
       same 40-unit cap the client enforces, reject nothing (friendly) ---- */
    if (body.title !== undefined) {
      const raw = String(body.title ?? "");
      /* strip control chars + hard trim so chips never wrap weirdly */
      const title = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, TITLE_MAX);
      await q("UPDATE marib_user SET title = $1 WHERE id = $2", [title || null, id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "title", to: title || "(cleared)" });
      lg.info("title set", { by: me.username, user: rec.username, title: title || "(cleared)" });
    }

    /* ---- R63: username rename — طلب المالك: الاسم كان مش متاح للتعديل.
       نفس قواعد الإنشاء: 2-40 حرف بدون حروف تحكم، والتفرده
       case-insensitive (لو حد تاني ماخد الاسم → 409). الجلسة
       بتشتغل بالـ uid فالاسم الجديد بيفضل شغال من غير إعادة دخول. ---- */
    if (body.username !== undefined) {
      const nu = String(body.username ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
      if (nu.length < 2 || nu.length > 40) return fail("invalid", 400);
      if (nu !== rec.username) {
        const dupe = await q(
          "SELECT 1 FROM marib_user WHERE LOWER(username) = LOWER($1) AND id <> $2",
          [nu, id]
        );
        if (dupe.length) return fail("duplicate", 409);
        await q("UPDATE marib_user SET username = $1 WHERE id = $2", [nu, id]);
        /* R63: الكاش كان هيفضل ماسك الاسم القديم لحد الـ TTL — الإبطال
           الفوري + الكاش الجديد (اللي بيحمل الاسم) بيخلي التعديل ظاهر
           في نفس اللحظة (التوب بار + الأوديت بيشوفوا الاسم الجديد). */
        invalidateUser(id);
        await audit(me.username, "edit", "users:" + nu, rec.username, { change: "username", from: rec.username, to: nu });
        lg.info("username changed", { by: me.username, from: rec.username, to: nu });
      }
    }

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 4) return fail("invalid", 400);
      await q("UPDATE marib_user SET pass_hash = $1 WHERE id = $2", [hashPassword(body.password), id]);
      await audit(me.username, "edit", "users:" + rec.username, rec.username, { change: "password" });
      lg.info("password changed", { by: me.username, user: rec.username });
    }
    if (typeof body.role === "string" && ["admin", "user"].includes(body.role)) {
      if (rec.role === "dev") return fail("dev-fixed");
      await q("UPDATE marib_user SET role = $1 WHERE id = $2", [body.role, id]);
      /* R57: الدور اتغير — كاش الدور/الصلاحيات لازم يموت دلوقتي عشان
         التنزيل يشتغل فورًا على نفس السيرفر (زي ما كان قبل الكاش) */
      invalidateUser(id);
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
    /* R55: حذف يوزر = users.manage edit */
    const g = await requirePermBody(req, "users.manage", "edit");
    if (g.res) return g.res;
    const me = g.user! as SessionUser;

    const id = req.nextUrl.searchParams.get("id") || "";
    const rows = await q("SELECT id, username, role FROM marib_user WHERE id = $1", [id]);
    const rec = rows[0] as { id: string; username: string; role: string } | undefined;
    if (!rec) return fail("notfound", 404);
    if (rec.role === "dev") return fail("dev-fixed");
    if (rec.id === me.uid) return fail("self");

    await q("DELETE FROM marib_user WHERE id = $1", [id]);
    /* R57: اليوزر اتمسح — كاش دوره كان هيخليه «حي» لحد الـ TTL؛
       الإبطال الفوري بيقطع صلاحيته في نفس اللحظة */
    invalidateUser(id);
    await audit(me.username, "delete", "users:" + rec.username, rec.username, null);
    lg.warn("user deleted", { by: me.username, user: rec.username });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverFail("users", "DELETE", e);
  }
}
