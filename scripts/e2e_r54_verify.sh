#!/bin/bash
# ============================================================
# R54 E2E — الجزء الثاني: إعادة التحقق الكامل بعد قتل السيرفر
# القديم (اللي كان ماسك البورت ببناء قديم في الذاكرة).
# السيرفر الجديد شغال — ده اختبار المتصفح بس.
# ============================================================
set -x
cd /home/z/my-project/marib-performance

agent-browser open http://localhost:3111
sleep 3
# مسح الجلسة القديمة عشان نشوف شاشة الدخول
agent-browser eval "document.cookie.split(';').forEach(function(c){document.cookie=c.replace(/^ +/,'').replace(/=.*/,'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/')}); try{localStorage.clear();sessionStorage.clear()}catch(e){}; 'cleared'"
agent-browser eval "location.href='http://localhost:3111/?fresh=r54'; 'nav'"
sleep 4

echo "=== 1) شاشة الدخول: اللوجو + شكل الرقعة ==="
agent-browser eval "var i=document.getElementById('lgCoLogo'); i ? i.src+' loaded='+(i.complete&&i.naturalWidth>0) : 'NO IMG'"
agent-browser eval "var l=document.querySelector('.lg-leather .lg-label'); var r=l.getBoundingClientRect(); 'label='+Math.round(r.width)+'x'+Math.round(r.height)"
agent-browser screenshot scripts/e2e_r54/10_login.png

echo "=== 2) تسجيل الدخول + الثيم الفاتح ==="
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; document.querySelector('#loginScreen .lg-submit').click(); 'login'"
sleep 5
agent-browser eval "try{localStorage.setItem('marib_theme','light')}catch(e){}; location.reload(); 'reload'"
sleep 5
echo "=== theme ==="
agent-browser eval "document.documentElement.getAttribute('data-theme')"
echo "=== brand logo (المفروض logo.png LOADED) ==="
agent-browser eval "var i=document.getElementById('brandLogo'); i ? i.src+' loaded='+(i.complete&&i.naturalWidth>0)+' '+i.naturalWidth+'x'+i.naturalHeight : 'NO'"
echo "=== brand h1 color (المفروض فاتح) ==="
agent-browser eval "getComputedStyle(document.querySelector('.brand h1')).color"
agent-browser screenshot scripts/e2e_r54/11_dashboard_light.png

echo "=== 3) الاتزان في الفاتح ==="
agent-browser eval "var b=document.getElementById('btnSwap'); b ? (b.click(),'home') : 'NO btnSwap'"
sleep 2
agent-browser eval "var m=document.getElementById('mgMp'); m ? (m.click(),'mp open') : 'NO mgMp'"
sleep 4
echo "=== mp logo (المفروض img mp-logo LOADED) ==="
agent-browser eval "var i=document.querySelector('.mp-brand .mp-logo'); i ? i.src+' loaded='+(i.complete&&i.naturalWidth>0) : 'NO MP LOGO'"
echo "=== mp h2 color ==="
agent-browser eval "var h=document.querySelector('.mp-t h2'); h ? getComputedStyle(h).color : 'NO'"
agent-browser screenshot scripts/e2e_r54/12_mp_light.png

echo "=== 4) الثيم الغامق (denim) سليم؟ ==="
agent-browser eval "try{localStorage.setItem('marib_theme','denim')}catch(e){}; location.reload(); 'reload'"
sleep 5
agent-browser eval "var h=document.querySelector('.mp-t h2'); h ? getComputedStyle(h).color : 'NO H2 (mp not open?)'"
agent-browser screenshot scripts/e2e_r54/13_mp_denim.png

echo "=== 5) أخطاء JS ==="
agent-browser errors 2>/dev/null || echo "(بلا أداة errors — تجاهل)"

echo "=== 6) التحليل البكسلي ==="
python3 << 'PYEOF'
from PIL import Image
import os

def check(path, region, name, min_light_pct=0.1):
    if not os.path.exists(path):
        print(f"{name}: MISSING"); return False
    img = Image.open(path).convert("RGB")
    w, h = img.size
    x0, y0, x1, y1 = int(w*region[0]), int(h*region[1]), int(w*region[2]), int(h*region[3])
    light = total = 0
    for y in range(y0, min(y1, h)):
        for x in range(x0, min(x1, w)):
            r, g, b = img.getpixel((x, y))
            total += 1
            if r > 170 and g > 150 and b > 120: light += 1
    pct = 100.0 * light / max(1, total)
    print(f"{name}: light-px={light} ({pct:.2f}%) of {total}")
    return pct > min_light_pct

base = "scripts/e2e_r54/"
ok = {}
ok["login logo visible"]   = check(base+"10_login.png", (0.30, 0.15, 0.75, 0.55), "login leather label area", 0.02)
ok["light topbar title"]   = check(base+"11_dashboard_light.png", (0.0, 0.0, 1.0, 0.10), "light topbar", 0.5)
ok["light mp header"]      = check(base+"12_mp_light.png", (0.0, 0.0, 1.0, 0.13), "light mp header", 0.5)
ok["denim mp header"]      = check(base+"13_mp_denim.png", (0.0, 0.0, 1.0, 0.13), "denim mp header", 0.5)
allok = all(ok.values())
for k, v in ok.items(): print(f"  {k}: {'PASS' if v else 'FAIL'}")
print("OVERALL:", "ALL PASS" if allok else "SOME FAILED")
PYEOF
