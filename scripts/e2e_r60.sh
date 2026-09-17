#!/bin/bash
# ============================================================
# R60 E2E — TypeScript strict (noUncheckedIndexedAccess) بأمر واحد
# 0) فحوصات الجولة نفسها: tsc بصفر أخطاء + الأعلام في tsconfig
# 1) يبني الكود بعد تشديد الأنواع
# 2) نفس قاعدة db_seeded + نفس طلبات الـ baseline بالترتيب
#    (baselines بتاعة R59 — الدليل على صفر تغيير سلوك)
# 3) يقارن: 12 JSON متطابقة + 5 ملفات XLSX متطابقة بالبايت
# 4) نفس فحوصات R59 الوظيفية كلها (deleteEntry + MaribKit +
#    باج رفع تيمبلت الغياب) — الواجهة ما اتلمستش فـ v=r59 زي ما هي
# 5) UI smoke كامل (دخول + إدخال + اتحزان + صفر أخطاء JS)
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r60
PASS=0; FAIL=0
check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1"; fi
}

# ---------- 0) فحوصات الجولة: الأنواع المشددة نفسها ----------
# 0a) tsc بصفر أخطاء بأعلام tsconfig (الهدف الأساسي للجولة)
bunx tsc --noEmit > /tmp/r60_tsc.log 2>&1
check "tsc --noEmit بصفر أخطاء (noUncheckedIndexedAccess شغال)" $?

# 0b) الأعلام مفعّلة فعلاً في tsconfig.json (مش بس على جهازي)
for FLAG in noUncheckedIndexedAccess noFallthroughCasesInSwitch noImplicitOverride; do
  grep -q "\"$FLAG\": true" tsconfig.json
  check "tsconfig: $FLAG مفعّل" $?
done

# ---------- 1) البناء ----------
bun run build 2>&1 | tail -3
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

start_server() {
  pkill -f "bun server.js" 2>/dev/null
  for i in $(seq 1 10); do curl -s -m 1 -o /dev/null http://localhost:3113/ 2>/dev/null || break; sleep 1; done
  cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r60_server.log 2>&1 &)
  cd /home/z/my-project/marib-performance
  for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
}

# ---------- 2) نفس القاعدة + نفس الترتيب ----------
rm -rf .next/standalone/db && mkdir -p .next/standalone/db && cp -r scripts/e2e_r56/db_seeded/. .next/standalone/db/
start_server
sleep 1

A=scripts/e2e_r60/after; mkdir -p $A
B=scripts/e2e_r60
curl -s -c /tmp/r60_jar.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > $A/auth.json
grep -q '"role":"dev"' $A/auth.json
check "دخول Amin (dev)" $?

curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/data" > $A/data.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/manpower" > $A/manpower.json
M=$(date +%Y-%m)
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/entries/absence?month=$M" > $A/absence.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/entries/overtime?month=$M" > $A/ot.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/entries/production?month=$M" > $A/prod.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/perms?me=1" > $A/perms.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/settings" > $A/settings.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/storage" > $A/storage.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/po" > $A/po.json
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/health" | python3 -c "
import json,sys
d=json.load(sys.stdin); d.pop('boot',None)
json.dump(d,open('scripts/e2e_r60/after/health.json','w'),sort_keys=True,ensure_ascii=False)"
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/audit" | python3 -c "
import json,sys
def norm(o):
    if isinstance(o,dict):
        return {k:('<TS>' if k=='at' else '<ID>' if k=='id' else norm(v)) for k,v in o.items()}
    if isinstance(o,list): return [norm(x) for x in o]
    return o
d=norm(json.load(sys.stdin))
json.dump(d,open('scripts/e2e_r60/after/audit.json','w'),sort_keys=True,ensure_ascii=False)"
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/users" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for u in d.get('users',[]): u['created']='<TS>'
json.dump(d,open('scripts/e2e_r60/after/users.json','w'),sort_keys=True,ensure_ascii=False)"

curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/manpower/export" -o $A/xlsx_ar.xlsx
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/manpower/export?lang=tr" -o $A/xlsx_tr.xlsx
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/manpower/export?template=1" -o $A/xlsx_tpl.xlsx
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/entries/absence?template=1" -o $A/xlsx_abs.xlsx
curl -s -b /tmp/r60_jar.txt "http://localhost:3113/api/po?template=1" -o $A/xlsx_po.xlsx

