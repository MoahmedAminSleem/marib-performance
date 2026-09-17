#!/bin/bash
# ============================================================
# R64 E2E — قسم صلاحيات صفحة الإدخال + الصفحة الرئيسية الجديدة
# 1) القسم الجديد: entry.view / entry.edit / entry.po —
#    الحرسان على كل مسار (قراءة/كتابة/عقود) + لوحة الصلاحيات
# 2) التوافق الرجعي: المايجريشن (BOOT_VER 59) بياخد أي data.upload=edit
#    قديم ويمنحه نفس الوصول تحت المفاتيح الجديدة — على قاعدة
#    "قبل الترقية" حقيقية (بذر PGlite مباشر + بوت كامل)
# 3) الرئيسية: بعد تسجيل الدخول → البوابة المرقاة (خلفية الدنيم
#    المصورة + بارالاكس) + ترحيب باسم اليوزر + كارت الإدخال بالصلاحية
# 4) الواجهة: عرض فقط (entry.view) = جداول بلا زراير كتابة + شارة
# ============================================================
set -x
source "$(dirname "$0")/e2e_lib.sh"
cd "$E2E_ROOT"
mkdir -p "$E2E_SCRATCH"

# ---------- البنية الثابتة ----------
e2e_typecheck
e2e_build
e2e_seed_db auto   # r56 لو موجود وإلا bootstrap (R61)
e2e_start_server
e2e_login_admin
# R61: على قاعدة bootstrap مستثنيين موثقين (audit + storage) —
# R64: perms كمان استثناء واحد موثق لمرة دي بس (الرد اكتسب 3 مفاتيح
# جديدة للقسم الجديد — الـ baseline اتجدد بهذه الجولة):
#   base_perms.json = المرجع الجديد (14 مفتاح بدل 11)
if [ -d "$E2E_SEED_R56/pglite" ]; then
  e2e_compare_core
else
  echo "⚠️ BOOTSTRAP MODE: audit + storage خارج المقارنة (موثق R61)"
  e2e_compare_core audit storage
fi
e2e_frontend_contract
e2e_functional_core

# ---------- فحوصات R64-1: القسم الجديد في لوحة الصلاحيات ----------
FEATS=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/perms" | python3 -c "
import json,sys
d=json.load(sys.stdin)
keys=[f['key'] for f in d.get('features',[])]
print(('entry.view' in keys) and ('entry.edit' in keys) and ('entry.po' in keys) and len(keys)==14)")
[ "$FEATS" = "True" ]; check "perms API: القسم الجديد كامل (entry.view+edit+po = 14 مفتاح)" $?
GRP=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/perms" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(all(f.get('group')=='entry' for f in d.get('features',[]) if f['key'].startswith('entry.')))")
[ "$GRP" = "True" ]; check "perms API: المفاتيح الثلاثة في مجموعة entry" $?

# ---------- فحوصات R64-2: دلالات الحرسان الجديدة ----------
# يوزر نظيف (صفر overrides) — قبل R64: GET كان بيرجع 200 عبر data.view
# (رؤية اللوحة). R64: صفحة الإدخال مقفولة افتراضيًا زي ما كانت مغلقة
# عمليًا (الزرار والكتابة كانوا محتاجين data.upload edit) — الفرق
# الوحيد: القراءة المباشرة للـ API بقيت محتاجة مفتاح القسم.
curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2Eentry64","password":"e2e-r64-1234","admin":false}' > /dev/null
E2E_EU=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/users" | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='E2Eentry64'][0])")
curl -s -c "$E2E_JAR2" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2Eentry64","password":"e2e-r64-1234","remember":true}' > /dev/null
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH")
[ "$C" = "403" ]; check "يوزر نظيف: قراءة الإدخال مقفولة (403) — القسم ليه مفاتيحه" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/entries/production" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","qty":10}')
[ "$C" = "403" ]; check "يوزر نظيف: كتابة الإدخال مقفولة (403)" $?

# entry.view=view → قراءة 200 + كتابة 403 + عقود 403
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"entry.view\",\"level\":\"view\"}" > /dev/null
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH")
[ "$C" = "200" ]; check "entry.view=view: القراءة 200" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/entries/production" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","qty":10}')
[ "$C" = "403" ]; check "entry.view=view: الكتابة 403 (عرض فقط)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/po" \
  -H 'Content-Type: application/json' -d '{"po":"E2E-R64","contract_qty":100}')
[ "$C" = "403" ]; check "entry.view=view: إدارة العقود 403" $?

