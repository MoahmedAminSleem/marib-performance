#!/usr/bin/env node
/* ============================================================
   code_map.mjs — R63: مولّد خريطة الكود (Code Intelligence)
   ============================================================
   المشكلة اللي بيحلها: أي جلسة AI (أو مطور جديد) بتبدأ من صفر —
   تقرأ آلاف السطور عشان تلاقي سطر واحد، ومع نمو المشروع ده بيبقى
   مستحيل. الحل: خريطة تتولّد آليًا من الكود نفسه (مش بتتكتب بإيد —
   فمستحيل تكذب) وتترفع على git مع كل جولة.

   إيه اللي بتقوله الخريطة لأي حد بيعدّل:
     1) مسارات الـ API: الملف + الحارس (صلاحية) + الجداول + مين بيستدعيها
     2) جداول DB: كل جدول ومين بيقرأه/يكتب فيه
     3) وحدات الواجهة: كل ملف والـ endpoints اللي بيندها + عناصر DOM
     4) مكتبات السيرفر: دور كل lib ومين بيستوردها
     5) رادار التأثير: عدّلت ملف X → إيه اللي بيعتمد عليه مباشرةً
     6) الصلاحيات: كل مفتاح ومين بيستخدمه (سيرفر + واجهة)

   التوليد حتمي (Deterministic): نفس الكود = نفس الخريطة بالبايت —
   عشان كده فحص "الخريطة طازة" (--check) بيشتغل في الـ E2E.

   الاستخدام:
     bun scripts/code_map.mjs            # يولّد docs/CODE-MAP.md
     bun scripts/code_map.mjs --check    # exit 1 لو المرفوع مش طازي
   ============================================================ */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const OUT = join(ROOT, "docs", "CODE-MAP.md");

/* ---------- 1) جمع الملفات ---------- */
function walk(dir, out = []) {
  let items;
  try { items = readdirSync(dir); } catch { return out; }
  for (const it of items) {
    const p = join(dir, it);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (["node_modules", ".next", "db", "logs", ".git", "e2e_common"].includes(it)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|mjs|sh)$/.test(it)) {
      if (it === "xlsx.full.min.js" || it === "bun.lock" || it.startsWith("postinstall")) continue;
      out.push(p);
    }
  }
  return out;
}

const allFiles = walk(join(ROOT, "src")).concat(walk(join(ROOT, "public", "app")), walk(join(ROOT, "scripts")));
/* فرز حتمي (رتبة readdirSync بتختلف بين node وbun — الحتمية إلزامية
   عشان فحص --check يشتغل مع أي runtime) */
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
allFiles.sort(byStr);
const byPath = new Map();
for (const f of allFiles) {
  let txt = "";
  try { txt = readFileSync(f, "utf8"); } catch { continue; }
  byPath.set(f, {
    file: f,
    rel: relative(ROOT, f).split("\\").join("/"),
    txt,
    lines: txt.split("\n").length,
    kb: Math.round(statSync(f).size / 102.4) / 10,
    isServer: f.startsWith(join(ROOT, "src")),
    isClient: f.startsWith(join(ROOT, "public", "app")),
  });
}
const files = [...byPath.values()];

/* ---------- 2) استخراج لكل ملف ---------- */
function rxMany(txt, rx) {
  const out = new Set();
  let m;
  const r = new RegExp(rx, "g");
  while ((m = r.exec(txt)) !== null) out.add(m[1]);
  return [...out];
}