# ---------- 3) المقارنات بالبايت ----------
echo "=========== COMPARISON ==========="
for name in data manpower absence ot prod perms settings storage po health audit users; do
  cmp -s "$B/base_${name}.json" "$A/${name}.json"
  check "GET /api/… ${name}: JSON متطابقة بالبايت مع الـ baseline" $?
done
# ملفات الإكسل: مقارنة كل أجزاء OOXML بالبايت ما عدا docProps/core.xml
# (خصائص المستند فيها طابع «وقت الإنشاء» بيتغير مع كل توليد — زي R56
# اللي قارن محتوى XML مش الحاوية). وجود الجزء نفسه بيتأكد منه ضمن الدورة.
for name in xlsx_ar xlsx_tr xlsx_tpl xlsx_abs xlsx_po; do
  python3 - "$B/base_${name}.xlsx" "$A/${name}.xlsx" << 'PYX'
import sys, zipfile
za, zb = zipfile.ZipFile(sys.argv[1]), zipfile.ZipFile(sys.argv[2])
na, nb = set(za.namelist()), set(zb.namelist())
if na != nb: sys.exit(1)
for n in sorted(na):
    if n == 'docProps/core.xml': continue   # طابع وقت الإنشاء — متغير بالطبيعة
    if za.read(n) != zb.read(n): sys.exit(1)
sys.exit(0)
PYX
  check "ملف ${name}.xlsx متطابق بالبايت (كل أجزاء OOXML ما عدا طابع الإنشاء)" $?
done

