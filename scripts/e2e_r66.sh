#!/bin/bash
# ============================================================
# R66 E2E — ملاحظات المالك على الرئيسية (الجولة التصميمية الثالثة)
# 1) كلمة JACK&JONES الكبيرة اتشالت من الخلفية العلوية (كانت
#    مكررة — موجودة مرة في صف البراندات) — فحص بكسل حتمي
# 2) جملة «إيه اللي هتشغّله النهارده؟» + الخط الأصفر المتقطع
#    تحتها اتشالوا — العنوان مخفي افتراضيًا (بيظهر بس لحساب
#    من غير أي صلاحية كرسالة perm_none)
# 3) لوجو SET الغلط اتبدل بـ STING — البراند التركي (1985) —
#    بنفس أسلوب الصف: حروف داكنة مطبوعة على الدنيم
# ============================================================
set -x
source "$(dirname "$0")/e2e_lib.sh"
cd "$E2E_ROOT"
mkdir -p "$E2E_SCRATCH"

# ---------- البنية الثابتة ----------
e2e_typecheck
e2e_build
e2e_seed_db auto
e2e_start_server
e2e_login_admin
if [ -d "$E2E_SEED_R56/pglite" ]; then
  e2e_compare_core
else
  echo "⚠️ BOOTSTRAP MODE: audit + storage خارج المقارنة (موثق R61)"
  e2e_compare_core audit storage
fi
e2e_frontend_contract
e2e_functional_core

# sanity: الصلاحيات زي ما هي (14 مفتاح — ما اتلمستش الجولة دي)
FEATS=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/perms" | python3 -c "
import json,sys
print(len(json.load(sys.stdin).get('features',[]))==14)")
[ "$FEATS" = "True" ]; check "perms API: 14 مفتاح زي ما هي (مفيش تغيير سلوك)" $?

