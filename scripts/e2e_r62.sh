#!/bin/bash
# ============================================================
# R62 E2E — Logging & Observability (على مكتبة R61 المشتركة)
# الجولة بتضيف: قياس كل استعلام (عدد/زمن/بطيء/فاشل) + عدادات
# أخطاء 5xx + stats حية في /api/health — وبتثبت:
#   1) صفر تغيير سلوك: نفس 13 JSON + 5 XLSX بالبايت (stats بتتشال
#      من health في الالتقاط — معدّة من R61)
#   2) stats موجودة وشكلها سليم (uptime/q/mem/node)
#   3) العدادات حية: q.count بيزيد مع النداءات
#   4) الـ sinks: ملف logs/marib.log + stdout الاتنين سطور JSON منظمة
# ============================================================
set -x
source "$(dirname "$0")/e2e_lib.sh"
cd "$E2E_ROOT"
mkdir -p "$E2E_SCRATCH"

# ---------- البنية الثابتة ----------
e2e_typecheck
e2e_build
e2e_seed_db r56
# اللوج القديم بيتشال عشان فحص الـ file sink يكون على تشغيلة دي بالذات
rm -f "$E2E_ROOT/.next/standalone/logs/marib.log" "$E2E_ROOT/.next/standalone/logs/marib.log.1"
e2e_start_server
e2e_login_admin
e2e_compare_core
e2e_frontend_contract
e2e_functional_core
e2e_ui_smoke r62

# ---------- فحوصات R62 الخاصة: المراقبة نفسها ----------
# 1) stats موجود وشكله سليم (كل الخانات + أنواعها)
curl -s -b "$E2E_JAR" "$E2E_URL/api/health" | python3 -c "
import json,sys
d=json.load(sys.stdin)
s=d.get('stats')
assert s, 'stats missing'
assert isinstance(s['uptime_s'], int) and s['uptime_s'] >= 0
q=s['q']
assert q['count'] > 0 and q['ms_total'] >= 0 and q['slow'] >= 0 and q['errors'] >= 0
assert isinstance(s['srv_errors'], int) and s['srv_errors'] >= 0
assert s['mem']['rss_mb'] > 0
assert s['node'].startswith('v')
assert 'boot' in d and 'db' in d and d['ok'] is True
print('STATS OK')"
check "stats في /api/health: uptime + q(count/slow/ms/errors) + srv_errors + mem + node كلهم سليمة" $?

# 2) العداد حي: بيزيد مع النداءات (manpower بيشغّل شوية استعلامات)
Q1=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/health" | python3 -c "import json,sys;print(json.load(sys.stdin)['stats']['q']['count'])")
curl -s -b "$E2E_JAR" "$E2E_URL/api/manpower" > /dev/null
curl -s -b "$E2E_JAR" "$E2E_URL/api/manpower" > /dev/null
Q2=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/health" | python3 -c "import json,sys;print(json.load(sys.stdin)['stats']['q']['count'])")
echo "Q_COUNT: $Q1 → $Q2"
[ "$Q2" -gt "$Q1" ]; check "stats.q.count حي — زاد بعد نداءين manpower ($Q1 → $Q2)" $?

# 3) الـ file sink: logs/marib.log اتكتب في التشغيلة دي بسطور JSON منظمة
[ -f "$E2E_ROOT/.next/standalone/logs/marib.log" ]
check "الـ file sink: logs/marib.log موجود" $?
grep -q '"mod":"health"' "$E2E_ROOT/.next/standalone/logs/marib.log"
check "الـ file sink: فيه سطر health JSON منظّم (t/lvl/mod/msg)" $?
python3 - "$E2E_ROOT/.next/standalone/logs/marib.log" << 'PYL'
import json,sys
ok=0
with open(sys.argv[1]) as f:
    for line in f:
        line=line.strip()
        if not line: continue
        d=json.loads(line)          # أي سطر مش JSON = فشل
        assert 't' in d and 'lvl' in d and 'mod' in d and 'msg' in d
        ok+=1
assert ok >= 5, 'not enough log lines'
print('LOG LINES OK:', ok)
PYL
check "الـ file sink: كل السطور JSON سليمة فيها t/lvl/mod/msg (≥5)" $?

# 4) الـ stdout sink: نفس السطور في لوج السيرفر (Vercel بيشوف ده)
grep -q '"mod":"health"' "$E2E_SERVER_LOG"
check "الـ stdout sink: لوج السيرفر فيه سطور JSON منظّمة" $?

# 5) slow-query: قاعدة القياس موجودة (عتبة 250ms في الكود)
grep -q "SLOW_MS = 250" "$E2E_ROOT/src/lib/marib/db.ts"
check "slow-query: العتبة (250ms) والقياس موجودين في db.ts" $?

e2e_stop_server
e2e_summary
