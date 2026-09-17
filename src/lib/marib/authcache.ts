/* ============================================================
   R57 — كاش الدور والصلاحيات (Optimize Performance)
   ============================================================
   كل نداء API كان بيعمل استعلامين قبل أي شغل حقيقي:
     1) SELECT role FROM marib_user WHERE id=…   (currentUser)
     2) SELECT feature, level FROM marib_perm …  (loadUserPerms)
   على Neon كل استعلام = رحلة شبكة (serverless) — واللوحة بتعمل
   ~6 نداءات API عند الفتح، فده كان 12 استعلام احتياطي كل مرة.

   الكاش هنا: TTL قصير (30 ثانية) + إبطال صريح فوري من نفس
   المسارات اللي بتكتب (users PUT/DELETE + perms PUT/DELETE) —
   يعني على نفس السيرفر التغيير فوري بالظبط زي قبل (اختبار R55
   بيغطي ده)، وعلى Vercel متعدد النسخ أقصى تأخير 30 ثانية بين
   النسخ — نفس طبيعة أي نظام JWT/كاش صلاحيات، ومقابل توفير
   استعلامين لكل نداء.

   ملاحظة أمان: الدور بيتخزن مع «وجود» اليوزر (صف = موجود) —
   حذف يوزر بيعمل إبطال فوري من نفس السيرفر، والـ TTL هو سقف
   التعرف على الحذف بين النسخ. الجلسة أصلًا HMAC موقّعة وبتعيش
   12 ساعة/30 يوم، فالـ 30 ثانية تحسين صافي مش تراجع.
   ============================================================ */

import type { PermLevel } from "./perms";

const TTL_MS = 30_000; /* 30 ثانية */

type Entry<T> = { v: T; at: number };

/* R63: كاش الدور بقى بيشيل الاسم كمان — عشان تعديل اسم مستخدم
   يبان في نفس اللحظة (التوب بار / الأوديت بيتغذوا من currentUser)
   بدل ما الاسم القديم يفضل ماسك لحد ما الكوكي يتوقع. */
export interface RoleEntry { r: string; u: string }

interface AuthCacheShape {
  __maribRoleCache?: Map<string, Entry<RoleEntry>>;
  __maribPermCache?: Map<string, Entry<Record<string, PermLevel>>>;
}

/* globalThis — ينجو من HMR في التطوير (نفس نمط __maribDriver في db.ts) */
const g = globalThis as unknown as AuthCacheShape;
const roles: Map<string, Entry<RoleEntry>> = (g.__maribRoleCache ??= new Map());
const perms: Map<string, Entry<Record<string, PermLevel>>> = (g.__maribPermCache ??= new Map());

function fresh<T>(e: Entry<T> | undefined): e is Entry<T> {
  return !!e && Date.now() - e.at < TTL_MS;
}

/* ---------------- الدور (مع وجود اليوزر) ---------------- */

export function cachedRole(uid: string): RoleEntry | undefined {
  const e = roles.get(uid);
  return fresh(e) ? e.v : undefined;
}

export function setCachedRole(uid: string, role: string, username: string): void {
  roles.set(uid, { v: { r: role, u: username }, at: Date.now() });
}

/* ---------------- الصلاحيات (خريطة feature→level) ---------------- */

export function cachedPerms(uid: string): Record<string, PermLevel> | undefined {
  const e = perms.get(uid);
  return fresh(e) ? e.v : undefined;
}

export function setCachedPerms(uid: string, p: Record<string, PermLevel>): void {
  perms.set(uid, { v: p, at: Date.now() });
}

/* ---------------- الإبطال ---------------- */

/** إبطال يوزر واحد (تعديل دور / حذف / تغيير صلاحيات).
 *  بدون معامل = إبطال الكل (احتياطي). */
export function invalidateUser(uid?: string): void {
  if (uid) {
    roles.delete(uid);
    perms.delete(uid);
  } else {
    roles.clear();
    perms.clear();
  }
}
