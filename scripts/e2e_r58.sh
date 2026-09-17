#!/bin/bash
# ============================================================
# R58 E2E — عقود الـ PO في صفحة الإدخال (أمر واحد متكامل)
# 1) يبني الكود (BOOT_VER=58 → جدول marib_po + فهرس جديد)
# 2) فحوصات API: upsert/قائمة/تفاصيل بالقسم والخط/تيمبلت XLSX/
#    استيراد/حذف/أذونات/تسجيل العقد تلقائيًا مع أول سجل
# 3) فحوصات UI: تاريخ امبارح + الشريطين + PO حي (خانات أول مرة +
#    سطر المعلومات) + التولتيب + الحفظ + إدارة العقود
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r58
PASS=0; FAIL=0
check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1"; fi
}

# ---------- 1) البناء ----------
bun run build 2>&1 | tail -3
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

start_server() {
  # درس R57: اسم العملية الفعلي «bun server.js» + انتظار فضي البورت
  pkill -f "bun server.js" 2>/dev/null
  for i in $(seq 1 10); do curl -s -m 1 -o /dev/null http://localhost:3113/ 2>/dev/null || break; sleep 1; done
  cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r58_server.log 2>&1 &)
  cd /home/z/my-project/marib-performance
  for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
}

# ---------- 2) نفس قاعدة البيانات المزروعة ----------
rm -rf .next/standalone/db && mkdir -p .next/standalone/db && cp -r scripts/e2e_r56/db_seeded/. .next/standalone/db/
start_server
sleep 1

curl -s -c /tmp/r58_jar.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > scripts/e2e_r58/auth.json
grep -q '"role":"dev"' scripts/e2e_r58/auth.json
check "دخول Amin (dev)" $?

# 2a) boot=58 (الـ schema الجديد اقلع)
curl -s -b /tmp/r58_jar.txt http://localhost:3113/api/health > scripts/e2e_r58/health.json
python3 -c "
import json,sys
d=json.load(open('scripts/e2e_r58/health.json'))
sys.exit(0 if d.get('boot',{}).get('ver')=='58' and d.get('ok') else 1)"
check "health: boot.ver=58 (marib_po اتخلقت مع البوت)" $?

# 2b) القايمة فاضية أول مرة
curl -s -b /tmp/r58_jar.txt http://localhost:3113/api/po > scripts/e2e_r58/po_empty.json
grep -q '{"pos":\[\]}' scripts/e2e_r58/po_empty.json
check "GET /api/po (فاضي أول مرة)" $?

# 2c) upsert يدوي: PO-100 عقد 5000
curl -s -b /tmp/r58_jar.txt -X POST http://localhost:3113/api/po \
  -H 'Content-Type: application/json' \
  -d '{"po":"PO-100","contract_qty":5000}' > scripts/e2e_r58/po_post.json
grep -q '"ok":true' scripts/e2e_r58/po_post.json
check "POST /api/po: تسجيل عقد PO-100 = 5000" $?

# 2d) تفاصيل PO معروف (لسه مفيش إنتاج)
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?po=PO-100" > scripts/e2e_r58/po_d1.json
python3 -c "
import json,sys
d=json.load(open('scripts/e2e_r58/po_d1.json'))
sys.exit(0 if d.get('known') and d.get('contract_qty')==5000 and d.get('made_total')==0 and d.get('left')==5000 else 1)"
check "تفاصيل PO-100: known + عقد 5000 + متبقي 5000" $?

# 2e) تسجيل إنتاج مع PO جديد + كمية عقد → السجل والعقد مع بعض
curl -s -b /tmp/r58_jar.txt -X POST http://localhost:3113/api/entries/production \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-15","dept":"الصدر","line":"1","po_number":"PO-200","qty":800,"po_contract_qty":3000,"note":"r58 e2e"}' > scripts/e2e_r58/prod1.json
grep -q '"ok":true' scripts/e2e_r58/prod1.json
check "POST إنتاج: PO-200 جديد + عقد 3000 مع السجل" $?

