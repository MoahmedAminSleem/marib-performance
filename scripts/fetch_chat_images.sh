#!/bin/bash
# ============================================================
# fetch_chat_images.sh — بيجيب كل صور محادثة z.ai من رابط
# المشاركة ويحملها على الديسك.
#
# الاستعمال:
#   bash scripts/fetch_chat_images.sh <share_url> [outdir]
#
# المبدأ (اتحدد بالتجربة في R70):
# - صور الـ IM بتتخزن على CDN موقّع:
#   https://z-cdn-media.chatglm.cn/files/{uuid}.png?auth_key=...
# - auth_key بيتولد fresh مع كل تحميل لصفحة المحادثة — فلازم
#   الصفحة تتفتح الأول والـ URLs تتسحب من الـ DOM بعدها فورًا.
# - التحميل المباشر بـ curl شغال (مفيش كوكيز مطلوبة).
# - الـ imgs ممكن تكون lazy-load فبنسكرب الحاوية لتحت الأول.
# - دروس أول تشغيلتين: sleep 1 بين close و open (سباق about:blank)
#   + استخراج الـ URLs بـ JSON.stringify → python (مش sed)
#   + --timeout بيجي بعد الأمر مش قبله (قبلها = Unknown command
#   والأمر بيفشل بصمت → about:blank).
# ============================================================
set -o pipefail

URL="${1:?Usage: fetch_chat_images.sh <share_url> [outdir]}"
OUT="${2:-/home/z/my-project/upload}"
mkdir -p "$OUT"

echo "[1/5] فتح المحادثة…"
agent-browser close 2>/dev/null
sleep 1
timeout 40 agent-browser open "$URL" >/dev/null 2>&1

# استنى التنقل يخلص (about:blank وقت السباق) — لغاية 15 ثانية
CUR=""
for i in $(seq 1 15); do
  CUR=$(timeout 15 agent-browser get url 2>/dev/null | tail -1 | tr -d '"' | tr -d ' ')
  [ "$CUR" != "about:blank" ] && [ -n "$CUR" ] && break
  sleep 1
done

# استنى المحتوى يظهر (img) — لغاية 20 ثانية
for i in $(seq 1 20); do
  NIMG=$(timeout 15 agent-browser eval "document.querySelectorAll('img').length" 2>/dev/null | tail -1 | tr -d '"')
  [ "${NIMG:-0}" -gt 0 ] 2>/dev/null && break
  sleep 1
done

if [ "$CUR" = "https://chat.z.ai/" ] || [ "$CUR" = "https://chat.z.ai" ] || [ -z "$CUR" ]; then
  echo "✗ الرابط مش share link صالح (redirect للرئيسية) — لازم «Share → Create link» من المحادثة"
  exit 1
fi
echo "    المحادثة اتفتحت: $CUR"

echo "[2/5] سحب URLs الصور (قبل السكرول) + سكرول خفيف وجمّع أي صور lazy…"
# ملاحظة مهمة: الصفحة virtualized — السكرول بيشيل الصور اللي عدّت
# من الشاشة، فلازم الاستخراج الأول يحصل قبل أي سكرول وبعده نجمّع.
ALL_URLS=""
for round in 1 2 3 4 5; do
  RAW=$(timeout 25 agent-browser eval "JSON.stringify(Array.from(document.querySelectorAll('img[src*=\"z-cdn-media\"]')).map(function(i){return i.src}).filter(function(v,i,a){return a.indexOf(v)===i}))" 2>/dev/null | tail -1)
  GOT=$(echo "$RAW" | python3 -c "
import json, sys
raw = sys.stdin.read().strip()
try:
    data = json.loads(raw)
    if isinstance(data, str):   # الـ CLI بيرجّع JSON مزدوج — فك مرتين
        data = json.loads(data)
    print('\n'.join(u for u in data if u))
except Exception:
    pass" 2>/dev/null)
  if [ -n "$GOT" ]; then
    ALL_URLS="${ALL_URLS}${GOT}"$'\n'
  fi
  # سكرولة واحدة لتحت (بتحمّل رسائل أكتر)
  timeout 20 agent-browser eval "var c=document.querySelector('.flex.overflow-auto.flex-col.w-full')||document.scrollingElement; if(c){c.scrollTop=c.scrollHeight;} 'ok'" >/dev/null 2>&1
  sleep 2
done
# إزالة التكرار مع الحفاظ على الترتيب
URLS=$(printf '%s' "$ALL_URLS" | python3 -c "
import sys
seen, out = set(), []
for line in sys.stdin.read().splitlines():
    u = line.strip()
    if u and u not in seen:
        seen.add(u); out.append(u)
print('\n'.join(out))" 2>/dev/null)

if [ -z "$URLS" ]; then
  echo "✗ مفيش صور في المحادثة دي (أو الصور لسه محملتش — جرب تاني)"
  agent-browser close 2>/dev/null
  exit 1
fi
N=$(echo "$URLS" | wc -l)
echo "    لقيت $N صورة"

echo "[4/5] تحميل…"
i=0
while IFS= read -r u; do
  [ -z "$u" ] && continue
  i=$((i+1))
  fname=$(echo "$u" | sed 's|.*/files/||; s|?.*||')
  out="$OUT/chat_img_${i}_${fname}"
  curl -s -m 30 -o "$out" "$u"
  ok=$(python3 -c "
try:
    with open('$out','rb') as f: h=f.read(8)
    print('OK' if h[:8]==b'\x89PNG\r\n\x1a\n' or h[:3]==b'\xff\xd8\xff' else 'BAD')
except Exception:
    print('BAD')")
  sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
  echo "    [$i/$N] $fname · ${sz} bytes · $ok"
  [ "$ok" = "BAD" ] && rm -f "$out"
done <<< "$URLS"

echo "[5/5] تم — الصور في: $OUT"
ls "$OUT" 2>/dev/null | head -20
agent-browser close 2>/dev/null
exit 0
