#!/bin/bash
# ============================================================
# R68 E2E — واجهة تسجيل الأوفر تايم زي تسجيل الإنتاج (طلب المالك
# من المحادثة): 1) شريطا الخط/القسم بنفس شكل الإنتاج (R58)
# 2) التاريخ الافتراضي = امبارس (نفس منطق الإنتاج)
# 3) خانة الأشخاص الإضافيين: ناس مش مسجلين كود/اسم في الاتزان —
#    عدد + ساعاتهم، بتتضاف على المختارين بالاسم لكل قسم وخط
#    (السيرفر بيخزن صف إضافيين extra_count والعرض بيحسب:
#    الأشخاص = المسمّى + N · الساعات = Σ + N×H)
# + الحراس الدائمة من R65/R66/R67 (بكسل الخلفية + CSS + القاموس)
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

# ---------- R68-1: الماركب بنسخة r68 ----------
HTML=$(curl -s "$E2E_URL/")
echo "$HTML" | grep -q 'src="/app/logo.png?v=r68"'
check "الماركب: لوجو الرئيسية بالنسخة v=r68 (cache-bust)" $?
echo "$HTML" | grep -q 'src="/app/bg/home-denim.jpg?v=r68"'
check "الماركب: خلفية الدنيم بالنسخة v=r68 (cache-bust)" $?
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

