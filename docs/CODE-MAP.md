# CODE-MAP — خريطة الكود (آلي التوليد)

> **متعدّلش بإيدك.** الخريطة دي بتتولّد من الكود نفسه — لو اتغير
> الكود، بتتغير معاه. أعد التوليد قبل أي commit: `bun scripts/code_map.mjs`
> النسخة: r63 · الملفات المفهرسة: 63

## الوصفة (30 ثانية لأي تعديل)

```
1. دوّر على الخصيصة في الخريطة تحت (Ctrl+F في الملف ده)
2. افتح الملف المذكور واقرأ الشريحة المطلوبة بس (offset/limit — مش الملف كله)
3. بص في «رادار التأثير» — إيه اللي بيعتمد على الملف ده قبل ما تكسر حاجة
4. عدّل → tsc → E2E → أعد توليد الخريطة → commit
```

البروتوكول الكامل + القواعد: `docs/08-CODE-INTELLIGENCE.md`

## 1) مسارات الـ API (السيرفر)

| المسار | الميثودز | الحارس | الجداول | الملف |
|---|---|---|---|---|
| `/audit` | GET | audit.view | audit | `src/app/api/audit/route.ts` |
| `/auth` | GET/POST/DELETE | — | user | `src/app/api/auth/route.ts` |
| `/data` | GET/POST | data.upload · data.view | audit, data | `src/app/api/data/route.ts` |
| `/entries/absence` | GET/POST/DELETE | entry.edit · **entry-read** | absence | `src/app/api/entries/absence/route.ts` |
| `/entries/employees` | GET | **entry-read** | dept, emp | `src/app/api/entries/employees/route.ts` |
| `/entries/overtime` | GET/POST/DELETE | entry.edit · **entry-read** | overtime | `src/app/api/entries/overtime/route.ts` |
| `/entries/production` | GET/POST/DELETE | entry.edit · **entry-read** | po, prod | `src/app/api/entries/production/route.ts` |
| `/health` | GET | — | data, emp, user | `src/app/api/health/route.ts` |
| `/manpower` | GET/POST | manpower.view | dept, emp, req, setting, transfer | `src/app/api/manpower/route.ts` |
| `/manpower/export` | GET | manpower.export | — | `src/app/api/manpower/export/route.ts` |
| `/perms` | GET/PUT/DELETE | users.manage | perm, user | `src/app/api/perms/route.ts` |
| `/po` | GET/POST/DELETE | entry.po · **entry-read** | po, prod | `src/app/api/po/route.ts` |
| `/settings` | GET/PUT | settings.edit | setting | `src/app/api/settings/route.ts` |
| `/storage` | GET | storage.view | data, setting | `src/app/api/storage/route.ts` |
| `/users` | GET/POST/PUT/DELETE | users.manage | user | `src/app/api/users/route.ts` |

## 2) جداول الـ DB — مين بيلمس إيه

