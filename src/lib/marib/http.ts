/* Marib HTTP helpers (R25 #10 — refactoring)
   Every /api route repeated the same plumbing: ensureBoot → session
   check → role gate → try/catch → console.error → 500. These helpers
   keep that behaviour byte-for-byte (same JSON error codes, same
   status numbers) but in one place, and route the errors through the
   structured logger instead of bare console.error. */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot } from "@/lib/marib/db";
import { currentUser, sessionUser, isAdmin, isDev, type SessionUser } from "@/lib/marib/session";
import { log, type ChildLogger } from "@/lib/marib/logger";

export const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MB — months of sheets fit easily

export type Role = "user" | "admin" | "dev";

export function ok(data: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...data });
}

export function fail(code: string, status = 400): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

export function serverFail(mod: string, method: string, e: unknown): NextResponse {
  log.child(mod).error(method + " failed", { err: e });
  return fail("server", 500);
}

/* Safe body read: caps the payload size BEFORE parsing (the previous
   per-route guards only ran after req.json()). Returns null on a
   malformed/oversized body — routes keep their own error codes. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX_BODY_BYTES) return null;
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* Boot + session in one call:
   { user }        → caller may proceed
   { res }         → send this response (401) */
export async function requireUser(req: NextRequest, mod: string, method: string): Promise<{ user?: SessionUser; res?: NextResponse }> {
  await ensureBoot();
  const me = sessionUser(req);
  if (!me) return { res: fail("auth", 401) };
  return { user: me };
}

/* Boot + session + role gate in one call:
   role "user"  → any signed-in user
   role "admin" → admin or dev
   role "dev"   → dev only
   Rejections: 401 auth · 403 admin/dev */
export async function requireRole(
  req: NextRequest,
  role: Role,
  mod: string,
  method: string
): Promise<{ user?: SessionUser; res?: NextResponse }> {
  const base = await requireUser(req, mod, method);
  if (base.res) return base;
  const me = base.user!;
  if (role === "admin" && !isAdmin(me)) return { res: fail("admin", 403) };
  if (role === "dev" && !isDev(me)) return { res: fail("dev", 403) };
  return { user: me };
}

/* wrappers kept for the routes that read the body with the async
   cookie session (currentUser) — same semantics as before */
export async function requireUserBody(req: NextRequest): Promise<{ user?: SessionUser; res?: NextResponse }> {
  await ensureBoot();
  const me = await currentUser(req);
  if (!me) return { res: fail("auth", 401) };
  return { user: me };
}

export async function requireRoleBody(req: NextRequest, role: Role): Promise<{ user?: SessionUser; res?: NextResponse }> {
  const base = await requireUserBody(req);
  if (base.res) return base;
  const me = base.user!;
  if (role === "admin" && !isAdmin(me)) return { res: fail("admin", 403) };
  if (role === "dev" && !isDev(me)) return { res: fail("dev", 403) };
  return { user: me };
}

export { isAdmin, isDev };
export type { SessionUser };
export function logger(mod: string): ChildLogger { return log.child(mod); }
