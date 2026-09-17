#!/bin/bash
# ============================================================
# R67 E2E — ملاحظات المالك الرابعة على خلفية الرئيسية:
# 1) البلور اللي كان جنب STING (RDD اتدهن بالـ inpaint) — اتحل
#    باسترجاع شريط صف البراندات كله من باكب ما قبل R66:
#    حدة RDD رجعت 633 مقابل 634 في الأصل (فحص حتمي)
# 2) STING كان أكبر من باقي البراندات — اتعاد رسمه بـ
#    cap=25 (زي ONLY 26 · RDD 25 · VOICE 25) بحدود حادة
#    من supersample ×2 (فحص ارتفاع الحروف 20-31)
# 3) الفاصل "|" بين STING و RDD — رجع من الباكب (R66 كان
#    شاله بالغلط مع لوجو SET — هو جزء من إيقاع الصف)
# 4) لون STING كان باهت — حبر مصمت RGB(6,5,4) α=255:
#    p10 = [0,1,5] زي RDD بالظبط (فحص p10 ≤ 30)
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

# ---------- R67-1: الماركب بنسخة r67 ----------
HTML=$(curl -s "$E2E_URL/")
echo "$HTML" | grep -q 'src="/app/logo.png?v=r67"'
check "الماركب: لوجو الرئيسية بالنسخة v=r67 (cache-bust)" $?
echo "$HTML" | grep -q 'src="/app/bg/home-denim.jpg?v=r67"'
check "الماركب: خلفية الدنيم بالنسخة v=r67 (الصورة المعدلة)" $?
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

# ---------- R67-2: الخلفية — الفحوصات البكسلية الحتمية الجديدة ----------
curl -s "$E2E_URL/app/bg/home-denim.jpg?v=r67" -o "$E2E_SCRATCH/bg_r67.jpg"
BGCHK=$(python3 - "$E2E_SCRATCH/bg_r67.jpg" <<'PYEOF'
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

# (ب) منطقة كلمة JACK&JONES الكبيرة القديمة (R66) — لسه دنيم نظيف
b = g[90:146, 520:912]
ok.append(("bigword", "CLEAN" if b.min() > 100 else "STILL_THERE"))

# (ج) STING موجود: حروف داكنة في السلوت (npx > 400)
c = g[218:258, 684:858]
ok.append(("sting", "OK" if int((c < 140).sum()) > 400 else "MISSING"))

# (د) STING = 5 حروف + الفواصل: تكتلات أعمدة داكنة متقطعة في صف البراندات
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
ok.append(("sting_letters", "OK" if len(cl) >= 3 else "BROKEN:%d" % len(cl)))

# (هـ) R67-جديد: الفاصل "|" بين STING و RDD رجع — عمود رأسي رفيع داكن
#     عند x≈836-843 (زي فواصل الصف عند 523 و 693 و 994)
bar = g[214:260, 836:843].astype(np.int16)
denim = int(np.median(g[214:260, 850:864]))
ok.append(("bar", "OK" if int(bar.min()) < denim - 8 else "MISSING"))

# (و) R67-جديد: STING بحجم الصف — وارتفاع تكتلات الحروف 20-31 بكسل
#     (النسخة القديمة الأكبر كانت بتدي ~33)
slot = g[220:254, 700:836].astype(np.int16)
bgm = int(np.median(slot))
mS = (slot < bgm - 18).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(mS, 8)
hts = [st[i, 3] for i in range(1, n) if st[i, 4] >= 25]
mh = float(np.median(hts)) if hts else 0
ok.append(("sting_size", "OK" if 20 <= mh <= 31 else "WRONG:%.0f" % mh))

# (ز) R67-جديد: حبر STING مصمت مش باهت — p10 للبكسلات الداكنة ≤ 30
#     (النسخة الباهة القديمة كانت p10 ≈ 90 · الجيران RDD/ONLY ≈ 2-9)
sel = np.asarray(im)[220:254, 700:836][mS > 0]
p10 = np.percentile(sel, 10, axis=0) if len(sel) else np.array([999] * 3)
ok.append(("sting_ink", "OK" if p10.max() <= 30 else "FADED:%s" % p10.round(0)))

# (ح) R67-جديد: البلور راح — حدة RDD (865-915) رجعت زي الأصل
#     (النسخة المدهونة كانت 372 · الأصل 634 · المطلوب ≥ 450)
lap = cv2.Laplacian(g[210:265, 864:915].astype(np.float64), cv2.CV_64F).var()
ok.append(("rdd_sharp", "OK" if lap >= 450 else "BLURRY:%.0f" % lap))

print(" | ".join("%s=%s" % t for t in ok))
for name, val in ok:
    assert val in ("CLEAN", "OK"), "FAILED: " + name
PYEOF
)
[ $? -eq 0 ] && echo "$BGCHK" | grep -q 'blackbox=CLEAN'
check "الخلفية: المربع الأسود القديم لسه نظيف (min>100)" $?
echo "$BGCHK" | grep -q 'bigword=CLEAN'
check "الخلفية: كلمة JACK&JONES الكبيرة لسه ممسوحة (min>100)" $?
echo "$BGCHK" | grep -q 'sting=OK'
check "الخلفية: لوجو STING ظاهر (حروف داكنة مطبوعة)" $?
echo "$BGCHK" | grep -q 'sting_letters=OK'
check "الخلفية: STING كامل (3+ تكتلات حروف)" $?
echo "$BGCHK" | grep -q 'bar=OK'
check "الخلفية: الفاصل «|» بين STING و RDD موجود" $?
echo "$BGCHK" | grep -q 'sting_size=OK'
check "الخلفية: STING بحجم الصف (ارتفاع الحروف 20-31px)" $?
echo "$BGCHK" | grep -q 'sting_ink=OK'
check "الخلفية: حبر STING مصمت (p10 ≤ 30 — مش باهت)" $?
echo "$BGCHK" | grep -q 'rdd_sharp=OK'
check "الخلفية: حدة البراند المجاور رجعت (Laplacian ≥ 450 — البلور راح)" $?

