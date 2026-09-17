#!/bin/bash
# ============================================================
# R57 E2E — Optimize Performance (أمر واحد متكامل)
# 1) يبني الكود بعد التحسينات
# 2) نفس قاعدة db_seeded + نفس طلبات الـ baseline بالترتيب
# 3) يقارن: JSON متطابقة (data بالطابع الزمني متطبّع) + ترويسات
# 4) فحوصات الأداء الجديدة:
#    - Cache-Control immutable على أصول /app/*
#    - defer على الـ 11 سكريبت + v=r57
#    - بوابة boot_ver: بوت كامل أول مرة ← fast بعد إعادة التشغيل
#    - كاش الدور/الصلاحيات: الإلزام فوري (منح/سحب/دور/حذف)
#    - فريش DB فاضية: بذر كامل + Amin + 810 موظف
# 5) UI smoke test (defer + preload ما يكسروش حاجة)
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r57/after
PASS=0; FAIL=0
check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1"; fi
}

# ---------- 1) البناء ----------
bun run build 2>&1 | tail -3
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

start_server() {
  # درس R57: اسم العملية الفعلي «bun server.js» — النمط القديم
  # standalone/server.js كان بيفشل في القتل، والسيرفر الجديد كان
  # بيضرب EADDRINUSE والقديم الشارد بيكمل خدمة كود عتيق.
  pkill -f "bun server.js" 2>/dev/null
  for i in $(seq 1 10); do curl -s -m 1 -o /dev/null http://localhost:3113/ 2>/dev/null || break; sleep 1; done
  cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r57_after_server.log 2>&1 &)
  cd /home/z/my-project/marib-performance
  for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
}

# ---------- 2) نفس القاعدة + نفس الترتيب ----------
rm -rf .next/standalone/db && mkdir -p .next/standalone/db && cp -r scripts/e2e_r56/db_seeded/. .next/standalone/db/
start_server
sleep 1