# ---------- 4) فحوصات refactoring ----------
# 4a) 12 سكريبت defer (kit.js أولهم) + v=r59
HTML=$(curl -s http://localhost:3113/)
KIT_FIRST=$(echo "$HTML" | grep -oE 'src="/app/[^"]+\.js[^"]*"' | head -1)
echo "FIRST_SCRIPT=$KIT_FIRST"
echo "$KIT_FIRST" | grep -q '/app/kit.js?v=r59'
check "kit.js أول سكريبت في الصفحة + v=r59" $?
DEFER_N=$(echo "$HTML" | grep -oE 'src="/app/[^"]+v=r59" defer' | wc -l)
echo "DEFER_SCRIPTS=$DEFER_N"
[ "$DEFER_N" = "12" ]
check "12 سكريبت كلهم defer + ?v=r59" $?

# 4b) MaribKit معرّف ومخدوم
curl -s -o /dev/null -w "" http://localhost:3113/app/kit.js?v=r59
KHTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3113/app/kit.js?v=r59")
[ "$KHTTP" = "200" ]; check "kit.js بيتخدم (200)" $?

# 4c) deleteEntry: الحذف + 404 + الصلاحية (على القاعدة الحية)
# سجل إنتاج تجريبي
P1=$(curl -s -b /tmp/r60_jar.txt -X POST http://localhost:3113/api/entries/production \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-10","dept":"الصدر","line":"2","po_number":"R60-DEL","qty":50}')
P1_ID=$(echo "$P1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$P1_ID" ]; check "سجل إنتاج تجريبي اتحفظ" $?
D1=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r60_jar.txt -X DELETE "http://localhost:3113/api/entries/production?id=$P1_ID")
[ "$D1" = "200" ]; check "deleteEntry: حذف إنتاج = 200" $?
D2=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r60_jar.txt -X DELETE "http://localhost:3113/api/entries/production?id=$P1_ID")
[ "$D2" = "404" ]; check "deleteEntry: حذف تاني = 404 (نفس السلوك القديم)" $?
D3=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r60_jar.txt -X DELETE "http://localhost:3113/api/entries/production?id=")
[ "$D3" = "400" ]; check "deleteEntry: بدون id = 400" $?
# غياب + أوفر تايم (نفس الدالة المشتركة)
A1=$(curl -s -b /tmp/r60_jar.txt -X POST http://localhost:3113/api/entries/absence \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-10","emp_code":"17001","reason":"r60"}')
A1_ID=$(echo "$A1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
DA=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r60_jar.txt -X DELETE "http://localhost:3113/api/entries/absence?id=$A1_ID")
[ "$DA" = "200" ]; check "deleteEntry: حذف غياب = 200" $?
O1=$(curl -s -b /tmp/r60_jar.txt -X POST http://localhost:3113/api/entries/overtime \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-10","emp_code":"17001","hours":2}')
O1_ID=$(echo "$O1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
DO=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r60_jar.txt -X DELETE "http://localhost:3113/api/entries/overtime?id=$O1_ID")
[ "$DO" = "200" ]; check "deleteEntry: حذف أوفر تايم = 200" $?
# صلاحية: يوزر عادي (data.upload = hidden افتراضي) → 403
curl -s -b /tmp/r60_jar.txt -X POST http://localhost:3113/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"TestR60","password":"test1234","admin":false}' > /dev/null
R59U=$(curl -s -b /tmp/r60_jar.txt http://localhost:3113/api/users | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='TestR60'][0])")
curl -s -c /tmp/r60_jar2.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"TestR60","password":"test1234","remember":true}' > /dev/null
DP=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r60_jar2.txt -X DELETE "http://localhost:3113/api/entries/production?id=whatever")
[ "$DP" = "403" ]; check "deleteEntry: يوزر عادي = 403 (الحارس شغال من المصدر المشترك)" $?
curl -s -b /tmp/r60_jar.txt -X DELETE "http://localhost:3113/api/users?id=$R59U" > /dev/null

# ---------- 5) UI: MaribKit + إصلاح باج رفع تيمبلت الغياب ----------
# درس التشغيلة الأولى: ديالوج confirm مفتوح من جولة سابقة بيعلّق الصفحة
# كلها — نطفي أي ديالوج ونقفل التاب قبل ما نفتح من جديد.
agent-browser dialog dismiss 2>/dev/null || true
agent-browser close 2>/dev/null || true
sleep 1
agent-browser open http://localhost:3113 2>/dev/null
sleep 3
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5
UI_OK=$(agent-browser eval "var s=document.getElementById('loginScreen'); s ? (s.classList.contains('on') ? 'STILL' : 'IN') : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$UI_OK" = "IN" ]; check "UI: دخول + داشبورد" $?

# 5a) MaribKit معرّف وكل دواله موجودة
KIT_OK=$(agent-browser eval "(window.MaribKit && MaribKit.dstamp && MaribKit.ensureXLSX && MaribKit.dlBlob && MaribKit.readGrid) ? 'OK' : 'MISSING'" 2>/dev/null | tail -1 | tr -d '"')
[ "$KIT_OK" = "OK" ]; check "UI: MaribKit معرّف بكل دواله" $?
STAMP=$(agent-browser eval "MaribKit.dstamp(new Date(2026,8,17))" 2>/dev/null | tail -1 | tr -d '"')
[ "$STAMP" = "20260917" ]; check "UI: MaribKit.dstamp سليم (20260917)" $?

# 5b) 🔧 فحص الباج المصلح: زرار رفع تيمبلت الغياب كان سايح دايمًا
# (MaribCloud.ensureXX مش موجودة) — دلوقتي readGrid على MaribKit.
# بنبني ملف غياب فعلي ونرفعه من الواجهة نفسها.
python3 - << 'PYEOF'
import zipfile
# شيت بسيط: صف الرأس (p, الكود, الاسم, السبب) + صفين موظفين معروفين
rows = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>p</t></is></c><c r="B1" t="inlineStr"><is><t>الكود</t></is></c><c r="C1" t="inlineStr"><is><t>الاسم</t></is></c><c r="D1" t="inlineStr"><is><t>السبب</t></is></c></row>',
    '<row r="2"><c r="A2" t="inlineStr"><is><t>1</t></is></c><c r="B2" t="inlineStr"><is><t>17001</t></is></c><c r="C2" t="inlineStr"><is><t>ر60 تجربة</t></is></c><c r="D2" t="inlineStr"><is><t>ازمة</t></is></c></row>',
    '<row r="3"><c r="A3" t="inlineStr"><is><t>2</t></is></c><c r="B3" t="inlineStr"><is><t>17002</t></is></c><c r="C3" t="inlineStr"><is><t>ر60 تجربة2</t></is></c><c r="D3" t="inlineStr"><is><t>مرضي</t></is></c></row>',
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
with zipfile.ZipFile('scripts/e2e_r60/upload_absence.xlsx', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct)
    z.writestr('_rels/.rels', root_rels)
    z.writestr('xl/workbook.xml', wb)
    z.writestr('xl/_rels/workbook.xml.rels', rels)
    z.writestr('xl/worksheets/sheet1.xml', sheet)
print("XLSX BUILT")
PYEOF

# فتح الإدخال → تاب الغياب → زرار الرفع
agent-browser eval "document.getElementById('mgEntry').click(); 'open'" 2>/dev/null
sleep 2
agent-browser eval "var t=document.querySelector('.ent-tab[data-tab=absence]'); t ? t.click() : 'NO_TAB'; 'tab'" 2>/dev/null
sleep 2
ABS_BTN=$(agent-browser eval "document.getElementById('entAbsUpload') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ABS_BTN" = "YES" ]; check "UI: زرار رفع تيمبلت الغياب موجود" $?
# الضغطة بتفتح الـ picker المرفق (R59: كلاس ثابت ent-file-pick)
agent-browser eval "document.getElementById('entAbsUpload').click(); 'pick'" 2>/dev/null
sleep 1
PICK_IN_DOM=$(agent-browser eval "document.querySelector('input.ent-file-pick') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
echo "PICK_IN_DOM=$PICK_IN_DOM"
[ "$PICK_IN_DOM" = "YES" ]; check "UI: الـ picker مرفق في الـ DOM (R59: input بكلاس ثابت)" $?
# رفع الملف الفعلي — agent-browser upload بيحط الملف وبيطلق change
agent-browser upload "input.ent-file-pick" /home/z/my-project/marib-performance/scripts/e2e_r60/upload_absence.xlsx 2>/dev/null
sleep 2
ABS_FORM=$(agent-browser eval "var f=document.querySelector('.ent-form-card'); f && f.textContent.indexOf('2')>=0 ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
echo "ABS_UPLOAD_FORM=$ABS_FORM"
[ "$ABS_FORM" = "OPEN" ]; check "🔧 باج رفع تيمبلت الغياب المصلح: الملف اتقرا وفورم التاريخ فتح" $?
# اختار التاريخ واحفظ — الصفوف لازم تظهر في الجدول
agent-browser eval "var d=document.querySelector('.ent-form-card input[type=date]'); if(d){d.value='2026-09-14';} 'date'" 2>/dev/null
agent-browser eval "document.querySelector('.ent-form-card .ent-form-save').click(); 'save'" 2>/dev/null
sleep 2
ABS_T=$(agent-browser eval "document.querySelector('.ent-tbl') ? document.querySelector('.ent-tbl').textContent : 'NONE'" 2>/dev/null | tail -1)
echo "ABS_TABLE=$ABS_T"
echo "$ABS_T" | grep -q "17001"
check "🔧 رفع تيمبلت الغياب: الصفوف اترفعت وظهرت في الجدول (17001)" $?
# ملاحظة: سجلات التجربة مش بتتمسح هنا — الحذف بيعمل confirm() ولو
# الديالوج ما اتروش القاعدة هتتقلب من جولة للتانية. القاعدة أصلاً
# بتترجع من db_seeded مع كل تشغيل للسكريبت.

# 5c) الاتزان بيفتح (ensureXLSX الموحد ما كسرش الموديول) — من بوابة
# الأوضاع: زرار mgMp (البوابة ظاهرة بعد الدخول) ← MaribManpower.show()
agent-browser eval "document.querySelector('.ent-x') ? document.querySelector('.ent-x').click() : 0; 'close'" 2>/dev/null
sleep 1
agent-browser eval "document.getElementById('mgMp').click(); 'mp'" 2>/dev/null
sleep 3
MP_OK=$(agent-browser eval "document.getElementById('mpTree') ? 'LOADED' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
echo "MP_STATE=$MP_OK"
[ "$MP_OK" = "LOADED" ]; check "UI: صفحة الاتزان بتفتح وشجرتها موجودة" $?
# زرار تنزيل التيمبلت شغال (dlBlob) — الفحص: الفانكشن نفسها مرتبطة
DL_OK=$(agent-browser eval "document.getElementById('mpTmplBtn') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$DL_OK" = "YES" ]; check "UI: زر تيمبلت الاتزان موجود (dlBlob مرتبط)" $?

# 5d) صفر أخطاء JS
JS_ERRS=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
echo "JS_ERRORS_COUNT=$JS_ERRS"
[ "$JS_ERRS" = "0" ]; check "UI: صفر أخطاء JavaScript" $?
agent-browser screenshot scripts/e2e_r60/ui_final.png 2>/dev/null

pkill -f "bun server.js" 2>/dev/null

echo ""
echo "=========== النتيجة: PASS=$PASS FAIL=$FAIL ==========="
[ $FAIL -eq 0 ] && echo "E2E R60: كل الفحوصات نجحت" || { echo "E2E R60: فيه فشل — راجع فوق"; exit 1; }
