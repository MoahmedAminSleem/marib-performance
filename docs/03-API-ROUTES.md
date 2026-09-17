# 03 — API ROUTES

> كل المسارات تحت `/api/`. من R48 فيه نظام واحد بس: marib
> (HMAC cookie). نظام Prisma القديم اتمسح بالكامل (شوف سير-العمل-R48).

## المسارات الجديدة (marib)

| Route | Method | Auth | Function |
|-------|--------|------|----------|
| `/api/auth` | GET | any | session check → `{user}` |
| `/api/auth` | POST | none | login → sets cookie |
| `/api/auth` | DELETE | any | logout |
| `/api/data` | GET | perm:data.view | كل الشهور packed + lastSync (R55) |
| `/api/data` | POST | perm:data.upload | استبدال شهر كامل (transaction) (R55) |
| `/api/manpower` | GET | perm:manpower.view | الهيكل الكامل (depts+emps+req+transfers+tr+root) (R55) |
| `/api/manpower` | POST | perm:manpower.edit (و import → manpower.import) | add/edit/editMany/del/delMany/fill/vacAdd/vacDel/deptAdd/deptRename/deptMove/deptDelete/req/archDel/import/undo/rootSet — edit/add/fill بيقبلوا `name_ar`/`job_ar` + حفظ تلقائي للعربي (R47) |
| `/api/manpower/export` | GET | perm:manpower.export | تنزيل Excel (?template=1 ?lang=ar\|tr) — البناء في lib/marib/manpower_export.ts (R56) |
| `/api/users` | GET | perm:users.manage | قائمة المستخدمين (R55) |
| `/api/users` | POST | perm:users.manage edit | إنشاء مستخدم (R55) |
| `/api/users` | PUT | perm:users.manage edit | تعديل (photo/title/**username**/password/role) (R55 · R63: الاسم) |
| `/api/users` | DELETE | perm:users.manage edit | حذف (R55) |
| `/api/health` | GET | none | فحص حيوية: `{ok, db, boot, users, months, employees, stats}` (R48: على جداول marib · R56: `db` = neon/pglite — إثبات مرئي إن الإنتاج على Neon · R57: `boot` = fast/full · R62: `stats` = عدادات حية — uptime + q{count/slow/ms_total/errors} + srv_errors + last_error + mem.rss_mb + node) |
| `/api/settings` | GET | any | كل الإعدادات |
| `/api/settings` | PUT | perm:settings.edit | حفظ إعداد (storage_quota/mhome: dev فقط فوق الصلاحية) (R55) |
| `/api/storage` | GET | perm:storage.view | قياس مساحة القاعدة + أكبر الجداول (R55) |
| `/api/audit` | GET | perm:audit.view | سجل العمليات (?from=?to=) |
| `/api/perms` | GET | perm:users.manage view | كل المستخدمين + الصلاحيات (R55) |
| `/api/perms` | GET ?me=1 | any | صلاحياتي الفعّالة |
| `/api/perms` | PUT | perm:users.manage edit | set override (R55) |
| `/api/perms` | DELETE | perm:users.manage edit | clear override (R55) |
| `/api/entries/production` | GET | **entry-read** (data.view أو data.upload — R63) | ?month=YYYY-MM |
| `/api/entries/production` | POST | perm:data.upload | create |
| `/api/entries/production` | DELETE | perm:data.upload | ?id= |
| `/api/entries/employees` | GET | **entry-read** (R63) | الحد الأدنى لكومبوبوكس الإدخال: {code,name,nameTr,job,path} — بدل /api/manpower (كان محتاج manpower.view) |
| `/api/entries/absence` | GET | **entry-read** | ?month= + ?template=1 |
| `/api/entries/absence` | POST | perm:data.upload | create (?action=import) |
| `/api/entries/absence` | DELETE | perm:data.upload | ?id= |
| `/api/entries/overtime` | GET | **entry-read** | ?month= |
| `/api/entries/overtime` | POST | perm:data.upload | create |
| `/api/entries/overtime` | DELETE | perm:data.upload | ?id= |
| `/api/po` | GET | **entry-read** (كل الفروع: قايمة/تفاصيل/تيمبلت — R63) | ?po= + ?template=1 |
| `/api/po` | POST | perm:data.upload | upsert / ?action=import |
| `/api/po` | DELETE | perm:data.upload | ?po= |

## المسارات القديمة (Prisma) — اتمسحت في R48

المسارات دي كانت بقايا من النظام القديم والفرونت مش بيستخدمها خالص
>(اتأكدنا من كل الـ fetches في marib_cloud.js + الموديولات). اتمسحت:
>`/api/auth/login` · `/api/auth/me` · `/api/auth/logout` · `/api/months` ·
>`/api/months/[key]` · `/api/users/[id]` · `/api/users/[id]/password`
>معاهم `src/lib/{db,auth,bootstrap}.ts` + seed JSONs القديمة.
>و`/api/data` + `/api/storage` دول أصلًا على نظام marib (في الجدول فوق).

## مفاتيح الصلاحيات (R46)

```
manpower.view    manpower.edit    manpower.import    manpower.export
data.view        data.upload
users.manage
settings.view    settings.edit
audit.view       storage.view
```

## التراجع (Undo)

```
POST /api/manpower  action=import  →  يرجّع undoToken في الـ response
POST /api/manpower  action=undo    →  ?undoToken=X  →  restoreFromSnapshot()
```

## حارس قراءة الإدخال (R63)

```
requireEntryRead = data.view (رؤية) أو data.upload (تعديل)
المسارات المحروسة: entries/{production,absence,overtime,employees} GET + po GET
السبب: مسؤول الإدخال اللي اللوحة/الاتزان مخفيين عنه كان كل القراءات بترجع 403
```

## العربي والتركي في الموظفين (R47 + R50)

```
POST /api/manpower  action=edit    →  body: { ..., name_ar, job_ar }  (فاضي = مسح صريح)
POST /api/manpower  action=import  →  rows من أعمدة Database بتاعة الشيت
التيمبلت (?template=1) بقى 15 عمود من R50 — العربي هو العمود الأساسي
وجنب كل حاجة حروفية عمود TR (التركي): الاسم/الادارة/القسم/القسم
الداخلي/الوظيفة. الترجمة الفورية و /api/translate اتشالوا في R50.
```