# 2a) الإقلاع البارد الأول (db_seeded من غير boot_ver ← بوت كامل متوقع)
COLD_FULL_MS=$(curl -s -o /dev/null -w "%{time_total}" http://localhost:3113/api/health | python3 -c "import sys;print(round(float(sys.stdin.read().strip())*1000))")
echo "COLD_FULL_MS=$COLD_FULL_MS (بوت كامل: DDL + فحوص)"

# 2b) نفس طلبات الـ baseline بالترتيب
curl -s -c /tmp/r57_jar.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > scripts/e2e_r57/after_auth.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/health" > scripts/e2e_r57/after/health.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/data" > scripts/e2e_r57/after/data_pre.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/manpower" > scripts/e2e_r57/after/manpower.json
MONTH=$(date +%Y-%m)
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/entries/absence?month=$MONTH" > scripts/e2e_r57/after/absence.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/entries/overtime?month=$MONTH" > scripts/e2e_r57/after/overtime.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/entries/production?month=$MONTH" > scripts/e2e_r57/after/production.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/perms?me=1" > scripts/e2e_r57/after/perms.json

# 2c) نفس رفع الشهر التجريبي (يغطي مسار lastSync)
curl -s -b /tmp/r57_jar.txt -X POST http://localhost:3113/api/data \
  -H 'Content-Type: application/json' \
  -d '{"month":"2026-08","files":["e2e-r57.xlsx"],"pack":{"dd":{"c":["Date","Line","Qty","Target"],"r":[["2026-08-01","L1",100,120],["2026-08-02","L2",150,140],["2026-08-03","L1",130,120]]},"ot":{"c":["Date","Line","Hours"],"r":[["2026-08-01","L1",8]]}}}' > scripts/e2e_r57/after_data_post.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/data" > scripts/e2e_r57/after/data.json

# 2d) الحالة المستقرة (نفس قياس الـ baseline)
python3 - << 'PYEOF'
import subprocess, statistics
times = []
for _ in range(20):
    r = subprocess.run(["curl", "-s", "-b", "/tmp/r57_jar.txt",
                        "-o", "/dev/null", "-w", "%{time_total}",
                        "http://localhost:3113/api/data"],
                       capture_output=True, text=True)
    times.append(float(r.stdout.strip()) * 1000)
med = round(statistics.median(times), 1)
avg = round(statistics.mean(times), 1)
print(f"DATA_STEADY median={med}ms avg={avg}ms n=20")
open("scripts/e2e_r57/after_steady.txt", "w").write(f"median={med}\navg={avg}\n")
PYEOF

# ---------- 3) المقارنات ----------
echo "=========== COMPARISON ==========="

# 3a) data قبل الرفع: الرد الفاضي المتوقع لقاعدة من غير شهور — بالبايت
printf '{"months":[],"pack":{},"lastSync":{}}' > /tmp/empty_data.json
cmp -s /tmp/empty_data.json scripts/e2e_r57/after/data_pre.json
check "data (قبل الرفع) = الرد الفاضي المتطابق بالبايت" $?

# 3b) data بعد الرفع: نفس المحتوى ما عدا طابع lastSync الزمني (وقت الطلب)
python3 - << 'PYEOF'
import json, sys
def norm(p):
    d = json.load(open(p))
    for m in (d.get("lastSync") or {}).values():
        m["at"] = "<TS>"
    return d
b = norm("scripts/e2e_r57/base_data.json")
a = norm("scripts/e2e_r57/after/data.json")
ok = b == a
if not ok:
    print("base :", json.dumps(b)[:400])
    print("after:", json.dumps(a)[:400])
sys.exit(0 if ok else 1)
PYEOF
check "data (بعد الرفع): months + pack + lastSync متطابقين (الطابع الزمني متطبّع)" $?

# 3c) الباقي متطابق بالبايت
for name in manpower absence overtime production perms; do
  cmp -s "scripts/e2e_r57/base_${name}.json" "scripts/e2e_r57/after/${name}.json"
  check "GET /api/${name} JSON متطابقة بالبايت" $?
done

# 3d) health: نفس الأرقام + الحقلين الجديدين db و boot
python3 - << 'PYEOF'
import json, sys
base = json.load(open('scripts/e2e_r57/base_health.json'))
after = json.load(open('scripts/e2e_r57/after/health.json'))
ok = (
    base.get('users') == after.get('users') and
    base.get('months') == after.get('months') and
    base.get('employees') == after.get('employees') and
    after.get('db') in ('neon', 'pglite') and
    after.get('boot', {}).get('ver') == '57' and
    after.get('boot', {}).get('path') in ('fast', 'full') and
    after.get('ok') is True
)
print("health base :", base)
print("health after:", after)
sys.exit(0 if ok else 1)
PYEOF
check "health: نفس الأرقام + db + boot={ver:57}" $?

# 3e) رفع الشهر: نفس رد الـ baseline (ok + نفس عدد الصفوف)
cmp -s scripts/e2e_r57/base_data_post.json scripts/e2e_r57/after_data_post.json
check "POST /api/data رفع الشهر: نفس الرد بالبايت" $?

# ---------- 4) فحوصات الأداء الجديدة ----------

# 4a) Cache-Control immutable على JS و CSS
curl -s -D - -o /dev/null "http://localhost:3113/app/app_core.js?v=r57" | grep -i "cache-control" > /tmp/h1.txt
grep -qi "max-age=31536000" /tmp/h1.txt && grep -qi "immutable" /tmp/h1.txt
check "app_core.js: Cache-Control immutable سنة كاملة" $?
cat /tmp/h1.txt
curl -s -D - -o /dev/null "http://localhost:3113/app/app.css?v=r57" | grep -i "cache-control" > /tmp/h2.txt
grep -qi "immutable" /tmp/h2.txt
check "app.css: Cache-Control immutable" $?
curl -s -D - -o /dev/null "http://localhost:3113/app/xlsx.full.min.js?v=r57" | grep -i "cache-control" > /tmp/h3.txt
grep -qi "immutable" /tmp/h3.txt
check "xlsx.full.min.js (932KB): immutable — بعد أول استيراد صفر تنزيل" $?

# 4b) defer على الـ 11 سكريبت + v=r57 في HTML
DEFER_N=$(curl -s http://localhost:3113/ | grep -oE 'src="/app/[^"]+v=r57" defer' | wc -l)
echo "DEFER_SCRIPTS=$DEFER_N"
[ "$DEFER_N" = "11" ]
check "11 سكريبت كلهم defer + ?v=r57" $?

# 4c) بوابة boot_ver: إعادة تشغيل ← أول طلب أسرع + boot.path=fast
start_server
sleep 1
COLD_FAST_MS=$(curl -s -o /dev/null -w "%{time_total}" http://localhost:3113/api/health | python3 -c "import sys;print(round(float(sys.stdin.read().strip())*1000))")
echo "COLD_FAST_MS=$COLD_FAST_MS (بوابة boot_ver — استعلام واحد)"
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/health" > /tmp/h_fast.json
python3 -c "
import json,sys
d=json.load(open('/tmp/h_fast.json'))
sys.exit(0 if d.get('boot',{}).get('path')=='fast' and d.get('months')==1 and d.get('employees')==810 else 1)"
check "بعد إعادة التشغيل: boot.path=fast + نفس الأرقام (months=1 بعد الرفع)" $?
python3 -c "print('تقليل الإقلاع البارد: ${COLD_FULL_MS}ms ← ${COLD_FAST_MS}ms')"

# ---------- 5) كاش الدور/الصلاحيات: الإلزام فوري ----------
# يوزر تجريبي: الدخول ← المنح/السحب فوري ← تغيير الدور فوري ← الحذف فوري
R57U=$(curl -s -b /tmp/r57_jar.txt -X POST http://localhost:3113/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"TestR57","password":"test1234","admin":false}')
echo "$R57U" | grep -q '"ok":true'
check "إنشاء يوزر TestR57" $?
R57_ID=$(echo "$R57U" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

curl -s -c /tmp/r57_jar2.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"TestR57","password":"test1234","remember":true}' > /tmp/r57_tlogin.json
grep -q '"role":"user"' /tmp/r57_tlogin.json
check "دخول TestR57 (role=user)" $?

# 5a) الدخول العادي: user افتراضيًا data.view=view ← 200
S1=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/data)
[ "$S1" = "200" ]; check "قبل المنح: /api/data لـ TestR57 = 200 (view افتراضي)" $?
# نداء تاني عشان الدور والصلاحيات يدخلوا الكاش فعليًا
S1B=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/data)
[ "$S1B" = "200" ]; check "النداء التاني (دور وصلاحيات في الكاش دلوقتي) = 200" $?

# 5b) سحب data.view ← فورًا 403 (الإبطال من perms PUT)
curl -s -b /tmp/r57_jar.txt -X PUT http://localhost:3113/api/perms \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$R57_ID\",\"feature\":\"data.view\",\"level\":\"hidden\"}" > /dev/null
S2=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/data)
[ "$S2" = "403" ]; check "سحب data.view ← فورًا 403 (كاش الصلاحيات اتلغى)" $?

# 5c) إرجاع view ← فورًا 200
curl -s -b /tmp/r57_jar.txt -X PUT http://localhost:3113/api/perms \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$R57_ID\",\"feature\":\"data.view\",\"level\":\"view\"}" > /dev/null
S3=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/data)
[ "$S3" = "200" ]; check "إرجاع data.view ← فورًا 200" $?

