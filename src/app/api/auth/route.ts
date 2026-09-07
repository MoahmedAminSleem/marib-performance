/* /api/auth — login (POST) · session (GET) · logout (DELETE) */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot, q, audit } from "@/lib/marib/db";
import { sessionUser, issueToken, verifyPassword, COOKIE_NAME, type SessionUser } from "@/lib/marib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    await ensureBoot();
    const u = sessionUser(req);
    if (!u) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: u });
  } catch (e) {
    console.error("auth GET", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureBoot();
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const remember = !!body.remember;
    if (!username || !password) return NextResponse.json({ error: "fill" }, { status: 400 });

    const tKey = throttleKey(req, username);
    if (isLocked(tKey)) return NextResponse.json({ error: "locked" }, { status: 429 });

    const rows = await q(
      "SELECT id, username, pass_hash, role FROM marib_user WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [username]
    );
    const rec = rows[0] as { id: string; username: string; pass_hash: string; role: SessionUser["role"] } | undefined;
    /* dummy verify on unknown user keeps the timing flat (no enumeration) */
    const stored = rec ? rec.pass_hash : "scrypt$00$00000000000000000000000000000000";
    const ok = verifyPassword(password, stored) && !!rec;
    if (!ok) {
      noteFail(tKey);
      return NextResponse.json({ error: "bad" }, { status: 401 });
    }
    clearFails(tKey);
    const u: SessionUser = { uid: rec!.id, username: rec!.username, role: rec!.role };
    const { token, maxAge } = issueToken(u, remember);
    await audit(u.username, "login", "site", null, null);

    const res = NextResponse.json({ user: u });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: maxAge ?? undefined,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    console.error("auth POST", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const u = sessionUser(req);
    if (u) await audit(u.username, "logout", "site", null, null);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("auth DELETE", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
