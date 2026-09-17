/* ============================================================
   R46 — نظام الصلاحيات (permissions) — shared client/server core
   ============================================================
   كل ميزة في الموقع ليها مفتاح. الأدمن بيلعب على مستوى كل ميزة
   لكل يوزر: inherit | hidden | view | edit. لو inherit، بيرجع للـ role
   الافتراضي (dev=edit, admin=edit, user=view). الكور ده مشترك بين
   السيرفر (للـ API routes) والعميل (لإظهار/إخفاء UI).
   ============================================================ */

import type { NextRequest } from "next/server";
import type { SessionUser } from "./session";

/* ---------------- المفاتيح المتاحة + التسمية ---------------- */

export type PermLevel = "inherit" | "hidden" | "view" | "edit";

export interface PermKey {
  key: string;
  /** EN label for admin UI */
  label_en: string;
  /** AR label for admin UI */
  label_ar: string;
  /** short description for admin UI */
  desc_en: string;
  desc_ar: string;
  /** grouping tag — used to render sections in the admin UI */
  group: "manpower" | "data" | "entry" | "users" | "settings" | "audit";
}

/** قائمة بكل الميزات اللي الأدمن يقدر يتحكم فيها. مفيش حاجة تتعمل
 *  في الموقع بدون ما تمر من القايمة دي — فالأدمن بيقدر فعلاً يتحكم
 *  في كل حاجة. */
export const PERM_KEYS: PermKey[] = [
  /* manpower / الاتزان */
  { key: "manpower.view",   label_en: "View Balance",       label_ar: "رؤية الاتزان",
    desc_en: "Open the manpower structure page",
    desc_ar: "فتح صفحة هيكل القوى العاملة",
    group: "manpower" },
  { key: "manpower.edit",   label_en: "Edit Balance",       label_ar: "تعديل الاتزان",
    desc_en: "Add / edit / delete employees, depts, vacancies",
    desc_ar: "إضافة / تعديل / حذف موظفين وأقسام وشواغر",
    group: "manpower" },
  { key: "manpower.import", label_en: "Import to Balance",  label_ar: "استيراد للاتزان",
    desc_en: "Upload Excel file to update the structure",
    desc_ar: "رفع ملف إكسل لتحديث الهيكل",
    group: "manpower" },
  { key: "manpower.export", label_en: "Export Balance",     label_ar: "تصدير الاتزان",
    desc_en: "Download Excel template or full hierarchy",
    desc_ar: "تنزيل تيمبلت أو الهيكل كاملاً",
    group: "manpower" },
  /* data dashboard / اللوحة */
  { key: "data.view",   label_en: "View Dashboard",    label_ar: "رؤية اللوحة",
    desc_en: "Open the KPIs / charts page",
    desc_ar: "فتح صفحة المؤشرات والرسومات",
    group: "data" },
  { key: "data.upload", label_en: "Upload Data",       label_ar: "رفع البيانات",
    desc_en: "Upload Excel for a new month or refresh existing",
    desc_ar: "رفع إكسل لشهر جديد أو تحديث شهر موجود",
    group: "data" },
  /* R64: صفحة إدخال البيانات — قسم مخصوص (طلب المالك): قبل كده كانت
     الصفحة مربوطة بمفاتيح اللوحة (data.view/data.upload) فتحكم
     المالك فيها كان غير مباشر ومربك. المفاتيح الثلاثة الجديدة بتفصل
     صفحة الإدخال بالكامل عن اللوحة: الرؤية / الحفظ والتعديل / عقود الـ PO */
  { key: "entry.view",  label_en: "View Data Entry",   label_ar: "رؤية صفحة الإدخال",
    desc_en: "Open the data entry page and read its entries",
    desc_ar: "فتح صفحة إدخال البيانات وقراءة سجلاتها",
    group: "entry" },
  { key: "entry.edit", label_en: "Edit Data Entry",    label_ar: "تعديل صفحة الإدخال",
    desc_en: "Add / delete production, absence and overtime entries + templates",
    desc_ar: "إضافة وحذف سجلات الإنتاج والغياب والأوفر تايم + التيمبلت",
    group: "entry" },
  { key: "entry.po",    label_en: "Manage PO Contracts", label_ar: "إدارة عقود الشراء",
    desc_en: "Upload PO template, add / edit / delete contract quantities",
    desc_ar: "رفع تيمبلت الـ PO وإضافة وتعديل وحذف كميات العقود",
    group: "entry" },
  /* users / المستخدمين */
  { key: "users.manage", label_en: "Manage Users",     label_ar: "إدارة المستخدمين",
    desc_en: "Create / delete users, set passwords and roles",
    desc_ar: "إنشاء / حذف المستخدمين وتعيين كلمات السر والأدوار",
    group: "users" },
  /* settings / الإعدادات */
  { key: "settings.view",   label_en: "View Settings",    label_ar: "رؤية الإعدادات",
    desc_en: "Open the settings popup",
    desc_ar: "فتح نافذة الإعدادات",
    group: "settings" },
  { key: "settings.edit",   label_en: "Edit Settings",    label_ar: "تعديل الإعدادات",
    desc_en: "Change theme / targets / supervisor classification / manager home",
    desc_ar: "تغيير الثيم والأهداف وتصنيف المشرفين ورئيسية المدير",
    group: "settings" },
  /* audit / السجل */
  { key: "audit.view",   label_en: "View Activity Log",   label_ar: "رؤية سجل النشاط",
    desc_en: "See every upload and edit made on the site",
    desc_ar: "رؤية كل رفع وتعديل حصل على الموقع",
    group: "audit" },
  { key: "storage.view", label_en: "View Storage",        label_ar: "رؤية التخزين",
    desc_en: "See database space usage",
    desc_ar: "رؤية مساحة قاعدة البيانات",
    group: "audit" },
];

