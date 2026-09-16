# 03 — API ROUTES

> كل المسارات تحت `/api/`. نظاما المصادقة متوازيان (انظر ARCHITECTURE.md).

## المسارات الجديدة (marib)

| Route | Method | Auth | Function |
|-------|--------|------|----------|
| `/api/auth` | GET | any | session check → `{user}` |
| `/api/auth` | POST | none | login → sets cookie |
| `/api/auth` | DELETE | any | logout |
| `/api/manpower` | GET | any | الهيكل الكامل (depts+emps+req+transfers+tr+root) |
| `/api/manpower` | POST | admin+ | add/edit/fill/vacAdd/vacDel/deptAdd/deptRename/deptMove/deptDelete/req/import/undo/trSync |
| `/api/manpower/export` | GET | any | تنزيل Excel (?template=1 ?lang=ar\|en\|tr) |
| `/api/users` | GET | admin | قائمة المستخدمين |
| `/api/users` | POST | admin | إنشاء مستخدم |
| `/api/users` | PUT | admin | تعديل (photo/title/password/role) |
| `/api/users` | DELETE | admin | حذف |
| `/api/users/[id]` | GET/PUT/DELETE | admin | مستخدم واحد |
| `/api/users/[id]/password` | PUT | admin | تغيير كلمة السر |
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

## المسارات القديمة (Prisma)

| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/auth/login` | POST | none | login (Prisma User table) |
| `/api/auth/logout` | DELETE | any | logout |
| `/api/auth/me` | GET | any | session check (Prisma) |
| `/api/health` | GET | none | `{months, users}` (Prisma) |
| `/api/data` | GET/POST | user | رفع/تنزيل بيانات الشهور |
| `/api/storage` | GET | dev | مساحة التخزين |
| `/api/months` | GET | user | قائمة الشهور |
| `/api/months/[key]` | GET/PUT/DELETE | user | شهر واحد |

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