# سجل تاني نفس الـ PO قسم تاني + سجل لنفس القسم/الخط يوم تاني
curl -s -b /tmp/r58_jar.txt -X POST http://localhost:3113/api/entries/production \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-16","dept":"الصدر","line":"1","po_number":"PO-200","qty":400}' > /dev/null
curl -s -b /tmp/r58_jar.txt -X POST http://localhost:3113/api/entries/production \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-16","dept":"التجميع","line":"2","po_number":"PO-200","qty":600}' > /dev/null

# 2f) تفاصيل PO-200: مصنوع 1800 + متبقي 1200 + أيام
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?po=PO-200" > scripts/e2e_r58/po_d2.json
python3 -c "
import json,sys
d=json.load(open('scripts/e2e_r58/po_d2.json'))
ok = (d.get('known') and d.get('contract_qty')==3000 and d.get('made_total')==1800
      and d.get('left')==1200 and len(d.get('days',[]))==2)
sys.exit(0 if ok else 1)"
check "تفاصيل PO-200: مصنوع 1800 + متبقي 1200 + يومين" $?

# 2g) فلتر القسم/الخط (التولتيب): الصدر + خط 1 = 1200 بس
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?po=PO-200&dept=%D8%A7%D9%84%D8%B5%D8%AF%D8%B1&line=1" > scripts/e2e_r58/po_d3.json
python3 -c "
import json,sys
d=json.load(open('scripts/e2e_r58/po_d3.json'))
ok = (d.get('made_scope')==1200 and d.get('scope_days')==2 and d.get('made_total')==1800)
sys.exit(0 if ok else 1)"
check "تفاصيل بالقسم (الصدر) + الخط (1): نطاق 1200 + إجمالي 1800" $?

# 2h) قائمة الإدارة: PO-100 و PO-200 بالمصنوع والمتبقي
curl -s -b /tmp/r58_jar.txt http://localhost:3113/api/po > scripts/e2e_r58/po_list.json
python3 -c "
import json,sys
d=json.load(open('scripts/e2e_r58/po_list.json'))
m={p['po']:p for p in d.get('pos',[])}
ok = m.get('PO-100',{}).get('made')==0 and m.get('PO-200',{}).get('made')==1800 and m.get('PO-200',{}).get('left')==1200
sys.exit(0 if ok else 1)"
check "قايمة الإدارة: العقد/المصنوع/المتبقي صح" $?

# 2i) تيمبلت XLSX: ملف سليم (zip فيه sheet + التعليمات)
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?template=1" -o scripts/e2e_r58/po_template.xlsx
python3 -c "
import zipfile,sys
z=zipfile.ZipFile('scripts/e2e_r58/po_template.xlsx')
names=z.namelist()
ok = any('sheet1.xml' in n or 'worksheets' in n for n in names) and '[Content_Types].xml' in names
x=z.read([n for n in names if n.endswith('sheet1.xml')][0]).decode('utf-8')
ok = ok and ('PO' in x or 'رقم PO' in x)
sys.exit(0 if ok else 1)"
check "تيمبلت XLSX سليم (شيت POs + التعليمات)" $?

# 2j) استيراد: تحديث PO-100 + PO جديد + صف مرفوض
curl -s -b /tmp/r58_jar.txt -X POST "http://localhost:3113/api/po?action=import" \
  -H 'Content-Type: application/json' \
  -d '{"rows":[["p","PO-100","6500","تحديث"],["p","PO-300","2000",""],["p","PO-400","","بدون كمية"]]}' > scripts/e2e_r58/po_import.json
python3 -c "
import json,sys
d=json.load(open('scripts/e2e_r58/po_import.json'))
sys.exit(0 if d.get('inserted')==1 and d.get('updated')==1 and d.get('skipped')==1 else 1)"
check "استيراد التيمبلت: 1 جديد + 1 تحديث + 1 مرفوض (بدون كمية)" $?
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?po=PO-100" | grep -q '"contract_qty":6500'
check "PO-100 اتحديث لـ 6500" $?

