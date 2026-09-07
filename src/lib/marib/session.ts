/* Marib session — HMAC-signed cookie + scrypt password hashing (node:crypto) */

import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import type { NextRequest } from "next/server";

export interface SessionUser {
  uid: string;
  username: string;
  role: "dev" | "admin" | "user";
}

const COOKIE = "marib_sess";
const DAY = 86400;

function secret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // deterministic per-deployment secret derived from the (secret) DB URL
  const seed = (process.env.DATABASE_URL || "marib-local") + "marib-auth-v1";
  return createHash("sha256").update(seed).digest("hex");
}

function b64u(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function fromB64u(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function issueToken(u: SessionUser, remember: boolean): { token: string; maxAge: number | null } {
  const exp = Date.now() + (remember ? 30 * DAY : 12 * 3600) * 1000;
  const payload = b64u(JSON.stringify({ ...u, exp }));
  return { token: payload + "." + sign(payload), maxAge: remember ? 30 * DAY : null };
}

export function verifyToken(token: string | undefined | null): SessionUser | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = sign(payload);
  try {
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const o = JSON.parse(fromB64u(payload));
    if (!o || typeof o.exp !== "number" || o.exp < Date.now()) return null;
    return { uid: o.uid, username: o.username, role: o.role };
  } catch {
    return null;
  }
}

/** read the session user from an incoming request's cookie */
export function sessionUser(req: NextRequest): SessionUser | null {
  return verifyToken(req.cookies.get(COOKIE)?.value);
}

/** session + live role re-validation against the DB — use on MUTATING
 *  routes so demoted/deleted accounts lose their powers at once */
export async function currentUser(req: NextRequest): Promise<SessionUser | null> {
  const u = sessionUser(req);
  if (!u) return null;
  try {
    const { q } = await import("./db");
    const rows = await q("SELECT role FROM marib_user WHERE id = $1 LIMIT 1", [u.uid]);
    if (!rows.length) return null;
    return { uid: u.uid, username: u.username, role: rows[0].role as SessionUser["role"] };
  } catch {
    return u; /* DB hiccup — the signed token is still our best evidence */
  }
}

export const COOKIE_NAME = COOKIE;

/* ---------- passwords: scrypt salted ---------- */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(pw, salt, 32).toString("hex");
  return `scrypt$${salt}$${h}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [alg, salt, h] = stored.split("$");
    if (alg !== "scrypt" || !salt || !h) return false;
    const test = scryptSync(pw, salt, 32);
    const ref = Buffer.from(h, "hex");
    return test.length === ref.length && timingSafeEqual(test, ref);
  } catch {
    return false;
  }
}

export function isAdmin(u: SessionUser | null): boolean {
  return !!u && (u.role === "dev" || u.role === "admin");
}
export function isDev(u: SessionUser | null): boolean {
  return !!u && u.role === "dev";
}
