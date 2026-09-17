#!/bin/bash
# ============================================================
# R56 E2E — refactoring بدون أي تغيير سلوك (أمر واحد متكامل)
# 1) يبني الكود الجديد
# 2) يشغله على نفس قاعدة البيانات اللي الـ baseline اشتغل عليها
# 3) يكرر نفس الطلبات بالظبط
# 4) يقارن: JSON متطابق + XLSX متطابق (محتوى XML بالبايت)
# 5) smoke test للواجهة (الداشبورد بتفتح من غير أخطاء)
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r56/after scripts/e2e_r56/xml_after
PASS=0; FAIL=0
check() { # $1 = الاسم، $2 = نتيجة المقارنة (0=نجح)
  if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "✅ PASS: $1";
  else FAIL=$((FAIL+1)); echo "❌ FAIL: $1"; fi
}

# ---------- 1) البناء ----------
bun run build 2>&1 | tail -4
[ ! -f .next/standalone/server.js ] && { echo "BUILD FAILED"; exit 1; }

# ---------- 2) نفس الـ db المزروعة بتاعة الـ baseline ----------
rm -rf .next/standalone/db && cp -r scripts/e2e_r56/db_seeded .next/standalone/db
pkill -f "standalone/server.js" 2>/dev/null; sleep 1
cd .next/standalone && (NODE_ENV=production PORT=3112 bun server.js > /tmp/r56_after_server.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 90); do sleep 1; curl -s -o /dev/null http://localhost:3112/api/health && break; done

# ---------- 3) نفس الطلبات بالظبط ----------
curl -s -c /tmp/r56_jar2.txt -X POST http://localhost:3112/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"Amin","password":"2872002","remember":true}' > scripts/e2e_r56/after_auth.json
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/health" > scripts/e2e_r56/after/health.json
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/data" > scripts/e2e_r56/after/data.json
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/manpower" > scripts/e2e_r56/after/manpower.json
MONTH=$(date +%Y-%m)
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/entries/absence?month=$MONTH" > scripts/e2e_r56/after/absence.json
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/entries/overtime?month=$MONTH" > scripts/e2e_r56/after/overtime.json
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/entries/production?month=$MONTH" > scripts/e2e_r56/after/production.json
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/perms?me=1" > scripts/e2e_r56/after/perms.json

# POST/DELETE round-trip (نفس الطلب بتاع الـ baseline)
curl -s -b /tmp/r56_jar2.txt -X POST http://localhost:3112/api/entries/absence \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"$MONTH-10\",\"emp_code\":\"NOEXIST\",\"emp_name\":\"\",\"reason\":\"baseline-test\"}" > scripts/e2e_r56/after_abs_post.json
ABS_ID=$(python3 -c "import json;print(json.load(open('scripts/e2e_r56/after_abs_post.json')).get('id',''))" 2>/dev/null)
[ -n "$ABS_ID" ] && curl -s -b /tmp/r56_jar2.txt -X DELETE "http://localhost:3112/api/entries/absence?id=$ABS_ID" > scripts/e2e_r56/after_abs_delete.json

# عينات إضافية: أوفر تايم + إنتاج POST/DELETE (مش موجودة في الbaseline —
# بس بنتأكد إن الشكل سليم والصلاحيات شغالة بعد النقل)
curl -s -b /tmp/r56_jar2.txt -X POST http://localhost:3112/api/entries/overtime \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"$MONTH-11\",\"emp_code\":\"NOEXIST\",\"emp_name\":\"\",\"dept\":\"الصدر\",\"line\":\"خط 1\",\"hours\":2}" > scripts/e2e_r56/after_ot_post.json
OT_ID=$(python3 -c "import json;print(json.load(open('scripts/e2e_r56/after_ot_post.json')).get('id',''))" 2>/dev/null)
[ -n "$OT_ID" ] && curl -s -b /tmp/r56_jar2.txt -X DELETE "http://localhost:3112/api/entries/overtime?id=$OT_ID" > /tmp/r56_ot_del.json
curl -s -b /tmp/r56_jar2.txt -X POST http://localhost:3112/api/entries/production \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"$MONTH-12\",\"dept\":\"التجميع\",\"line\":\"خط 2\",\"po_number\":\"PO-TEST\",\"qty\":100}" > scripts/e2e_r56/after_pr_post.json
PR_ID=$(python3 -c "import json;print(json.load(open('scripts/e2e_r56/after_pr_post.json')).get('id',''))" 2>/dev/null)
[ -n "$PR_ID" ] && curl -s -b /tmp/r56_jar2.txt -X DELETE "http://localhost:3112/api/entries/production?id=$PR_ID" > /tmp/r56_pr_del.json

# التصديرات
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/manpower/export" -o scripts/e2e_r56/after_export.xlsx
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/manpower/export?lang=tr" -o scripts/e2e_r56/after_export_tr.xlsx
curl -s -b /tmp/r56_jar2.txt "http://localhost:3112/api/manpower/export?template=1" -o scripts/e2e_r56/after_template.xlsx
ls -la scripts/e2e_r56/after_*.xlsx

# ---------- 4) المقارنات ----------
echo "=========== COMPARISON ==========="

# 4a) JSON المتطابقة (بايت ببايت)
for name in data manpower absence overtime production perms; do
  cmp -s "scripts/e2e_r56/base_${name}.json" "scripts/e2e_r56/after/${name}.json"
  check "GET /api/${name} JSON متطابقة بالبايت" $?