# 2k) حذف الريفرانس: الإنتاج بيفضل
curl -s -b /tmp/r58_jar.txt -X DELETE "http://localhost:3113/api/po?po=PO-300" > /dev/null
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?po=PO-300" > scripts/e2e_r58/po_d4.json
grep -q '"known":false' scripts/e2e_r58/po_d4.json
check "حذف PO-300: الريفرانس اتمسح" $?
curl -s -b /tmp/r58_jar.txt "http://localhost:3113/api/po?po=PO-200" | grep -q '"made_total":1800'
check "PO-200: الإنتاج سليم بعد حذف ريفرانس تاني" $?

# 2l) الأذونات: يوزر عادي (data.view hidden افتراضيًا) → 403
curl -s -b /tmp/r58_jar.txt -X POST http://localhost:3113/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"TestR58","password":"test1234","admin":false}' > /dev/null
curl -s -c /tmp/r58_jar2.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"TestR58","password":"test1234","remember":true}' > /dev/null
# data.view افتراضي view لليوزر العادي (R55) — فالقراءة مسموحة
# زي باقي صفحات الإدخال بالظبط، والكتابة هي المقفولة
S1=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r58_jar2.txt http://localhost:3113/api/po)
[ "$S1" = "200" ]; check "يوزر عادي: GET /api/po = 200 (data.view افتراضي view — زي الإدخال)" $?
S2=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r58_jar2.txt -X POST http://localhost:3113/api/po \
  -H 'Content-Type: application/json' -d '{"po":"X","contract_qty":1}')
[ "$S2" = "403" ]; check "يوزر عادي: POST /api/po = 403 (صلاحية data.upload)" $?
S3=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r58_jar2.txt "http://localhost:3113/api/po?po=PO-200")
[ "$S3" = "200" ]; check "يوزر عادي: تفاصيل PO = 200 (قراءة زي الإدخال)" $?
# سحب data.view (hidden) → القراءة بتتقفل فعليًا (اختبار الحارس)
R58_ID=$(curl -s -b /tmp/r58_jar.txt http://localhost:3113/api/users | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin).get('users',[]) if u['username']=='TestR58'][0])")
curl -s -b /tmp/r58_jar.txt -X PUT http://localhost:3113/api/perms \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$R58_ID\",\"feature\":\"data.view\",\"level\":\"hidden\"}" > /dev/null
S4=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r58_jar2.txt http://localhost:3113/api/po)
[ "$S4" = "403" ]; check "سحب data.view → GET /api/po = 403 (الحارس شغال)" $?
S5=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r58_jar2.txt -X POST http://localhost:3113/api/po \
  -H 'Content-Type: application/json' -d '{"po":"X","contract_qty":1}')
[ "$S5" = "403" ]; check "view بس: POST /api/po لسه 403 (لازم edit)" $?
curl -s -b /tmp/r58_jar.txt -X DELETE "http://localhost:3113/api/users?id=$R58_ID" > /dev/null

# ---------- 3) UI (agent-browser) ----------
agent-browser open http://localhost:3113 2>/dev/null
sleep 3
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5
UI_OK=$(agent-browser eval "var s=document.getElementById('loginScreen'); s ? (s.classList.contains('on') ? 'STILL' : 'IN') : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$UI_OK" = "IN" ]; check "UI: دخول + داشبورد" $?

# فتح الإدخال (زرار بوابة الأوضاع) → تاب الإنتاج
agent-browser eval "document.getElementById('mgEntry').click(); 'opened'" 2>/dev/null
sleep 2
HAS_POP=$(agent-browser eval "document.getElementById('entPop') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$HAS_POP" = "YES" ]; check "UI: نافذة إدخال البيانات اتفتحت" $?

# زرار إضافة سجل إنتاج → النموذج
agent-browser eval "document.getElementById('entProdAdd').click(); 'form'" 2>/dev/null
sleep 1
HAS_FORM=$(agent-browser eval "document.querySelector('.ent-form-card') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$HAS_FORM" = "YES" ]; check "UI: نموذج الإنتاج اتفتح" $?