# 5d) ترقية الدور user←admin ← فورًا يقدر يجيب اليوزرز (كانت 403)
S4=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/users)
[ "$S4" = "403" ]; check "قبل الترقية: /api/users لـ TestR57 = 403 (user)" $?
curl -s -b /tmp/r57_jar.txt -X PUT http://localhost:3113/api/users \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$R57_ID\",\"role\":\"admin\"}" > /dev/null
S5=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/users)
[ "$S5" = "200" ]; check "ترقية الدور لـ admin ← فورًا 200 (كاش الدور اتلغى)" $?

# 5e) حذف اليوزر ← الجلسة بتتنفى فورًا
curl -s -b /tmp/r57_jar.txt -X DELETE "http://localhost:3113/api/users?id=$R57_ID" > /dev/null
S6=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/r57_jar2.txt http://localhost:3113/api/data)
[ "$S6" = "401" ]; check "حذف TestR57 ← فورًا 401 (كاش الدور اتلغى + اليوزر مش موجود)" $?

# ---------- 6) فريش DB فاضية: بوت كامل + بذر Amin + 810 موظف ----------
pkill -f "bun server.js" 2>/dev/null; sleep 2
rm -rf .next/standalone/db && mkdir -p .next/standalone/db
cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r57_fresh_server.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
sleep 1
curl -s -c /tmp/r57_jar3.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > /tmp/r57_fresh_login.json
grep -q '"role":"dev"' /tmp/r57_fresh_login.json
check "فريش DB: بذر Amin + دخول dev ناجح" $?
curl -s -b /tmp/r57_jar3.txt http://localhost:3113/api/health > /tmp/r57_fresh_health.json
python3 -c "
import json,sys
d=json.load(open('/tmp/r57_fresh_health.json'))
sys.exit(0 if d.get('employees')==810 and d.get('users')==1 and d.get('boot',{}).get('path')=='full' else 1)"
check "فريش DB: بذر الاتزان كامل (810 موظف) + boot=full" $?