| الجدول | الملفات (15 جدول) |
|---|---|
| `marib_absence` | `src/app/api/entries/absence/route.ts` · `src/lib/marib/db.ts` |
| `marib_audit` | `src/app/api/audit/route.ts` · `src/app/api/data/route.ts` · `src/lib/marib/db.ts` |
| `marib_data` | `src/app/api/data/route.ts` · `src/app/api/health/route.ts` · `src/app/api/storage/route.ts` · `src/lib/marib/db.ts` |
| `marib_dept` | `src/app/api/entries/employees/route.ts` · `src/app/api/manpower/route.ts` · `src/lib/marib/db.ts` · `src/lib/marib/entries.ts` · `src/lib/marib/manpower_export.ts` · `src/lib/marib/manpower_io.ts` · `src/lib/marib/undo.ts` |
| `marib_emp` | `src/app/api/entries/employees/route.ts` · `src/app/api/health/route.ts` · `src/app/api/manpower/route.ts` · `src/lib/marib/db.ts` · `src/lib/marib/entries.ts` · `src/lib/marib/manpower_export.ts` · `src/lib/marib/manpower_io.ts` · `src/lib/marib/undo.ts` |
| `marib_meta` | `scripts/e2e_r64_seed_legacy.mjs` · `src/lib/marib/db.ts` · `src/lib/marib/undo.ts` |
| `marib_overtime` | `src/app/api/entries/overtime/route.ts` · `src/lib/marib/db.ts` |
| `marib_perm` | `scripts/e2e_r64_seed_legacy.mjs` · `src/app/api/perms/route.ts` · `src/lib/marib/authcache.ts` · `src/lib/marib/db.ts` · `src/lib/marib/perms.ts` |
| `marib_po` | `src/app/api/entries/production/route.ts` · `src/app/api/po/route.ts` · `src/lib/marib/db.ts` |
| `marib_prod` | `src/app/api/entries/production/route.ts` · `src/app/api/po/route.ts` · `src/lib/marib/db.ts` |
| `marib_req` | `src/app/api/manpower/route.ts` · `src/lib/marib/db.ts` · `src/lib/marib/manpower_export.ts` · `src/lib/marib/undo.ts` |
| `marib_setting` | `src/app/api/manpower/route.ts` · `src/app/api/settings/route.ts` · `src/app/api/storage/route.ts` · `src/lib/marib/db.ts` |
| `marib_transfer` | `src/app/api/manpower/route.ts` · `src/lib/marib/db.ts` · `src/lib/marib/manpower_export.ts` · `src/lib/marib/manpower_io.ts` · `src/lib/marib/undo.ts` |
| `marib_undo` | `src/lib/marib/db.ts` · `src/lib/marib/undo.ts` |
| `marib_user` | `scripts/e2e_r64_seed_legacy.mjs` · `src/app/api/auth/route.ts` · `src/app/api/health/route.ts` · `src/app/api/perms/route.ts` · `src/app/api/users/route.ts` · `src/lib/marib/authcache.ts` · `src/lib/marib/db.ts` · `src/lib/marib/session.ts` |

## 3) وحدات الواجهة (public/app)

| الملف | الوحدة | الـ endpoints اللي بيندها | حجم |
|---|---|---|---|
| `public/app/app_manpower.js` | MaribManpower | /api/manpower | 2979 سطر · 153.7KB |
| `public/app/app_main.js` | App | — | 2269 سطر · 106.7KB |
| `public/app/app_pages.js` | AppPages | — | 1445 سطر · 73.9KB |
| `public/app/app_auth.js` | MaribAuth | /api/perms | 1235 سطر · 57.8KB |
| `public/app/app_entries.js` | AppEntries | /api/entries/<br>/api/entries/absence<br>/api/entries/employees<br>/api/entries/overtime<br>/api/entries/production<br>/api/po | 953 سطر · 49.4KB |
| `public/app/i18n_dict.js` | — | — | 941 سطر · 107KB |
| `public/app/app_core.js` | MaribCore | — | 782 سطر · 41.2KB |
| `public/app/app_charts.js` | MaribCharts | — | 759 سطر · 40.6KB |
| `public/app/app_admin.js` | AppAdmin | /api/perms | 448 سطر · 22.3KB |
| `public/app/i18n_core.js` | I18N | — | 331 سطر · 17.2KB |
| `public/app/kit.js` | MaribKit | — | 101 سطر · 5.1KB |
| `public/app/marib_cloud.js` | MaribCloud | /api/audit<br>/api/auth<br>/api/data<br>/api/manpower<br>/api/settings<br>/api/storage<br>/api/users | 97 سطر · 3.8KB |

## 4) مكتبات السيرفر (src/lib/marib) — الدور والمستوردون

