/* /api/auth — login (POST) · session (GET) · logout (DELETE)
   R25: refactored onto the shared http helpers + structured logging
   (login attempts, throttling, logins and logouts are now visible in
   the Vercel runtime logs and logs/marib.log locally). */

import { NextRequest, NextResponse } from "next/server";
import { q, audit } from "@/lib/marib/db";
import { issueToken, verifyPassword, COOKIE_NAME, type SessionUser } from "@/lib/marib/session";
import { fail, serverFail, readJson, logger, requireUser } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("auth");

/* login throttle — per username+IP, in-memory (survives HMR via globalThis) */
const g = globalThis as unknown as { __maribFails?: Map<string, { n: number; until: number }> };
const fails = (g.__maribFails ||= new Map());
const WINDOW = 10 * 60 * 1000;
const MAX_FAILS = 8;

function throttleKey(req: NextRequest, username: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return username.toLowerCase() + "@" + ip;
}
function isLocked(key: string): boolean {
  const f = fails.get(key);
  return !!f && f.n >= MAX_FAILS && Date.now() < f.until;
}
function noteFail(key: string): void {
  const f = fails.get(key) || { n: 0, until: 0 };
  if (Date.now() - (f.until || 0) > WINDOW) f.n = 0;
  f.n += 1;
  f.until = Date.now() + WINDOW;
  fails.set(key, f);
}
function clearFails(key: string): void {
  fails.delete(key);
}

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "auth", "GET");
    /* the login screen expects the exact { user: null } body on
       no-session (401 status, null user — original shape kept) */
    if (g.res) return NextResponse.json({ user: null }, { status: 401 });
    /* R26: the session user carries the profile photo too (photo circle);
       R27: and the job title (لقب) — both read live from the DB so they
       update without re-issuing the signed cookie. */
    let photo: string | null = null;
    let title: string | null = null;
    try {
      const rows = await q("SELECT photo, title FROM marib_user WHERE id = $1 LIMIT 1", [g.user!.uid]);
      photo = (rows[0]?.photo as string) || null;
      title = (rows[0]?.title as string) || null;
    } catch { /* DB hiccup — the session without the photo is still valid */ }
    return NextResponse.json({ user: { ...g.user!, photo, title } });
  } catch (e) {
    return serverFail("auth", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const remember = !!body.remember;
    if (!username || !password) return fail("fill", 400);

    const tKey = throttleKey(req, username);
    if (isLocked(tKey)) {
      lg.warn("login blocked (throttle)", { user: username, fails: fails.get(tKey)?.n });
      return fail("locked", 429);
    }

    const rows = await q(
      "SELECT id, username, pass_hash, role, photo, title FROM marib_user WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [username]
    );
    const rec = rows[0] as { id: string; username: string; pass_hash: string; role: SessionUser["role"]; photo?: string | null; title?: string | null } | undefined;
    /* dummy verify on unknown user keeps the timing flat (no enumeration) */
    const stored = rec ? rec.pass_hash : "scrypt$00$00000000000000000000000000000000";
    const okPass = verifyPassword(password, stored) && !!rec;
    if (!okPass) {
      noteFail(tKey);
      lg.warn("login failed", { user: username, attempt: fails.get(tKey)?.n });
      return fail("bad", 401);
    }
    clearFails(tKey);
    const u: SessionUser = { uid: rec!.id, username: rec!.username, role: rec!.role };
    const { token, maxAge } = issueToken(u, remember);
    await audit(u.username, "login", "site", null, null);
    lg.info("login ok", { user: u.username, role: u.role, remember });

    const res = NextResponse.json({ user: { ...u, photo: (rec as { photo?: string | null }).photo || null, title: (rec as { title?: string | null }).title || null } });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: maxAge ?? undefined,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    return serverFail("auth", "POST", e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = (await requireUser(req, "auth", "DELETE")).user;
    if (me) {
      await audit(me.username, "logout", "site", null, null);
      lg.info("logout", { user: me.username });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return serverFail("auth", "DELETE", e);
  }
}