done

# 4b) health: نفس الأرقام + الحقل الجديد db
python3 << 'PYEOF'
import json, sys
base = json.load(open('scripts/e2e_r56/base_health.json'))
after = json.load(open('scripts/e2e_r56/after/health.json'))
ok = (
    base.get('users') == after.get('users') and
    base.get('months') == after.get('months') and
    base.get('employees') == after.get('employees') and
    after.get('db') in ('neon', 'pglite') and
    after.get('ok') is True
)
print("health base :", base)
print("health after:", after)
sys.exit(0 if ok else 1)
PYEOF
check "health: نفس الأرقام + الحقل الجديد db موجود" $?

# 4c) POST الغياب: نفس الشكل (id عشوائي فمقارنة الشكل مش البايت)
python3 << 'PYEOF'
import json, sys
b = json.load(open('scripts/e2e_r56/base_abs_post.json'))
a = json.load(open('scripts/e2e_r56/after_abs_post.json'))
ok = (b.get('ok') == a.get('ok') is True and b.get('matched') == a.get('matched') and 'id' in a)
bd = json.load(open('scripts/e2e_r56/base_abs_delete.json'))
ad = json.load(open('scripts/e2e_r56/after_abs_delete.json'))
ok = ok and bd == ad == {'ok': True}
sys.exit(0 if ok else 1)
PYEOF
check "absence POST/DELETE: نفس الشكل والنتيجة" $?

# 4d) أوفر تايم + إنتاج POST/DELETE
python3 << 'PYEOF'
import json, sys
ot = json.load(open('scripts/e2e_r56/after_ot_post.json'))
pr = json.load(open('scripts/e2e_r56/after_pr_post.json'))
ok = ot.get('ok') is True and ot.get('matched') is False and pr.get('ok') is True and 'id' in pr
sys.exit(0 if ok else 1)
PYEOF
check "overtime/production POST/DELETE round-trip سليم" $?

# 4e) XLSX: محتوى XML متطابق بالبايت (docProps فيها توقيت فبتتشال من المقارنة)
python3 << 'PYEOF'
import zipfile, os, filecmp, sys

def snapshot(xlsx, outdir):
    os.makedirs(outdir, exist_ok=True)
    n = 0
    with zipfile.ZipFile(xlsx) as z:
        for name in z.namelist():
            if name.endswith('/') or 'docProps/' in name: continue
            open(os.path.join(outdir, name.replace('/', '__')), 'wb').write(z.read(name))
            n += 1
    return n

fails = []
pairs = [
    ("base_export.xlsx", "after_export.xlsx", "التصدير الكامل (ar)"),
    ("base_export_tr.xlsx", "after_export_tr.xlsx", "التصدير الكامل (tr)"),
    ("base_template.xlsx", "after_template.xlsx", "التيمبلت"),
]
for base_f, after_f, label in pairs:
    bdir = f"scripts/e2e_r56/xml_cmp_b_{base_f}"
    adir = f"scripts/e2e_r56/xml_cmp_a_{after_f}"
    nb = snapshot(f"scripts/e2e_r56/{base_f}", bdir)
    na = snapshot(f"scripts/e2e_r56/{after_f}", adir)
    if nb == 0 or nb != na:
        fails.append(f"{label}: عدد الأجزاء مختلف ({nb} ≠ {na})")
        continue
    diff = [f for f in os.listdir(bdir) if not filecmp.cmp(os.path.join(bdir, f), os.path.join(adir, f), shallow=False)]
    if diff:
        fails.append(f"{label}: ملفات مختلفة → {diff}")
    else:
        print(f"✅ {label}: {nb} جزء XML متطابقين بالبايت")
sys.exit(1 if fails else 0)
PYEOF
check "XLSX: المحتوى متطابق بالبايت (تصدير/تيمبلت/تركي)" $?

# ---------- 5) UI smoke test — الداشبورد بتفتح من غير أخطاء ----------
agent-browser open http://localhost:3112 2>/dev/null
sleep 3
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5
# شاشة الدخول بتتقفل بـ CSS classes (on/bye) مش style.display —
# الخروج الناجح = كلاس on اتشال بعد أنيميشن bye
UI_OK=$(agent-browser eval "var s=document.getElementById('loginScreen'); s ? (s.classList.contains('on') ? 'STILL_LOGIN' : 'IN') : 'NO_SCREEN'" 2>/dev/null | tail -1 | tr -d '"')
echo "UI_LOGIN_STATE=$UI_OK"
[ "$UI_OK" = "IN" ] ; check "UI: تسجيل الدخول والدامشبورد اتفتحوا" $?
JS_ERRS=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
echo "JS_ERRORS_COUNT=$JS_ERRS"
[ "$JS_ERRS" = "0" ] ; check "UI: صفر أخطاء JavaScript" $?
agent-browser screenshot scripts/e2e_r56/after_ui_dashboard.png 2>/dev/null

pkill -f "standalone/server.js" 2>/dev/null
echo ""
echo "=========== النتيجة: PASS=$PASS FAIL=$FAIL ==========="
[ $FAIL -eq 0 ] && echo "E2E R56: كل الفحوصات نجحت" || { echo "E2E R56: فيه فشل — راجع فوق"; exit 1; }