# 3a) التاريخ الافتراضي = امبارح
YESTERDAY=$(TZ=UTC date -d "yesterday" +%Y-%m-%d)
UI_DATE=$(agent-browser eval "document.getElementById('efDate').value" 2>/dev/null | tail -1 | tr -d '"')
echo "UI_DATE=$UI_DATE (expected $YESTERDAY)"
[ "$UI_DATE" = "$YESTERDAY" ]; check "UI: التاريخ الافتراضي = امبارح ($YESTERDAY)" $?

# 3b) الشريطين بدل الدروب ليست: 5 خطوط + 5 أقسام + صفر select
LINES_N=$(agent-browser eval "document.querySelectorAll('#efLineStrip .ent-strip-btn').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$LINES_N" = "5" ]; check "UI: شريط الخط = 5 أزرار" $?
SECS_N=$(agent-browser eval "document.querySelectorAll('#efSecStrip .ent-strip-btn').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$SECS_N" = "5" ]; check "UI: شريط القسم = 5 أزرار" $?
NO_SEL=$(agent-browser eval "document.querySelectorAll('.ent-form-card select').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NO_SEL" = "0" ]; check "UI: صفر قوائم منسدلة في النموذج" $?

# 3c) نقر شريط الخط + شريط القسم
agent-browser eval "document.querySelector('#efLineStrip .ent-strip-btn[data-v=\\\"1\\\"]').click(); 'line'" 2>/dev/null
agent-browser eval "document.querySelector('#efSecStrip .ent-strip-btn[data-v=\\\"الصدر\\\"]').click(); 'sec'" 2>/dev/null
sleep 1
ON_L=$(agent-browser eval "document.querySelector('#efLineStrip .ent-strip-btn.on') ? document.querySelector('#efLineStrip .ent-strip-btn.on').getAttribute('data-v') : 'NONE'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ON_L" = "1" ]; check "UI: نقر شريط الخط → خط 1 مختار" $?
ON_S=$(agent-browser eval "document.querySelector('#efSecStrip .ent-strip-btn.on') ? document.querySelector('#efSecStrip .ent-strip-btn.on').getAttribute('data-v') : 'NONE'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ON_S" = "الصدر" ]; check "UI: نقر شريط القسم → الصدر مختار" $?

# 3d) PO معروف (PO-200) → سطر المعلومات: عقد 3000 + مصنوع 1800
agent-browser eval "var i=document.getElementById('efPo'); i.value='PO-200'; i.dispatchEvent(new Event('input',{bubbles:true})); 'typed'" 2>/dev/null
sleep 2
INFO_OK=$(agent-browser eval "var b=document.getElementById('poInfoBox'); b ? b.textContent.replace(/\\s+/g,' ') : 'NONE'" 2>/dev/null | tail -1)
echo "PO_INFO=$INFO_OK"
echo "$INFO_OK" | grep -q "3,000" && echo "$INFO_OK" | grep -q "1,800" && echo "$INFO_OK" | grep -q "1,200"
check "UI: PO معروف → سطر العقد (3,000/1,800/1,200)" $?

# 3e) التولتيب: hover → يظهر وي فيه النطاق (الصدر · خط 1 = 1,200)
agent-browser eval "var b=document.getElementById('poInfoBox'); b.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true})); 'hover'" 2>/dev/null
sleep 1
TIP_OK=$(agent-browser eval "var t=document.getElementById('poTip'); t && !t.hidden ? t.textContent.replace(/\\s+/g,' ') : 'HIDDEN'" 2>/dev/null | tail -1)
echo "PO_TIP=$TIP_OK"
echo "$TIP_OK" | grep -q "1,200" && echo "$TIP_OK" | grep -q "PO-200"
check "UI: التولتيب = PO-200 + النطاق بالتاريخ والإجمالي" $?
agent-browser eval "var b=document.getElementById('poInfoBox'); b.dispatchEvent(new MouseEvent('mouseleave',{bubbles:true})); 'out'" 2>/dev/null

