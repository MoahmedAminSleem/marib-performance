# 04 — FILES MAP

> كل ملف ووظيفته. **عدّل الملف الصحيح — لا تخمن.**

## src/lib/marib/

| File | Role | Lines |
|------|------|-------|
| `db.ts` | raw SQL driver (PGlite/pg) + BOOT_SQL + ensureBoot() + audit() | ~300 |
| `session.ts` | HMAC cookie (issueToken/verifyToken) + hashPassword (scrypt) | ~100 |
| `http.ts` | requireUser/requireRole/requirePerm + readJson + fail/serverFail + **requireEntryRead (R63)** | ~155 |
| `perms.ts` | R46: PERM_KEYS + loadUserPerms + effectiveLevel + checkPerm | ~180 |
| `undo.ts` | R46: captureUndoSnapshot + restoreFromSnapshot | ~170 |
| `translate.ts` | R46: gtx + myMemory + translateInto + translateLive | ~100 |
| `xlsx-writer.ts` | مولّد Excel داخلي (XBook/XSheet/XStyle) | ~600 |
| `logger.ts` | structured JSON logging | ~50 |

## src/app/api/

| Path | File | Notes |
|------|------|-------|
| `auth/route.ts` | login/logout/session (marib_user) | نظام واحد من R48 |
| `manpower/route.ts` | GET (snapshot) + POST (actions) | ~840 lines — الأكبر |
| `manpower/export/route.ts` | Excel export | ~640 lines |
| `users/route.ts` | CRUD users (photo/title/password/role) | ~155 |
| `settings/route.ts` | GET/PUT settings | ~90 |
| `audit/route.ts` | GET audit log | R46: perm-aware |
| `perms/route.ts` | R46: GET/PUT/DELETE perms | ~115 |
| `translate/route.ts` | R46: GET ?term=&to= | ~25 |
| `entries/production/route.ts` | R46: CRUD production | ~115 |
| `entries/absence/route.ts` | R46: CRUD + template + import | ~215 |
| `entries/overtime/route.ts` | R46: CRUD overtime | ~115 |
| `entries/employees/route.ts` | R63: كومبوبوكس الإدخال — {code,name,nameTr,job,path} بحارس الإدخال | ~65 |
| `health/route.ts` | فحص حيوية {ok,users,months,employees} | R48: على جداول marib |
| `data/route.ts` | رفع/تنزيل بيانات الشهور (marib_data) | marib أصلًا |
| `storage/route.ts` | مساحة التخزين (marib) | marib أصلًا |

> R48 حذفت: `auth/login` · `auth/logout` · `auth/me` · `users/[id]` ·
> `users/[id]/password` · `months` · `months/[key]` (نظام Prisma الميت) +
> `src/lib/{db,auth,bootstrap}.ts` + `src/server/seed/2026-0*.json` +
> `src/app/{skeleton-html.ts,marib-app.css}`.

## public/app/

| File | Role | Size |
|------|------|------|
| `app_main.js` | الواجهة الرئيسية (Dashboard, charts, settings, entries popup) | ~220KB |
| `app_manpower.js` | الاتزان (tree, cards, AR toggle, ImpExp, undo) | ~160KB |
| `app_auth.js` | الدخول + **الصفحة الرئيسية (R64: البوابة المرقاة — خلفية الدنيم + بارالاكس + ترحيب)** + canEntry | ~46KB |
| `app_core.js` | أدوات مشتركة (utils, format, navigation) | ~25KB |
| `app_charts.js` | Recharts wrapper | ~30KB |
| `marib_cloud.js` | API client (fetch wrapper) | ~5KB |
| `i18n_core.js` | محرك الترجمة (T/TT/norm) | ~12KB |
| `i18n_dict.js` | قاموس الترجمة (AR/EN/TR × ~500 مفتاح) | ~100KB |
| `app.css` | كل الستايل | ~620KB |
| `bg/home-denim.jpg` | **R64: خلفية الصفحة الرئيسية المصورة (دنيم + 6 براندات)** | 93KB |
| `xlsx.full.min.js` | SheetJS (client-side Excel parsing) | ~950KB |

## src/app/

| File | Role |
|------|------|
| `skeleton.ts` | HTML الـ SPA كله (login + topbar + dashboard + modals) |
| `page.tsx` | `<div dangerouslySetInnerHTML={{__html: SKELETON}} />` + قائمة السكريبتات (?v=r64) |
| `layout.tsx` | root layout (meta + app.css?v=r64) |
| `globals.css` | Tailwind base |

> R48 حذفت كمان: `skeleton-html.ts` (51KB) و`marib-app.css` (515KB) — صفر استيرادات.

## ملفات أخرى

| File | Role |
|------|------|
| `سير-العمل.html` | سجل الجولات التاريخي (R28→R49) |
| `README.md` | وصف المشروع |
| `next.config.ts` | CSP headers + standalone output |
| `package.json` | R49: 15 حزمة بس (next·react·react-dom·pg·PGlite + أدوات بناء) — ممنوع في الـ ZIP أبدًا |
| `.env` | DATABASE_URL + AUTH_SECRET + DEV_BOOT_PASSWORD |
| ~~`prisma/`~~ | R49: اتمسح بالكامل (schema.prisma + schema.postgres.prisma) — مفيش كود بيستخدمه |
| ~~`tailwind.config.ts`~~ | R49: اتمسح — Tailwind v4 مش بيقرأه (مفيش @config في globals.css) |
| `src/server/seed/manpower-seed.ts` | بيانات الاتزان (828 موظف) — يستخدمه ensureBoot |
