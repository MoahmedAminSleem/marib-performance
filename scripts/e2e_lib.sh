#!/bin/bash
# ============================================================
# e2e_lib.sh — مكتبة الـ E2E المشتركة (R61)
# ============================================================
# قبل R61: كل جولة كانت بتاخد سكريبت الجولة اللي فاتت (270+ سطر)
# وتعدّل عليه — 6 نسخ شبه متطابقة (r54..r60) وكل تعديل بيتكرر 6 مرات.
# دلوقتي: كل الفحوصات الثابتة هنا كدوال، وسكريبت الجولة بقى رفيع —
# بناء + قاعدة + مقارنة + فحوصات الجولة الخاصة بس.
#
# الاستخدام (سكريبت الجولة):
#   source "$(dirname "$0")/e2e_lib.sh"
#   cd "$E2E_ROOT"
#   e2e_typecheck        # بوابة الأنواع الدايمة (R60)
#   e2e_build
#   e2e_seed_db          # db_seeded (R56) أو bootstrap من الصفر
#   e2e_start_server
#   e2e_login_admin
#   e2e_compare_core     # 12 JSON + 5 XLSX بالبايت vs baselines المرفوعة
#   e2e_frontend_contract# 12 سكريبت defer + kit أولهم + v
#   e2e_functional_core  # deleteEntry + صلاحية 403
#   e2e_ui_smoke rXX     # دخول + إدخال + اتحزان + صفر أخطاء JS
#   e2e_stop_server
#   e2e_summary
#
# الـ baselines (scripts/e2e_common/baselines/) مرفوعة على git — أي
# sandbox جديد عنده نفس شبكة الأمان من غير تاريخ محلي. القاعدة نفسها
# (db_seeded) 40M فمبتترفعش — بتتعمل bootstrap من ensureBoot لو ناقصة.
#
# الشهر ثابت E2E_MONTH=2026-09 عمدًا: رد الغياب/الأوفر/الإنتاج بيردّ
# اسم الشهر جوه الـ JSON، فلو اعتمدنا على تاريخ اليوم المقارنة كانت
# هتكسر مع أول شهر جديد. البيانات المزروعة months=0 فأي شهر فاضي.
# ============================================================

E2E_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_PORT=3113
E2E_MONTH="2026-09"                 # ثابت — انظر الشرح فوق
E2E_V="r69"                         # نسخة الكاش الحالية للواجهة (تتغير مع أي تعديل واجهة)
E2E_COMMON="$E2E_ROOT/scripts/e2e_common"
E2E_BASE="$E2E_COMMON/baselines"    # مرفوعة على git
E2E_SCRATCH="$E2E_COMMON/scratch"   # gitignored — مخرجات التشغيلة الجارية
E2E_SEED_R56="$E2E_ROOT/scripts/e2e_r56/db_seeded"
E2E_SEED_BOOT="$E2E_COMMON/db_seeded"   # bootstrap fallback (gitignored)
E2E_JAR="/tmp/e2e_jar.txt"
E2E_JAR2="/tmp/e2e_jar2.txt"
E2E_SERVER_LOG="/tmp/e2e_server.log"
E2E_URL="http://localhost:$E2E_PORT"

# أسماء الردود الـ 13 + الإكسل الـ 5 (بترتيب الالتقاط من R56+؛
# auth بيتقنص وقت الدخول ومتطبّع uid→<ID> — عشان يقعد حتمي مع أي قاعدة)
E2E_JSONS="auth data manpower absence ot prod perms settings storage po health audit users"
E2E_XLSXS="xlsx_ar xlsx_tr xlsx_tpl xlsx_abs xlsx_po"

PASS=0; FAIL=0
check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1"; fi
}

e2e_summary() {
  echo ""
  echo "=========== النتيجة: PASS=$PASS FAIL=$FAIL ==========="
  [ $FAIL -eq 0 ] && echo "E2E: كل الفحوصات نجحت" || { echo "E2E: فيه فشل — راجع فوق"; exit 1; }
}

# ---------- 0) بوابة الأنواع (دايمة من R60) ----------
e2e_typecheck() {
  (cd "$E2E_ROOT" && bunx tsc --noEmit > /tmp/e2e_tsc.log 2>&1)
  check "tsc --noEmit بصفر أخطاء (noUncheckedIndexedAccess شغال)" $?
  for FLAG in noUncheckedIndexedAccess noFallthroughCasesInSwitch noImplicitOverride; do
    grep -q "\"$FLAG\": true" "$E2E_ROOT/tsconfig.json"
    check "tsconfig: $FLAG مفعّل" $?
  done
}

