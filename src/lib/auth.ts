import crypto from "crypto"
import { db } from "@/lib/db"

/* ============================================================
   Marib server auth — scrypt password hashing + DB sessions
   (httpOnly cookie). No external auth dependency: node:crypto only.
   ============================================================ */

export const SESSION_COOKIE = "marib_sess"
export const SESSION_HOURS = 12            // normal login
export const SESSION_HOURS_REMEMBER = 24 * 30 // remember-me (30 days)
export const MAX_FAILED = 5               // attempts before lock
export const LOCK_MINUTES = 10            // lock duration

export type Role = "dev" | "admin" | "user"

export interface SessionUser {
  id: number
  username: string
  role: Role
  canUpload: boolean
  active: boolean
}

/* ---------------- password hashing (scrypt, salted) ---------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return `s1$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$")
    if (parts.length !== 3 || parts[0] !== "s1") return false
    const salt = parts[1]
    const want = Buffer.from(parts[2], "hex")
    const got = crypto.scryptSync(password, salt, want.length)
    return crypto.timingSafeEqual(want, got)
  } catch {
    return false
  }
}

/* ---------------- sessions ---------------- */

export function newToken(): string {
  return crypto.randomBytes(48).toString("hex")
}

export async function createSession(userId: number, hours: number) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000)
  await db.session.create({ data: { id: token, userId, expiresAt } })
  return { token, expiresAt, maxAge: hours * 3600 }
}

export async function destroySession(token: string) {
  try {
    await db.session.deleteMany({ where: { id: token } })
  } catch {
    /* session row may already be gone */
  }
}

export async function sessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null
  const sess = await db.session.findUnique({ where: { id: token } })
  if (!sess) return null
  if (sess.expiresAt.getTime() < Date.now()) {
    await destroySession(token).catch(() => {})
    return null
  }
  const u = await db.user.findUnique({ where: { id: sess.userId } })
  if (!u || !u.active) return null
  return {
    id: u.id,
    username: u.username,
    role: u.role as Role,
    canUpload: u.canUpload || u.role === "dev" || u.role === "admin",
    active: u.active,
  }
}

/* ---------------- login rate limiting ----------------
   Two layers:
   1. per-username (DB: failedCount + lockedUntil) — survives restarts,
      works across all server instances.
   2. per-IP in-memory (best effort per instance).                 */

const ipHits = new Map<string, { n: number; first: number }>()

/** IP limiter counts ONLY FAILED logins (401/423) — successful sign-ins
 *  never count, so a shared office IP is never throttled by normal use.
 *  40 failures / 10 min per IP; the per-username 5-attempt lock above is
 *  the primary protection against targeted brute force. */
export function ipLimited(ip: string): boolean {
  const now = Date.now()
  const rec = ipHits.get(ip)
  if (!rec) return false
  if (now - rec.first > 10 * 60 * 1000) {
    ipHits.delete(ip)
    return false
  }
  return rec.n >= 40
}

export function ipFailed(ip: string) {
  const now = Date.now()
  const rec = ipHits.get(ip)
  if (!rec || now - rec.first > 10 * 60 * 1000) {
    ipHits.set(ip, { n: 1, first: now })
    return
  }
  rec.n++
}

export function isLocked(u: { failedCount: number; lockedUntil: Date | null }): boolean {
  return !!u.lockedUntil && u.lockedUntil.getTime() > Date.now()
}

export async function registerFailure(username: string) {
  const u = await db.user.findUnique({ where: { username } })
  if (!u) return
  const failedCount = u.failedCount + 1
  const lockedUntil =
    failedCount >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : u.lockedUntil
  await db.user.update({ where: { id: u.id }, data: { failedCount, lockedUntil } }).catch(() => {})
}

export async function clearFailures(userId: number) {
  await db.user
    .update({ where: { id: userId }, data: { failedCount: 0, lockedUntil: null } })
    .catch(() => {})
}

/* ---------------- route guard ---------------- */

export function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export function unauthorized() {
  return Response.json({ ok: false, error: "auth" }, { status: 401 })
}

export function forbidden() {
  return Response.json({ ok: false, error: "forbidden" }, { status: 403 })
}
