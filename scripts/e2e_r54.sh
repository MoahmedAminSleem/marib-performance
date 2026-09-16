#!/bin/bash
# ============================================================
# R54 E2E — لوجو مأرب + إصلاح الوضع الفاتح (أمر واحد متكامل)
# يبني، يشغل السيرفر، يدخل، يلقط صور للثيمين، ويتحقق بكسليًا.
# ============================================================
set -x
cd /home/z/my-project/marib-performance
mkdir -p scripts/e2e_r54

# ---------- 1) البناء ----------
bun run build 2>&1 | tail -5
BUILD_OK=$?
[ $BUILD_OK -ne 0 ] && { echo "BUILD FAILED"; exit 1; }

# ---------- 2) نسخ الداتابيز للستاندالون + تشغيل السيرفر ----------
rm -rf .next/standalone/db && cp -r db .next/standalone/db
pkill -f "standalone/server.js" 2>/dev/null; sleep 1
cd .next/standalone && (NODE_ENV=production PORT=3111 bun server.js > /tmp/r54_server.log 2>&1 &)
cd /home/z/my-project/marib-performance
for i in $(seq 1 40); do sleep 1; curl -s -o /dev/null http://localhost:3111/api/health && break; done
curl -s http://localhost:3111/api/health
echo ""

# ---------- 3) شاشة الدخول — اللوجو على رقعة الجلد ----------
agent-browser open http://localhost:3111
sleep 3
echo "=== LOGIN LOGO SRC (المفروض logo.png) ==="
agent-browser eval "var i=document.getElementById('lgCoLogo'); i ? i.src : 'NO IMG'"
echo "=== LABEL SHAPE (المفروض عريضة 104x54 تقريبًا) ==="
agent-browser eval "var l=document.querySelector('.lg-leather .lg-label'); var r=l.getBoundingClientRect(); Math.round(r.width)+'x'+Math.round(r.height)"
agent-browser screenshot /home/z/my-project/marib-performance/scripts/e2e_r54/01_login_logo.png

# ---------- 4) تسجيل الدخول ----------
agent-browser eval "document.getElementById('lgUser').value='Amin'; document.getElementById('lgPass').value='2872002'; 'ok'"
agent-browser eval "document.querySelector('#loginScreen .lg-submit').click(); 'login'"
sleep 5

# ---------- 5) الداشبورد (denim) — اللوجو في التوب بار ----------
echo "=== BRAND LOGO SRC (المفروض logo.png) ==="
agent-browser eval "var i=document.getElementById('brandLogo'); i ? i.src : 'NO IMG'"
echo "=== BRAND LOGO LOADED (naturalWidth>0) ==="
agent-browser eval "var i=document.getElementById('brandLogo'); i ? (i.complete && i.naturalWidth>0 ? 'LOADED '+i.naturalWidth+'x'+i.naturalHeight : 'BROKEN') : 'NO'"
agent-browser screenshot /home/z/my-project/marib-performance/scripts/e2e_r54/02_dashboard_denim.png

# ---------- 6) الوضع الفاتح — التوب بار + عنوان الصفحة ----------
agent-browser eval "try{localStorage.setItem('marib_theme','light')}catch(e){}; location.reload(); 'reload'"
sleep 5
echo "=== THEME ATTR ==="
agent-browser eval "document.documentElement.getAttribute('data-theme')"
echo "=== BRAND H1 COLOR (المفروض فاتح 241,228,201) ==="
agent-browser eval "getComputedStyle(document.querySelector('.brand h1')).color"
echo "=== BRAND SMALL COLOR (المفروض فاتح 201,181,131) ==="
agent-browser eval "getComputedStyle(document.querySelector('.brand small')).color"
echo "=== PAGE TITLE COLOR ==="
agent-browser eval "getComputedStyle(document.getElementById('pageTitle')).color"
agent-browser screenshot /home/z/my-project/marib-performance/scripts/e2e_r54/03_dashboard_light_topbar.png

# ---------- 7) الاتزان في الوضع الفاتح — الهيدر + اللوجو ----------
agent-browser eval "var b=document.getElementById('btnSwap'); b ? (b.click(),'home') : 'NO btnSwap'"
sleep 2
agent-browser eval "var m=document.getElementById('mgMp'); m ? (m.click(),'mp open') : 'NO mgMp'"
sleep 4
echo "=== MP LOGO (المفروض img mp-logo logo.png) ==="
agent-browser eval "var i=document.querySelector('.mp-brand .mp-logo'); i ? i.src+' loaded='+(i.complete&&i.naturalWidth>0) : 'NO MP LOGO'"
echo "=== MP H2 COLOR (المفروض فاتح) ==="
agent-browser eval "var h=document.querySelector('.mp-t h2'); h ? getComputedStyle(h).color : 'NO H2'"
echo "=== MP SMALL COLOR ==="
agent-browser eval "var s=document.querySelector('.mp-t small'); s ? getComputedStyle(s).color : 'NO'"
echo "=== MP TAB COLOR (غير المختار) ==="
agent-browser eval "var t=document.getElementById('mpTabArch'); t ? getComputedStyle(t).color : 'NO'"
agent-browser screenshot /home/z/my-project/marib-performance/scripts/e2e_r54/04_mp_light_header.png

# ---------- 8) أخطاء الكونسول ----------
echo "=== JS ERRORS ==="
agent-browser errors 2>/dev/null || echo "(agent-browser errors غير متاح)"

# ---------- 9) التحليل البكسلي للقطات ----------
python3 << 'PYEOF'
from PIL import Image
import os

def contrast_check(path, region, name):
    """منطقة (x0,y0,x1,y1): في النص الفاتح لازم يكون فيه بكسلات فاتحة كتير"""
    if not os.path.exists(path):
        print(f"{name}: MISSING SCREENSHOT"); return False
    img = Image.open(path).convert("RGB")
    w, h = img.size
    x0, y0, x1, y1 = int(w*region[0]), int(h*region[1]), int(w*region[2]), int(h*region[3])
    light = dark = total = 0
    for y in range(y0, min(y1, h)):
        for x in range(x0, min(x1, w)):
            r, g, b = img.getpixel((x, y))
            total += 1
            if r > 170 and g > 150 and b > 120: light += 1
            elif r < 90 and g < 90 and b < 110: dark += 1
    pct = 100.0 * light / max(1, total)
    print(f"{name}: light-text px={light} ({pct:.1f}%) dark-bg px={dark} total={total}")
    return pct > 0.15

base = "/home/z/my-project/marib-performance/scripts/e2e_r54/"
# 03: التوب بار في الوضع الفاتح — منطقة العنوان (يمين الصورة في RTL)
ok1 = contrast_check(base+"03_dashboard_light_topbar.png", (0.0, 0.0, 1.0, 0.10), "LIGHT topbar title")
# 04: هيدر الاتزان في الوضع الفاتح
ok2 = contrast_check(base+"04_mp_light_header.png", (0.0, 0.0, 1.0, 0.12), "LIGHT mp header")
print("VERDICT topbar:", "PASS" if ok1 else "FAIL")
print("VERDICT mp:", "PASS" if ok2 else "FAIL")
PYEOF

echo "=== E2E R54 DONE ==="