# 3f) حفظ سجل من الواجهة (PO-200 + كمية 100) → يظهر في الجدول
agent-browser eval "document.getElementById('efQty').value='100'; document.querySelector('.ent-form-save').click(); 'save'" 2>/dev/null
sleep 2
TBL_OK=$(agent-browser eval "document.querySelector('.ent-tbl') ? document.querySelector('.ent-tbl').textContent : 'NONE'" 2>/dev/null | tail -1)
echo "$TBL_OK" | grep -q "PO-200" && echo "$TBL_OK" | grep -q "الصدر"
check "UI: السجل اتحفظ وظهر في الجدول (PO-200 · الصدر)" $?

# 3g) PO جديد → خانتا كمية العقد + المتبقي التلقائي
agent-browser eval "document.getElementById('entProdAdd').click(); 'form2'" 2>/dev/null
sleep 1
agent-browser eval "var i=document.getElementById('efPo'); i.value='PO-999'; i.dispatchEvent(new Event('input',{bubbles:true})); 'new-po'" 2>/dev/null
sleep 2
NEW_OK=$(agent-browser eval "document.getElementById('efPoContract') ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$NEW_OK" = "OPEN" ]; check "UI: PO جديد → خانة كمية العقد فتحت" $?
agent-browser eval "var c=document.getElementById('efPoContract'); c.value='2500'; c.dispatchEvent(new Event('input',{bubbles:true})); 'qty'" 2>/dev/null
sleep 1
LEFT_V=$(agent-browser eval "document.getElementById('efPoLeft') ? document.getElementById('efPoLeft').value : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$LEFT_V" = "2500" ]; check "UI: المتبقي اتملّي تلقائي = 2500 (عقد بدون إنتاج)" $?
# غلق النموذج بدون حفظ (PO-999 تجريبي)
agent-browser eval "document.querySelector('.ent-form-card .ent-form-cancel').click(); 'cancel'" 2>/dev/null
sleep 1

# 3h) أزرار عقود الـ PO موجودة + إدارة العقود بتفتح
BTN_OK=$(agent-browser eval "(document.getElementById('entPoTpl')&&document.getElementById('entPoUpload')&&document.getElementById('entPoManage'))?'YES':'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$BTN_OK" = "YES" ]; check "UI: أزرار التيمبلت + إدارة العقود موجودة" $?
agent-browser eval "document.getElementById('entPoManage').click(); 'manage'" 2>/dev/null
sleep 2
MNG_OK=$(agent-browser eval "document.querySelector('.po-manage .ent-tbl') ? document.querySelector('.po-manage .ent-tbl').textContent.replace(/\\s+/g,' ').slice(0,120) : 'NO'" 2>/dev/null | tail -1)
echo "PO_MANAGE=$MNG_OK"
echo "$MNG_OK" | grep -q "PO-100" && echo "$MNG_OK" | grep -q "PO-200"
check "UI: إدارة العقود: PO-100 + PO-200 بالقايمة" $?
agent-browser screenshot scripts/e2e_r58/ui_po_manage.png 2>/dev/null
agent-browser eval "document.querySelector('.po-manage .ent-form-x') ? document.querySelector('.po-manage .ent-form-x').click() : document.querySelector('.po-manage').remove(); 'closed'" 2>/dev/null
sleep 1

# 3i) صفر أخطاء JS من أول الفتح
JS_ERRS=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
echo "JS_ERRORS_COUNT=$JS_ERRS"
[ "$JS_ERRS" = "0" ]; check "UI: صفر أخطاء JavaScript" $?

pkill -f "bun server.js" 2>/dev/null

echo ""
echo "=========== النتيجة: PASS=$PASS FAIL=$FAIL ==========="
[ $FAIL -eq 0 ] && echo "E2E R58: كل الفحوصات نجحت" || { echo "E2E R58: فيه فشل — راجع فوق"; exit 1; }
