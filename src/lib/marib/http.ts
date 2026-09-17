/* Marib HTTP helpers (R25 #10 — refactoring)
   Every /api route repeated the same plumbing: ensureBoot → session
   check → role gate → try/catch → console.error → 500. These helpers
   keep that behaviour byte-for-byte (same JSON error codes, same
   status numbers) but in one place, and route the errors through the
   structured logger instead of bare console.error. */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot } from "@/lib/marib/db";
import { currentUser, sessionUser, isAdmin, isDev, type SessionUser } from "@/lib/marib/session";
import { checkPerm, type PermLevel } from "@/lib/marib/perms";
import { log, type ChildLogger } from "@/lib/marib/logger";
import { stats, noteError } from "@/lib/marib/stats";

export const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MB — months of sheets fit easily

export type Role = "user" | "admin" | "dev";

export function ok(data: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...data });
}

export function fail(code: string, status = 400): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

export function serverFail(mod: string, method: string, e: unknown): NextResponse {
  /* R62 (observability): كل 5xx بيزوّد العداد ويسجل آخر خطأ بسياقه
     (المسار + الميثود + الرسالة) — /api/health بيعرضهم في stats.
     الرد نفسه زي ما هو بالبايت: {error:"server"} 500. */
  const s = stats();
  s.srvErrors++;
  noteError(mod + "." + method + ": " + (e instanceof Error ? e.message : String(e)));
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
export async function requireUser(req: NextRequest, _mod: string, _method: string): Promise<{ user?: SessionUser; res?: NextResponse }> {
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

/* R46-2 — perm-aware route guard: boots, checks session, then verifies the
   signed-in user has at least `minLevel` access on `feature`. Returns
   { user } on success, { res: 401|403 } on failure. Use this on every
   route that protects an R46 feature. */
export async function requirePerm(
  req: NextRequest,
  feature: string,
  minLevel: PermLevel = "view"
): Promise<{ user?: SessionUser; level?: PermLevel; res?: NextResponse }> {
  const { user, level, allowed } = await checkPerm(req, feature, minLevel);
  if (!user) return { res: fail("auth", 401) };
  if (!allowed) return { res: fail("forbidden", 403) };
  return { user, level };
}

/* Same as requirePerm but also reads the body first (for POST/PUT/DELETE
   where the body is going to be parsed anyway — saves a round-trip
   in the caller). */
export async function requirePermBody(
  req: NextRequest,
  feature: string,
  minLevel: PermLevel = "view"
): Promise<{ user?: SessionUser; level?: PermLevel; res?: NextResponse }> {
  await ensureBoot();
  const { currentUser } = await import("./session");
  const me = await currentUser(req);
  if (!me) return { res: fail("auth", 401) };
  const { loadUserPerms, effectiveLevel } = await import("./perms");
  const overrides = await loadUserPerms(me.uid);
  const level = effectiveLevel(me.role, overrides, feature);
  const ORDER: PermLevel[] = ["hidden", "view", "edit"];
  const allowed = ORDER.indexOf(level) >= ORDER.indexOf(minLevel);
  if (!allowed) return { res: fail("forbidden", 403) };
  return { user: me, level };
}

/* R63 — حارس قراءة الإدخال: مسؤول إدخال البيانات له الحق يقرأ اللي
   بيشتغل عليه. المشكلة القديمة: قراءة /api/entries/* و /api/po كانت
   محتاجة data.view (رؤية اللوحة) — فأي حد المالك مخبّي عنه اللوحة
   (data.view=hidden) ومفتحه الإدخال (data.upload=edit) كانت كل
   القراءات بترجع 403 في وشه: قوايم الشهر فاضية والكومبوبوكس ميت.
   R64 — القسم بقى ليه مفاتيحه الخاصة (طلب المالك): القراءة مسموحة
   لصاحب entry.view (رؤية) أو entry.edit / entry.po (تعديل — المعدِّل
   لازم يقرأ). data.view ما بيدخلش في الحكاية خالص: رؤية اللوحة
   ملهاش علاقة بصفحة الإدخال. التوافق الرجعي: أي data.upload=edit
   قديم اترحّل لمفاتيح entry.* تلقائيًا (BOOT_VER 59). */
export async function requireEntryRead(
  req: NextRequest
): Promise<{ user?: SessionUser; res?: NextResponse }> {
  const a = await requirePerm(req, "entry.view", "view");
  if (!a.res) return a;
  const b = await requirePerm(req, "entry.edit", "edit");
  if (!b.res) return b;
  const c = await requirePerm(req, "entry.po", "edit");
  if (!c.res) return c;
  return { res: fail("forbidden", 403) };
}

export { isAdmin, isDev };
export type { SessionUser };
export function logger(mod: string): ChildLogger { return log.child(mod); }