| الملف | exports | بيستورده | سطور |
|---|---|---|---|
| `src/lib/marib/authcache.ts` | cachedPerms, cachedRole, invalidateUser, setCachedPerms, setCachedRole | `src/app/api/perms/route.ts`<br>`src/app/api/users/route.ts` | 83 |
| `src/lib/marib/db.ts` | audit, bootInfo, driverName, ensureBoot, exec, q, withTransaction | `src/app/api/audit/route.ts`<br>`src/app/api/auth/route.ts`<br>`src/app/api/data/route.ts`<br>`src/app/api/entries/absence/route.ts`<br>`src/app/api/entries/employees/route.ts`<br>`src/app/api/entries/overtime/route.ts`<br>`src/app/api/entries/production/route.ts`<br>`src/app/api/health/route.ts`<br>`src/app/api/manpower/route.ts`<br>`src/app/api/perms/route.ts`<br>`src/app/api/po/route.ts`<br>`src/app/api/settings/route.ts`<br>`src/app/api/storage/route.ts`<br>`src/app/api/users/route.ts`<br>`src/lib/marib/entries.ts`<br>`src/lib/marib/http.ts`<br>`src/lib/marib/manpower_export.ts`<br>`src/lib/marib/manpower_io.ts`<br>`src/lib/marib/undo.ts` | 562 |
| `src/lib/marib/entries.ts` | deleteEntry, isDayStr, loadDeptMap, loadEmpMap, matchEmployee, monthParam | `src/app/api/entries/absence/route.ts`<br>`src/app/api/entries/overtime/route.ts`<br>`src/app/api/entries/production/route.ts`<br>`src/app/api/manpower/route.ts` | 127 |
| `src/lib/marib/http.ts` | MAX_BODY_BYTES, fail, logger, ok, readJson, requireEntryRead, requirePerm, requirePermBody, requireRole, requireRoleBody, requireUser, requireUserBody, serverFail | `src/app/api/audit/route.ts`<br>`src/app/api/auth/route.ts`<br>`src/app/api/data/route.ts`<br>`src/app/api/entries/absence/route.ts`<br>`src/app/api/entries/employees/route.ts`<br>`src/app/api/entries/overtime/route.ts`<br>`src/app/api/entries/production/route.ts`<br>`src/app/api/health/route.ts`<br>`src/app/api/manpower/export/route.ts`<br>`src/app/api/manpower/route.ts`<br>`src/app/api/perms/route.ts`<br>`src/app/api/po/route.ts`<br>`src/app/api/settings/route.ts`<br>`src/app/api/storage/route.ts`<br>`src/app/api/users/route.ts`<br>`src/lib/marib/entries.ts`<br>`src/lib/marib/manpower_io.ts` | 160 |
| `src/lib/marib/logger.ts` | log | `src/lib/marib/db.ts`<br>`src/lib/marib/http.ts`<br>`src/lib/marib/logger.ts` | 96 |
| `src/lib/marib/manpower_export.ts` | buildExport, buildTemplate | `src/app/api/manpower/export/route.ts` | 661 |
| `src/lib/marib/manpower_io.ts` | cleanStr, deptPath, hasArabic, importManpower, logTransfer, normCode, normName | `src/app/api/manpower/route.ts` | 443 |
| `src/lib/marib/perms.ts` | PERM_KEYS, PERM_KEY_SET, checkPerm, defaultForRole, effectiveLevel, fetchMyEffectivePerms, loadAllPerms, loadUserPerms | `src/app/api/perms/route.ts`<br>`src/lib/marib/authcache.ts`<br>`src/lib/marib/http.ts` | 221 |
| `src/lib/marib/session.ts` | COOKIE_NAME, currentUser, hashPassword, isAdmin, isDev, issueToken, sessionUser, verifyPassword, verifyToken | `src/app/api/auth/route.ts`<br>`src/app/api/settings/route.ts`<br>`src/app/api/users/route.ts`<br>`src/lib/marib/http.ts`<br>`src/lib/marib/perms.ts` | 110 |
| `src/lib/marib/stats.ts` | noteError, stats, statsSnapshot | `src/app/api/health/route.ts`<br>`src/lib/marib/db.ts`<br>`src/lib/marib/http.ts` | 71 |
| `src/lib/marib/undo.ts` | captureUndoSnapshot, restoreFromSnapshot, sweepExpiredUndoTokens | — | 183 |
| `src/lib/marib/xlsx-writer.ts` | XBook, XSheet | `src/app/api/entries/absence/route.ts`<br>`src/app/api/po/route.ts`<br>`src/lib/marib/manpower_export.ts` | 633 |