# ---------- 1) البناء ----------
e2e_build() {
  (cd "$E2E_ROOT" && bun run build 2>&1 | tail -3)
  [ -f "$E2E_ROOT/.next/standalone/server.js" ] || { echo "BUILD FAILED"; exit 1; }
}

# ---------- السيرفر (درس R57: pkill بالاسم الفعلي + انتظار فضي البورت) ----------
e2e_stop_server() {
  pkill -f "bun server.js" 2>/dev/null
  for i in $(seq 1 10); do
    curl -s -m 1 -o /dev/null "$E2E_URL/" 2>/dev/null || break
    sleep 1
  done
}

e2e_start_server() {
  e2e_stop_server
  (cd "$E2E_ROOT/.next/standalone" && NODE_ENV=production PORT=$E2E_PORT bun server.js > "$E2E_SERVER_LOG" 2>&1 &)
  for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null "$E2E_URL/" && break; done
}

# ---------- القاعدة ----------
# e2e_seed_db [auto|r56|boot|مسار] — auto: r56 لو موجود وإلا bootstrap
e2e_seed_db() {
  local src="${1:-auto}"
  if [ "$src" = "auto" ]; then
    if [ -d "$E2E_SEED_R56/pglite" ]; then src="r56"; else src="boot"; fi
  fi
  if [ "$src" = "r56" ]; then src="$E2E_SEED_R56"; fi
  if [ "$src" = "boot" ]; then
    if [ ! -d "$E2E_SEED_BOOT/pglite" ]; then e2e_bootstrap_seed; fi
    src="$E2E_SEED_BOOT"
  fi
  [ -d "$src/pglite" ] || { echo "SEED NOT FOUND: $src"; exit 1; }
  rm -rf "$E2E_ROOT/.next/standalone/db"
  mkdir -p "$E2E_ROOT/.next/standalone/db"
  cp -r "$src/." "$E2E_ROOT/.next/standalone/db/"
}

# قاعدة مزروعة من الصفر على مدار بوت كامل واحد (ensureBoot: DDL +
# بذر Amin + 810 موظف) — بتتعمل مرة واحدة وتفضل في e2e_common/db_seeded
e2e_bootstrap_seed() {
  echo "⚠️  BOOTSTRAP: بعمل قاعدة مزروعة من الصفر (مفيش db_seeded محلي)…"
  rm -rf "$E2E_ROOT/.next/standalone/db"
  e2e_start_server
  # أول نداء API بيشغّل البوت الكامل — نستنى ما يخلص (بوت كامل = ثواني)
  for i in $(seq 1 60); do
    curl -s "$E2E_URL/api/health" 2>/dev/null | grep -q '"ok":true' && break
    sleep 1
  done
  e2e_stop_server
  mkdir -p "$E2E_COMMON"
  rm -rf "$E2E_SEED_BOOT"
  cp -r "$E2E_ROOT/.next/standalone/db" "$E2E_SEED_BOOT"
  [ -d "$E2E_SEED_BOOT/pglite" ]
  check "bootstrap: قاعدة db_seeded اتعملت من الصفر (ensureBoot)" $?
}

# ---------- الدخول ----------
e2e_login_admin() {
  mkdir -p "$E2E_SCRATCH/after"
  curl -s -c "$E2E_JAR" -X POST "$E2E_URL/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"username":"Amin","password":"2872002","remember":true}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
u=d.get('user') or {}
u['uid']='<ID>'
json.dump(d,open('$E2E_SCRATCH/after/auth.json','w'),sort_keys=True,ensure_ascii=False)"
  grep -Eq '"role": ?"dev"' "$E2E_SCRATCH/after/auth.json"
  check "دخول Amin (dev)" $?
}

