#!/bin/bash
# ============================================================
# R56 BASELINE — لقطة السلوك الحالي قبل الـ refactoring
# المرجع اللي هنتقارن بيه بعد التعديل: نفس الـ XLSX بالظبط
# (محتوى XML متطابق) + نفس ردود الـ API.
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p db scripts/e2e_r56

# ---------- 1) بناء نظيف من الكود الحالي ----------
bun run build 2>&1 | tail -4
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

# ---------- 2) قاعدة بيانات نظيفة (أول boot = جداول + seed) ----------
rm -rf .next/standalone/db && mkdir -p .next/standalone/db
pkill -f "standalone/server.js" 2>/dev/null; sleep 1
cd .next/standalone && (NODE_ENV=production PORT=3111 bun server.js > /tmp/r56_baseline_server.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3111/api/health && break; done
echo "=== HEALTH ==="; curl -s http://localhost:3111/api/health; echo ""

# ---------- 3) تسجيل الدخول ----------
curl -s -c /tmp/r56_jar.txt -X POST http://localhost:3111/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > scripts/e2e_r56/base_auth.json
echo "=== AUTH ==="; head -c 150 scripts/e2e_r56/base_auth.json; echo ""

# ---------- 4) لقطات الـ API (لازم تتطابق بعد الـ refactoring) ----------
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/health" > scripts/e2e_r56/base_health.json
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/data" > scripts/e2e_r56/base_data.json
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/manpower" > scripts/e2e_r56/base_manpower.json
MONTH=$(date +%Y-%m)
echo "MONTH=$MONTH"
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/entries/absence?month=$MONTH" > scripts/e2e_r56/base_absence.json
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/entries/overtime?month=$MONTH" > scripts/e2e_r56/base_overtime.json
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/entries/production?month=$MONTH" > scripts/e2e_r56/base_production.json
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/perms?me=1" > scripts/e2e_r56/base_perms.json
wc -c scripts/e2e_r56/base_*.json

# ---------- 5) POST/DELETE round-trip على الغياب (شكل الرد بس — الـ id عشوائي) ----------
curl -s -b /tmp/r56_jar.txt -X POST http://localhost:3111/api/entries/absence \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"$MONTH-10\",\"emp_code\":\"NOEXIST\",\"emp_name\":\"\",\"reason\":\"baseline-test\"}" > scripts/e2e_r56/base_abs_post.json
echo "=== ABS POST ==="; cat scripts/e2e_r56/base_abs_post.json; echo ""
ABS_ID=$(python3 -c "import json;print(json.load(open('scripts/e2e_r56/base_abs_post.json')).get('id',''))" 2>/dev/null)
if [ -n "$ABS_ID" ]; then
  curl -s -b /tmp/r56_jar.txt -X DELETE "http://localhost:3111/api/entries/absence?id=$ABS_ID" > scripts/e2e_r56/base_abs_delete.json
  echo "=== ABS DELETE ==="; cat scripts/e2e_r56/base_abs_delete.json; echo ""
fi

# ---------- 6) التصدير الكامل + التيمبلت + التركي ----------
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/manpower/export" -o scripts/e2e_r56/base_export.xlsx
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/manpower/export?lang=tr" -o scripts/e2e_r56/base_export_tr.xlsx
curl -s -b /tmp/r56_jar.txt "http://localhost:3111/api/manpower/export?template=1" -o scripts/e2e_r56/base_template.xlsx
ls -la scripts/e2e_r56/*.xlsx

# ---------- 7) حفظ الـ db المزروعة (نفس المحتوى للاختبار بعد التعديل) ----------
pkill -f "standalone/server.js" 2>/dev/null; sleep 2
rm -rf scripts/e2e_r56/db_seeded && cp -r .next/standalone/db scripts/e2e_r56/db_seeded

# ---------- 8) فك الـ XLSX لمقارنة المحتوى (بدون metadata الوقت) ----------
python3 << 'PYEOF'
import zipfile, os
def snapshot(xlsx, outdir):
    os.makedirs(outdir, exist_ok=True)
    n = 0
    with zipfile.ZipFile(xlsx) as z:
        for name in z.namelist():
            if name.endswith('/') or 'docProps/' in name: continue  # docProps فيها توقيت الإنشاء
            data = z.read(name)
            open(os.path.join(outdir, name.replace('/', '__')), 'wb').write(data)
            n += 1
    return n

for xlsx, out in [("scripts/e2e_r56/base_export.xlsx", "scripts/e2e_r56/xml_export"),
                  ("scripts/e2e_r56/base_export_tr.xlsx", "scripts/e2e_r56/xml_export_tr"),
                  ("scripts/e2e_r56/base_template.xlsx", "scripts/e2e_r56/xml_template")]:
    if os.path.exists(xlsx) and os.path.getsize(xlsx) > 2000:
        print(xlsx, "->", snapshot(xlsx, out), "parts")
    else:
        print(xlsx, "MISSING/TINY!", os.path.getsize(xlsx) if os.path.exists(xlsx) else -1)
PYEOF

echo "=== BASELINE DONE ==="