# entry.edit=edit → الكتابة شغالة (إنتاج/غياب/أوفر + حذف) والعقود لسه 403
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"entry.edit\",\"level\":\"edit\"}" > /dev/null
for TGT in "entries/production|{\"date\":\"2026-09-12\",\"dept\":\"الصدر\",\"line\":\"1\",\"qty\":10}" \
           "entries/absence|{\"date\":\"2026-09-12\",\"emp_code\":\"17001\",\"reason\":\"r64\"}" \
           "entries/overtime|{\"date\":\"2026-09-12\",\"emp_code\":\"17001\",\"hours\":2}"; do
  EP="${TGT%%|*}"; BODY="${TGT##*|}"
  C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/$EP" \
    -H 'Content-Type: application/json' -d "$BODY")
  [ "$C" = "200" ]; check "entry.edit=edit: POST /api/$EP = 200" $?
done
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/po" \
  -H 'Content-Type: application/json' -d '{"po":"E2E-R64","contract_qty":100}')
[ "$C" = "403" ]; check "entry.edit بدون entry.po: العقود لسه 403 (فصل حقيقي)" $?
# حذف السجلات اللي عملها
IDS=$(curl -s -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH" | python3 -c "
import json,sys
print(' '.join(r['id'] for r in json.load(sys.stdin).get('entries',[]) if r.get('date')=='2026-09-12'))")
for id in $IDS; do
  curl -s -o /dev/null -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/entries/production?id=$id"
done
AID=$(curl -s -b "$E2E_JAR2" "$E2E_URL/api/entries/absence?month=$E2E_MONTH" | python3 -c "
import json,sys
print(' '.join(r['id'] for r in json.load(sys.stdin).get('entries',[]) if r.get('reason')=='r64'))")
for id in $AID; do
  curl -s -o /dev/null -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/entries/absence?id=$id"
done
OID=$(curl -s -b "$E2E_JAR2" "$E2E_URL/api/entries/overtime?month=$E2E_MONTH" | python3 -c "
import json,sys
print(' '.join(r['id'] for r in json.load(sys.stdin).get('entries',[]) if r.get('note','')==''))")
for id in $OID; do
  curl -s -o /dev/null -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/entries/overtime?id=$id"
done

# entry.po=edit → إدارة العقود شغالة (كتابة/حذف/رفع تيمبلت)
curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/perms" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$E2E_EU\",\"feature\":\"entry.po\",\"level\":\"edit\"}" > /dev/null
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/po" \
  -H 'Content-Type: application/json' -d '{"po":"E2E-R64","contract_qty":100}')
[ "$C" = "200" ]; check "entry.po=edit: POST /api/po = 200" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/po?po=E2E-R64")
[ "$C" = "200" ]; check "entry.po=edit: DELETE /api/po = 200" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/po?action=import" \
  -H 'Content-Type: application/json' -d '{"rows":[[1,"E2E-IMP",55,""]]}')
[ "$C" = "200" ]; check "entry.po=edit: رفع تيمبلت العقود = 200" $?
curl -s -o /dev/null -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/po?po=E2E-IMP"

# نظافة: مسح الـ overrides قبل حذف اليوزر
for F in entry.view entry.edit entry.po; do
  curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/perms?userId=$E2E_EU&feature=$F"
done
curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/users?id=$E2E_EU"

# ---------- فحوصات R64-3: المايجريشن على قاعدة "قبل الترقية" ----------
# بذر مباشر بـ PGlite (boot_ver=58 + يوزر عنده data.upload=edit) →
# بوت كامل بالكود الجديد → المفروض ياخد نفس الوصول تحت entry.*
e2e_stop_server
LEGACY_DIR="$E2E_SCRATCH/r64_legacy_db"
rm -rf "$LEGACY_DIR"
# درس التشغيلة الأولى: PGlite بيخزن في مجلد فرعي pglite/ جوه db/ —
# البذر لازم يترص فيه (زي e2e_seed_db بالظبط) مش في db/ مباشرة
(cd "$E2E_ROOT" && node scripts/e2e_r64_seed_legacy.mjs "$LEGACY_DIR/pglite" > /dev/null)
[ -d "$LEGACY_DIR/pglite" ]; check "مايجريشن: قاعدة قبل الترقية اتزرعت (boot_ver=58)" $?
rm -rf "$E2E_ROOT/.next/standalone/db"
mkdir -p "$E2E_ROOT/.next/standalone/db/pglite"
cp -r "$LEGACY_DIR/pglite/." "$E2E_ROOT/.next/standalone/db/pglite/"
e2e_start_server
BV=$(curl -s "$E2E_URL/api/health" | python3 -c "import json,sys;print(json.load(sys.stdin)['boot']['ver'])")
[ "$BV" = "59" ]; check "مايجريشن: البوت الكامل اشتغل بالنسخة 59" $?
curl -s -c "$E2E_JAR" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > /dev/null
MIG=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/perms" | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=[x for x in d.get('users',[]) if x['username']=='E2Elegacy']
p=u[0]['perms'] if u else {}
print(p.get('entry.view')=='view' and p.get('entry.edit')=='edit' and p.get('entry.po')=='edit' and p.get('data.upload')=='edit')")
[ "$MIG" = "True" ]; check "مايجريشن: data.upload=edit ← entry.view+edit+po (والقديم فضل)" $?
curl -s -c "$E2E_JAR2" -X POST "$E2E_URL/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2Elegacy","password":"e2e-legacy-1234","remember":true}' > /dev/null
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH")
[ "$C" = "200" ]; check "مايجريشن: اليوزر المترحّل بيقرأ الإدخال (200)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X POST "$E2E_URL/api/entries/production" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-13","dept":"الضهر","line":"2","qty":8}')
[ "$C" = "200" ]; check "مايجريشن: والكتابة شغالة (200) — محدش خسر وصول" $?
MID=$(curl -s -b "$E2E_JAR2" "$E2E_URL/api/entries/production?month=$E2E_MONTH" | python3 -c "
import json,sys
print(' '.join(r['id'] for r in json.load(sys.stdin).get('entries',[]) if r.get('date')=='2026-09-13'))")
for id in $MID; do
  curl -s -o /dev/null -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/entries/production?id=$id"
done

# ---------- رجوع للقاعدة الأساسية + فحوصات R64-4: الواجهة ----------
e2e_stop_server
e2e_seed_db auto
e2e_start_server
e2e_login_admin
e2e_ui_smoke r64

# الرئيسية بعد تسجيل الدخول: البوابة ظاهرة + الخلفية + الترحيب
agent-browser eval "MaribAuth.logout(); 'out'" 2>/dev/null
sleep 1
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5
GATE=$(agent-browser eval "var g=document.getElementById('modeGate'); g && !g.hidden ? 'HOME' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$GATE" = "HOME" ]; check "الرئيسية: تسجيل دخول جديد → الصفحة الرئيسية (البوابة) على طول" $?
HELLO=$(agent-browser eval "var h=document.getElementById('mgHello'); h && !h.hidden ? h.textContent : 'NO'" 2>/dev/null | tail -1)
echo "MG_HELLO: $HELLO"
[ -n "$HELLO" ] && [ "$HELLO" != "NO" ] && echo "$HELLO" | grep -q "Amin"
check "الرئيسية: الترحيب باسم اليوزر ظاهر" $?
BG=$(agent-browser eval "var i=document.querySelector('.mgb-img'); i && i.complete && i.naturalWidth>0 ? 'OK' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$BG" = "OK" ]; check "الرئيسية: خلفية الدنيم ات حملت وبتظهر" $?
CARDS=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.mg-card')).filter(function(c){return c.style.display!=='none'}).length" 2>/dev/null | tail -1 | tr -d '"')
[ "$CARDS" = "3" ]; check "الرئيسية: الكروت الثلاثة ظاهرة (لوحة/اتزان/إدخال)" $?

# لوحة الصلاحيات: القسم الجديد ظاهر بالمفاتيح الثلاثة
# (يوزر غير-dev لازم موجود الأول — المطورين مش بيظهروا في الماتريكس
#  فاللوحة بتعرض حالة «فاضية» وده سلوك صح مش باج)
curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"username":"E2EuiPerm","password":"e2e-ui-1234","admin":false}' > /dev/null
agent-browser eval "var nb=Array.prototype.slice.call(document.querySelectorAll('.nav-btn')).filter(function(b){return b.getAttribute('data-page')==='pm'})[0]; nb ? (nb.click(),'pm') : 'NO'" 2>/dev/null
sleep 3
agent-browser eval "AppAdmin.loadPerms(); 'load'" 2>/dev/null
sleep 2
PGRP=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.pm-group')).map(function(g){return g.textContent}).join('|')" 2>/dev/null | tail -1)
echo "PM_GROUPS: $PGRP"
echo "$PGRP" | grep -q "صفحة إدخال البيانات"
check "الواجهة: قسم «صفحة إدخال البيانات» ظاهر في لوحة الصلاحيات" $?
PFEAT=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.pm-feat b')).map(function(b){return b.textContent}).join('|')" 2>/dev/null | tail -1)
echo "$PFEAT" | grep -q "رؤية صفحة الإدخال" && echo "$PFEAT" | grep -q "تعديل صفحة الإدخال" && echo "$PFEAT" | grep -q "إدارة عقود الشراء"
check "الواجهة: المفاتيح الثلاثة (رؤية/تعديل/عقود) في القسم" $?
# نظافة اليوزر البصري
E2E_UIUID=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/users" | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='E2EuiPerm'][0])")
curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/users?id=$E2E_UIUID"

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?
grep -q "home-denim" "$E2E_ROOT/docs/CODE-MAP.md"
check "CODE-MAP: خلفية الرئيسية الجديدة موجودة في الأصول" $?

e2e_stop_server
e2e_summary