/** quick lookup — used by route guards */
export const PERM_KEY_SET: Set<string> = new Set(PERM_KEYS.map((k) => k.key));

/* ---------------- default fallback by role ---------------- */

/** المستوى الافتراضي لو مفيش override — بيرجع للـ role.
 *  R55: الافتراضيات اتظبطت على السلوك الفعلي للـ API قبل الصلاحيات:
 *  الأدمن كان بيدير اليوزرين والإعدادات بالكامل عن طريق دوره، فلو
 *  خلينا users.manage="view" ليه كان هيتقفل فجأة (رجوعية). */
export function defaultForRole(role: SessionUser["role"], feature: string): PermLevel {
  /* dev: كل حاجة edit — what good is a developer account you can't use? */
  if (role === "dev") return "edit";
  /* admin: edit كل حاجة — زي ما كان الـ API سايح بالظبط قبل R55
   *  (requireRole admin = تحكم كامل في اليوزرين والإعدادات). */
  if (role === "admin") return "edit";
  /* user: view by default — الأدمن يقدر يرفع أي ميزة لـ edit لليوزر ده.
   *  R55: الأسطح الإدارية (إدارة اليوزرين / السجل / التخزين) مقفولة
   *  لليوزر العادي افتراضيًا — كانت هترجع "view" وده كان هيفضح قايمة
   *  اليوزرين ومساحة الداتابيز لكل واحد داخل.
   *  R64: صفحة الإدخال كمان مقفولة افتراضيًا — قبل كده كانت محتاجة
   *  data.upload=edit (مفتاح اللوحة) عشان تتفتح، والافتراضي بتاع
   *  اليوزر "view" فمحدش كانشوفها غير الممنوحين. نفس السلوك بالظبط
   *  بس من مفتاحها الخاص دلوقتي. */
  if (feature === "users.manage" || feature === "audit.view" || feature === "storage.view"
    || feature === "entry.view" || feature === "entry.edit" || feature === "entry.po") {
    return "hidden";
  }
  return "view";
}

/* ---------------- القراءة من الـ DB ---------------- */

/** كل الـ perms لمستخدم واحد — يرجع خريطة { feature: level }.
 *  R57: من كاش 30 ثانية لو موجودة (استعلام أقل لكل نداء API) —
 *  الإبطال فوري من perms PUT/DELETE (نفس السيرفر). */
export async function loadUserPerms(userId: string): Promise<Record<string, PermLevel>> {
  const { cachedPerms, setCachedPerms } = await import("./authcache");
  const hit = cachedPerms(userId);
  if (hit) return hit;
  const { q } = await import("./db");
  const rows = await q(
    "SELECT feature, level FROM marib_perm WHERE user_id = $1",
    [userId]
  );
  const out: Record<string, PermLevel> = {};
  for (const r of rows) {
    const lvl = r.level as PermLevel;
    if (lvl && lvl !== "inherit") out[r.feature as string] = lvl;
  }
  setCachedPerms(userId, out);
  return out;
}

/** كل الـ perms لكل المستخدمين — يرجع خريطة { userId: { feature: level } }. */
export async function loadAllPerms(): Promise<Record<string, Record<string, PermLevel>>> {
  const { q } = await import("./db");
  const rows = await q("SELECT user_id, feature, level FROM marib_perm");
  const out: Record<string, Record<string, PermLevel>> = {};
  for (const r of rows) {
    const uid = r.user_id as string;
    const f = r.feature as string;
    const lvl = r.level as PermLevel;
    if (!out[uid]) out[uid] = {};
    if (lvl && lvl !== "inherit") out[uid][f] = lvl;
  }
  return out;
}

/** المستوى الفعّال (effective level) لمستخدم + ميزة — يدمج الـ override
 *  مع fallback الـ role. */
export function effectiveLevel(
  role: SessionUser["role"] | null | undefined,
  perms: Record<string, PermLevel> | undefined,
  feature: string
): PermLevel {
  if (!role) return "hidden";
  const override = perms?.[feature];
  if (override && override !== "inherit") return override;
  return defaultForRole(role, feature);
}

/* ---------------- حارس الـ API route ---------------- */

const ORDER: PermLevel[] = ["hidden", "view", "edit"];

/** فحص أن المستخدم الحالي عنده على الأقل minLevel للميزة دي.
 *  يرجع { user, level, allowed }. لو مفيش session أو المستوى أقل
 *  من minLevel، allowed بتبقى false. */
export async function checkPerm(
  req: NextRequest,
  feature: string,
  minLevel: PermLevel = "view"
): Promise<{
  user: SessionUser | null;
  level: PermLevel;
  allowed: boolean;
}> {
  const { currentUser } = await import("./session");
  const me = await currentUser(req);
  if (!me) return { user: null, level: "hidden", allowed: false };
  const perms = await loadUserPerms(me.uid);
  const level = effectiveLevel(me.role, perms, feature);
  const allowed = ORDER.indexOf(level) >= ORDER.indexOf(minLevel);
  return { user: me, level, allowed };
}

/* ---------------- العميل: تحميل الـ perms دفعة واحدة ---------------- */

/** العميل بيستدعي دي بعد الـ login — يرجع خريطة فعّالة لليوزر الحالي
 *  عشان يقدر يخفي/يظهر UI حسبها من غير ما يسأل السيرفر كل شوية. */
export async function fetchMyEffectivePerms(cookie: string): Promise<Record<string, PermLevel>> {
  try {
    const r = await fetch("/api/perms?me=1", { headers: { cookie } });
    if (!r.ok) return {};
    const data = await r.json() as { perms?: Record<string, PermLevel> };
    return data.perms || {};
  } catch {
    return {};
  }
}
