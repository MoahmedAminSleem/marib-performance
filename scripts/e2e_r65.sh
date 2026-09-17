#!/bin/bash
# ============================================================
# R65 E2E — تلميع الصفحة الرئيسية (4 طلبات المالك)
# 1) اللوجو كبير + فوق يمين — زاوية ثابتة على الشاشة (مش مع السكرول)
# 2) المربع الأسود اتشال من خلفية الدنيم — فحص بكسل حتمي على
#    الصورة المتخدمة نفسها (نفس إحداثيات الاكتشاف)
# 3) كروت بنفس أسلوب الخلفية: قماش دنيم + خياطة كريمية متقطعة
#    + رقعة كريمية للأيقونة — ولوجوهات سادة SVG بدل ic3d الباهتة
# 4) Humanize: كلام بشري (mg_title سؤال حي + ترحيب دافي) + حركة عضوية
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

# ---------- R65-1: الماركب — اللوجو فوق يمين + أيقونات SVG ----------
HTML=$(curl -s "$E2E_URL/")
echo "$HTML" | grep -q 'src="/app/logo.png?v=r65"'
check "الماركب: لوجو الرئيسية بالنسخة v=r65" $?
# الترتيب: mg-brand لازم تيجي بعد modeGate وقبل mg-in (زاوية على .mgate مش جوه السكرول)
ORDER=$(echo "$HTML" | python3 -c "
import sys
h = sys.stdin.read()
i_gate, i_brand, i_in = h.find('id=\"modeGate\"'), h.find('class=\"mg-brand\"'), h.find('class=\"mg-in\"')
print('OK' if 0 <= i_gate < i_brand < i_in else 'NO')")
[ "$ORDER" = "OK" ]; check "الماركب: اللوجو زاوية على البوابة قبل المحتوى (فوق يمين)" $?
# مفيش ic3d جوه البوابة خالص — كل الأيقونات SVG سادة
GATE_ICONS=$(echo "$HTML" | python3 -c "
import sys
h = sys.stdin.read()
gate = h[h.find('id=\"modeGate\"'):h.find('class=\"shell\"')]
print('CLEAN' if ('ic3d' not in gate and gate.count('<svg') >= 7) else 'DIRTY')")
[ "$GATE_ICONS" = "CLEAN" ]; check "الماركب: صفر ic3d في البوابة + 7+ أيقونة SVG سادة (كروت + زراير)" $?

# ---------- R65-2: الخلفية نظيفة — المربع الأسود اتمسح (بكسل حتمي) ----------
curl -s "$E2E_URL/app/bg/home-denim.jpg?v=r65" -o "$E2E_SCRATCH/bg_r65.jpg"
BGBOX=$(python3 - "$E2E_SCRATCH/bg_r65.jpg" <<'PYEOF'
import sys
from PIL import Image
import numpy as np
im = Image.open(sys.argv[1]).convert("L")
# المنطقة اللي كان فيها المربع الأسود (اكتشاف R65: x603-824 / y324-387)
a = np.asarray(im)[324:388, 603:825]
print("CLEAN" if a.min() > 100 else "BLACKBOX")
PYEOF
)
[ "$BGBOX" = "CLEAN" ]; check "الخلفية: منطقة المربع الأسود القديم فاضية نظيفة (min>100)" $?

# ---------- R65-3: كروت الدنيم في الـ CSS المتخدم ----------
CSS=$(curl -s "$E2E_URL/app/app.css?v=r65")
echo "$CSS" | grep -q 'repeating-linear-gradient(58deg,rgba(255,255,255,.03) 0 2px'
check "CSS: قماش التوييل القطري في الكروت (نفس لغة الخلفية)" $?
echo "$CSS" | grep -q 'border:1.5px dashed rgba(238,224,186,.42)'
check "CSS: الخياطة الكريمية المتقطعة حوالين الكروت" $?
echo "$CSS" | grep -q 'background:linear-gradient(172deg,#F4E9CF 0%,#E7D4A9 100%)'
check "CSS: رقعة الأيقونة الكريمية (زي رقعة البراند)" $?
echo "$CSS" | grep -q 'position:absolute;top:30px;right:34px'
check "CSS: اللوجو زاوية ثابتة فوق يمين" $?
echo "$CSS" | grep -q 'height:96px'
check "CSS: اللوجو كبير (96px)" $?

# ---------- R65-4: كلام بشري في القاموس المتخدم ----------
DICT=$(curl -s "$E2E_URL/app/i18n_dict.js?v=r65")
echo "$DICT" | grep -q 'هتشغّله النهارده'
check "i18n: عنوان حي «إيه اللي هتشغّله النهارده؟» (humanize)" $?
echo "$DICT" | grep -q 'أهلًا بيك يا'
check "i18n: ترحيب بشري «أهلًا بيك يا»" $?

# ---------- R65-5: الواجهة في المتصفح ----------
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

# الكروت: دنيم بالتوييل + الأيقونات SVG سادة
CARDS_CSS=$(agent-browser eval "
var c=document.querySelector('.mg-card');
c ? (getComputedStyle(c).backgroundImage.indexOf('repeating-linear-gradient')>=0 ? 'DENIM':'OTHER') : 'NONE'" 2>/dev/null | tail -1 | tr -d '"')
[ "$CARDS_CSS" = "DENIM" ]; check "الواجهة: الكروت قماش دنيم حقيقي (توييل) — مش زجاج" $?
NO_IC3D=$(agent-browser eval "document.querySelectorAll('#modeGate img.ic3d').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NO_IC3D" = "0" ]; check "الواجهة: صفر صور ic3d في الرئيسية" $?
SVGS=$(agent-browser eval "document.querySelectorAll('#modeGate .mg-ico svg').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$SVGS" = "3" ]; check "الواجهة: أيقونات الكروت الثلاثة SVG سادة" $?
PATCH=$(agent-browser eval "var i=document.querySelector('.mg-card .mg-ico'); i? (getComputedStyle(i).backgroundImage.indexOf('linear-gradient')>=0?'PATCH':'FLAT'):'NONE'" 2>/dev/null | tail -1 | tr -d '"')
[ "$PATCH" = "PATCH" ]; check "الواجهة: رقعة الأيقونة الكريمية شغالة" $?
HELLO=$(agent-browser eval "var h=document.getElementById('mgHello'); h && !h.hidden ? h.textContent : 'NO'" 2>/dev/null | tail -1)
echo "MG_HELLO: $HELLO"
echo "$HELLO" | grep -q "أهلًا بيك يا" && echo "$HELLO" | grep -q "Amin"
check "الواجهة: الترحيب البشري «أهلًا بيك يا Amin»" $?
BG=$(agent-browser eval "var i=document.querySelector('.mgb-img'); i && i.complete && i.naturalWidth>0 ? 'OK' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$BG" = "OK" ]; check "الواجهة: خلفية الدنيم النظيفة محمّلة وبتظهر" $?
CARDS=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.mg-card')).filter(function(c){return c.style.display!=='none'}).length" 2>/dev/null | tail -1 | tr -d '"')
[ "$CARDS" = "3" ]; check "الواجهة: الكروت الثلاثة ظاهرة (لوحة/اتزان/إدخال)" $?

# دخول عادي: الكروت بتودّي لأماكنها (نفس رحلة R64 للتأكد مفيش كسر)
agent-browser eval "document.getElementById('mgEntry').click(); 'entry'" 2>/dev/null
sleep 2
ENT=$(agent-browser eval "document.querySelector('.ent-panel') ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ENT" = "OPEN" ]; check "الرحلة: كارت الإدخال بيفتح صفحة الإدخال" $?

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?

e2e_ui_smoke r65

e2e_stop_server
e2e_summary
