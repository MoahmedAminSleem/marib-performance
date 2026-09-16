# 04 — FILES MAP

> كل ملف ووظيفته. **عدّل الملف الصحيح — لا تخمن.**

## src/lib/marib/

| File | Role | Lines |
|------|------|-------|
| `db.ts` | raw SQL driver (PGlite/pg) + BOOT_SQL + ensureBoot() + audit() | ~300 |
| `session.ts` | HMAC cookie (issueToken/verifyToken) + hashPassword (scrypt) | ~100 |
| `http.ts` | requireUser/requireRole/requirePerm + readJson + fail/serverFail | ~130 |
| `perms.ts` | R46: PERM_KEYS + loadUserPerms + effectiveLevel + checkPerm | ~180 |
| `undo.ts` | R46: captureUndoSnapshot + restoreFromSnapshot | ~170 |
| `translate.ts` | R46: gtx + myMemory + translateInto + translateLive | ~100 |
| `xlsx-writer.ts` | مولّد Excel داخلي (XBook/XSheet/XStyle) | ~600 |
| `logger.ts` | structured JSON logging | ~50 |

## src/app/api/

| Path | File | Notes |
|------|------|-------|
| `auth/route.ts` | login/logout/session (marib_user) | النظام الجديد |
| `auth/login/route.ts` | login (Prisma) | النظام القديم |
| `auth/logout/route.ts` | logout (Prisma) | |
| `auth/me/route.ts` | session (Prisma) | |
| `manpower/route.ts` | GET (snapshot) + POST (actions) | ~870 lines — الأكبر |
| `manpower/export/route.ts` | Excel export | ~640 lines |
| `users/route.ts` | CRUD users | ~155 |
| `users/[id]/route.ts` | single user | |
| `users/[id]/password/route.ts` | password change | |
| `settings/route.ts` | GET/PUT settings | ~90 |
| `audit/route.ts` | GET audit log | R46: perm-aware |
| `perms/route.ts` | R46: GET/PUT/DELETE perms | ~115 |
| `translate/route.ts` | R46: GET ?term=&to= | ~25 |
| `entries/production/route.ts` | R46: CRUD production | ~115 |
| `entries/absence/route.ts` | R46: CRUD + template + import | ~210 |
| `entries/overtime/route.ts` | R46: CRUD overtime | ~115 |
| `health/route.ts` | Prisma health check | |
| `data/route.ts` | Prisma data upload/download | |
| `storage/route.ts` | Prisma storage info | |
| `months/route.ts` | Prisma months list | |
| `months/[key]/route.ts` | Prisma single month | |

## public/app/

| File | Role | Size |
|------|------|------|
| `app_main.js` | الواجهة الرئيسية (Dashboard, charts, settings, entries popup) | ~220KB |
| `app_manpower.js` | الاتزان (tree, cards, AR toggle, ImpExp, undo) | ~160KB |
| `app_auth.js` | الدخول + البوابة + mode gate + page persistence | ~44KB |
| `app_core.js` | أدوات مشتركة (utils, format, navigation) | ~25KB |
| `app_charts.js` | Recharts wrapper | ~30KB |
| `marib_cloud.js` | API client (fetch wrapper) | ~5KB |
| `i18n_core.js` | محرك الترجمة (T/TT/norm) | ~12KB |
| `i18n_dict.js` | قاموس الترجمة (AR/EN/TR × ~500 مفتاح) | ~100KB |
| `app.css` | كل الستايل | ~620KB |
| `xlsx.full.min.js` | SheetJS (client-side Excel parsing) | ~950KB |

## src/app/

| File | Role |
|------|------|
| `skeleton.ts` | HTML الـ SPA كله (login + topbar + dashboard + modals) |
| `skeleton-html.ts` | نسخة HTML ثابتة (للنسخ القديم) |
| `page.tsx` | `<div dangerouslySetInnerHTML={{__html: SKELETON}} />` |
| `layout.tsx` | root layout (fonts, meta) |
| `globals.css` | Tailwind base |

## ملفات أخرى

| File | Role |
|------|------|
| `سير-العمل.html` | سجل الجولات التاريخي (R28→R46) |
| `README.md` | وصف المشروع |
| `next.config.ts` | CSP headers + standalone output |
| `package.json` | dependencies + scripts |
| `.env` | DATABASE_URL + AUTH_SECRET + DEV_BOOT_PASSWORD |
| `prisma/schema.prisma` | SQLite schema (للنظام القديم) |
| `src/server/seed/manpower-seed.ts` | بيانات الاتزان (828 موظف) |
| `src/server/seed/2026-0[7-9].json` | بيانات الشهور |
