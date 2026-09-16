# 07 — HOW TO CONTINUE (دليل الاستكمال)

> **اقرأ هذا الملف قبل أي تعديل.** فيه المبادئ والتدفق.

## مبادئ المالك

1. **الـ Loop:** نفّذ → تراجع → تراجع → E2E → سلّم. لا تسلّم قبل الاختبار.
2. **التوثيق:** كل تعديل يُوثّق في `docs/` فوراً. أي نموذج AI جديد يقرأ `00-START-HERE.md` أولاً.
3. **التركيز:** لا تتهيّس. لا تتكلم بلغات غريبة. لا تكسر الدنيا.
4. **اللغة:** الكلام بالعربي/الإنجليزي بس. الكود بالإنجليزي. التعليقات بالعربي.
5. **البيانات:** لا تمسح بيانات المستخدم. `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` دائماً.
6. **الأمان:** كل route mutating يحترم الصلاحيات (requirePerm/requirePermBody). كل تغيير بيتسجل في audit.
7. **الـ Excel:** استخدم `xlsx-writer.ts` الداخلي. لا تضف مكتبات خارجية (exceljs كسر Vercel في R39).

## التدفق المثالي لأي تعديل

```
1. اقرأ docs/00-START-HERE.md → 01-ARCHITECTURE.md → 05-CURRENT-STATE.md
2. اقرأ الملف اللي هتعدّله من docs/04-FILES-MAP.md
3. ابدأ dev server: pkill -9 -f "next\|marib-watch" && nohup setsid bash scripts/marib-watch.sh &
4. عدّل الملف
5. اختبر: curl + browser snapshot
6. لو فيه عطب → ارجع الملف (git diff) → أصلح → أعد الاختبار
7. E2E: login → ادخل الصفحة → جرّب الميزة كاملة
8. حدّث docs/05-CURRENT-STATE.md + سير-العمل.html
9. أنشئ ZIP: scripts/marib-watch.sh → zip changed files → /home/z/my-project/download/
```

## تشغيل المشروع

```bash
# 1. Install
cd /home/z/my-project/marib/marib-performance-main
bun install

# 2. .env (موجود)
# DATABASE_URL=file:./db/sqlite.db
# AUTH_SECRET=marib-local-dev-secret-R46-2026
# DEV_BOOT_PASSWORD=2872002

# 3. Start
nohup setsid bash /home/z/my-project/scripts/marib-watch.sh &
# watchdog يعيد تشغيل dev server تلقائياً

# 4. Login
# http://localhost:3000
# Amin / 2872002

# 5. PGlite عند الإنهيار
rm -rf db/pglite .next
# الـ watchdog بيعيد التشغيل + ensureBoot() بيزرع من جديد
```

## اختصارات مهمة

```bash
# قتل كل العمليات
pkill -9 -f "next\|marib-watch\|bun run"

# فحص كل APIs
curl -s -m 10 http://localhost:3000/api/health

# Login + test
curl -s -m 15 -c /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"username":"Amin","password":"2872002","remember":true}' \
  http://localhost:3000/api/auth

# اختبر ترجمة
curl -s -m 15 -b /tmp/cookies.txt "http://localhost:3000/api/translate?term=SEWING&to=ar"

# اختبر excessTotal
curl -s -m 15 -b /tmp/cookies.txt http://localhost:3000/api/manpower | python3 -c "
import json,sys; d=json.load(sys.stdin); print('surplus:', __import__('builtins').sum(1 for e in d.get('emps',[])))"
```

## بنية الـ ZIP للرفع

```
marib_r46_upload/
├── src/lib/marib/         ← libraries
├── src/app/api/           ← API routes
├── src/app/skeleton.ts    ← HTML
├── public/app/            ← client JS + CSS + i18n
├── سير-العمل.html         ← سجل الجولات
├── docs/                  ← التوثيق
└── CHANGED-FILES.txt     ← manifest
```

رفع: GitHub → Add file → Upload files → اسحب الملفات مع الحفاظ على البنية.

## التحذيرات

- ⚠️ **لا تضف `package.json` للـ ZIP** — Vercel يستخدم النسخة الموجودة على GitHub
- ⚠️ **لا تستخدم `exceljs`** — استخدم `xlsx-writer.ts` الداخلي
- ⚠️ **لا تلمس `prisma/`** — النظام القديم لا يزال يُستخدم في `/api/health`, `/api/data`, `/api/months`
- ⚠️ **الـ skeleton.ts هو string واحد** — عدّله بـ Python script (regex على الـ escaped HTML) مش بـ Edit مباشر
- ⚠️ **app.css كبير (620KB)** — الزق في النهاية بس، متعدّلش القواعد الموجودة
