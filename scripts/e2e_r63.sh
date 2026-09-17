#!/bin/bash
# ============================================================
# R63 E2E — الصلاحيات المتضاربة + تعديل الاسم + خريطة الكود
# الجولة بتصلح 6 باجات صلاحيات حقيقية + بتضيف ميزة تعديل الاسم
# + نظام ملاحة الكود. الفحوصات:
#   1) صفر تغيير سلوك: نفس 13 JSON + 5 XLSX بالبايت
#   2) حارس الإدخال: مسؤول إدخال (upload=edit + view=hidden)
#      بيقرأ entries+po+employees — واللوحة/الاتزان لسه مقفولين
#   3) تعديل اسم المستخدم: rename → دخول بالجديد + قديم مرفوض
#      + تكرار 409 + باطل 400 + أوديت + الصلاحيات بتفضل
#   4) الواجهة: شارة الفعلي في لوحة الصلاحيات + زرار تعديل الاسم
#   5) الخريطة: CODE-MAP طازة (متولدة من الكود الحالي)
# ============================================================
set -x
source "$(dirname "$0")/e2e_lib.sh"
cd "$E2E_ROOT"
mkdir -p "$E2E_SCRATCH"

# ---------- البنية الثابتة ----------
e2e_typecheck
e2e_build
e2e_seed_db auto   # r56 لو موجود وإلا bootstrap من الصفر (R61)
e2e_start_server
e2e_login_admin
# R61: على قاعدة bootstrap (sandbox جديد من غير seed التاريخي) audit
# (أرشيف جولات سابقة) + storage (أحجام فيزيائية) مستثنيين موثقين —
# على قاعدة r56 المقارنة كاملة.
if [ -d "$E2E_SEED_R56/pglite" ]; then
  e2e_compare_core
else
  echo "⚠️ BOOTSTRAP MODE: audit + storage خارج المقارنة (مستحيلين على قاعدة من الصفر — موثق R61)"
  e2e_compare_core audit storage
fi
e2e_frontend_contract
e2e_functional_core

# ---------- فحوصات R63: حارس قراءة الإدخال ----------
# يوزر تجريبي: data.view=hidden + data.upload=edit — السيناريو اللي
# كان بيبوظ (مسؤول إدخال مخبّية عنه اللوحة) — قبل R63 كان كل الإدخال
# بيرجع 403 في وشه.
curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2EentryUser","password":"e2e-entry-1234","admin":false}' > /dev/null
E2E_EU=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/users" | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='E2EentryUser'][0])")
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"data.view\",\"level\":\"hidden\"}" > /dev/null
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"data.upload\",\"level\":\"edit\"}" > /dev/null
# الاتزان كمان متخفي عنه — السيناريو الكامل لمسؤول إدخال محدود
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"manpower.view\",\"level\":\"hidden\"}" > /dev/null
curl -s -c "$E2E_JAR2" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2EentryUser","password":"e2e-entry-1234","remember":true}' > /dev/null

for EP in "entries/production?month=$E2E_MONTH" "entries/absence?month=$E2E_MONTH" "entries/overtime?month=$E2E_MONTH" "entries/employees" "po"; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/$EP")
  [ "$C" = "200" ]; check "حارس الإدخال: /api/$EP = 200 لمسؤول الإدخال (view=hidden + upload=edit)" $?
done
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/po?template=1")
[ "$C" = "200" ]; check "حارس الإدخال: تيمبلت الـ PO بينزل (200)" $?

