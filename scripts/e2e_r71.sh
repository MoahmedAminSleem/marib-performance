#!/bin/bash
# ============================================================
# R71 E2E — قناة مرفقات المالك: «اللينك هحتاج احدثه كل شوية».
# الجذر: قناة الشات بتسلّم اسم الملف بس من غير البايتس (اتثبت في
# R70-images) — وحل الـ share-link بيتجدد مع كل محادثة جديدة
# فالملك رفضه صراحة: عايز لينك ثابت من غير أي تحديث.
# الحل: قناة ثابتة جوه الأب نفسه — صفحة /up (سحب وإفلات + Ctrl+V
# + اختيار ملفات، والمفتاح بيتحفظ مرة واحدة في localStorage) +
# POST/GET /api/owner-uploads بيحفظ البايتس فعلًا على ديسك السيرفر
# في /home/z/my-project/uploads/ (خارج الريبو — مفيش تلوث git).
# الفحوص: 401 بدون مفتاح (GET+POST) · رفع PNG والبايتس على الديسك
# بنفس الحجم بالبايت · قائمة GET بتشوفه (إيصال للمالك) · الامتداد
# الممنوع بيرفض ومش بيوصل للديسك · الصفحة بتترندر في المتصفح
# والمفتاح من URL بيتحفظ · صفر أخطاء JS على /up.
# + كل رجرسون R70/R69 (full-bleed + التلات إصلاحات + R68 API) + الحراس.
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

# ---------- R69-1: الماركب بنسخة r69 ----------
HTML=$(curl -s "$E2E_URL/")
echo "$HTML" | grep -q 'src="/app/logo.png?v=r71"'
check "الماركب: لوجو الرئيسية بالنسخة v=r71 (cache-bust)" $?
echo "$HTML" | grep -q 'src="/app/bg/home-denim.jpg?v=r71"'
check "الماركب: خلفية الدنيم بالنسخة v=r71 (cache-bust)" $?

