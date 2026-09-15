/* R46 — shared translation library (extracted from src/app/api/manpower/route.ts).
   Two free APIs, no API key required:
     1. Google gtx endpoint — primary (no limits)
     2. MyMemory — fallback (5000 chars/day anonymous)
   Translations are cached in marib_i18n so subsequent requests are instant. */

import { q } from "./db";

const AR_RE = /[\u0600-\u06FF]/;

/* Google gtx — single segment or short text */
export async function gtx(text: string, from: string, to: string, host = "translate.googleapis.com"): Promise<string> {
  const u =
    "https://" + host + "/translate_a/single?client=gtx&sl=" +
    from + "&tl=" + to + "&dt=t&q=" + encodeURIComponent(text);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3500);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) return "";
    const j = (await r.json()) as unknown;
    const segs = (j as unknown[][])?.[0];
    if (!Array.isArray(segs)) return "";
    return segs.map((s) => (Array.isArray(s) && s[0]) ? String(s[0]) : "").join("").trim();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/* MyMemory — free 5000 chars/day, no key */
export async function myMemory(text: string, from: string, to: string): Promise<string> {
  try {
    const u =
      "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) +
      "&langpair=" + from + "|" + to;
    const r = await fetch(u);
    if (!r.ok) return "";
    const j = (await r.json()) as { responseData?: { translatedText?: string } };
    const out = String(j?.responseData?.translatedText || "").trim();
    if (!out || /MYMEMORY WARNING|INVALID/i.test(out)) return "";
    return out;
  } catch {
    return "";
  }
}

/* Try Google first (both hosts), then MyMemory. Returns "" if all fail. */
export async function translateInto(text: string, from: string, to: string): Promise<string> {
  return (await gtx(text, from, to))
    || (await gtx(text, from, to, "translate.google.com"))
    || (await myMemory(text, from, to));
}

/* Auto-detect source language (Arabic vs English) and translate to the other
   two languages (ar → en+tr, en → ar+tr). Stores results in marib_i18n so the
   next lookup is instant. */
export async function translateAndStore(term: string): Promise<void> {
  const t = (term || "").trim().slice(0, 90);
  if (!t || t.length < 2) return;
  const have = await q("SELECT lang FROM marib_i18n WHERE term = $1", [t]);
  const done = new Set(have.map((r) => r.lang as string));
  const from = AR_RE.test(t) ? "ar" : "en";
  const targets: string[] = from === "ar" ? ["en", "tr"] : ["ar", "tr"];
  await Promise.all(targets.map(async (tl) => {
    if (done.has(tl)) return;
    try {
      const out = await translateInto(t, from, tl);
      if (out && out !== t) {
        await q(
          `INSERT INTO marib_i18n (term, lang, tr) VALUES ($1, $2, $3)
           ON CONFLICT (term, lang) DO UPDATE SET tr = EXCLUDED.tr, at = now()`,
          [t, tl, out]
        );
      }
    } catch {
      /* silent failure — the term just stays untranslated */
    }
  }));
}

/* Live translate — used by the dept AR toggle button when no cached
   translation exists. Returns the translated text or "" on failure.
   The result is cached for next time. */
export async function translateLive(text: string, to: string): Promise<string> {
  const t = (text || "").trim();
  if (!t || t.length < 2) return "";
  /* check cache first */
  const cached = await q("SELECT tr FROM marib_i18n WHERE term = $1 AND lang = $2", [t, to]);
  if (cached.length) return cached[0].tr as string;
  const from = AR_RE.test(t) ? "ar" : "en";
  if (from === to) return t;
  const out = await translateInto(t, from, to);
  if (out && out !== t) {
    try {
      await q(
        `INSERT INTO marib_i18n (term, lang, tr) VALUES ($1, $2, $3)
         ON CONFLICT (term, lang) DO UPDATE SET tr = EXCLUDED.tr, at = now()`,
        [t, to, out]
      );
    } catch { /* non-fatal */ }
  }
  return out;
}