# والخصوصية محفوظة: اللوحة والاتزان لسه مقفولين ليه
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/data")
[ "$C" = "403" ]; check "الخصوصية: /api/data لسه مقفول (data.view=hidden)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/manpower")
[ "$C" = "403" ]; check "الخصوصية: /api/manpower مقفول (manpower.view=hidden) والكومبوبوكس شغال من مساره الخاص" $?
# والكتابة شغالة (upload=edit)
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/entries/production" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","qty":10}')
[ "$C" = "200" ]; check "حارس الإدخال: الكتابة شغالة (POST production = 200)" $?
E2E_EU_PROD=$(curl -s -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH" | python3 -c "import json,sys;print([r['id'] for r in json.load(sys.stdin).get('entries',[]) if r.get('note','')==''][0])" 2>/dev/null || true)
[ -n "$E2E_EU_PROD" ] && curl -s -o /dev/null -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/entries/production?id=$E2E_EU_PROD" > /dev/null

# سحب الصلاحية → القراءة بتقفل تاني (والإبطال فوري من نفس السيرفر)
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"data.upload\",\"level\":\"hidden\"}" > /dev/null
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH")
[ "$C" = "403" ]; check "سحب upload + view مخفية → القراءة بتقفل (403) فورًا" $?
# نظافة: مسح الـ overrides قبل حذف اليوزر
for F in data.view data.upload manpower.view; do
  curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/perms?userId=$E2E_EU&feature=$F"
done
curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/users?id=$E2E_EU"

# ---------- فحوصات R63: تعديل اسم المستخدم ----------
curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2ErenA","password":"e2e-ren-1234","admin":false}' > /dev/null
E2E_RU=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/users" | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='E2ErenA'][0])")
# صلاحية قبل ال_rename — لازم تفضل بعد الاسم الجديد (uid مش username)
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_RU\",\"feature\":\"manpower.view\",\"level\":\"hidden\"}" > /dev/null

C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X PUT "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' -d "{\"id\":\"$E2E_RU\",\"username\":\"E2ErenB\"}")
[ "$C" = "200" ]; check "rename: التعديل = 200" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' -d '{"username":"E2ErenB","password":"e2e-ren-1234","remember":true}')
[ "$C" = "200" ]; check "rename: الدخول بالاسم الجديد = 200" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' -d '{"username":"E2ErenA","password":"e2e-ren-1234","remember":true}')
[ "$C" = "401" ]; check "rename: الاسم القديم مرفوض (401)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X PUT "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' -d "{\"id\":\"$E2E_RU\",\"username\":\"Amin\"}")
[ "$C" = "409" ]; check "rename: اسم مستخدم بالفعل = 409" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X PUT "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' -d "{\"id\":\"$E2E_RU\",\"username\":\"x\"}")
[ "$C" = "400" ]; check "rename: اسم باطل (حرف واحد) = 400" $?
# الصلاحية فضلت مع اليوزر بعد الrename (بالـ uid)
curl -s -c "$E2E_JAR2" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' -d '{"username":"E2ErenB","password":"e2e-ren-1234","remember":true}' > /dev/null
P=$(curl -s -b "$E2E_JAR2" "$E2E_URL/api/perms?me=1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('perms',{}).get('manpower.view','MISSING'))")
[ "$P" = "hidden" ]; check "rename: الصلاحية فضلت مع اليوزر (manpower.view=hidden بعد الاسم الجديد)" $?
# الأوديت سجّل العملية
curl -s -b "$E2E_JAR" "$E2E_URL/api/audit" | grep -q "E2ErenB"
check "rename: العملية متسجلة في الأوديت" $?
# نظافة
curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/perms?userId=$E2E_RU&feature=manpower.view"
curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/users?id=$E2E_RU"

# ---------- UI smoke (فيه فحوصات R63 إضافية) ----------
e2e_ui_smoke r63

# شارة المستوى الفعلي في لوحة الصلاحيات
agent-browser eval "AppAdmin.loadPerms(); 'load'" 2>/dev/null
sleep 2
local_pm=$(agent-browser eval "var c=document.querySelector('.pm-cell .pm-eff'); c ? c.textContent : 'NONE'" 2>/dev/null | tail -1)
echo "PM_EFF_CHIP: $local_pm"
[ -n "$local_pm" ] && [ "$local_pm" != "NONE" ]
check "UI: شارة المستوى الفعلي بتظهر في لوحة الصلاحيات (pm-eff)" $?

# زرار تعديل الاسم في مودال المستخدمين
agent-browser eval "MaribAuth.openUsers(); 'open'" 2>/dev/null
sleep 2
local_ren=$(agent-browser eval "document.querySelector('.us-ic.ren') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$local_ren" = "YES" ]; check "UI: زرار تعديل اسم المستخدم موجود في مودال المستخدمين" $?
agent-browser eval "document.getElementById('usClose') ? document.getElementById('usClose').click() : 0; 'close'" 2>/dev/null

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?
grep -q "entries/employees" "$E2E_ROOT/docs/CODE-MAP.md"
check "CODE-MAP: المسار الجديد /entries/employees موجود في الخريطة" $?
grep -q "requireEntryRead\|entry-read" "$E2E_ROOT/docs/CODE-MAP.md"
check "CODE-MAP: حارس الإدخال ظاهر في جدول المسارات" $?

e2e_stop_server
e2e_summary
