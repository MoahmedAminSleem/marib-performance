# 01 — ARCHITECTURE

## التقنيات

| التقنية | النسخة | الوظيفة |
|---------|--------|---------|
| Next.js | 16.1.3 | إطار الويب (App Router) |
| React | 19 | الواجهة |
| PGlite | 0.5.8 | Postgres WASM للتطوير المحلي (file-based at `db/pglite/`) |
| pg | 8.23 | Postgres للإنتاج (Vercel + Neon) |
| Prisma | 6.11 | نظام قديم — يُستخدم فقط في `/api/health`, `/api/auth/login`, `/api/data`, `/api/storage`, `/api/months` |
| XLSX (in-house) | — | مولّد Excel بدون مكتبات خارجية (`src/lib/marib/xlsx-writer.ts`) |
| z-ai-web-dev-sdk | 0.0.18 | SDK للترجمة + VLM + LLM |

## بنية المشروع

```
marib-performance-main/
├── src/
│   ├── app/
│   │   ├── skeleton.ts          ← HTML الـ SPA (80KB string)
│   │   ├── skeleton-html.ts     ← نسخة HTML ثابتة (للنسخ القديم)
│   │   ├── page.tsx              ← صفحة Next.js الوحيدة (dangerouslySetInnerHTML)
│   │   ├── layout.tsx            ← root layout
│   │   ├── globals.css           ← Tailwind
│   │   ├── marib-app.css         ← غير مستخدم (مدمج في app.css)
│   │   └── api/                  ← كل الـ API routes
│   │       ├── auth/             ← login/logout/me (النظام القديم Prisma)
│   │       ├── auth/route.ts     ← login/logout (النظام الجديد marib_user)
│   │       ├── perms/            ← R46: نظام الصلاحيات
│   │       ├── translate/        ← R46: ترجمة فورية
│   │       ├── entries/          ← R46: إدخال البيانات (production/absence/overtime)
│   │       ├── manpower/         ← الاتزان (هيكل القوى العاملة)
│   │       ├── users/            ← إدارة المستخدمين
│   │       ├── settings/         ← الإعدادات
│   │       ├── audit/            ← سجل العمليات
│   │       ├── months/           ← شهور البيانات
│   │       ├── data/             ← رفع/تنزيل البيانات
│   │       └── health/           ← فحص الصحة
│   ├── lib/
│   │   ├── db.ts                 ← Prisma client (النظام القديم)
│   │   ├── bootstrap.ts          ← Prisma boot (النظام القديم)
│   │   ├── auth.ts               ← Prisma auth (النظام القديم)
│   │   └── marib/                ← كل المنطق الجديد
│   │       ├── db.ts             ← raw SQL driver (PGlite/pg) + BOOT_SQL + ensureBoot()
│   │       ├── session.ts        ← HMAC-signed cookie (marib_sess)
│   │       ├── http.ts           ← helpers (requireUser/requireRole/requirePerm)
│   │       ├── perms.ts          ← R46: نظام الصلاحيات
│   │       ├── undo.ts           ← R46: snapshot/restore للتراجع
│   │       ├── translate.ts      ← R46: Google gtx + MyMemory
│   │       ├── xlsx-writer.ts    ← مولّد Excel داخلي
│   │       └── logger.ts        ← structured logging
│   └── server/seed/
│       ├── manpower-seed.ts      ← بيانات الاتزان (828 موظف / 63 قسم)
│       └── 2026-0[7-9].json      ← بيانات شهور يوليو/أغسطس/سبتمبر
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
│       ├── xlsx.full.min.js      ← مكتبة XLSX (client-side)
│       └── app.css               ← كل الستايل (600KB+)
├── prisma/
│   └── schema.prisma             ← SQLite schema (للنظام القديم)
├── docs/                         ← هذا الفولدر
├── سير-العمل.html                ← السجل التاريخي (R28→R46)
├── README.md
├── next.config.ts                ← CSP headers + standalone output
├── package.json
└── .env                          ← DATABASE_URL + AUTH_SECRET + DEV_BOOT_PASSWORD
```

## نظاما المصادقة (مهم!)

هناك **نظامان متوازيان**:

| | النظام القديم (Prisma) | النظام الجديد (marib) |
|---|---|---|
| **Cookie** | `marib_sess` (hex token, DB lookup) | `marib_sess` (signed payload.signature) |
| **DB** | Prisma `User` + `Session` tables (SQLite) | `marib_user` table (PGlite/Postgres) |
| **Routes** | `/api/auth/login`, `/api/auth/me`, `/api/health`, `/api/data`, `/api/months`, `/api/storage` | `/api/auth` (GET/POST/DELETE), `/api/manpower/*`, `/api/users/*`, `/api/settings/*`, `/api/perms/*`, `/api/entries/*`, `/api/translate/*` |
| **Login** | `/api/auth/login` (POST) | `/api/auth` (POST) |
| **الواجهة** | تستخدم النظام الجديد (`/api/auth`) | ✓ هذا هو المستخدم فعلياً |

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

## BOOT_SQL

`ensureBoot()` في `src/lib/marib/db.ts` ينشئ كل الجداول في أول طلب. Idempotent — آمن لإعادة التشغيل. الجداول:

`marib_user` · `marib_data` · `marib_setting` · `marib_audit` · `marib_emp` · `marib_dept` · `marib_req` · `marib_transfer` · `marib_meta` · `marib_i18n` · `marib_perm` (R46) · `marib_undo` (R46) · `marib_prod` (R46) · `marib_absence` (R46) · `marib_overtime` (R46)