## 5) رادار التأثير — عدّلت ملف X؟ دول اللي بيستوردوه مباشرة

> الفحص الأعمق (مين بينادي على مين وقت التشغيل) بيجي من الـ E2E —
> الرادار ده بيغطي الاعتماد البنيوي (imports) اللي بيتكسر في البناء.

| الملف | المستوردون المباشرون |
|---|---|
| `src/app/skeleton.ts` | `src/app/page.tsx` |
| `src/lib/marib/authcache.ts` | `src/app/api/perms/route.ts` · `src/app/api/users/route.ts` |
| `src/lib/marib/db.ts` | `src/app/api/audit/route.ts` · `src/app/api/auth/route.ts` · `src/app/api/data/route.ts` · `src/app/api/entries/absence/route.ts` · `src/app/api/entries/employees/route.ts` · `src/app/api/entries/overtime/route.ts` · `src/app/api/entries/production/route.ts` · `src/app/api/health/route.ts` · `src/app/api/manpower/route.ts` · `src/app/api/perms/route.ts` · `src/app/api/po/route.ts` · `src/app/api/settings/route.ts` · `src/app/api/storage/route.ts` · `src/app/api/users/route.ts` · `src/lib/marib/entries.ts` · `src/lib/marib/http.ts` · `src/lib/marib/manpower_export.ts` · `src/lib/marib/manpower_io.ts` · `src/lib/marib/undo.ts` |
| `src/lib/marib/entries.ts` | `src/app/api/entries/absence/route.ts` · `src/app/api/entries/overtime/route.ts` · `src/app/api/entries/production/route.ts` · `src/app/api/manpower/route.ts` |
| `src/lib/marib/http.ts` | `src/app/api/audit/route.ts` · `src/app/api/auth/route.ts` · `src/app/api/data/route.ts` · `src/app/api/entries/absence/route.ts` · `src/app/api/entries/employees/route.ts` · `src/app/api/entries/overtime/route.ts` · `src/app/api/entries/production/route.ts` · `src/app/api/health/route.ts` · `src/app/api/manpower/export/route.ts` · `src/app/api/manpower/route.ts` · `src/app/api/perms/route.ts` · `src/app/api/po/route.ts` · `src/app/api/settings/route.ts` · `src/app/api/storage/route.ts` · `src/app/api/users/route.ts` · `src/lib/marib/entries.ts` · `src/lib/marib/manpower_io.ts` |
| `src/lib/marib/logger.ts` | `src/lib/marib/db.ts` · `src/lib/marib/http.ts` · `src/lib/marib/logger.ts` |
| `src/lib/marib/manpower_export.ts` | `src/app/api/manpower/export/route.ts` |
| `src/lib/marib/manpower_io.ts` | `src/app/api/manpower/route.ts` |
| `src/lib/marib/perms.ts` | `src/app/api/perms/route.ts` · `src/lib/marib/authcache.ts` · `src/lib/marib/http.ts` |
| `src/lib/marib/session.ts` | `src/app/api/auth/route.ts` · `src/app/api/settings/route.ts` · `src/app/api/users/route.ts` · `src/lib/marib/http.ts` · `src/lib/marib/perms.ts` |
| `src/lib/marib/stats.ts` | `src/app/api/health/route.ts` · `src/lib/marib/db.ts` · `src/lib/marib/http.ts` |
| `src/lib/marib/xlsx-writer.ts` | `src/app/api/entries/absence/route.ts` · `src/app/api/po/route.ts` · `src/lib/marib/manpower_export.ts` |

**الواجهة (client):** الوحدات بتوصل لبعض عبر جسر `__maribCtx` (مش imports) —
الاعتماد البياني: `app_main` بيصدّر الجسر → `app_pages` / `app_entries` / `app_admin` بيستهلكوه،
وكلهم بيستخدموا `MaribCloud` (API) + `MaribAuth` (صلاحيات) + `I18N` (ترجمة) + `MaribKit` (أدوات).

