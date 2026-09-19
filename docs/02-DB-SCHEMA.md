# 02 — DB SCHEMA

> كل الجداول في `marib_*` (النظام الجديد، PGlite/Postgres). Prisma tables (`User`, `Session`, `MonthData`, `AppSetting`) منفصلة (SQLite).

## جداول النظام الجديد

### marib_user
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| username | TEXT UNIQUE | |
| pass_hash | TEXT | scrypt |
| role | TEXT | dev \| admin \| user |
| photo | TEXT | data URL (nullable) |
| title | TEXT | لقب (nullable) |
| created_at | TIMESTAMPTZ | |
| created_by | TEXT | |

### marib_emp (الموظفون)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| code | TEXT UNIQUE | nullable (vacancy) — partial index excludes NULL + 'جديد' |
| name | TEXT | nullable |
| job | TEXT | |
| dept_id | TEXT FK→marib_dept | |
| hire | TEXT | YYYY-MM-DD |
| vac | BOOLEAN | true = شاغر |
| note | TEXT | |
| mach | TEXT | الماكينة (D.N / H.L / S.N…) |
| ord | INT | ترتيب العرض |
| name_ar | TEXT | R46: الاسم بالعربي (nullable) |
| job_ar | TEXT | R46: الوظيفة بالعربي (nullable) |

### marib_dept (الأقسام - شجرة)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| name | TEXT | |
| parent_id | TEXT | nullable (root) |
| ord | INT | |

### marib_req (المطلوب اليدوي)
| Column | Type | Notes |
|--------|------|-------|
| node_key | TEXT PK | dept key |
| required | INT | override |
| updated_by | TEXT | |

### marib_transfer (أرشيف النقل)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| at | TIMESTAMPTZ | |
| actor | TEXT | |
| code | TEXT | |
| name | TEXT | |
| from_dept | TEXT | |
| from_job | TEXT | |
| to_dept | TEXT | |
| to_job | TEXT | |
| kind | TEXT | move \| dept \| dept-rename \| fill \| import-out |
| note | TEXT | |

### marib_meta (مفاتيح/قيم)
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | |
| value | TEXT | |

**مفاتيح معروفة:** `mp_seed_ver` (زرع الاتزان), `mp_root` (اسم الجذر مأرب 3)

### marib_i18n (ترجمات تلقائية)
| Column | Type | Notes |
|--------|------|-------|
| term | TEXT | |
| lang | TEXT | ar \| en \| tr |
| tr | TEXT | الترجمة |
| at | TIMESTAMPTZ | |
| PK | (term, lang) | |

### marib_audit (سجل العمليات)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| at | TIMESTAMPTZ | |
| actor | TEXT | |
| action | TEXT | create \| edit \| delete \| upload \| login \| logout \| restore |
| entity | TEXT | |
| label | TEXT | |
| details | JSONB | |

### marib_setting (إعدادات الموقع)
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | targets \| groups \| storage_quota \| mhome \| theme |
| value | JSONB | |
| updated_at | TIMESTAMPTZ | |
| updated_by | TEXT | |

### marib_perm (R46: الصلاحيات)
| Column | Type | Notes |
|--------|------|-------|
| user_id | TEXT | FK→marib_user |
| feature | TEXT | manpower.view \| … (14 ميزة — R64 ضافت entry.view/edit/po) |
| level | TEXT | inherit \| hidden \| view \| edit |
| updated_at | TIMESTAMPTZ | |
| updated_by | TEXT | |
| PK | (user_id, feature) | |

> **R64 (BOOT_VER 59):** ترحيل واحد لمرة واحدة — أي override قديم
> `data.upload=edit` (كان الطريقة الوحيدة لفتح صفحة الإدخال قبل القسم
> الخاص) بياخد نفس الوصول تحت المفاتيح الجديدة:
> `entry.view=view` + `entry.edit=edit` + `entry.po=edit`.
> Idempotent (ON CONFLICT DO NOTHING) وبيحترم أي اختيار صريح موجود.

### marib_undo (R46: تراجع الاستيراد)
| Column | Type | Notes |
|--------|------|-------|
| token | TEXT PK | UUID |
| actor | TEXT | |
| payload | JSONB | snapshot of emp+dept+req+transfer+meta |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | +15 min |

### marib_prod (R46: إنتاج بالـ PO)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| month_key | TEXT | YYYY-MM |
| date | DATE | |
| dept_id | TEXT | |
| line_id | TEXT | |
| po_number | TEXT | |
| qty | INT | |
| note | TEXT | |
| actor | TEXT | |
| created_at | TIMESTAMPTZ | |

### marib_absence (R46: الغياب)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| month_key | TEXT | |
| date | DATE | |
| emp_id | TEXT | nullable (لو مش متطابق) |
| emp_code | TEXT | |
| emp_name | TEXT | |
| dept_id | TEXT | |
| reason | TEXT | |
| note | TEXT | |
| actor | TEXT | |
| created_at | TIMESTAMPTZ | |

### marib_overtime (R46: الأوفر تايم · R68: الأشخاص الإضافيين)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| month_key | TEXT | |
| date | DATE | |
| emp_id | TEXT | nullable — فاضي لصف الإضافيين |
| emp_code | TEXT | فاضي لصف الإضافيين |
| emp_name | TEXT | فاضي لصف الإضافيين |
| dept_id | TEXT | |
| line_id | TEXT | |
| hours | NUMERIC(4,2) | ساعات الشخص الواحد — إجمالي صف الإضافيين = N × hours |
| extra_count | INT (R68) | 0 للصف المسمّى · N لصف الأشخاص الإضافيين (مش مسجلين بالاتزان) |
| note | TEXT | |
| actor | TEXT | |
| created_at | TIMESTAMPTZ | |

## Prisma (النظام القديم — SQLite)

```prisma
model User { id, username, role, canUpload, active, pwHash, failedCount, lockedUntil, createdAt, updatedAt }
model Session { id, userId, expiresAt, createdAt }
model MonthData { id, monthKey, label, packJson, fileNames, uploadedById, uploadedAt, updatedAt }
model AppSetting { key, value, updatedAt }
```