# ---------- R66-1: الماركب بنسخة r66 ----------
HTML=$(curl -s "$E2E_URL/")
echo "$HTML" | grep -q 'src="/app/logo.png?v=r66"'
check "الماركب: لوجو الرئيسية بالنسخة v=r66 (cache-bust)" $?
echo "$HTML" | grep -q 'src="/app/bg/home-denim.jpg?v=r66"'
check "الماركب: خلفية الدنيم بالنسخة v=r66 (الصورة المعدلة)" $?
# الترتيب: mg-brand لازم تيجي بعد modeGate وقبل mg-in (زي R65)
ORDER=$(echo "$HTML" | python3 -c "
import sys
h = sys.stdin.read()
i_gate, i_brand, i_in = h.find('id=\"modeGate\"'), h.find('class=\"mg-brand\"'), h.find('class=\"mg-in\"')
print('OK' if 0 <= i_gate < i_brand < i_in else 'NO')")
[ "$ORDER" = "OK" ]; check "الماركب: اللوجو زاوية على البوابة قبل المحتوى (فوق يمين)" $?
GATE_ICONS=$(echo "$HTML" | python3 -c "
import sys
h = sys.stdin.read()
gate = h[h.find('id=\"modeGate\"'):h.find('class=\"shell\"')]
print('CLEAN' if ('ic3d' not in gate and gate.count('<svg') >= 7) else 'DIRTY')")
[ "$GATE_ICONS" = "CLEAN" ]; check "الماركب: صفر ic3d في البوابة + 7+ أيقونة SVG سادة" $?

# ---------- R66-2: الخلفية — الكلمة الكبيرة راحت + STING موجود (بكسل حتمي) ----------
curl -s "$E2E_URL/app/bg/home-denim.jpg?v=r66" -o "$E2E_SCRATCH/bg_r66.jpg"
BGCHK=$(python3 - "$E2E_SCRATCH/bg_r66.jpg" <<'PYEOF'
import sys
from PIL import Image
import numpy as np
import cv2

im = Image.open(sys.argv[1]).convert("RGB")
g = np.asarray(im.convert("L"))
ok = []

# (أ) المربع الأسود القديم (R65) — لسه نظيف
a = g[324:388, 603:825]
ok.append(("blackbox", "CLEAN" if a.min() > 100 else "BLACKBOX"))

# (ب) منطقة كلمة JACK&JONES الكبيرة القديمة (اكتشاف R66:
#     الحروف كانت x=528-903 / y=94-140) — لازم تكون دنيم نظيف
b = g[90:146, 520:912]
ok.append(("bigword", "CLEAN" if b.min() > 100 else "STILL_THERE"))

# (ج) STING موجود: حروف داكنة في السلوت الجديد
c = g[218:258, 684:858]
ok.append(("sting", "OK" if int((c < 140).sum()) > 400 else "MISSING"))

# (د) STING = 5 حروف: تكتلات أعمدة داكنة متقطعة في صف البراندات
row = g[214:262, 660:880].astype(np.int16)
bg = int(np.median(row))
m = (row < bg - 20).astype(np.uint8)
cp = m.sum(axis=0)
on = cp > 1
cl, x = [], 0
while x < len(on):
    if on[x]:
        x2 = x
        while x2 < len(on) and on[x2]:
            x2 += 1
        cl.append((x, x2)); x = x2
    else:
        x += 1
ok.append(("sting_letters", "OK" if len(cl) >= 4 else "BROKEN:%d" % len(cl)))

print(" | ".join("%s=%s" % t for t in ok))
for name, val in ok:
    assert val in ("CLEAN", "OK"), "FAILED: " + name
PYEOF
)
[ $? -eq 0 ] && echo "$BGCHK" | grep -q 'blackbox=CLEAN'
check "الخلفية: المربع الأسود القديم لسه نظيف (min>100)" $?
echo "$BGCHK" | grep -q 'bigword=CLEAN'
check "الخلفية: كلمة JACK&JONES الكبيرة اتمسحت — دنيم نظيف (min>100)" $?
echo "$BGCHK" | grep -q 'sting=OK'
check "الخلفية: لوجو STING ظاهر (حروف داكنة مطبوعة)" $?
echo "$BGCHK" | grep -q 'sting_letters=OK'
check "الخلفية: STING كامل (4+ تكتلات حروف)" $?

# ---------- R66-3: كروت الدنيم في الـ CSS المتخدم (زي R65 — ما اتلمستش) ----------
CSS=$(curl -s "$E2E_URL/app/app.css?v=r66")
echo "$CSS" | grep -q 'repeating-linear-gradient(58deg,rgba(255,255,255,.03) 0 2px'
check "CSS: قماش التوييل القطري في الكروت (نفس لغة الخلفية)" $?
echo "$CSS" | grep -q 'border:1.5px dashed rgba(238,224,186,.42)'
check "CSS: الخياطة الكريمية المتقطعة حوالين الكروت" $?
echo "$CSS" | grep -q 'position:absolute;top:30px;right:34px'
check "CSS: اللوجو زاوية ثابتة فوق يمين" $?
echo "$CSS" | grep -q 'height:96px'
check "CSS: اللوجو كبير (96px)" $?
# الخط الأصفر المتقطع تحت العنوان — لازم يكون اتشال
echo "$CSS" | grep -q 'border-bottom:2px dashed rgba(217,168,107,.35)' && RC=1 || RC=0
[ "$RC" = "0" ]; check "CSS: الخط الأصفر المتقطع تحت العنوان اتشال" $?

# ---------- R66-4: القاموس — العنوان راح والترحيب فاتل ----------
DICT=$(curl -s "$E2E_URL/app/i18n_dict.js?v=r66")
echo "$DICT" | grep -q 'هتشغّله' && RC=1 || RC=0
[ "$RC" = "0" ]; check "i18n: مفتاح mg_title اتشال من القاموس" $?
echo "$DICT" | grep -q 'أهلًا بيك يا'
check "i18n: ترحيب بشري «أهلًا بيك يا» فاتل" $?

# ---------- R66-5: الواجهة في المتصفح ----------
agent-browser dialog dismiss 2>/dev/null || true
agent-browser close 2>/dev/null || true
sleep 1
agent-browser open "$E2E_URL" 2>/dev/null
sleep 3
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5
GATE=$(agent-browser eval "var g=document.getElementById('modeGate'); g && !g.hidden ? 'HOME' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$GATE" = "HOME" ]; check "الواجهة: تسجيل دخول جديد → الرئيسية ظاهرة" $?

# العنوان: مخفي افتراضيًا لحساب عنده صلاحيات (طلب المالك)
TT=$(agent-browser eval "var t=document.getElementById('mgTitle'); t ? (t.hidden ? 'HIDDEN' : 'SHOWN') : 'MISSING'" 2>/dev/null | tail -1 | tr -d '"')
[ "$TT" = "HIDDEN" ]; check "الواجهة: جملة «إيه اللي هتشغّله النهارده؟» مش ظاهرة (العنوان مخفي)" $?

# اللوجو: زاوية فوق يمين + كبير — بالقياسات الفعلية من المتصفح
LOGO_POS=$(agent-browser eval "
var b=document.querySelector('.mg-brand');
if(!b){'MISSING'}
else{
  var r=b.getBoundingClientRect(), w=window.innerWidth;
  var cs=getComputedStyle(b);
  (cs.position==='absolute' && r.right>w-260 && r.top<160 && r.top>=0) ? 'TOPRIGHT':'WRONG:'+cs.position
}" 2>/dev/null | tail -1 | tr -d '"')
[ "$LOGO_POS" = "TOPRIGHT" ]; check "الواجهة: اللوجو فوق يمين (absolute + الحافة اليمنى < 260px + top<160)" $?
LOGO_H=$(agent-browser eval "var l=document.querySelector('.mg-brand-logo'); l?Math.round(l.getBoundingClientRect().height):0" 2>/dev/null | tail -1 | tr -d '"')
[ "$LOGO_H" -ge 90 ]; check "الواجهة: اللوجو كبير فعليًا (height=${LOGO_H}px ≥ 90)" $?

# الترحيب البشري فاتل
HELLO=$(agent-browser eval "var h=document.getElementById('mgHello'); h && !h.hidden ? h.textContent : 'NO'" 2>/dev/null | tail -1)
echo "MG_HELLO: $HELLO"
echo "$HELLO" | grep -q "أهلًا بيك يا" && echo "$HELLO" | grep -q "Amin"
check "الواجهة: الترحيب البشري «أهلًا بيك يا Amin»" $?
BG=$(agent-browser eval "var i=document.querySelector('.mgb-img'); i && i.complete && i.naturalWidth>0 && i.src.indexOf('v=r66')>=0 ? 'OK' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$BG" = "OK" ]; check "الواجهة: خلفية الدنيم المعدلة (v=r66) محمّلة وبتظهر" $?
CARDS=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.mg-card')).filter(function(c){return c.style.display!=='none'}).length" 2>/dev/null | tail -1 | tr -d '"')
[ "$CARDS" = "3" ]; check "الواجهة: الكروت الثلاثة ظاهرة (لوحة/اتزان/إدخال)" $?

# دخول عادي: الكروت بتودّي لأماكنها (نفس رحلة R65 للتأكد مفيش كسر)
agent-browser eval "document.getElementById('mgEntry').click(); 'entry'" 2>/dev/null
sleep 2
ENT=$(agent-browser eval "document.querySelector('.ent-panel') ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ENT" = "OPEN" ]; check "الرحلة: كارت الإدخال بيفتح صفحة الإدخال" $?

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?

e2e_ui_smoke r66

e2e_stop_server
e2e_summary