# ---------- الالتقاط: نفس الردود بالترتيب + التطبيع الموروث ----------
# health: بنشيل boot (متغير بالطبيعة fast/full) و stats (R62: عدادات
# حية بطبيعتها — زي boot بالظبط). audit: at→<TS> و id→<ID> في كل
# المستويات. users: created→<TS>. الباقي بايت-مع-بايت زي ما هو.
e2e_capture_after() {
  mkdir -p "$E2E_SCRATCH/after"
  local A="$E2E_SCRATCH/after"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/data" > "$A/data.json"
  # manpower: هوية كل موظف (id في أول عنصر) uuid بيتولد وقت البذر —
  # بتتطبّع لـ <ID> عشان القاعدة المزروعة من الصفر تتقارن صح.
  curl -s -b "$E2E_JAR" "$E2E_URL/api/manpower" | python3 -c "
import json,sys
d=json.load(sys.stdin)
d['emps']=[['<ID>']+list(r[1:]) for r in d.get('emps',[])]
d['transfers']=[['<TS>']+list(r[1:-1])+['<ID>'] for r in d.get('transfers',[])]
json.dump(d,open('$A/manpower.json','w'),sort_keys=True,ensure_ascii=False)"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/absence?month=$E2E_MONTH" > "$A/absence.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$E2E_MONTH" > "$A/ot.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/production?month=$E2E_MONTH" > "$A/prod.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/perms?me=1" > "$A/perms.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/settings" > "$A/settings.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/storage" > "$A/storage.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/po" > "$A/po.json"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/health" | python3 -c "
import json,sys
d=json.load(sys.stdin); d.pop('boot',None); d.pop('stats',None)
json.dump(d,open('$A/health.json','w'),sort_keys=True,ensure_ascii=False)"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/audit" | python3 -c "
import json,sys
def norm(o):
    if isinstance(o,dict):
        return {k:('<TS>' if k=='at' else '<ID>' if k=='id' else norm(v)) for k,v in o.items()}
    if isinstance(o,list): return [norm(x) for x in o]
    return o
d=norm(json.load(sys.stdin))
json.dump(d,open('$A/audit.json','w'),sort_keys=True,ensure_ascii=False)"
  # users: id/uid uuidات بتتولد وقت البذر و created_at طابع البذر نفسه
  curl -s -b "$E2E_JAR" "$E2E_URL/api/users" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for u in d.get('users',[]):
    u['created']='<TS>'; u['created_at']='<TS>'; u['id']='<ID>'
json.dump(d,open('$A/users.json','w'),sort_keys=True,ensure_ascii=False)"

  curl -s -b "$E2E_JAR" "$E2E_URL/api/manpower/export" -o "$A/xlsx_ar.xlsx"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/manpower/export?lang=tr" -o "$A/xlsx_tr.xlsx"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/manpower/export?template=1" -o "$A/xlsx_tpl.xlsx"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/absence?template=1" -o "$A/xlsx_abs.xlsx"
  curl -s -b "$E2E_JAR" "$E2E_URL/api/po?template=1" -o "$A/xlsx_po.xlsx"
}

# المقارنات الفردية — بترجع rc من غير ما تلمس العدادات (عشان الـ canary)
e2e_cmp_json() {
  cmp -s "$E2E_BASE/base_$1.json" "$E2E_SCRATCH/after/$1.json"
}
e2e_cmp_xlsx() {
  python3 - "$E2E_BASE/base_$1.xlsx" "$E2E_SCRATCH/after/$1.xlsx" << 'PYX'
import sys, zipfile, re
za, zb = zipfile.ZipFile(sys.argv[1]), zipfile.ZipFile(sys.argv[2])
na, nb = set(za.namelist()), set(zb.namelist())
if na != nb: sys.exit(1)
# R68 (درس الباج الكامن): التصدير والتيمبلتات بتحط ختم «تاريخ اليوم»
# في خلية العنوان — فالمقارنة بالبايت كانت بتعد بس لأن كل الجولات
# قبل كده اشتغلت نفس يوم التقاط الـ baselines (17 سبتمبر). التطبيع
# محصور في سياقات العناوين الأربعة المعروفة (عقيدة R59: الطابع
# هوية مش بيانات) — أي تاريخ تاني في أي خلية بيانات بيفضل فاضح.
RX_DATE = re.compile(r'\d{4}-\d{2}-\d{2}')
PREFIXES = ('تصدير ', 'تيمبلت الاتزان — ', 'تيمبلت الغياب — ', 'تيمبلت عقود الـ PO — ')
def norm(b):
    s = b.decode('utf-8', errors='strict')
    for p in PREFIXES:
        i = s.find(p)
        if i < 0: continue
        j = i + len(p)
        m = RX_DATE.match(s, j)          # التاريخ لازم يلاصق العنوان نفسه
        if m: s = s[:j] + '<DATE>' + s[m.end():]
    return s.encode('utf-8')
for n in sorted(na):
    if n == 'docProps/core.xml': continue   # طابع وقت الإنشاء — متغير بالطبيعة
    if norm(za.read(n)) != norm(zb.read(n)): sys.exit(1)
sys.exit(0)
PYX
}

