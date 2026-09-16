# 05 — CURRENT STATE

> **الحالة في 16 سبتمبر 2026 (R46).** ما تم، ما معلّق، المشاكل المعروفة.

## ✅ مكتمل (R46)

| # | الميزة | الحالة |
|---|--------|--------|
| R46-1 | تنظيف الإعدادات (شيل الشرح) | ✅ |
| R46-2 | نظام الصلاحيات الكامل (DB+API+UI+enforcement) | ✅ |
| R46-3 | الأسماء ثنائية اللغة (DB columns + UI toggle) | ✅ — لكن مودال التعديل لسه ما يضيفش name_ar/job_ar |
| R46-4 | كارت Extra Staff (surplus depts only) | ✅ — لكن المستخدم بلّغ إنه مش بيجيب العدد صح |
| R46-5 | الثيم الفاتح (4 أيزاءات + checkbox + X + header) | ✅ — لكن الأيقونات لسه مش باينة على موقع المستخدم |
| R46-6 | ترجمة فورية (Google gtx + MyMemory + toggle) | ✅ |
| R46-7 | Import&Export موحد + undo 15min | ✅ |
| R46-8 | صفحات إدخال البيانات (backend + UI) | ✅ |
| R46-9 | .mp-selbar CSS | ✅ |
| R46-10 | اختيار لغة Excel (AR/EN/TR) | ✅ |
| R46-11 | تصغير أيقونات Vacant | ✅ |
| R46-fix | الريفرش بيفضل في نفس الصفحة (localStorage) | ✅ |

## ⚠️ معلّق / يحتاج متابعة

| الموضوع | التفاصيل |
|---------|----------|
| **أيقونات الـ topbar** | CSS defensive مع `!important` موجود، لكن المستخدم بلّغ إنها لسه مش باينة. السبب المحتمل: browser cache أو لم يرفع آخر ZIP. |
| **كارت Extra Staff** | `excessTotal()` بيرجع مجموع surplus. المستخدم يتوقع "3" لكن بيشوف "2". السبب المحتمل: قسم General Maintenance ملوش `own` (override) متفع — فلن يحسب. لازم المستخدم يفعّل override للقسم. |
| **مودال تعديل الموظف** | مفيش input fields لـ `name_ar` و `job_ar`. البنية التحتية موجودة بس الإدخال من الـ UI لسه. |
| **استيراد name_ar/job_ar** | الـ import flow مش بياخد أعمدة name_ar/job_ar من الـ Excel. |
| **بيانات الأسماء** | الـ seed فيه أسماء عربي أصلاً. عشان الـ EN toggle يشتغل، الأدمن لازم يدخل الأسماء الإنجليزية في `name` و العربية في `name_ar`. |
| **Vercel build** | `bun run build` شغّال محلياً بدون أخطاء. لم يُختبر على Vercel. |

## 🔴 المشاكل المعروفة

1. **dev server instability:** الـ watchdog بيـ auto-restart بس أحياناً بيموت. الحل: `pkill -9 -f "next\|marib-watch"` ثم إعادة التشغيل.
2. **PGlite init:** أحياناً بتفشل. الحل: `rm -rf db/pglite` ثم إعادة التشغيل (الـ seed بيرجع تلقائياً).
3. **node_modules:** أحياناً بيتمسح. الحل: `bun install`.

## 📦 الإصدارات

| Version | Date | Files | Notes |
|---------|------|-------|-------|
| v4 | 16 Sep 2026 | 20 | excess card fix + defensive CSS + page persistence + سير-العمل |
| v3 | 16 Sep 2026 | 18 | excess card leaf depts + Entries button re-added |
| v2 | 16 Sep 2026 | 18 | Entries button + defensive CSS |
| v1 | 15 Sep 2026 | 16 | initial R46 upload |

## الخطوة التالية

المستخدم بلّغ عن:
1. كارت Extra Staff مش بيجيب العدد صح (يتوقع 3، بيشوف 2)
2. الأيقونات مش باينة
3. الريفرش بيرجّع للرئيسية (اتصلحت في v4)

للمتابعة:
- اطلب من المستخدم screenshot بعد رفع v4
- إذا الأيقونات لسه مش باينة → تأكد إن CSS مرفوع صح
- إذا العدد لسه غلط → اطلب screenshot للـ override settings (Settings → Targets)
