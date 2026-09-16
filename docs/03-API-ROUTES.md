# 03 — API ROUTES

> كل المسارات تحت `/api/`. من R48 فيه نظام واحد بس: marib
> (HMAC cookie). نظام Prisma القديم اتمسح بالكامل (شوف سير-العمل-R48).

## المسارات الجديدة (marib)

| Route | Method | Auth | Function |
|-------|--------|------|----------|
| `/api/auth` | GET | any | session check → `{user}` |
| `/api/auth` | POST | none | login → sets cookie |
| `/api/auth` | DELETE | any | logout |
| `/api/manpower` | GET | any | الهيكل الكامل (depts+emps+req+transfers+tr+root) |
| `/api/manpower` | POST | admin+ | add/edit/fill/vacAdd/vacDel/deptAdd/deptRename/deptMove/deptDelete/req/import/undo/trSync — edit/add/fill/import بيقبلوا `name_ar`/`job_ar` + حفظ تلقائي للعربي (R47)، و import بيقبل `arCol` |
| `/api/manpower/export` | GET | any | تنزيل Excel (?template=1 ?lang=ar\|en\|tr) |
| `/api/users` | GET | admin | قائمة المستخدمين |
| `/api/users` | POST | admin | إنشاء مستخدم |
| `/api/users` | PUT | admin | تعديل (photo/title/password/role) |
| `/api/users` | DELETE | admin | حذف |
| `/api/health` | GET | none | فحص حيوية: `{ok, users, months, employees}` (R48: على جداول marib) |
| `/api/settings` | GET | any | كل الإعدادات |
| `/api/settings` | PUT | admin+ | حفظ إعداد |
| `/api/audit` | GET | perm:audit.view | سجل العمليات (?from=?to=) |
| `/api/perms` | GET | admin | كل المستخدمين + الصلاحيات |
| `/api/perms` | GET ?me=1 | any | صلاحياتي الفعّالة |
| `/api/perms` | PUT | admin | set override |
| `/api/perms` | DELETE | admin | clear override |
| `/api/translate` | GET | any | ?term=X&to=ar\|en\|tr → ترجمة فورية |
| `/api/entries/production` | GET | perm:data.view | ?month=YYYY-MM |
| `/api/entries/production` | POST | perm:data.upload | create |
| `/api/entries/production` | DELETE | perm:data.upload | ?id= |
| `/api/entries/absence` | GET | perm:data.view | ?month= + ?template=1 |
| `/api/entries/absence` | POST | perm:data.upload | create (?action=import) |
| `/api/entries/absence` | DELETE | perm:data.upload | ?id= |
| `/api/entries/overtime` | GET | perm:data.view | ?month= |
| `/api/entries/overtime` | POST | perm:data.upload | create |
| `/api/entries/overtime` | DELETE | perm:data.upload | ?id= |

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

## العربي في الموظفين (R47)

```
POST /api/manpower  action=edit    →  body: { ..., name_ar, job_ar }  (فاضي = مسح صريح)
POST /api/manpower  action=import  →  body: { rows: [code,name,dept,sec,sub,job,note,hire,vac,mach,del,nameAr,jobAr], arCol: true|false }
  - arCol=true   → أعمدة العربي موجودة في الشيت (القيمة الفاضية = فاضية)
  - arCol=false  → شيت قديم: تغيير اسم عربي لإنجليزي بيتحفظ العربي القديم في name_ar تلقائيًا
التيمبلت (?template=1) فيه عمودي «الأسم بالعربي» و«الوظيفة بالعربي» (12 عمود).
```