# أول مرة في sandbox جديد (مفيش baselines): الالتقاطة نفسها تترقى
# لـ baseline برسالة عالية — من بعدها المقارنة صايمة ضد المرفوع على git.
e2e_promote_baselines() {
  echo "⚠️  PROMOTE: baselines ناقصة — بتاخد القيم من التشغيلة دي (دي أول مرة فقط)!"
  mkdir -p "$E2E_BASE"
  for n in $E2E_JSONS; do cp "$E2E_SCRATCH/after/$n.json" "$E2E_BASE/base_$n.json"; done
  for n in $E2E_XLSXS; do cp "$E2E_SCRATCH/after/$n.xlsx" "$E2E_BASE/base_$n.xlsx"; done
}

# e2e_compare_core [أسماء للاستثناء من JSON] — الافتراضي: الكل
e2e_compare_core() {
  local excl=" $* "
  # الترتيب نفسه من أيام R56: login قبل الالتقاط (auth.json ضمنه)
  e2e_capture_after
  local need=0
  for n in $E2E_JSONS; do [ -f "$E2E_BASE/base_$n.json" ] || need=1; done
  for n in $E2E_XLSXS;  do [ -f "$E2E_BASE/base_$n.xlsx" ] || need=1; done
  if [ "$need" = "1" ]; then e2e_promote_baselines; fi
  for n in $E2E_JSONS; do
    [[ "$excl" == *" $n "* ]] && continue
    e2e_cmp_json "$n"
    check "GET /api/… $n: JSON متطابقة بالبايت مع الـ baseline" $?
  done
  for n in $E2E_XLSXS; do
    e2e_cmp_xlsx "$n"
    check "ملف $n.xlsx متطابق بالبايت (كل أجزاء OOXML ما عدا طابع الإنشاء)" $?
  done
}

# ---------- عقد الواجهة (من R57/R59 — ثابت) ----------
e2e_frontend_contract() {
  local HTML=$(curl -s "$E2E_URL/")
  local FIRST=$(echo "$HTML" | grep -oE 'src="/app/[^"]+\.js[^"]*"' | head -1)
  echo "$FIRST" | grep -q "/app/kit.js?v=$E2E_V"
  check "kit.js أول سكريبت في الصفحة + v=$E2E_V" $?
  local N=$(echo "$HTML" | grep -oE "src=\"/app/[^\"]+v=$E2E_V\" defer" | wc -l)
  [ "$N" = "12" ]
  check "12 سكريبت كلهم defer + ?v=$E2E_V" $?
  local KHTTP=$(curl -s -o /dev/null -w "%{http_code}" "$E2E_URL/app/kit.js?v=$E2E_V")
  [ "$KHTTP" = "200" ]; check "kit.js بيتخدم (200)" $?
}