# ---------- R69-2: الخلفية — الحراس البكسلية الدائمة (R65/R66/R67) ----------
curl -s "$E2E_URL/app/bg/home-denim.jpg?v=r71" -o "$E2E_SCRATCH/bg_r71.jpg"
BGCHK=$(python3 - "$E2E_SCRATCH/bg_r71.jpg" <<'PYEOF'
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

# (د) STING = تكتلات أعمدة داكنة متقطعة في صف البراندات
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

# (هـ) الفاصل "|" بين STING و RDD (R67)
bar = g[214:260, 836:843].astype(np.int16)
denim = int(np.median(g[214:260, 850:864]))
ok.append(("bar", "OK" if int(bar.min()) < denim - 8 else "MISSING"))

# (و) STING بحجم الصف (R67)
slot = g[220:254, 700:836].astype(np.int16)
bgm = int(np.median(slot))
mS = (slot < bgm - 18).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(mS, 8)
hts = [st[i, 3] for i in range(1, n) if st[i, 4] >= 25]
mh = float(np.median(hts)) if hts else 0
ok.append(("sting_size", "OK" if 20 <= mh <= 31 else "WRONG:%.0f" % mh))

# (ز) حبر STING مصمت (R67)
sel = np.asarray(im)[220:254, 700:836][mS > 0]
p10 = np.percentile(sel, 10, axis=0) if len(sel) else np.array([999] * 3)
ok.append(("sting_ink", "OK" if p10.max() <= 30 else "FADED:%s" % p10.round(0)))

# (ح) حدة RDD (R67)
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
check "الخلفية: حدة RDD (Laplacian ≥ 450)" $?

# ---------- R69-3: CSS — الجديد بتاع R69 + الحراس ----------
CSS=$(curl -s "$E2E_URL/app/app.css?v=r71")
# (أ) إصلاح اختفاء الكلمة: الثيم الفاتح للـ .mh-box.on = كحلي + أبيض
echo "$CSS" | grep -q 'html\[data-theme="light"\] \.mh-box\.on'
check "CSS R69: الثيم الفاتح لصندوق اليومي/الأسبوعي/شهري موجود (.mh-box.on)" $?
NAVY=$(echo "$CSS" | python3 -c "
import sys,re
css = sys.stdin.read()
m = re.search(r'html\[data-theme=\"light\"\] \.mh-box\.on\{(.*?)\}', css, re.S)
blk = m.group(1) if m else ''
ok = 'color:#fff' in blk and '#2A4066' in blk and '#1D2E4C' in blk
print('NAVY' if ok else 'WRONG')")
[ "$NAVY" = "NAVY" ]; check "CSS R69: المربع المختار فاتح-الثيم = كحلي غامق + نص أبيض (مش كريمي على فاتح)" $?
# (ب) ارتفاعات بيت المدير: الاستثناء 3 أعمدة
echo "$CSS" | grep -q '#page-mhome \.grid-3{grid-template-columns:repeat(3,1fr)}'
check "CSS R69: بيت المدير 3 أعمدة في نطاق 1180-1350 (مصفوفة 3×2 بتملي الصفحة)" $?
# (ج) المربع الجديد للإضافيين: عنوان + تلميح جوه
echo "$CSS" | grep -q '\.ot-x-head'
check "CSS R69: عنوان مربع الإضافيين (.ot-x-head) موجود" $?
echo "$CSS" | grep -q '\.ot-x-hint'
check "CSS R69: تلميح الإضافيين جوه المربع (.ot-x-hint)" $?
echo "$CSS" | grep -q 'html\[data-theme="light"\] \.ot-x-hint'
check "CSS R69: الثيم الفاتح متقابل للمربع الجديد (درس R54)" $?
# حراس R65/R68 الدائمة (مختصرة)
echo "$CSS" | grep -q 'height:96px'
check "CSS: اللوجو كبير (96px) — حارس R65" $?
echo "$CSS" | grep -q '\.ent-ot-sum'
check "CSS: شريط إجمالي الأوفر تايم (.ent-ot-sum) — حارس R68" $?

# ---------- R69-4: القاموس — مفتاح العدد الجديد + الحراس ----------
DICT=$(curl -s "$E2E_URL/app/i18n_dict.js?v=r71")
echo "$DICT" | grep -q 'ent_ot_extra_count:'
check "i18n R69: مفتاح «العدد» القصير (ent_ot_extra_count) فاتل" $?
COUNT_AR=$(echo "$DICT" | grep -o 'ent_ot_extra_count: *{ *ar: *"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
[ "$COUNT_AR" = "العدد" ]; check "i18n R69: تسمية العدد = «العدد» (قصيرة — مش الجملة الطويلة)" $?
HRS_AR=$(echo "$DICT" | grep -o 'ent_ot_extra_hours: *{ *ar: *"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')
[ "$HRS_AR" = "ساعات الشخص" ]; check "i18n R69: تسمية الساعات = «ساعات الشخص» (كانت «ساعاتهم»)" $?
echo "$DICT" | grep -q 'ent_ot_extra_hint:'
check "i18n: تلميح الإضافيين لسه فاتل (حارس R68)" $?

# ---------- R70: CSS الغلاف full-bleed في الكود المخدم ----------
CSSV=$(curl -s "$E2E_URL/app/app.css?v=r71")
echo "$CSSV" | grep -q 'max-width:none;margin:0'
check "CSS R70: الغلاف بلا حد أقصى للعرض — بيملي الجنبين (كان 1620 + توسيط)" $?
echo "$CSSV" | grep -q 'height:100vh'
check "CSS R70: ارتفاع الغلاف = الشاشة كلها (كان 100vh-32 + 16px فوق وتحت)" $?
echo "$CSSV" | grep -q 'border:none;border-radius:0'
check "CSS R70: بلا إطار عائم — حواف الشاشة نفسها (كان بوردر + راديوس)" $?
echo "$CSSV" | grep -q 'min-height:100vh;margin-block:0'
check "CSS R70: الموبايل full-bleed كمان (كان 8px فوق وتحت)" $?

# ---------- R69-5: الكود المخدم — الدوال الجديدة ----------
PAGES_JS=$(curl -s "$E2E_URL/app/app_pages.js?v=r71")
echo "$PAGES_JS" | grep -q 'function mhChartH'
check "JS R69: دالة الارتفاع الديناميكي (mhChartH) في الكود المخدم" $?
echo "$PAGES_JS" | grep -q 'Math.max(240, Math.min(700, h))'
check "JS R70: سقف الارتفاع اترفع لـ 700 — الجرافات بتملي الشاشات الطويلة (كان 460)" $?
echo "$PAGES_JS" | grep -q 'seg.getBoundingClientRect().top'
check "JS R69: الارتفاع بيتحسب من موقع الشريط الفعلي (بيطرح الفلاتر فوقه)" $?
echo "$PAGES_JS" | grep -q 'addEventListener("resize"'
check "JS R69: إعادة رسم بيت المدير عند تغيير مقاس النافذة" $?
echo "$PAGES_JS" | grep -c 'height: mhChartH()' | grep -q '^6$'
check "JS R69: الجرافات الستة كلها بياخدو الارتفاع الديناميكي" $?
ENTRIES_JS=$(curl -s "$E2E_URL/app/app_entries.js?v=r71")
echo "$ENTRIES_JS" | grep -q 'ot-x-head'
check "JS R69: هيكل مربع الإضافيين الجديد (عنوان + خانتين + تلميح) في الكود المخدم" $?
echo "$ENTRIES_JS" | grep -q 'ot-x-fields'
check "JS R69: صف خانتي الإضافيين (.ot-x-fields)" $?
NOHANG=$(echo "$ENTRIES_JS" | python3 -c "
import sys
js = sys.stdin.read()
# التلميح لازم يكون جوه div.ot-extra-form (ot-x-hint موجود)
# والنمط القديم المعلق بره الحدود (ent-form-hint + مفتاح التلميح) مشاله
hx = js.find('ot-x-hint')
bad = \"'<p class=\\\"ent-form-hint\\\">' + esc(T(\\\"ent_ot_extra_hint\\\")\" in js
print('INSIDE' if hx > 0 and not bad else 'HANGING')")
[ "$NOHANG" = "INSIDE" ]; check "JS R69: التلميح بقى جوه مربع الإضافيين (مش معلق تحته)" $?

# ---------- R69-6: رجرسون R68 API — الحفظ المركب والحساب ----------
OT1=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-12","dept":"الصدر","line":"1","extra_count":4,"extra_hours":2}')
echo "$OT1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('ok') is True and len(d.get('ids',[]))==1 and d.get('extra_count')==4"
check "رجرسون R68: حفظ إضافيين بس = صف واحد" $?
OT2=$(curl -s -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-12","dept":"الصدر","line":"1","emp_code":"17001","hours":2.5,"extra_count":3,"extra_hours":1.5}')
echo "$OT2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('ok') is True and len(d.get('ids',[]))==2 and d.get('id')"
check "رجرسون R68: حفظ مختلط = صفين + id متوافق للخلف" $?
OTLIST=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$E2E_MONTH")
echo "$OTLIST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
es=d.get('entries',[])
named=[e for e in es if int(e.get('extra_count',0))==0]
extra=[e for e in es if int(e.get('extra_count',0))>0]
ppl=len(named)+sum(int(e['extra_count']) for e in extra)
hrs=sum(float(e['hours']) for e in named)+sum(int(e['extra_count'])*float(e['hours']) for e in extra)
assert ppl==8 and abs(hrs-15.0)<1e-6, 'people %r hours %r' % (ppl, hrs)"
check "رجرسون R68: الحساب — 8 أشخاص · 15 ساعة (زي ما كان)" $?
V1=$(curl -s -o /dev/null -w "%{http_code}" -b "$E2E_JAR" -X POST "$E2E_URL/api/entries/overtime" \
  -H 'Content-Type: application/json' -d '{"date":"2026-09-12","dept":"الصدر","line":"1","hours":2}')
[ "$V1" = "400" ]; check "رجرسون R68: لا موظف ولا إضافيين = 400" $?
# نظافة رجرسون API
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
[ "$OTLEFT" = "0" ]; check "رجرسون R68: النظافة — صفوف الفحص اتمسحت" $?

# ---------- R69-7: الواجهة في المتصفح — رحلة الإصلاحات الثلاثة ----------

# بذر بيانات شهر للوحة (dd + ot sheets — نفس مسار الرفع الطبيعي):
# بيت المدير محتاج داتا عشان زرار «تحليل الأداء» يدخل لوحة حقيقية
# (من غير داتا enterDash بيفتح شاشة «مفيش بيانات» — سلوك أصلي).
# القاعدة بتتبدل كل تشغيلة من النسخة النضيفة فمفيش أثر باقي.
SEED_OK=$(python3 - "$E2E_JAR" "$E2E_URL" <<'PYEOF'
import json, sys, urllib.request, random

jar_path, base = sys.argv[1], sys.argv[2]
# الكوكي من ملف curl مباشرة كـ Cookie header — سياسة cookiejar بتاعة
# python بتتحرج مع domain=localhost (قواعد النقط) فالبعث اليدوي أضمن.
# (curl نفسه بيتساهل مع secure+localhost — بس urllib لأ)
token = None
for line in open(jar_path):
    if "marib_sess" in line:
        token = line.rstrip("\n").split("\t")[-1]
if not token:
    print("NO_TOKEN")
    sys.exit(0)

def post(path, data):
    req = urllib.request.Request(base + path, data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Cookie": "marib_sess=" + token},
                                 method="POST")
    return json.load(urllib.request.urlopen(req))

random.seed(70)
DAYS_AR = ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]
dd_cols = ["date", "day", "client", "line", "section", "manager", "leader", "supervisor",
           "target", "regWorkers", "actWorkers", "regMin", "absent",
           "actualProd", "achv", "attWorkers", "minAvail", "sam",
           "minPiece", "prodEff", "minProd", "defects"]
dd, ot = [], []
for d in range(8, 17):
    date = "2026-09-%02d" % d
    for li, line in enumerate(["1", "2"]):
        for si, sec in enumerate(["الصدر", "الضهر"]):
            target = 1000 + li * 50
            reg, act = 30, 28
            prod = int(target * 0.9)
            minpiece = int(prod * 12.0)
            minprod = int(minpiece * 0.95)
            dd.append([date, DAYS_AR[(d + 1) % 7], "ONLY", line, sec,
                       "م. أحمد", "أ. محمود", "مشرف %s-%d" % (line, si + 1),
                       target, reg, act, act * 660, 2, prod, 0.9, 30,
                       act * 600, 12.0, minpiece, 0.95, minprod, 5])
        otw, otmin = 4, 480
        prod = 120
        ot.append([date, DAYS_AR[(d + 1) % 7], "ONLY", line, "الصدر",
                   "م. أحمد", "أ. محمود", "مشرف %s-1" % line,
                   0, None, None, None, None, prod, 0, otw, otmin,
                   12.0, prod * 12, 0, prod * 12, 0])

pack = {"dd": {"c": dd_cols, "r": dd}, "ot": {"c": dd_cols, "r": ot}}
r = post("/api/data", {"month": "2026-09", "files": ["e2e-r71-seed.xlsx"], "pack": pack})
print("OK" if r.get("ok") else "FAIL")
PYEOF
)
[ "$SEED_OK" = "OK" ]; check "الرحلة: بذر بيانات شهر للوحة (بيت المدير محتاج داتا)" $?

agent-browser dialog dismiss 2>/dev/null || true
agent-browser close 2>/dev/null || true
sleep 1
agent-browser open "$E2E_URL" 2>/dev/null
sleep 3
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'" 2>/dev/null
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'" 2>/dev/null
sleep 5

# تفعيل بيت المدير لـ Amin (dev-only) — زي ما بيحصل من الإعدادات
AUID=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/auth" | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['uid'])")
MHPUT=$(curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/settings" \
  -H 'Content-Type: application/json' \
  -d "{\"key\":\"mhome\",\"value\":{\"users\":[\"$AUID\"]}}")
echo "$MHPUT" | grep -q '"ok":true'
check "الرحلة: تفعيل بيت المدير لـ Amin (زي الإعدادات)" $?

# دخول لوحة التحليل → بيت المدير
agent-browser eval "location.reload(); 'r'" 2>/dev/null
sleep 6
agent-browser eval "var g=document.getElementById('modeGate'); if(g && !g.hidden){document.getElementById('mgDash').click(); 'gate'} else 'dash'" 2>/dev/null
sleep 3
MH=$(agent-browser eval "document.body.classList.contains('pg-mhome') ? 'MHOME' : 'NO:'+document.body.className" 2>/dev/null | tail -1 | tr -d '"')
[ "$MH" = "MHOME" ]; check "الرحلة 1: كارت «تحليل الأداء» بيفتح بيت المدير" $?

# (أ) التلات مربعات موجودة والكلمة ظاهرة في الوضع الداكن (الأصل)
SEG=$(agent-browser eval "document.querySelectorAll('#mhSeg .mh-box').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$SEG" = "3" ]; check "الرحلة 1: التلات مربعات (يومي/أسبوعي/شهري) موجودة" $?
DARKTXT=$(agent-browser eval "var b=document.querySelector('.mh-box.on'); var cs=getComputedStyle(b); cs.color" 2>/dev/null | tail -1 | tr -d '"')
[ "$DARKTXT" = "rgb(242, 235, 221)" ]; check "الرحلة 1: الداكن زي ما هو — نص المربع المختار كريمي (مفيش رجرسون)" $?

# (ب) الإصلاح: الثيم الفاتح — الكلمة كانت بتختفي (شكوى المالك)
agent-browser eval "localStorage.setItem('marib_theme','light'); location.reload(); 'lt'" 2>/dev/null
sleep 6
agent-browser eval "var g=document.getElementById('modeGate'); if(g && !g.hidden){document.getElementById('mgDash').click(); 'gate'} else 'dash'" 2>/dev/null
sleep 3
LT=$(agent-browser eval "
var b=document.querySelector('.mh-box.on');
var cs=getComputedStyle(b);
var navy = cs.backgroundImage.indexOf('42, 64, 102') >= 0 || cs.backgroundImage.indexOf('29, 46, 76') >= 0;
(cs.color==='rgb(255, 255, 255)' && navy) ? 'VISIBLE' : 'INVISIBLE:' + cs.color + '|' + cs.backgroundImage.slice(0,60)" 2>/dev/null | tail -1 | tr -d '"')
[ "$LT" = "VISIBLE" ]; check "الرحلة 2: الفاتح — كلمة المربع المختار ظاهرة (أبيض على كحلي — كانت بتختفي)" $?
LT2=$(agent-browser eval "
var b=document.querySelector('.mh-box:not(.on)');
var cs=getComputedStyle(b);
var light = cs.backgroundImage.indexOf('253, 254, 255') >= 0;
(cs.color==='rgb(31, 41, 55)' && light) ? 'VISIBLE' : 'OFF_INVISIBLE'" 2>/dev/null | tail -1 | tr -d '"')
[ "$LT2" = "VISIBLE" ]; check "الرحلة 2: الفاتح — المربعات غير المختارة: نص غامق على فاتح" $?

# (ج) الإصلاح: الجرافات بتملي الصفحة (شاشة كبيرة → ارتفاع ديناميكي)
agent-browser set viewport 1920 1080
sleep 1
agent-browser eval "window.dispatchEvent(new Event('resize')); 'r'" 2>/dev/null
sleep 2
SVGH=$(agent-browser eval "document.querySelector('#mhEff svg') ? parseInt(document.querySelector('#mhEff svg').getAttribute('height')) : 0" 2>/dev/null | tail -1 | tr -d '"')
[ "$SVGH" -ge 270 ]; check "الرحلة 1: 1080p — ارتفاع الجراف ${SVGH}px ≥ 270 (ديناميكي، كان ثابت 260)" $?
FITS=$(agent-browser eval "var c=document.querySelector('.content'); c.scrollHeight <= c.clientHeight + 4 ? 'FITS' : 'OVER'" 2>/dev/null | tail -1 | tr -d '"')
[ "$FITS" = "FITS" ]; check "الرحلة 1: 1080p — الصفحة بتملي المحتوى من غير سكرول زيادة" $?

# (ج2) R70: الغلاف full-bleed — الجنبين وفوق وتحت مفيش فراغ (شكوى اللقطة المخططة بالأحمر)
FILL=$(agent-browser eval "
var sh=document.querySelector('.shell'), r=sh.getBoundingClientRect();
var iw=window.innerWidth, ih=window.innerHeight;
var noH=document.documentElement.scrollWidth <= iw;
(Math.round(r.width)===iw && Math.round(r.height)===ih && Math.abs(r.left)<1 && Math.abs(r.top)<1 && noH)
  ? 'FULLBLEED' : 'GAP:'+Math.round(r.width)+'x'+Math.round(r.height)+'@'+Math.round(r.left)+','+Math.round(r.top)+' sw'+document.documentElement.scrollWidth+'/'+iw" 2>/dev/null | tail -1 | tr -d '"')
[ "$FILL" = "FULLBLEED" ]; check "الرحلة 1: 1920×1080 — الغلاف ماخد الشاشة كلها (مفيش فراغ جنب/فوق/تحت — كان 150px كل جنب + 16px فوق وتحت) — ${FILL}" $?
# الغلاف نفسه مانعه السكرول الأفقي (border:none بدل 1px)
NOHS=$(agent-browser eval "document.documentElement.scrollWidth > document.documentElement.clientWidth ? 'HSCROLL' : 'OK'" 2>/dev/null | tail -1 | tr -d '"')
[ "$NOHS" = "OK" ]; check "الرحلة 1: مفيش سكرول أفقي بعد التوسيع" $?

# (د) الإصلاح: البيت بيفضل 3 أعمدة على لابتوب 1280-1350
agent-browser set viewport 1300 800
sleep 1
agent-browser eval "window.dispatchEvent(new Event('resize')); 'r'" 2>/dev/null
sleep 2
COLS=$(agent-browser eval "getComputedStyle(document.querySelector('#page-mhome .grid-3')).gridTemplateColumns.split(' ').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$COLS" = "3" ]; check "الرحلة 1: 1300px — البيت لسه 3 أعمدة (كان بيتكسر 2 + كارت يتيم)" $?

# رجوع للثيم الداكن + مقاس واقعي قبل فورم الأوفر تايم
agent-browser eval "localStorage.setItem('marib_theme','denim'); location.reload(); 'r'" 2>/dev/null
sleep 6

# (هـ) الإصلاح: مربع الإضافيين — العنوان سطر واحد + التلميح جوه
agent-browser eval "AppEntries.open(); 'open'" 2>/dev/null
sleep 2
agent-browser eval "var t=document.querySelector('.ent-tab[data-tab=overtime]'); t ? t.click() : 'NO_TAB'; 'tab'" 2>/dev/null
sleep 2
agent-browser eval "document.getElementById('entOtAdd').click(); 'add'" 2>/dev/null
sleep 1
XHEAD=$(agent-browser eval "document.querySelector('.ent-form-card .ot-x-head b') ? 'YES' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$XHEAD" = "YES" ]; check "الرحلة 3: عنوان مربع الإضافيين موجود (سطر واحد فوق)" $?
HEADLINES=$(agent-browser eval "Math.round(document.querySelector('.ent-form-card .ot-x-head b').getBoundingClientRect().height / 17)" 2>/dev/null | tail -1 | tr -d '"')
[ "$HEADLINES" = "1" ]; check "الرحلة 3: العنوان في سطر واحد (كان بيتكسر 4 سطور)" $?
INSIDE=$(agent-browser eval "
var box=document.querySelector('.ent-form-card .ot-extra-form');
var hint=document.querySelector('.ent-form-card .ot-x-hint');
var br=box.getBoundingClientRect(), hr=hint.getBoundingClientRect();
(hr.top >= br.top && hr.bottom <= br.bottom) ? 'INSIDE' : 'HANGING'" 2>/dev/null | tail -1 | tr -d '"')
[ "$INSIDE" = "INSIDE" ]; check "الرحلة 3: التلميح جوه المربع (كان معلق تحته بره الحدود)" $?
CNTLBL=$(agent-browser eval "var l=document.querySelector('.ent-form-card .ot-x-fields label'); l ? l.textContent.trim() : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$CNTLBL" = "العدد" ]; check "الرحلة 3: تسمية قصيرة «العدد» (مش الجملة الطويلة)" $?

# (و) الحفظ من الفورم الجديد لسه شغال (رجرسون السلوك)
agent-browser eval "document.querySelector('#efSecStrip .ent-strip-btn[data-v=\"الصدر\"]').click(); 'sec'" 2>/dev/null
agent-browser eval "document.querySelector('#efLineStrip .ent-strip-btn[data-v=\"1\"]').click(); 'line'" 2>/dev/null
agent-browser eval "document.getElementById('efExtraCount').value='2'; document.getElementById('efExtraHours').value='3'; document.getElementById('efNote').value='e2e-r71-ui'; 'fill'" 2>/dev/null
agent-browser eval "document.querySelector('.ent-form-card .ent-form-save').click(); 'save'" 2>/dev/null
sleep 2
XROW=$(agent-browser eval "document.querySelector('tr.ot-extra-row') ? document.querySelector('tr.ot-extra-row').textContent : 'NONE'" 2>/dev/null | tail -1)
echo "$XROW" | grep -q "× 2"
check "الرحلة 3: حفظ من الفورم الجديد — صف الإضافيات بالحساب المرئي (× 2)" $?
echo "$XROW" | grep -q "= 6"
check "الرحلة 3: إجمالي الصف ظاهر (3 × 2 = 6)" $?

# نظافة رحلة المتصفح: صف e2e-r71-ui + قفل الإدخال + إزالة تفعيل البيت
BCLEAN=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$(date +%Y-%m)" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ids=[e['id'] for e in d.get('entries',[]) if e.get('note')=='e2e-r71-ui']
print(' '.join(ids))")
for id in $BCLEAN; do
  curl -s -o /dev/null -b "$E2E_JAR" -X DELETE "$E2E_URL/api/entries/overtime?id=$id"
done
OTLEFT2=$(curl -s -b "$E2E_JAR" "$E2E_URL/api/entries/overtime?month=$(date +%Y-%m)" | python3 -c "
import json,sys
print(len(json.load(sys.stdin).get('entries',[])))")
[ "$OTLEFT2" = "0" ]; check "الرحلة 3: نظافة — صف رحلة المتصفح اتحذف" $?
MHDEL=$(curl -s -b "$E2E_JAR" -X PUT "$E2E_URL/api/settings" \
  -H 'Content-Type: application/json' \
  -d '{"key":"mhome","value":{"users":[]}}')
echo "$MHDEL" | grep -q '"ok":true'
check "الرحلة: نظافة — تفعيل بيت المدير اتشال (القاعدة زي ما كانت)" $?
agent-browser set viewport 1280 577 2>/dev/null

# ---------- R71: قناة مرفقات المالك — صفحة /up + API الرفع ----------
UPCODE=$(curl -s -o /dev/null -w '%{http_code}' "$E2E_URL/up")
[ "$UPCODE" = "200" ]; check "R71: صفحة /up بتخدم (200 — كانت 404 قبل الجولة)" $?
UPHTML=$(curl -s "$E2E_URL/up")
echo "$UPHTML" | grep -q 'up-dropzone'
check "R71: منطقة السحب موجودة في الـ HTML (up-dropzone)" $?
echo "$UPHTML" | grep -q 'مرفقات'
check "R71: الصفحة بالعربي («مرفقات المالك»)" $?
# المفتاح: بدون مفتاح = 401 (GET و POST) — مش مفتوحة للناس
NOKEY1=$(curl -s -o /dev/null -w '%{http_code}' "$E2E_URL/api/owner-uploads")
[ "$NOKEY1" = "401" ]; check "R71: API بدون مفتاح = 401 (GET)" $?
printf '\x89PNG\r\n\x1a\n' > "$E2E_SCRATCH/up_test.png"
head -c 500 /dev/urandom >> "$E2E_SCRATCH/up_test.png"
UPSIZE=$(stat -c %s "$E2E_SCRATCH/up_test.png")
NOKEY2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$E2E_URL/api/owner-uploads" -F "file=@$E2E_SCRATCH/up_test.png")
[ "$NOKEY2" = "401" ]; check "R71: رفع بدون مفتاح = 401 (POST)" $?
# رفع صحيح: البايتس بتوصل فعلًا للديسك — مش اسم فاضي زي قناة الشات
UPPOST=$(curl -s -X POST "$E2E_URL/api/owner-uploads?k=2872002" -F "file=@$E2E_SCRATCH/up_test.png")
echo "$UPPOST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('ok') is True, d
assert len(d.get('saved',[]))==1 and d['saved'][0]['size']==$UPSIZE, d"
check "R71: رفع PNG بالمفتاح = ok + الحجم مظبوط ($UPSIZE بايت)" $?
UPNAME=$(echo "$UPPOST" | python3 -c "import json,sys; print(json.load(sys.stdin)['saved'][0]['name'])")
[ -f "/home/z/my-project/uploads/$UPNAME" ]
check "R71: الملف موجود فعلًا على ديسك السيرفر (uploads/)" $?
DISKSZ=$(stat -c %s "/home/z/my-project/uploads/$UPNAME" 2>/dev/null || echo 0)
[ "$DISKSZ" = "$UPSIZE" ]; check "R71: البايتس على الديسك = اللي اترفع (مش اسم فاضي — بايت-مع-بايت في الحجم)" $?
UPLIST=$(curl -s "$E2E_URL/api/owner-uploads?k=2872002")
echo "$UPLIST" | grep -q "$UPNAME"
check "R71: قائمة الملفات (GET) بتعرض الملف الجديد — إيصال مرئي للمالك" $?
# الامتداد الممنوع بيرفض والملف مش بيوصل للديسك خالص
printf 'MZbadfile' > "$E2E_SCRATCH/up_test.exe"
UPBAD=$(curl -s -X POST "$E2E_URL/api/owner-uploads?k=2872002" -F "file=@$E2E_SCRATCH/up_test.exe")
echo "$UPBAD" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d.get('ok') is False and len(d.get('saved',[]))==0 and d.get('errors'), d"
check "R71: الامتداد الممنوع (exe) بيرفض — ok:false + سبب واضح" $?
EXE_ON_DISK=$(ls /home/z/my-project/uploads/ 2>/dev/null | grep -c 'up_test\.exe' || true)
[ "$EXE_ON_DISK" = "0" ]; check "R71: الملف الممنوع مش على الديسك خالص" $?
# نظافة: ملف فحص الـ E2E يتشال — المجلد للمرفقات الحقيقية بس
rm -f "/home/z/my-project/uploads/$UPNAME"
[ ! -f "/home/z/my-project/uploads/$UPNAME" ]; check "R71: نظافة — ملف فحص الـ E2E اتمسح" $?
rm -f "$E2E_SCRATCH/up_test.png" "$E2E_SCRATCH/up_test.exe"

# R71: الصفحة في المتصفح الحقيقي — بتترندر والمفتاح من URL بيتحفظ
agent-browser dialog dismiss 2>/dev/null || true
agent-browser close 2>/dev/null || true
sleep 1
agent-browser open "$E2E_URL/up?k=2872002" 2>/dev/null
sleep 3
UPDOM=$(agent-browser eval "var d=document.getElementById('up-dropzone'); d ? (d.getBoundingClientRect().height > 40 ? 'RENDERED' : 'TINY') : 'MISSING'" 2>/dev/null | tail -1 | tr -d '"')
[ "$UPDOM" = "RENDERED" ]; check "R71: منطقة السحب بتترندر فعلًا في المتصفح (مرئية بمقاس)" $?
UPKEY=$(agent-browser eval "localStorage.getItem('marib-up-key')==='2872002' ? 'SAVED' : 'NO'" 2>/dev/null | tail -1 | tr -d '"')
[ "$UPKEY" = "SAVED" ]; check "R71: المفتاح من الـ URL اتحفظ في localStorage (مرة واحدة وبس)" $?
# رحلة الرفع الحقيقية من الصفحة نفسها (زي ما المالك بيستخدمها بالظبط):
# إنبوت الصفحة → إيصال «وصلت» → البايتس فعليًا على الديسك. درس الجولة:
# كائن File المحقون بيتسلسل فاضي في جسم fetch — الصفحة بتقرا البايتس
# وتبني ملف جديد قبل الإرسال (زي readGrid بتاع التيمبلتات).
rm -f /home/z/my-project/uploads/*favicon.png
agent-browser upload "input[type=file]" "$E2E_ROOT/public/favicon.png" 2>/dev/null
sleep 4
UPRES=$(agent-browser eval "var r=document.querySelector('.upx-res'); r && r.textContent.indexOf('وصلت')>=0 ? 'DELIVERED' : 'FAIL:'+(r ? r.textContent.slice(0,80) : 'none')" 2>/dev/null | tail -1 | tr -d '"')
[ "$UPRES" = "DELIVERED" ]; check "R71: رحلة المتصفح — رفع من الصفحة نفسها: إيصال «وصلت» ظاهر للمالك" $?
UPDISK=$(ls /home/z/my-project/uploads/ 2>/dev/null | grep -c 'favicon' || true)
[ "$UPDISK" = "1" ]; check "R71: رحلة المتصفح — الملف وصل الديسك فعليًا (favicon على السيرفر)" $?
UPDISKSZ=$(stat -c %s /home/z/my-project/uploads/*favicon.png 2>/dev/null || echo 0)
[ "$UPDISKSZ" = "2588" ]; check "R71: رحلة المتصفح — البايتس على الديسك بالحجم الصح (2588 بايت-مع-بايت)" $?
rm -f /home/z/my-project/uploads/*favicon.png
UPERRS=$(agent-browser errors 2>/dev/null | grep -c "Error" || true)
[ "$UPERRS" = "0" ]; check "R71: صفر أخطاء JavaScript على صفحة /up (بعد رحلة الرفع كاملة)" $?

# ---------- خريطة الكود: طازة ومتطابقة ----------
(cd "$E2E_ROOT" && bun scripts/code_map.mjs --check > /tmp/e2e_codemap.log 2>&1)
check "CODE-MAP طازة — متولدة من الكود الحالي (متطابقة بالبايت)" $?

e2e_ui_smoke r71

e2e_stop_server
e2e_summary
