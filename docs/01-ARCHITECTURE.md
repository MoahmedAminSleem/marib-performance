# 01 — ARCHITECTURE

## التقنيات

| التقنية | النسخة | الوظيفة |
|---------|--------|---------|
| Next.js | 16.1.3 | إطار الويب (App Router) |
| React | 19 | الواجهة |
| PGlite | 0.5.8 | Postgres WASM للتطوير المحلي (file-based at `db/pglite/`) |
| pg | 8.23 | Postgres للإنتاج (Vercel + Neon) |
| XLSX (in-house) | — | مولّد Excel بدون مكتبات خارجية (`src/lib/marib/xlsx-writer.ts`) |
| Tailwind | 4 | CSS pipeline لـ globals.css بس (SPA الستايل بتاعه في app.css) |
| الترجمة | — | Google gtx + MyMemory عبر fetch مباشر (`lib/marib/translate.ts`) |

> **R49:** الـ dependencies اتنضفت من 79 لـ 15 حزمة (بإذن المالك) — prisma
> وz-ai-web-dev-sdk و63 حزمة تيمبلت ميتة اتشالوا. شوف `سير-العمل-R49.md`.

## بنية المشروع

```
marib-performance-main/
├── src/
│   ├── app/
│   │   ├── skeleton.ts          ← HTML الـ SPA (80KB string)
│   │   ├── page.tsx              ← صفحة Next.js الوحيدة (dangerouslySetInnerHTML)
│   │   ├── layout.tsx            ← root layout
│   │   ├── globals.css           ← Tailwind
│   │   └── api/                  ← كل الـ API routes (نظام واحد: marib)
│   │       ├── auth/route.ts     ← login/logout (marib_user)
│   │       ├── perms/            ← R46: نظام الصلاحيات
│   │       ├── translate/        ← R46: ترجمة فورية
│   │       ├── entries/          ← R46: إدخال البيانات (production/absence/overtime)
│   │       ├── manpower/         ← الاتزان (هيكل القوى العاملة)
│   │       ├── users/            ← إدارة المستخدمين
│   │       ├── settings/         ← الإعدادات
│   │       ├── audit/            ← سجل العمليات
│   │       ├── data/             ← رفع/تنزيل البيانات (marib_data)
│   │       └── health/           ← فحص الصحة (R48: على جداول marib)
│   ├── lib/
│   │   └── marib/                ← كل المنطق (نظام واحد)
│   │       ├── db.ts             ← raw SQL driver (PGlite/pg) + BOOT_SQL + ensureBoot()
│   │       ├── session.ts        ← HMAC-signed cookie (marib_sess)
│   │       ├── http.ts           ← helpers (requireUser/requireRole/requirePerm)
│   │       ├── perms.ts          ← R46: نظام الصلاحيات
│   │       ├── undo.ts           ← R46: snapshot/restore للتراجع
│   │       ├── translate.ts      ← R46: Google gtx + MyMemory
│   │       ├── xlsx-writer.ts    ← مولّد Excel داخلي
│   │       └── logger.ts        ← structured logging
│   └── server/seed/
│       └── manpower-seed.ts      ← بيانات الاتزان (828 موظف / 63 قسم) — يستخدمه ensureBoot()
├── public/
│   └── app/
│       ├── app_main.js           ← الواجهة الرئيسية (Dashboard)
│       ├── app_manpower.js       ← الاتزان (Balance)
│       ├── app_auth.js           ← الدخول + البوابة
│       ├── app_core.js           ← أدوات مشتركة
│       ├── app_charts.js         ← الرسومات
│       ├── marib_cloud.js        ← API client (fetch wrapper)
│       ├── i18n_core.js          ← محرك الترجمة
│       ├── i18n_dict.js          ← قاموس الترجمة (AR/EN/TR)
│       ├── xlsx.full.min.js      ← مكتبة XLSX (lazy-load عند أول رفع/تنزيل)
│       └── app.css               ← كل الستايل (600KB+)
│   └── (R48: i18n.js / marib-core.js / marib-charts.js / embed.js / xlsx.js
│        + Marib_Performance_Studio.html الأوفلاين — كلهم اتمسحوا: ميتين بلا أي مرجع)
├── docs/                         ← هذا الفولدر
├── سير-العمل.html                ← السجل التاريخي (R28→R46)
├── README.md
├── next.config.ts                ← CSP headers + standalone output
├── package.json                 ← R49: 15 حزمة بس (اتنضفت 63 ميتة)
└── .env                          ← DATABASE_URL + AUTH_SECRET + DEV_BOOT_PASSWORD
```

## المصادقة (نظام واحد من R48)

R48 مسحت نظام Prisma القديم بالكامل. اللي فاضل (وكان المستخدم فعليًا من زمان):

| | النظام (marib) |
|---|---|
| **Cookie** | `marib_sess` (signed payload.signature — HMAC) |
| **DB** | `marib_user` table (PGlite/Postgres) |
| **Routes** | `/api/auth` (GET/POST/DELETE), `/api/manpower/*`, `/api/users/*`, `/api/settings/*`, `/api/perms/*`, `/api/entries/*`, `/api/translate/*`, `/api/health` |
| **Login** | `/api/auth` (POST) — Amin / 2872002 |

> الـ routes القديمة (`/api/auth/login`, `/api/auth/me`, `/api/auth/logout`,
> `/api/months`, `/api/users/[id]`…) اتمسحت في R48 — كانت ميتة (الفرونت عمره ما نده عليها).

## التشغيل المحلي

```bash
cd marib-performance-main
bun install
# .env file must exist with DATABASE_URL=file:./db/sqlite.db
bun run dev    # → http://localhost:3000
```

## البناء للإنتاج

```bash
bun run build   # → .next/standalone/
# Vercel ينشر تلقائياً عند رفع GitHub
```

> **ملاحظة تشغيل الـ standalone محليًا (اتكتشفت في R48):** سيرفر الـ standalone
> بيعمل `process.chdir(__dirname)` — فبيروح يدور على `db/pglite` جنب `server.js`.
> لو هتختبر الإنتاج محليًا: `cp -r db .next/standalone/db` قبل التشغيل.
> (على Vercel مفيش تأثير — الإنتاج Postgres/Neon مش PGlite.)

## BOOT_SQL

`ensureBoot()` في `src/lib/marib/db.ts` ينشئ كل الجداول في أول طلب. Idempotent — آمن لإعادة التشغيل. الجداول:

`marib_user` · `marib_data` · `marib_setting` · `marib_audit` · `marib_emp` · `marib_dept` · `marib_req` · `marib_transfer` · `marib_meta` · `marib_i18n` · `marib_perm` (R46) · `marib_undo` (R46) · `marib_prod` (R46) · `marib_absence` (R46) · `marib_overtime` (R46)