# ---------- الفحوصات الوظيفية الثابتة (deleteEntry من R59) ----------
e2e_functional_core() {
  # سجل إنتاج تجريبي: إنشاء → حذف 200 → تاني 404 → بدون id 400
  local P1=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/production" \
    -H 'Content-Type: application/json' \
    -d "{\"date\":\"2026-09-10\",\"dept\":\"الصدر\",\"line\":\"2\",\"po_number\":\"E2E-DEL-PO\",\"qty\":50}")
  local P1_ID=$(echo "$P1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  [ -n "$P1_ID" ]; check "سجل إنتاج تجريبي اتحفظ" $?
  local D1=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/production?id=$P1_ID")
  [ "$D1" = "200" ]; check "deleteEntry: حذف إنتاج = 200" $?
  local D2=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/production?id=$P1_ID")
  [ "$D2" = "404" ]; check "deleteEntry: حذف تاني = 404 (نفس السلوك القديم)" $?
  local D3=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/production?id=")
  [ "$D3" = "400" ]; check "deleteEntry: بدون id = 400" $?
  # غياب + أوفر تايم (نفس الدالة المشتركة)
  local A1=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/absence" \
    -H 'Content-Type: application/json' -d '{"date":"2026-09-10","emp_code":"17001","reason":"e2e"}')
  local A1_ID=$(echo "$A1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  local DA=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/absence?id=$A1_ID")
  [ "$DA" = "200" ]; check "deleteEntry: حذف غياب = 200" $?
  local O1=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
    -H 'Content-Type: application/json' -d '{"date":"2026-09-10","emp_code":"17001","hours":2}')
  local O1_ID=$(echo "$O1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  local DO=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/overtime?id=$O1_ID")
  [ "$DO" = "200" ]; check "deleteEntry: حذف أوفر تايم = 200" $?
  # صلاحية: يوزر عادي (data.upload = hidden افتراضي) → 403 من المصدر المشترك
  curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/users" \
    -H 'Content-Type: application/json' \
    -d '{"username":"E2EtmpUser","password":"e2e-test-1234","admin":false}' > /dev/null
  local U=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/users" | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='E2EtmpUser'][0])")
  curl -s -c "$E2E_JAR2" -X POST "$E2E_URL/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"username":"E2EtmpUser","password":"e2e-test-1234","remember":true}' > /dev/null
  local DP=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR2" -X DELETE "$E2E_URL/api/entries/production?id=whatever")
  [ "$DP" = "403" ]; check "deleteEntry: يوزر عادي = 403 (الحارس شغال من المصدر المشترك)" $?
  curl -s -b "$E2E_JAR" -X DELETE "$E2E_URL/api/users?id=$U" > /dev/null
}

# ---------- ملف رفع تيمبلت الغياب (باج R59 المصلح — بيتعاد فحصه دايمًا) ----------
e2e_build_upload_xlsx() {
  mkdir -p "$E2E_SCRATCH"
  (cd "$E2E_ROOT" && python3 - << 'PYEOF'
import zipfile
rows = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>p</t></is></c><c r="B1" t="inlineStr"><is><t>الكود</t></is></c><c r="C1" t="inlineStr"><is><t>الاسم</t></is></c><c r="D1" t="inlineStr"><is><t>السبب</t></is></c></row>',
    '<row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c><c r="B2" t="inlineStr"><is><t>17001</t></is></c><c r="C2" t="inlineStr"><is><t>فحص e2e</t></is></c><c r="D2" t="inlineStr"><is><t>e2e-ui</t></is></c></row>',
    '<row r="3"><c r="A3" t="inlineStr"><is><t>2</t></is></c><c r="B3" t="inlineStr"><is><t>17002</t></is></c><c r="C3" t="inlineStr"><is><t>فحص e2e 2</t></is></c><c r="D3" t="inlineStr"><is><t>e2e-ui</t></is></c></row>',
]
sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' \
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' \
  '<sheetData>' + ''.join(rows) + '</sheetData></worksheet>'
wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' \
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' \
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' \
  '<sheets><sheet name="Absence" sheetId="1" r:id="rId1"/></sheets></workbook>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' \
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' \
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' \
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' \
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' \
  '<Default Extension="xml" ContentType="application/xml"/>' \
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' \
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
root_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' \
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' \
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
with zipfile.ZipFile('scripts/e2e_common/scratch/upload_absence.xlsx', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct)
    z.writestr('_rels/.rels', root_rels)
    z.writestr('xl/workbook.xml', wb)
    z.writestr('xl/_rels/workbook.xml.rels', rels)
    z.writestr('xl/worksheets/sheet1.xml', sheet)
print("XLSX BUILT")
PYEOF
)
}

# نظافة بعد الـ UI: صفوف الرفع (reason=e2e-ui) بتتمسح من نفس مسار الـ API
# — القاعدة تفضل زي ما كانت، فأي مقارنة تانية بعد كدا (idempotence)
# مش بتتأثر بأثر الفحص نفسه.
e2e_cleanup_ui_rows() {
  local IDS=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/absence?month=$E2E_MONTH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ids=[r.get('id','') for r in d.get('entries',[]) if r.get('reason')=='e2e-ui']
print(' '.join(i for i in ids if i))" 2>/dev/null)
  for id in $IDS; do
    curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/absence?id=$id"
  done
}

