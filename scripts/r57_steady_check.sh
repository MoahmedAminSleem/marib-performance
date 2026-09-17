#!/bin/bash
# ============================================================
# R57 — فحص مركّز للحالة المستقرة (/api/data) بعد warm-up كامل
# الهدف: نثبت إن رقم 9.4ms في التشغيل الكامل كان أثر إحماء
# (السيرفر لسه شغال أول دقيقة + PGlite بقالها ثواني في الذاكرة)
# مش تراجع حقيقي من كاش الصلاحيات.
# المقارنة المنصفة: نفس القاعدة (db_seeded + رفع نفس الشهر)
# + إحماء 60 طلب + قياس 60 طلب.
# ============================================================
set -e
cd /home/z/my-project/marib-performance

pkill -f "bun server.js" 2>/dev/null || true
sleep 1

# نفس ظروف الـ E2E: قاعدة مزروعة + رفع شهر تجريبي
rm -rf .next/standalone/db && mkdir -p .next/standalone/db
cp -r scripts/e2e_r56/db_seeded/. .next/standalone/db/
cd .next/standalone && (NODE_ENV=production PORT=3116 bun server.js > /tmp/r57_steady.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 60); do sleep 1; curl -s -o /dev/null http://localhost:3116/ && break; done
sleep 1

curl -s -c /tmp/r57_sj.txt -X POST http://localhost:3116/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > /dev/null

# رفع نفس شهر الاختبار (عشان الاستجابة تكون بنفس الحجم زي الـ E2E)
curl -s -b /tmp/r57_sj.txt -X POST http://localhost:3116/api/data \
  -H 'Content-Type: application/json' \
  -d '{"month":"2026-08","files":["e2e-r57.xlsx"],"pack":{"dd":{"c":["Date","Line","Qty","Target"],"r":[["2026-08-01","L1",100,120],["2026-08-02","L2",150,140],["2026-08-03","L1",130,120]]},"ot":{"c":["Date","Line","Hours"],"r":[["2026-08-01","L1",8]]}}}' > /dev/null

echo "=== إحماء 60 طلب ==="
python3 - << 'PYEOF'
import subprocess, time
for _ in range(60):
    subprocess.run(["curl","-s","-b","/tmp/r57_sj.txt","-o","/dev/null",
                    "http://localhost:3116/api/data"], capture_output=True)
print("warmup done")
PYEOF

echo "=== قياس 60 طلب (بعد الإحماء) ==="
python3 - << 'PYEOF'
import subprocess, statistics
times = []
for _ in range(60):
    r = subprocess.run(["curl","-s","-b","/tmp/r57_sj.txt","-o","/dev/null",
                        "-w","%{time_total}","http://localhost:3116/api/data"],
                       capture_output=True, text=True)
    times.append(float(r.stdout.strip())*1000)
med = round(statistics.median(times),1); avg = round(statistics.mean(times),1)
p90 = round(sorted(times)[53],1); p99 = round(sorted(times)[59],1)
print(f"STEADY median={med}ms avg={avg}ms p90={p90}ms p99={p99}ms n=60")
print(f"الـ E2E الأول (بارد): baseline median=4.7/avg=5.4 ← after median=9.4/avg=11.4")
print(f"بعد إحماء كامل: median={med}ms avg={avg}ms")
PYEOF

pkill -f "bun server.js" 2>/dev/null || true
echo "STEADY CHECK DONE"