# 6b) إعادة تشغيل الفريش ← fast (boot_ver اتكتب من البوت الكامل)
pkill -f "bun server.js" 2>/dev/null; sleep 2
cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r57_fresh2.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
sleep 1
curl -s -b /tmp/r57_jar3.txt http://localhost:3113/api/health > /tmp/r57_fresh2_health.json
python3 -c "
import json,sys
d=json.load(open('/tmp/r57_fresh2_health.json'))
sys.exit(0 if d.get('boot',{}).get('path')=='fast' and d.get('employees')==810 else 1)"
check "فريش DB بعد إعادة التشغيل: boot=fast + الداتا سليمة (810)" $?

# ---------- 7) UI smoke — defer + preload ما كسروش حاجة ----------
agent-browser open http://localhost:3113 2>/dev/null
sleep 3
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5
UI_OK=$(agent-browser eval "var s=document.getElementById('loginScreen'); s ? (s.classList.contains('on') ? 'STILL_LOGIN' : 'IN') : 'NO_SCREEN'" 2>/dev/null | tail -1 | tr -d '"')
echo "UI_LOGIN_STATE=$UI_OK"
[ "$UI_OK" = "IN" ]; check "UI: تسجيل الدخول والداشبورد اتفتحوا (مع defer)" $?
JS_ERRS=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
echo "JS_ERRORS_COUNT=$JS_ERRS"
[ "$JS_ERRS" = "0" ]; check "UI: صفر أخطاء JavaScript" $?
# xlsx preload: اللمسة على زرار الإكسل بتشغل التنزيل في الخلفية
agent-browser eval "var b=document.getElementById('dtExcel'); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); 'tapped'" 2>/dev/null
sleep 4
XLSX_OK=$(agent-browser eval "window.XLSX ? 'LOADED' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
echo "XLSX_PRELOAD=$XLSX_OK"
[ "$XLSX_OK" = "LOADED" ]; check "UI: pointerdown على زر الإكسل حمّل xlsx في الخلفية" $?
agent-browser screenshot scripts/e2e_r57/after_ui_dashboard.png 2>/dev/null

pkill -f "bun server.js" 2>/dev/null

# ---------- 8) ملخص التوقيتات ----------
echo ""
echo "=========== التوقيتات (PGlite محلي — على Neon الفارق أكبر برحلة الشبكة لكل استعلام) ==========="
echo "الإقلاع البارد (بوت كامل DDL): ${COLD_FULL_MS}ms ← بوابة boot_ver: ${COLD_FAST_MS}ms"
echo "الـ baseline: $(cat scripts/e2e_r57/base_steady.txt | tr '\n' ' ') ← بعد: $(cat scripts/e2e_r57/after_steady.txt | tr '\n' ' ')"
echo ""
echo "=========== النتيجة: PASS=$PASS FAIL=$FAIL ==========="
[ $FAIL -eq 0 ] && echo "E2E R57: كل الفحوصات نجحت" || { echo "E2E R57: فيه فشل — راجع فوق"; exit 1; }