- `AppAdmin` (public/app/app_admin.js) → MaribCloud · I18N · __maribCtx
- `MaribAuth` (public/app/app_auth.js) → MaribCloud · MaribAuth · I18N
- `MaribCharts` (public/app/app_charts.js) → I18N
- `MaribCore` (public/app/app_core.js) → I18N
- `AppEntries` (public/app/app_entries.js) → MaribCloud · MaribAuth · I18N · MaribKit · __maribCtx
- `App` (public/app/app_main.js) → MaribCloud · MaribAuth · I18N · MaribKit · __maribCtx
- `MaribManpower` (public/app/app_manpower.js) → MaribCloud · MaribAuth · I18N · MaribKit
- `AppPages` (public/app/app_pages.js) → I18N · __maribCtx
- `I18N` (public/app/i18n_core.js) → I18N
- `MaribKit` (public/app/kit.js) → MaribKit
- `MaribCloud` (public/app/marib_cloud.js) → MaribCloud

## 6) الصلاحيات — كل مفتاح ومين بيستخدمه

| المفتاح | السيرفر (حارس) |
|---|---|
| `audit.view` | `src/app/api/audit/route.ts` |
| `data.upload` | `src/app/api/data/route.ts` |
| `data.view` | `src/app/api/data/route.ts` |
| `entry.edit` | `src/app/api/entries/absence/route.ts`<br>`src/app/api/entries/overtime/route.ts`<br>`src/app/api/entries/production/route.ts`<br>`src/lib/marib/entries.ts`<br>`src/lib/marib/http.ts` |
| `entry.po` | `src/app/api/po/route.ts`<br>`src/lib/marib/http.ts` |
| `entry.view` | `src/lib/marib/http.ts` |
| `manpower.export` | `src/app/api/manpower/export/route.ts` |
| `manpower.view` | `src/app/api/manpower/route.ts` |
| `settings.edit` | `src/app/api/settings/route.ts` |
| `storage.view` | `src/app/api/storage/route.ts` |
| `users.manage` | `src/app/api/perms/route.ts`<br>`src/app/api/users/route.ts` |

**حارس الإدخال (R64):** `requireEntryRead` — بيسمح بـ entry.view (رؤية) **أو** entry.edit / entry.po (تعديل). القسم ليه مفاتيحه الخاصة من R64 — قبل كده كان مربوط بمفاتيح اللوحة (data.view/data.upload).

## 7) الأصول الثابتة (public/app)

| الأصل | الحجم | الدور |
|---|---|---|
| `public/app/app.css` | 635.4KB | ستايل الموقع كله |
| `public/app/bg/home-denim.jpg` | 102KB | خلفية الصفحة الرئيسية (R64) |
| `public/app/cursor_needle.png` | 0.9KB | أنيميشن المكنة (شاشة الدخول) |
| `public/app/cursor_needle_thread.png` | 1.3KB | خيط المكنة (شاشة الدخول) |
| `public/app/favicon.png` | 1.4KB | أيقونة المتصفح |
| `public/app/icons/balance-scale.png` | 3.6KB | — |
| `public/app/icons/bar-chart.png` | 2.9KB | — |
| `public/app/icons/card-file-box.png` | 1.9KB | — |
| `public/app/icons/clipboard.png` | 1.9KB | — |
| `public/app/icons/door.png` | 1.5KB | — |
| `public/app/icons/factory.png` | 3.3KB | — |
| `public/app/icons/gear.png` | 2.3KB | — |
| `public/app/icons/house.png` | 2.1KB | — |
| `public/app/icons/users.png` | 1.9KB | — |
| `public/app/logo.png` | 9.6KB | لوجو مأرب (شريط العنوان + الرئيسية) |
| `public/app/xlsx.full.min.js` | 929.6KB | SheetJS — قراءة/كتابة الإكسل في المتصفح |

