#!/bin/bash
# ============================================================
# R57 Baseline — لقطة الأداء والسلوك قبل أي تحسين (أمر واحد متكامل)
# 1) يبني كود HEAD الحالي
# 2) يشغله على نفس قاعدة db_seeded بتاعة R56
# 3) يلتقط: ردود JSON (للمقارنة بالبايت بعد التعديل) + التوقيتات
#    (زمن أول طلب بعد إعادة تشغيل السيرفر = الإقلاع البارد،
#     ومتوسط /api/data = الحالة المستقرة) + ترويسات الكاش
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r57
PASS=0; FAIL=0
check() {
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1"; fi
}

# ---------- 1) البناء (كود HEAD الحالي — قبل أي تعديل R57) ----------
bun run build 2>&1 | tail -3
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

# ---------- 2) نفس قاعدة البيانات المزروعة ----------
rm -rf .next/standalone/db && mkdir -p .next/standalone/db && cp -r scripts/e2e_r56/db_seeded/. .next/standalone/db/

start_server() {
  pkill -f "bun server.js" 2>/dev/null; sleep 1
  cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r57_base_server.log 2>&1 &)
  cd /home/z/my-project/marib-performance
  for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
}
start_server

# ---------- 3) القياسات ----------
# 3a) الإقلاع البارد: إعادة تشغيل السيرفر ثم أول طلب API (بيشغّل ensureBoot)
pkill -f "bun server.js" 2>/dev/null; sleep 1
cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r57_base_server2.log 2>&1 &)
cd /home/z/my-project/marib-performance
sleep 2
COLD_MS=$(curl -s -o /dev/null -w "%{time_total}" http://localhost:3113/api/health | python3 -c "import sys;print(round(float(sys.stdin.read().strip())*1000))")
echo "COLD_FIRST_REQUEST_MS=$COLD_MS"
echo "$COLD_MS" > scripts/e2e_r57/base_cold_ms.txt

# 3b) الدخول + الردود (نفس ترتيب R56 عشان المقارنة بالبايت)
curl -s -c /tmp/r57_jar.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > scripts/e2e_r57/base_auth.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/health" > scripts/e2e_r57/base_health.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/data" > scripts/e2e_r57/base_data.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/manpower" > scripts/e2e_r57/base_manpower.json
MONTH=$(date +%Y-%m)
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/entries/absence?month=$MONTH" > scripts/e2e_r57/base_absence.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/entries/overtime?month=$MONTH" > scripts/e2e_r57/base_overtime.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/entries/production?month=$MONTH" > scripts/e2e_r57/base_production.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/perms?me=1" > scripts/e2e_r57/base_perms.json

# 3b-2) رفع شهر تجريبي — يغطي مسار lastSync (آخر رفع لكل شهر)
#       في رد /api/data (db_seeded من غير أي شهر — المسار كان هيتفلت)
curl -s -b /tmp/r57_jar.txt -X POST http://localhost:3113/api/data \
  -H 'Content-Type: application/json' \
  -d '{"month":"2026-08","files":["e2e-r57.xlsx"],"pack":{"dd":{"c":["Date","Line","Qty","Target"],"r":[["2026-08-01","L1",100,120],["2026-08-02","L2",150,140],["2026-08-03","L1",130,120]]},"ot":{"c":["Date","Line","Hours"],"r":[["2026-08-01","L1",8]]}}}' > scripts/e2e_r57/base_data_post.json
cat scripts/e2e_r57/base_data_post.json
curl -s -b /tmp/r57_jar.txt "http://localhost:3113/api/data" > scripts/e2e_r57/base_data.json
echo "data after month upload: $(wc -c < scripts/e2e_r57/base_data.json) bytes"

# 3c) الحالة المستقرة: متوسط زمن /api/data على 20 طلب
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
open("scripts/e2e_r57/base_steady.txt", "w").write(f"median={med}\navg={avg}\n")
PYEOF

# 3d) ترويسات الكاش الحالية للأصول الثابتة (المتوقع: مفيش immutable)
curl -s -D - -o /dev/null "http://localhost:3113/app/app_core.js?v=r55" | grep -i "cache-control\|etag" > scripts/e2e_r57/base_headers_appcore.txt
echo "--- headers قبل ---"; cat scripts/e2e_r57/base_headers_appcore.txt
if grep -qi "immutable" scripts/e2e_r57/base_headers_appcore.txt; then IM="1"; else IM="0"; fi
[ "$IM" = "0" ]
check "قبل: /app/*.js من غير immutable (الواقع الحالي)" $?

# 3e) الـ HTML الحالي: مفيش defer (الواقع الحالي)
curl -s http://localhost:3113/ > scripts/e2e_r57/base_index.html
[ "$(grep -c 'defer' scripts/e2e_r57/base_index.html)" = "0" ]
check "قبل: السكريبتات من غير defer (الواقع الحالي)" $?

pkill -f "bun server.js" 2>/dev/null
echo ""
echo "=========== Baseline جاهز: PASS=$PASS FAIL=$FAIL ==========="
[ -s scripts/e2e_r57/base_data.json ]
check "base_data.json اتسجل ($(wc -c < scripts/e2e_r57/base_data.json) بايت)" $?
ls -la scripts/e2e_r57/base_*.json scripts/e2e_r57/base_cold_ms.txt | head -12
exit $FAIL
