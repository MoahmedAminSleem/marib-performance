#!/bin/bash
# ============================================================
# R59 Baseline — لقطة سلوك HEAD قبل أي refactoring (أمر واحد)
# نفس منهجية R56: كل ردود API الثابتة + كل ملفات XLSX بالبايت.
# الردود اللي فيها طوابع زمنية (audit/users) بتتطبع للمقارنة.
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r59

# ---------- 1) البناء (HEAD الحالي) ----------
bun run build 2>&1 | tail -3
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

# ---------- 2) نفس قاعدة البيانات المزروعة ----------
pkill -f "bun server.js" 2>/dev/null
for i in $(seq 1 10); do curl -s -m 1 -o /dev/null http://localhost:3113/ 2>/dev/null || break; sleep 1; done
rm -rf .next/standalone/db && mkdir -p .next/standalone/db && cp -r scripts/e2e_r56/db_seeded/. .next/standalone/db/
cd .next/standalone && (NODE_ENV=production PORT=3113 bun server.js > /tmp/r59_base_server.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3113/ && break; done
sleep 1

# ---------- 3) الدخول + الردود الثابتة بالبايت ----------
B=scripts/e2e_r59
curl -s -c /tmp/r59_jar.txt -X POST http://localhost:3113/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > $B/base_auth.json
grep -q '"role":"dev"' $B/base_auth.json || { echo "LOGIN FAILED"; exit 1; }

curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/data" > $B/base_data.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/manpower" > $B/base_manpower.json
M=$(date +%Y-%m)
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/entries/absence?month=$M" > $B/base_absence.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/entries/overtime?month=$M" > $B/base_ot.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/entries/production?month=$M" > $B/base_prod.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/perms?me=1" > $B/base_perms.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/settings" > $B/base_settings.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/storage" > $B/base_storage.json
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/po" > $B/base_po.json

# health: طبع path (full/fast حسب الإقلاع) — الأرقام هي الثابتة
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/health" | python3 -c "
import json,sys
d=json.load(sys.stdin)
d.pop('boot',None)
json.dump(d,open('scripts/e2e_r59/base_health.json','w'),sort_keys=True,ensure_ascii=False)"

# audit + users: طبع الطوابع الزمنية وupdated_at — الباقي ثابت
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/audit" | python3 -c "
import json,sys
def norm(o):
    if isinstance(o,dict):
        return {k:('<TS>' if k=='at' else '<ID>' if k=='id' else norm(v)) for k,v in o.items()}
    if isinstance(o,list): return [norm(x) for x in o]
    return o
d=norm(json.load(sys.stdin))
json.dump(d,open('scripts/e2e_r59/base_audit.json','w'),sort_keys=True,ensure_ascii=False)"
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/users" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for u in d.get('users',[]): u['created']='<TS>'
json.dump(d,open('scripts/e2e_r59/base_users.json','w'),sort_keys=True,ensure_ascii=False)"

# ---------- 4) ملفات XLSX بالبايت ----------
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/manpower/export" -o $B/base_xlsx_ar.xlsx
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/manpower/export?lang=tr" -o $B/base_xlsx_tr.xlsx
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/manpower/export?template=1" -o $B/base_xlsx_tpl.xlsx
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/entries/absence?template=1" -o $B/base_xlsx_abs.xlsx
curl -s -b /tmp/r59_jar.txt "http://localhost:3113/api/po?template=1" -o $B/base_xlsx_po.xlsx

pkill -f "bun server.js" 2>/dev/null
echo "=== BASELINE CAPTURED ==="
ls -la $B/ | grep base_ | awk '{print $NF, $5}'