# ---------- R67-3: كروت الدنيم في الـ CSS (زي R65/R66 — ما اتلمستش) ----------
CSS=$(curl -s "$E2E_URL/app/app.css?v=r67")
echo "$CSS" | grep -q 'repeating-linear-gradient(58deg,rgba(255,255,255,.03) 0 2px'
check "CSS: قماش التوييل القطري في الكروت (نفس لغة الخلفية)" $?
echo "$CSS" | grep -q 'border:1.5px dashed rgba(238,224,186,.42)'
check "CSS: الخياطة الكريمية المتقطعة حوالين الكروت" $?
echo "$CSS" | grep -q 'position:absolute;top:30px;right:34px'
check "CSS: اللوجو زاوية ثابتة فوق يمين" $?
echo "$CSS" | grep -q 'height:96px'
check "CSS: اللوجو كبير (96px)" $?
# الخط الأصفر المتقطع تحت العنوان — لازم يفضل مشاله
echo "$CSS" | grep -q 'border-bottom:2px dashed rgba(217,168,107,.35)' && RC=1 || RC=0
[ "$RC" = "0" ]; check "CSS: الخط الأصفر المتقطع تحت العنوان لسه مشاله" $?

# ---------- R67-4: القاموس (زي R66 — ما اتلمسش) ----------
DICT=$(curl -s "$E2E_URL/app/i18n_dict.js?v=r67")
echo "$DICT" | grep -q 'هتشغّله' && RC=1 || RC=0
[ "$RC" = "0" ]; check "i18n: مفتاح mg_title لسه مشاله من القاموس" $?
echo "$DICT" | grep -q 'أهلًا بيك يا'
check "i18n: ترحيب بشري «أهلًا بيك يا» فاتل" $?

# ---------- R67-5: الواجهة في المتصفح ----------
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

# العنوان: مخفي افتراضيًا لحساب عنده صلاحيات (طلب المالك R66)
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
BG=$(agent-browser eval "var i=document.querySelector('.mgb-img'); i && i.complete && i.naturalWidth>0 && i.src.indexOf('v=r67')>=0 ? 'OK' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$BG" = "OK" ]; check "الواجهة: خلفية الدنيم المعدلة (v=r67) محمّلة وبتظهر" $?
CARDS=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.mg-card')).filter(function(c){return c.style.display!=='none'}).length" 2>/dev/null | tail -1 | tr -d '"')
[ "$CARDS" = "3" ]; check "الواجهة: الكروت الثلاثة ظاهرة (لوحة/اتزان/إدخال)" $?

# دخول عادي: الكروت بتودّي لأماكنها (نفس رحلة R65/R66 للتأكد مفيش كسر)
agent-browser eval "document.getElementById('mgEntry').click(); 'entry'" 2>/dev/null
sleep 2
ENT=$(agent-browser eval "document.querySelector('.ent-panel') ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ENT" = "OPEN" ]; check "الرحلة: كارت الإدخال بيفتح صفحة الإدخال" $?

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?

e2e_ui_smoke r67

e2e_stop_server
e2e_summary