# ---------- UI smoke كامل (درس R59: قفل التاب وdismiss أي ديالوج الأول) ----------
e2e_ui_smoke() {
  local TAG="${1:-ui}"
  mkdir -p "$E2E_SCRATCH"
  e2e_build_upload_xlsx
  agent-browser dialog dismiss 2>/dev/null || true
  agent-browser close 2>/dev/null || true
  sleep 1
  agent-browser open "$E2E_URL" 2>/dev/null
  sleep 3
  agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
  agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
  sleep 5
  local UI_OK=$(agent-browser eval "var s=document.getElementById('loginScreen'); s ? (s.classList.contains('on') ? 'STILL' : 'IN') : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$UI_OK" = "IN" ]; check "UI: دخول + داشبورد" $?

  local KIT_OK=$(agent-browser eval "(window.MaribKit && MaribKit.dstamp && MaribKit.ensureXLSX && MaribKit.dlBlob && MaribKit.readGrid) ? 'OK' : 'MISSING'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$KIT_OK" = "OK" ]; check "UI: MaribKit معرّف بكل دواله" $?
  local STAMP=$(agent-browser eval "MaribKit.dstamp(new Date(2026,8,17))" 2>/dev/null | tail -1 | tr -d '"')
  [ "$STAMP" = "20260917" ]; check "UI: MaribKit.dstamp سليم (20260917)" $?

  # باج R59 المصلح: رفع تيمبلت غياب فعلي من الواجهة
  agent-browser eval "document.getElementById('mgEntry').click(); 'open'" 2>/dev/null
  sleep 2
  agent-browser eval "var t=document.querySelector('.ent-tab[data-tab=absence]'); t ? t.click() : 'NO_TAB'; 'tab'" 2>/dev/null
  sleep 2
  local ABS_BTN=$(agent-browser eval "document.getElementById('entAbsUpload') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$ABS_BTN" = "YES" ]; check "UI: زرار رفع تيمبلت الغياب موجود" $?
  agent-browser eval "document.getElementById('entAbsUpload').click(); 'pick'" 2>/dev/null
  sleep 1
  local PICK=$(agent-browser eval "document.querySelector('input.ent-file-pick') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$PICK" = "YES" ]; check "UI: الـ picker مرفق في الـ DOM (R59)" $?
  agent-browser upload "input.ent-file-pick" "$E2E_SCRATCH/upload_absence.xlsx" 2>/dev/null
  sleep 2
  local FORM=$(agent-browser eval "var f=document.querySelector('.ent-form-card'); f && f.textContent.indexOf('2')>=0 ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$FORM" = "OPEN" ]; check "بايج رفع تيمبلت الغياب (R59): الملف اتقرا وفورم التاريخ فتح" $?
  agent-browser eval "var d=document.querySelector('.ent-form-card input[type=date]'); if(d){d.value='2026-09-14';} 'date'" 2>/dev/null
  agent-browser eval "document.querySelector('.ent-form-card .ent-form-save').click(); 'save'" 2>/dev/null
  sleep 2
  local TBL=$(agent-browser eval "document.querySelector('.ent-tbl') ? document.querySelector('.ent-tbl').textContent : 'NONE'" 2>/dev/null | tail -1)
  echo "$TBL" | grep -q "17001"
  check "رفع تيمبلت الغياب: الصفوف اترفعت وظهرت في الجدول (17001)" $?

  # الاتزان بيفتح + زر التيمبلت موجود
  agent-browser eval "document.querySelector('.ent-x') ? document.querySelector('.ent-x').click() : 0; 'close'" 2>/dev/null
  sleep 1
  agent-browser eval "document.getElementById('mgMp').click(); 'mp'" 2>/dev/null
  sleep 3
  local MP=$(agent-browser eval "document.getElementById('mpTree') ? 'LOADED' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$MP" = "LOADED" ]; check "UI: صفحة الاتزان بتفتح وشجرتها موجودة" $?
  local DL=$(agent-browser eval "document.getElementById('mpTmplBtn') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
  [ "$DL" = "YES" ]; check "UI: زر تيمبلت الاتزان موجود (dlBlob مرتبط)" $?

  local JS_ERRS=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
  echo "JS_ERRORS_COUNT=$JS_ERRS"
  [ "$JS_ERRS" = "0" ]; check "UI: صفر أخطاء JavaScript" $?
  agent-browser screenshot "$E2E_SCRATCH/ui_$TAG.png" 2>/dev/null
  # نظافة: صفوف الرفع تتمسح عشان القاعدة تفضل زي ما كانت
  e2e_cleanup_ui_rows
}