for (const f of files) {
  /* الـ imports المحلية بس (الخارجية مش مهمة للرادار) */
  f.imports = [
    ...rxMany(f.txt, /from\s+"(@\/[^"]+)"/g).map((s) => s.replace("@/", "src/")),
    ...rxMany(f.txt, /from\s+"(\.[^"]+)"/g).map((s) => {
      /* نسبي → مسار فعلي تقريبي (بدون تحليل extensions متعددة) */
      const base = join(dirname(f.file), s).split("\\").join("/");
      return relative(ROOT, base).split("\\").join("/");
    }),
  ].map((s) => s.replace(/\.(ts|tsx)$/, ""));

  /* exports — أسماء اللي بيقدمه الملف للباقي */
  f.exports = [...rxMany(f.txt, /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g),
               ...rxMany(f.txt, /export\s+const\s+([A-Za-z0-9_$]+)/g),
               ...rxMany(f.txt, /export\s+class\s+([A-Za-z0-9_$]+)/g)];

  /* جداول الـ DB — من سياق SQL بس (FROM/INTO/UPDATE/JOIN/CREATE TABLE)
     عشان مفاتيح localStorage زي marib_last_mode ما تتحسبش جداول */
  const sqlTables = new Set();
  let tm;
  const tRx = /\b(?:FROM|INTO|UPDATE|JOIN|TABLE\s+IF\s+NOT\s+EXISTS|REFERENCES)\s+(?:ONLY\s+)?(marib_[a-z_]{2,})\b/gi;
  while ((tm = tRx.exec(f.txt)) !== null) sqlTables.add(tm[1].toLowerCase());
  f.tables = [...sqlTables];

  /* مفاتيح الصلاحيات المستخدمة في الحارسات */
  f.perms = [
    ...rxMany(f.txt, /requirePermBody?\(\s*req\s*,\s*"([^"]+)"/g),
    ...rxMany(f.txt, /requirePerm\(\s*req\s*,\s*"([^"]+)"/g),
    ...rxMany(f.txt, /checkPerm\(\s*req\s*,\s*"([^"]+)"/g),
  ];

  /* endpoints اللي الملف بيندها (واجهة) — fetch المباشر + api() بتاعة marib_cloud */
  f.calls = [
    ...rxMany(f.txt, /fetch\("([^"]*\/api\/[^"?]*)/g),
    ...rxMany(f.txt, /api\("(\/api\/[^"?]*)/g),
  ].map((c) => c.split("?")[0]).map((c) => c.replace(/[^"]*\/api\//, "/api/")).filter((c) => c.startsWith("/api/"));

  /* عناصر DOM الأساسية (helper $) */
  f.dom = f.isClient ? rxMany(f.txt, /\$\("([A-Za-z][A-Za-z0-9_-]{2,})"\)/g).slice(0, 40) : [];

  /* فرز كل المجموعات المستخرجة — الحتمية عبر أي runtime */
  f.imports.sort(byStr);
  f.exports.sort(byStr);
  f.tables.sort(byStr);
  f.perms.sort(byStr);
  f.calls.sort(byStr);
  f.dom.sort(byStr);

  /* وحدة الواجهة: var NAME = (function */
  const mod = /var\s+([A-Za-z0-9_$]+)\s*=\s*\(function/.exec(f.txt);
  f.module = mod ? mod[1] : null;

  /* مسار API + الميثودز (سيرفري) */
  if (f.rel.startsWith("src/app/api/") && f.rel.endsWith("route.ts")) {
    f.route = "/" + f.rel.slice("src/app/api/".length).replace("/route.ts", "").split("/").map((s) => (s.startsWith("[") ? "{" + s.replace(/[[\]]/g, "") + "}" : s)).join("/");
    f.methods = [...rxMany(f.txt, /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/g)];
  }

  /* logger module */
  const lg = /logger\("([^"]+)"\)/.exec(f.txt);
  f.logmod = lg ? lg[1] : null;

  /* requireEntryRead (حارس الإدخال R63) */
  f.entryRead = /requireEntryRead/.test(f.txt);
}

/* ---------- 3) الفهارس العكسية ---------- */
/* ملف ← مين بيستورده (مباشرة) */
function importersOf(rel) {
  const want = rel.replace(/\.(ts|tsx|js)$/, "");
  return files
    .filter((f) => f.imports.some((im) => im === want || im.replace(/^\.\//, "") === want.replace(/^\.\//, "")))
    .map((f) => f.rel).sort(byStr);
}
/* endpoint ← الوحدات اللي بتنده عليه */
function clientsOf(ep) {
  return files.filter((f) => f.isClient && f.calls.some((c) => c === ep || c.startsWith(ep + "?") || ep.startsWith(c + "/"))).map((f) => f.rel).sort(byStr);
}

/* ---------- 4) التوليد ---------- */
const V = "r63";
const L = [];
L.push("# CODE-MAP — خريطة الكود (آلي التوليد)");
L.push("");
L.push("> **متعدّلش بإيدك.** الخريطة دي بتتولّد من الكود نفسه — لو اتغير");
L.push("> الكود، بتتغير معاه. أعد التوليد قبل أي commit: `bun scripts/code_map.mjs`");
L.push(`> النسخة: ${V} · الملفات المفهرسة: ${files.length}`);
L.push("");
L.push("## الوصفة (30 ثانية لأي تعديل)");
L.push("");
L.push("```");
L.push("1. دوّر على الخصيصة في الخريطة تحت (Ctrl+F في الملف ده)");
L.push("2. افتح الملف المذكور واقرأ الشريحة المطلوبة بس (offset/limit — مش الملف كله)");
L.push("3. بص في «رادار التأثير» — إيه اللي بيعتمد على الملف ده قبل ما تكسر حاجة");
L.push("4. عدّل → tsc → E2E → أعد توليد الخريطة → commit");
L.push("```");
L.push("");
L.push("البروتوكول الكامل + القواعد: `docs/08-CODE-INTELLIGENCE.md`");
L.push("");

/* --- القسم 1: مسارات الـ API --- */
L.push("## 1) مسارات الـ API (السيرفر)");
L.push("");
L.push("| المسار | الميثودز | الحارس | الجداول | الملف |");
L.push("|---|---|---|---|---|");
const routes = files.filter((f) => f.route).sort((a, b) => a.route< b.route ? -1 : a.route > b.route ? 1 : 0);
for (const r of routes) {
  const guard = [
    ...r.perms.map((p) => (r.rel.includes("entries/absence") && p === "data.view" ? p : p)),
    r.entryRead ? "**entry-read**" : "",
  ].filter(Boolean).join(" · ");
  L.push(`| \`${r.route}\` | ${r.methods.join("/") || "—"} | ${guard || "—"} | ${r.tables.map((t) => t.replace("marib_", "")).join(", ") || "—"} | \`${r.rel}\` |`);
}
L.push("");

/* --- القسم 2: جداول DB --- */
L.push("## 2) جداول الـ DB — مين بيلمس إيه");
L.push("");
const tableFiles = new Map();
for (const f of files) for (const t of f.tables) {
  if (!tableFiles.has(t)) tableFiles.set(t, []);
  tableFiles.get(t).push(f.rel);
}
L.push("| الجدول | الملفات (" + tableFiles.size + " جدول) |");
L.push("|---|---|");
for (const [t, fl] of [...tableFiles.entries()].sort((a, b) => byStr(a[0], b[0]))) {
  L.push(`| \`${t}\` | ${fl.slice().sort(byStr).map((x) => "`" + x + "`").join(" · ")} |`);
}
L.push("");

/* --- القسم 3: وحدات الواجهة --- */
L.push("## 3) وحدات الواجهة (public/app)");
L.push("");
L.push("| الملف | الوحدة | الـ endpoints اللي بيندها | حجم |");
L.push("|---|---|---|---|");
for (const f of files.filter((f) => f.isClient).sort((a, b) => b.lines - a.lines)) {
  L.push(`| \`${f.rel}\` | ${f.module || "—"} | ${[...new Set(f.calls)].join("<br>") || "—"} | ${f.lines} سطر · ${f.kb}KB |`);
}
L.push("");

/* --- القسم 4: مكتبات السيرفر --- */
L.push("## 4) مكتبات السيرفر (src/lib/marib) — الدور والمستوردون");
L.push("");
L.push("| الملف | exports | بيستورده | سطور |");
L.push("|---|---|---|---|");
for (const f of files.filter((f) => f.rel.startsWith("src/lib/")).sort((a, b) => a.rel< b.rel ? -1 : a.rel > b.rel ? 1 : 0)) {
  const imps = importersOf(f.rel);
  L.push(`| \`${f.rel}\` | ${f.exports.join(", ") || "—"} | ${imps.map((x) => "`" + x + "`").join("<br>") || "—"} | ${f.lines} |`);
}
L.push("");

/* --- القسم 5: رادار التأثير --- */
L.push("## 5) رادار التأثير — عدّلت ملف X؟ دول اللي بيستوردوه مباشرة");
L.push("");
L.push("> الفحص الأعمق (مين بينادي على مين وقت التشغيل) بيجي من الـ E2E —");
L.push("> الرادار ده بيغطي الاعتماد البنيوي (imports) اللي بيتكسر في البناء.");
L.push("");
L.push("| الملف | المستوردون المباشرون |");
L.push("|---|---|");
for (const f of files.filter((f) => f.isServer && f.rel.endsWith(".ts") && !f.rel.includes("app/api")).sort((a, b) => a.rel< b.rel ? -1 : a.rel > b.rel ? 1 : 0)) {
  const imps = importersOf(f.rel);
  if (imps.length) L.push(`| \`${f.rel}\` | ${imps.map((x) => "`" + x + "`").join(" · ")} |`);
}
/* وحدات الواجهة كمان — جسر ctx */
L.push("");
L.push("**الواجهة (client):** الوحدات بتوصل لبعض عبر جسر `__maribCtx` (مش imports) —");
L.push("الاعتماد البياني: `app_main` بيصدّر الجسر → `app_pages` / `app_entries` / `app_admin` بيستهلكوه،");
L.push("وكلهم بيستخدموا `MaribCloud` (API) + `MaribAuth` (صلاحيات) + `I18N` (ترجمة) + `MaribKit` (أدوات).");
L.push("");
for (const f of files.filter((f) => f.isClient && f.module).sort((a, b) => a.rel< b.rel ? -1 : a.rel > b.rel ? 1 : 0)) {
  const uses = [];
  if (/MaribCloud/.test(f.txt)) uses.push("MaribCloud");
  if (/MaribAuth/.test(f.txt)) uses.push("MaribAuth");
  if (/I18N/.test(f.txt)) uses.push("I18N");
  if (/MaribKit/.test(f.txt)) uses.push("MaribKit");
  if (/__maribCtx|ctx\./.test(f.txt)) uses.push("__maribCtx");
  L.push(`- \`${f.module}\` (${f.rel}) → ${uses.join(" · ")}`);
}
L.push("");

/* --- القسم 6: الصلاحيات --- */
L.push("## 6) الصلاحيات — كل مفتاح ومين بيستخدمه");
L.push("");
L.push("| المفتاح | السيرفر (حارس) |");
L.push("|---|---|");
const permFiles = new Map();
for (const f of files) {
  if (!f.isServer) continue;
  for (const p of f.perms) {
    if (!permFiles.has(p)) permFiles.set(p, new Set());
    permFiles.get(p).add(f.rel);
  }
}
for (const [p, fl] of [...permFiles.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
  L.push(`| \`${p}\` | ${[...fl].map((x) => "`" + x + "`").join("<br>")} |`);
}
L.push("");
L.push("**حارس الإدخال (R64):** \`requireEntryRead\` — بيسمح بـ entry.view (رؤية) **أو** entry.edit / entry.po (تعديل). القسم ليه مفاتيحه الخاصة من R64 — قبل كده كان مربوط بمفاتيح اللوحة (data.view/data.upload).");
L.push("");

/* --- القسم 7: الأصول الثابتة (R64) --- */
/* الصور والـ css اللي الواجهة بتشيلها من public/app — مع أحجامها.
   أصل زي خلفية الرئيسية بيتبحث عنه بالاسم لوحده من غير ما حد
   يعرف هو فين عاش. */
L.push("## 7) الأصول الثابتة (public/app)");
L.push("");
L.push("| الأصل | الحجم | الدور |");
L.push("|---|---|---|");
const ASSET_ROLES = [
  ["home-denim.jpg", "خلفية الصفحة الرئيسية (R64)"],
  ["logo.png", "لوجو مأرب (شريط العنوان + الرئيسية)"],
  ["favicon.png", "أيقونة المتصفح"],
  ["app.css", "ستايل الموقع كله"],
  ["cursor_needle.png", "أنيميشن المكنة (شاشة الدخول)"],
  ["cursor_needle_thread.png", "خيط المكنة (شاشة الدخول)"],
  ["xlsx.full.min.js", "SheetJS — قراءة/كتابة الإكسل في المتصفح"],
];
function walkAssets(dir, out = []) {
  let items;
  try { items = readdirSync(dir); } catch { return out; }
  for (const it of items) {
    const p = join(dir, it);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (["node_modules", ".next", "db", "logs", ".git", "e2e_common"].includes(it)) continue;
      walkAssets(p, out);
    } else if (/\.(png|jpe?g|svg|gif|webp|css)$/.test(it)) {
      out.push({ rel: relative(ROOT, p).split("\\").join("/"), kb: Math.round(st.size / 102.4) / 10, name: it });
    } else if (it === "xlsx.full.min.js") {
      out.push({ rel: relative(ROOT, p).split("\\").join("/"), kb: Math.round(st.size / 102.4) / 10, name: it });
    }
  }
  return out;
}
const assets = walkAssets(join(ROOT, "public", "app")).sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
for (const a of assets) {
  const role = (ASSET_ROLES.find(([n]) => a.name === n) || ["", "—"])[1];
  L.push(`| \`${a.rel}\` | ${a.kb}KB | ${role} |`);
}
L.push("");

const content = L.join("\n") + "\n";

/* ---------- 5) الكتابة / الفحص ---------- */
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current === content) {
    console.log("✅ CODE-MAP طازة (متطابقة مع الكود)");
    process.exit(0);
  }
  console.log("❌ CODE-MAP مش طازة — شغّل: bun scripts/code_map.mjs وارفعها مع الـ commit");
  process.exit(1);
}

writeFileSync(OUT, content);
console.log(`✅ اتولدت ${OUT} — ${files.length} ملف · ${routes.length} مسار API · ${tableFiles.size} جدول`);