# ---------- R68-2: الخلفية — الحراس البكسلية الدائمة (R65/R66/R67) ----------
curl -s "$E2E_URL/app/bg/home-denim.jpg?v=r68" -o "$E2E_SCRATCH/bg_r68.jpg"
BGCHK=$(python3 - "$E2E_SCRATCH/bg_r68.jpg" <<'PYEOF'
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

# (هـ) الفاصل "|" بين STING و RDD (R67) — عمود رأسي رفيع داكن
bar = g[214:260, 836:843].astype(np.int16)
denim = int(np.median(g[214:260, 850:864]))
ok.append(("bar", "OK" if int(bar.min()) < denim - 8 else "MISSING"))

# (و) STING بحجم الصف (R67) — وارتفاع تكتلات الحروف 20-31 بكسل
slot = g[220:254, 700:836].astype(np.int16)
bgm = int(np.median(slot))
mS = (slot < bgm - 18).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(mS, 8)
hts = [st[i, 3] for i in range(1, n) if st[i, 4] >= 25]
mh = float(np.median(hts)) if hts else 0
ok.append(("sting_size", "OK" if 20 <= mh <= 31 else "WRONG:%.0f" % mh))

# (ز) حبر STING مصمت (R67) — p10 للبكسلات الداكنة ≤ 30
sel = np.asarray(im)[220:254, 700:836][mS > 0]
p10 = np.percentile(sel, 10, axis=0) if len(sel) else np.array([999] * 3)
ok.append(("sting_ink", "OK" if p10.max() <= 30 else "FADED:%s" % p10.round(0)))

# (ح) حدة RDD (R67) — البلور ما رجعش
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

# ---------- R68-3: CSS — كروت الدنيم (R65) + الجديد بتاع R68 ----------
CSS=$(curl -s "$E2E_URL/app/app.css?v=r68")
echo "$CSS" | grep -q 'repeating-linear-gradient(58deg,rgba(255,255,255,.03) 0 2px'
check "CSS: قماش التوييل القطري في الكروت (نفس لغة الخلفية)" $?
echo "$CSS" | grep -q 'border:1.5px dashed rgba(238,224,186,.42)'
check "CSS: الخياطة الكريمية المتقطعة حوالين الكروت" $?
echo "$CSS" | grep -q 'position:absolute;top:30px;right:34px'
check "CSS: اللوجو زاوية ثابتة فوق يمين" $?
echo "$CSS" | grep -q 'height:96px'
check "CSS: اللوجو كبير (96px)" $?
echo "$CSS" | grep -q 'border-bottom:2px dashed rgba(217,168,107,.35)' && RC=1 || RC=0
[ "$RC" = "0" ]; check "CSS: الخط الأصفر المتقطع تحت العنوان لسه مشاله" $?
# الجديد R68: شريط الإجمالي + خانة الإضافيين + الثيم الفاتح
echo "$CSS" | grep -q '\.ent-ot-sum'
check "CSS R68: شريط إجمالي الأوفر تايم (.ent-ot-sum)" $?
echo "$CSS" | grep -q '\.ot-extra-form'
check "CSS R68: خانة الأشخاص الإضافيين في الفورم (.ot-extra-form)" $?
echo "$CSS" | grep -q 'tr\.ot-extra-row td'
check "CSS R68: صف الإضافيين في الجدول (tr.ot-extra-row)" $?
echo "$CSS" | grep -q 'html\[data-theme="light"\] \.ent-ot-sum'
check "CSS R68: الثيم الفاتح متقابل (درس R54)" $?

# ---------- R68-4: القاموس — القديم (R65/R66) + مفاتيح R68 ----------
DICT=$(curl -s "$E2E_URL/app/i18n_dict.js?v=r68")
echo "$DICT" | grep -q 'هتشغّله' && RC=1 || RC=0
[ "$RC" = "0" ]; check "i18n: مفتاح mg_title لسه مشاله من القاموس" $?
echo "$DICT" | grep -q 'أهلًا بيك يا'
check "i18n: ترحيب بشري «أهلًا بيك يا» فاتل" $?
echo "$DICT" | grep -q 'ent_ot_extra:'
check "i18n R68: مفتاح خانة الإضافيين (ent_ot_extra) فاتل" $?
echo "$DICT" | grep -q 'ent_ot_breakdown:'
check "i18n R68: مفتاح ملخص القسم والخط (ent_ot_breakdown) فاتل" $?
echo "$DICT" | grep -q 'ent_ot_bd_people:'
check "i18n R68: مفاتيح الحساب (ent_ot_bd_*) فاتلة" $?

# ---------- R68-5: الكود المخدم — الفورم الجديد موجود ----------
ENTRIES_JS=$(curl -s "$E2E_URL/app/app_entries.js?v=r68")
echo "$ENTRIES_JS" | grep -q 'efExtraCount'
check "JS R68: خانة عدد الإضافيين (efExtraCount) في الكود المخدم" $?
echo "$ENTRIES_JS" | grep -q 'entOtBreakdown'
check "JS R68: دالة ملخص القسم/الخط (entOtBreakdown) في الكود المخدم" $?
echo "$ENTRIES_JS" | grep -q 'entOtSum'
check "JS R68: شريط الإجمالي (entOtSum) في الكود المخدم" $?

# ---------- R68-6: الـ API — الإضافيين والحساب (الإثبات الفعلي) ----------
# (أ) حفظ إضافيين بس (من غير موظف) — كان بيرفض قبل كده (emp 400)
OT1=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-12","dept":"الصدر","line":"1","extra_count":4,"extra_hours":2}')
echo "$OT1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('ok') is True, 'not ok'
assert len(d.get('ids',[]))==1, 'expected 1 id, got %r' % d.get('ids')
assert d.get('extra_count')==4, 'extra_count wrong'"
check "API R68: حفظ إضافيين بس (بلا موظف) = صف واحد (كان 400 قبل كده)" $?

# (ب) حفظ مختلط: شخص بالاسم + إضافيين = صفين في معاملة واحدة
OT2=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-12","dept":"الصدر","line":"1","emp_code":"17001","hours":2.5,"extra_count":3,"extra_hours":1.5}')
echo "$OT2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('ok') is True, 'not ok'
assert len(d.get('ids',[]))==2, 'expected 2 ids (named+extra), got %r' % d.get('ids')
assert d.get('id'), 'backward-compat id missing'"
check "API R68: حفظ مختلط (شخص + إضافيين) = صفين + id متوافق للخلف" $?

# (ج) الحساب الصح: GET → الأشخاص = 1+4+3=8 · الساعات = 2.5+8+4.5=15
OTLIST=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$E2E_MONTH")
echo "$OTLIST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
es=d.get('entries',[])
named=[e for e in es if int(e.get('extra_count',0))==0]
extra=[e for e in es if int(e.get('extra_count',0))>0]
assert len(named)==1, 'named rows %d' % len(named)
assert len(extra)==2, 'extra rows %d' % len(extra)
ppl=sum(1 for e in named)+sum(int(e['extra_count']) for e in extra)
hrs=sum(float(e['hours']) for e in named)+sum(int(e['extra_count'])*float(e['hours']) for e in extra)
assert ppl==8, 'people %r != 8' % ppl
assert abs(hrs-15.0)<1e-6, 'hours %r != 15' % hrs
assert all(e.get('is_extra') for e in extra), 'is_extra flag missing'
assert all(e.get('emp_code')=='' for e in extra), 'extra rows must have no emp'"
check "API R68: الحساب — 8 أشخاص (1+4+3) · 15 ساعة (2.5+8+4.5) — «يتضافوا على المختارين بالاسم»" $?

# (د) التحقق: من غير موظف ومن غير إضافيين = 400
V1=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","hours":2}')
[ "$V1" = "400" ]; check "API R68: لا موظف ولا إضافيين = 400 (التحقق شغال)" $?
# (هـ) التحقق: إضافيين بساعات فاضية = 400
V2=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","extra_count":4,"extra_hours":0}')
[ "$V2" = "400" ]; check "API R68: إضافيين بساعات صفر = 400" $?
# (و) التحقق: عدد إضافيين مبالغ فيه = 400
V3=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","extra_count":999,"extra_hours":2}')
[ "$V3" = "400" ]; check "API R68: عدد إضافيين > 500 = 400 (سقف الحارس)" $?

# (ز) النظافة: كل صفوف الاختبار تتمسح — القاعدة ترجع زي ما كانت
CLEAN_IDS=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$E2E_MONTH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(' '.join(e['id'] for e in d.get('entries',[]) if e.get('date')=='2026-09-12'))")
for id in $CLEAN_IDS; do
  curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/overtime?id=$id"
done
OTLEFT=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$E2E_MONTH" | python3 -c "
import json,sys
print(len(json.load(sys.stdin).get('entries',[])))")
[ "$OTLEFT" = "0" ]; check "API R68: النظافة — صفوف الفحص اتمسحت (القاعدة زي ما كانت)" $?

# ---------- R68-7: الواجهة في المتصفح — رحلة الأوفر تايم كاملة ----------
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

TT=$(agent-browser eval "var t=document.getElementById('mgTitle'); t ? (t.hidden ? 'HIDDEN' : 'SHOWN') : 'MISSING'" 2>/dev/null | tail -1 | tr -d '"')
[ "$TT" = "HIDDEN" ]; check "الواجهة: جملة «إيه اللي هتشغّله النهارده؟» مش ظاهرة (العنوان مخفي)" $?
LOGO_POS=$(agent-browser eval "
var b=document.querySelector('.mg-brand');
if(!b){'MISSING'}
else{
  var r=b.getBoundingClientRect(), w=window.innerWidth;
  var cs=getComputedStyle(b);
  (cs.position==='absolute' && r.right>w-260 && r.top<160 && r.top>=0) ? 'TOPRIGHT':'WRONG:'+cs.position
}" 2>/dev/null | tail -1 | tr -d '"')
[ "$LOGO_POS" = "TOPRIGHT" ]; check "الواجهة: اللوجو فوق يمين (absolute)" $?
LOGO_H=$(agent-browser eval "var l=document.querySelector('.mg-brand-logo'); l?Math.round(l.getBoundingClientRect().height):0" 2>/dev/null | tail -1 | tr -d '"')
[ "$LOGO_H" -ge 90 ]; check "الواجهة: اللوجو كبير فعليًا (height=${LOGO_H}px ≥ 90)" $?
BG=$(agent-browser eval "var i=document.querySelector('.mgb-img'); i && i.complete && i.naturalWidth>0 && i.src.indexOf('v=r68')>=0 ? 'OK' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$BG" = "OK" ]; check "الواجهة: خلفية الدنيم (v=r68) محمّلة وبتظهر" $?
CARDS=$(agent-browser eval "Array.prototype.slice.call(document.querySelectorAll('.mg-card')).filter(function(c){return c.style.display!=='none'}).length" 2>/dev/null | tail -1 | tr -d '"')
[ "$CARDS" = "3" ]; check "الواجهة: الكروت الثلاثة ظاهرة (لوحة/اتزان/إدخال)" $?

# فتح صفحة الإدخال → تاب الأوفر تايم → زرار الإضافة → الفورم
agent-browser eval "document.getElementById('mgEntry').click(); 'entry'" 2>/dev/null
sleep 2
ENT=$(agent-browser eval "document.querySelector('.ent-panel') ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$ENT" = "OPEN" ]; check "الرحلة: كارت الإدخال بيفتح صفحة الإدخال" $?
agent-browser eval "var t=document.querySelector('.ent-tab[data-tab=overtime]'); t ? t.click() : 'NO_TAB'; 'tab'" 2>/dev/null
sleep 2
OTADD=$(agent-browser eval "document.getElementById('entOtAdd') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$OTADD" = "YES" ]; check "الرحلة R68: تاب الأوفر تايم بيفتح وزرار الإضافة موجود" $?
agent-browser eval "document.getElementById('entOtAdd').click(); 'add'" 2>/dev/null
sleep 1
FORM=$(agent-browser eval "document.querySelector('.ent-form-card') ? 'OPEN' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$FORM" = "OPEN" ]; check "الرحلة R68: فورم الأوفر تايم فتح" $?

# (1) التاريخ الافتراضي = امبارس (نفس منطق الإنتاج — R58)
YEST=$(agent-browser eval "(function(){var d=new Date(Date.now()-86400000);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+(d.getDate())).slice(-2)})()" 2>/dev/null | tail -1 | tr -d '"')
DATEV=$(agent-browser eval "document.getElementById('efDate').value" 2>/dev/null | tail -1 | tr -d '"')
[ "$DATEV" = "$YEST" ]; check "الفورم R68: التاريخ الافتراضي = امبارس (${DATEV})" $?

# (2) شريطا الخط والقسم — نفس شكل الإنتاج (5 أزرار لكل واحد)
NB=$(agent-browser eval "document.querySelectorAll('#efLineStrip .ent-strip-btn').length + 'x' + document.querySelectorAll('#efSecStrip .ent-strip-btn').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NB" = "5x5" ]; check "الفورم R68: شريط الخط (5) فوق + شريط القسم (5) تحت — زي الإنتاج" $?

# (3) خانة الأشخاص الإضافيين موجودة
XTRA=$(agent-browser eval "document.getElementById('efExtraCount') && document.getElementById('efExtraHours') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$XTRA" = "YES" ]; check "الفورم R68: خانة الأشخاص الإضافيين (عدد + ساعاتهم) موجودة" $?

# (4) رحلة حفظ إضافيين من غير موظف: قسم الصدر + خط 1 + عدد 2 × 3 ساعات
agent-browser eval "document.querySelector('#efSecStrip .ent-strip-btn[data-v=\"الصدر\"]').click(); 'sec'" 2>/dev/null
agent-browser eval "document.querySelector('#efLineStrip .ent-strip-btn[data-v=\"1\"]').click(); 'line'" 2>/dev/null
agent-browser eval "document.getElementById('efExtraCount').value='2'; document.getElementById('efExtraHours').value='3'; document.getElementById('efNote').value='e2e-r68-ui'; 'fill'" 2>/dev/null
agent-browser eval "document.querySelector('.ent-form-card .ent-form-save').click(); 'save'" 2>/dev/null
sleep 2
XROW=$(agent-browser eval "document.querySelector('tr.ot-extra-row') ? document.querySelector('tr.ot-extra-row').textContent : 'NONE'" 2>/dev/null | tail -1)
echo "$XROW" | grep -q "× 2"
check "الرحلة R68: صف الإضافيين ظهر في الجدول بالحساب المرئي (× 2)" $?
echo "$XROW" | grep -q "= 6"
check "الرحلة R68: إجمالي الصف ظاهر (3 × 2 = 6)" $?

# (5) شريط الإجمالي + ملخص القسم/الخط — «عشان يحسب صح»
SUM=$(agent-browser eval "document.getElementById('entOtSum') ? document.getElementById('entOtSum').textContent.replace(/\\s+/g,' ') : 'NONE'" 2>/dev/null | tail -1)
echo "$SUM" | grep -q "0" && echo "$SUM" | grep -q "2"
check "الرحلة R68: شريط الإجمالي — بالاسم 0 + إضافيين 2 = أشخاص 2" $?
echo "$SUM" | grep -q "6"
check "الرحلة R68: شريط الإجمالي — ساعات 6 (2 × 3)" $?
BD=$(agent-browser eval "document.getElementById('entOtBd') ? document.querySelector('#entOtBd tbody').textContent.replace(/\\s+/g,' ') : 'NONE'" 2>/dev/null | tail -1)
echo "$BD" | grep -q "الصدر" && echo "$BD" | grep -q "1"
check "الرحلة R68: ملخص القسم/الخط — الصدر · خط 1 ظاهر" $?

# (6) نظافة رحلة المتصفح: صف e2e-r68-ui يتحذف والملخص بيرجع يفرغ
BCLEAN=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$(date +%Y-%m)" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ids=[e['id'] for e in d.get('entries',[]) if e.get('note')=='e2e-r68-ui']
print(' '.join(ids))")
for id in $BCLEAN; do
  curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/overtime?id=$id"
done
OTLEFT2=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$(date +%Y-%m)" | python3 -c "
import json,sys
print(len(json.load(sys.stdin).get('entries',[])))")
[ "$OTLEFT2" = "0" ]; check "الرحلة R68: نظافة — صف رحلة المتصفح اتحذف" $?

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?

e2e_ui_smoke r68

e2e_stop_server
e2e_summary
