/* Marib Performance i18n — engine
   - t(key) / ta(key) dictionary access
   - locale number & percent formatting (tr: 210.161 / %82,83 — en/ar: 210,161 / 82.83%)
   - localized weekday names, count phrases, drill titles, KPI sub-lines
   - RTL/LTR switching + data-i18n DOM translation + persistence */
var I18N = (function () {
  "use strict";
  var LS_KEY = "marib_lang";
  var cur = "ar";
  var D = window.MARIB_I18N_DICT || {};
  var listeners = [];

  var DAYS_FULL = {
    ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    tr: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"]
  };
  var DAYS_SHORT = {
    ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    tr: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]
  };
  /* heat map rows run Saturday-first (regional week) */
  var HEAT_DAYS = {
    ar: ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"],
    en: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
    tr: ["Cmt", "Paz", "Pzt", "Sal", "Çar", "Per", "Cum"]
  };

  /* ---------- basics ---------- */
  function t(key) {
    var e = D[key];
    if (!e) return key;
    var v = (e[cur] != null) ? e[cur] : e.ar;
    return (v == null) ? e.ar : v;
  }
  /* pair/triple access: ta('c_x')[0] title, [1] sub, [2] badge */
  function ta(key) { var v = t(key); return Array.isArray(v) ? v : [v, v, v]; }
  function tv(key) { return ta(key)[0]; }   /* main title */
  function ts(key) { return ta(key)[1]; }   /* small sub-caption */
  function tb(key) { return ta(key)[2]; }   /* badge chip */
  function is(l) { return cur === l; }
  function dir() { return cur === "ar" ? "rtl" : "ltr"; }
  function listSep() { return cur === "ar" ? "، " : ", "; }
  function num(n) { return '<span class="num">' + n + "</span>"; }

  /* ---------- locale number formatting ---------- */
  function dec(s) { return cur === "tr" ? String(s).replace(".", ",") : String(s); }
  function loc() { return cur === "tr" ? "tr-TR" : "en-US"; }
  function fmtInt(n) { return (n == null || !isFinite(n)) ? "—" : Math.round(n).toLocaleString(loc()); }
  function fmtNum(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString(loc(), { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d });
  }
  /* v is already in percent units (e.g. 82.83) */
  function pctV(v, d) {
    if (v == null || !isFinite(v)) return "—";
    var s = v.toFixed(d == null ? 1 : d);
    return cur === "tr" ? "%" + s.replace(".", ",") : s + "%";
  }
  /* x is a fraction (e.g. 0.8283) */
  function fmtPct(x, d) { return (x == null || !isFinite(x)) ? "—" : pctV(x * 100, d); }
  function pts(v, d) { /* percentage-point delta with sign */
    var s = Math.abs(v).toFixed(d == null ? 1 : d);
    if (cur === "tr") s = s.replace(".", ",");
    return (v >= 0 ? "+" : "−") + s + " " + t("d_pts");
  }
  function kFmt(v) { return dec((Math.round(v / 100) / 10).toLocaleString(loc())) + "K"; }

  /* ---------- weekdays ---------- */
  function dayFull(dw) { return DAYS_FULL[cur][dw]; }
  function dayShort(dw) { return DAYS_SHORT[cur][dw]; }
  function heatDays() { return HEAT_DAYS[cur]; }

  /* ---------- count phrases (proper plurals; TR uses no plural after numerals) ---------- */
  var COUNTS = {
    line:  { ar: "خط", en: ["line", "lines"], tr: "hat" },
    sup:   { ar: "مشرف", en: ["supervisor", "supervisors"], tr: "şef" },
    sec:   { ar: "قسم", en: ["section", "sections"], tr: "bölüm" },
    mach:  { ar: "ماكينة", en: ["machine", "machines"], tr: "makine" },
    day:   { ar: "يوم", en: ["day", "days"], tr: "gün" },
    rec:   { ar: "سجل", en: ["record", "records"], tr: "kayıt" },
    worker:{ ar: "عامل", en: ["worker", "workers"], tr: "işçi" }
  };
  function count(n, kind) {
    var e = COUNTS[kind] || kind;
    var word;
    if (cur === "en" && Array.isArray(e.en)) word = (n == 1 ? e.en[0] : e.en[1]);
    else if (cur === "en") word = e;
    else word = (cur === "tr") ? e.tr : e.ar;
    return fmtInt(n) + " " + word;
  }

  /* ---------- entity prefixes ---------- */
  function lineN(n) { return cur === "ar" ? "خط " + n : (cur === "tr" ? "Hat " + n : "Line " + n); }
  /* localized section names (round 8): Turkish garment-sector terms
     (Ön / Arka / Montaj / Hazırlık …) + Arabic shop-floor terms;
     unknown sections fall back to the raw name from the data */
  var SECTION_MAP = {
    Front:       { ar: "صدر",  tr: "Ön" },  /* round 12: garment term — bodice front */
    Back:        { ar: "ظهر",  tr: "Arka" },
    Assembly:    { ar: "تجميع", tr: "Montaj" },
    Preparation: { ar: "تحضير", tr: "Hazırlık" },
    Sleeve:      { ar: "أكمام", tr: "Kol" },
    Pocket:      { ar: "جيوب",  tr: "Cep" },
    Collar:      { ar: "ياقات", tr: "Yaka" },
    Cuff:        { ar: "أساور", tr: "Manşet" },
    Cutting:     { ar: "قص",    tr: "Kesim" },
    Ironing:     { ar: "كي",    tr: "Ütü" },
    Quality:     { ar: "جودة",  tr: "Kalite" },
    Packing:     { ar: "تغليف", tr: "Paketleme" }
  };
  function sectionName(n) {
    var s = String(n == null ? "" : n).trim();
    var e = SECTION_MAP[s];
    if (!e) return s;
    var v = cur === "tr" ? e.tr : (cur === "en" ? s : e.ar);
    return v == null ? s : v;
  }
  function sectionN(n) {
    var nm = sectionName(n);
    if (cur === "ar") return "قسم " + nm;
    if (cur === "tr") return SECTION_MAP[String(n == null ? "" : n).trim()] ? nm : (n + " Bölümü");
    return "Section " + nm;
  }
  function machN(n) { return cur === "ar" ? "ماكينة " + n : (cur === "tr" ? "Cep Makinesi " + n : "Pocket Machine " + n); }
  function dayTitle(wdName, dateShort) { return wdName + " " + dateShort; }
  function drTitleSec(v) { return cur === "ar" ? sectionN(v) : (cur === "tr" ? sectionN(v) : "Section: " + sectionName(v)); }
  function drTitleLine(v) { return lineN(v); }
  function drTitlePm(v) { return machN(v); }
  function drTitlePmLine(v) { return cur === "ar" ? "ماكينات خط " + v : (cur === "tr" ? "Hat " + v + " Makineleri" : "Machines — Line " + v); }

  /* ---------- KPI sub-lines (numbered templates) ---------- */
  function subTargetPcs(n) {
    return cur === "tr" ? "Hedef: " + num(fmtInt(n)) + " adet"
         : cur === "en" ? "Target: " + num(fmtInt(n)) + " pcs"
         : 'الهدف: ' + num(fmtInt(n)) + " قطعة";
  }
  function subActualOf(n, m) {
    return cur === "tr" ? "Gerçekleşen " + num(fmtInt(n)) + " / " + num(fmtInt(m))
         : cur === "en" ? "Actual " + num(fmtInt(n)) + " of " + num(fmtInt(m))
         : 'الفعلي ' + num(fmtInt(n)) + " من " + num(fmtInt(m));
  }
  function subOtOf(n, m) {
    return cur === "tr" ? num(fmtInt(n)) + " dk FM — " + num(fmtInt(m)) + " dk kullanılabilir"
         : cur === "en" ? num(fmtInt(n)) + " OT min of " + num(fmtInt(m)) + " available"
         : num(fmtInt(n)) + " دقيقة أوفر من " + num(fmtInt(m)) + " متاحة";
  }
  function subAbsentWorkers(n) {
    return cur === "tr" ? num(fmtInt(n)) + " işçi devamsız"
         : cur === "en" ? num(fmtInt(n)) + " workers absent"
         : 'غياب ' + num(fmtInt(n)) + " عامل";
  }
  function subBestLine(line, actual) {
    return cur === "tr" ? "Hat " + num(line) + " · gerçekleşen " + num(fmtInt(actual))
         : cur === "en" ? "Line " + num(line) + " · actual " + num(fmtInt(actual))
         : 'خط ' + num(line) + " · فعلي " + num(fmtInt(actual));
  }
  /* round 12: sub-line for the "best machine by efficiency" KPI —
     machine number + its produced/available minutes */
  function subBestMachine(mach, mp, cap) {
    return cur === "tr" ? "Makine " + num(mach) + " · " + num(fmtInt(mp)) + " / " + num(fmtInt(cap)) + " dk"
         : cur === "en" ? "Machine " + num(mach) + " · " + num(fmtInt(mp)) + " / " + num(fmtInt(cap)) + " min"
         : 'ماكينة ' + num(mach) + " · " + num(fmtInt(mp)) + " من " + num(fmtInt(cap)) + " دقيقة";
  }
  function subOfAvail(n) {
    return cur === "tr" ? num(fmtInt(n)) + " dk kapasiteden"
         : cur === "en" ? "out of " + num(fmtInt(n)) + " available"
         : 'من أصل ' + num(fmtInt(n)) + " متاحة";
  }
  function subSecOutput(n) {
    return cur === "tr" ? "Bölüm üretimi " + num(fmtInt(n)) + " adet"
         : cur === "en" ? "Sections output " + num(fmtInt(n)) + " pcs"
         : 'إنتاج الأقسام ' + num(fmtInt(n)) + " قطعة";
  }
  function subInclOtPcs(n) {
    return cur === "tr" ? num(fmtInt(n)) + " adet FM üretimi içerir"
         : cur === "en" ? "includes " + num(fmtInt(n)) + " OT pieces"
         : 'يشمل ' + num(fmtInt(n)) + " قطعة أوفر تايم";
  }
  function subProducedOf(n, m) {
    return cur === "tr" ? num(fmtInt(m)) + " dk içinden " + num(fmtInt(n)) + " dk üretildi"
         : cur === "en" ? num(fmtInt(n)) + " produced of " + num(fmtInt(m)) + " available"
         : num(fmtInt(n)) + " منتجة من " + num(fmtInt(m)) + " متاحة";
  }
  function subOtSplit(a, b) {
    return cur === "tr" ? num(fmtInt(a)) + " dk FM çizelgeleri + " + num(fmtInt(b)) + " dk cep makineleri"
         : cur === "en" ? "incl. " + num(fmtInt(a)) + " from OT sheets + " + num(fmtInt(b)) + " from pocket machines"
         : 'تشمل ' + num(fmtInt(a)) + " أوفر شيتات + " + num(fmtInt(b)) + " ماكينات جيوب";
  }
  function subMinOf(n, m) {
    return cur === "tr" ? num(fmtInt(n)) + " dk / " + num(fmtInt(m)) + " dk kapasite"
         : cur === "en" ? num(fmtInt(n)) + " minutes of " + num(fmtInt(m)) + " available"
         : num(fmtInt(n)) + " دقيقة من " + num(fmtInt(m)) + " متاحة";
  }
  /* efficiency as a sub-line under a plain-minutes KPI (percentage stays separate) */
  function subEffOf(eff) {
    if (eff == null || !isFinite(eff)) return "";
    var p = pctV(eff * 100, 1);
    return cur === "tr" ? "Verim " + num(p)
         : cur === "en" ? "Efficiency " + num(p)
         : "الكفاءة " + num(p);
  }
  function subPeakDay(wdName, dateShort) {
    return cur === "ar" ? "يوم " + wdName + " " + num(dateShort) : wdName + " " + num(dateShort);
  }
  function subOtMin(n) { return fmtInt(n) + (cur === "tr" ? " dk FM" : (cur === "en" ? " OT minutes" : " دقيقة أوفر")); }
  function subMinRec(n) { return fmtInt(n) + (cur === "tr" ? " dk" : (cur === "en" ? " min" : " دقيقة")); }
  function heroChip(total, days) {
    return cur === "tr" ? "Toplam gerçek <b>" + fmtInt(total) + "</b> · " + days + " gün"
         : cur === "en" ? "Total actual <b>" + fmtInt(total) + "</b> · " + days + " days"
         : 'إجمالي الفعلي <b>' + fmtInt(total) + "</b> · " + days + " يوم";
  }
  function dateChip(days) {
    return cur === "tr" ? " · " + days + " gün" : (cur === "en" ? " · " + days + " days" : " · " + days + " يوم");
  }

  /* ---------- toast templates ---------- */
  function toastCsv(name) { return cur === "tr" ? name + " dışa aktarıldı" : (cur === "en" ? "Exported " + name : "تم تصدير " + name); }
  function toastReadErr(n) { return cur === "tr" ? n + " dosya okunamadı" : (cur === "en" ? "Couldn't read " + n + " file(s)" : "تعذر قراءة " + n + " ملف"); }
  function toastParsed(n) {
    return cur === "tr" ? n + " dosya analiz edildi — veriler güncel"
         : cur === "en" ? "Analyzed " + n + " file(s) — data is now up to date"
         : "تم تحليل " + n + " ملف — البيانات محدثة الآن";
  }

  /* ---------- DOM translation (data-i18n, data-i18n-title, optional :0/:1/:2 index) ---------- */
  function resolve(key) {
    var idx = key.indexOf(":");
    if (idx < 0) return t(key);
    var base = key.slice(0, idx), i = +key.slice(idx + 1);
    return ta(base)[i] != null ? ta(base)[i] : ta(base)[0];
  }
  function fixSubCaps(el) {
    /* Latin caps captions keep letter-spacing; Arabic sub-captions (EN mode) must not */
    if (!el) return;
    var hasAr = /[\u0600-\u06FF]/.test(el.textContent || "");
    if (el.classList && (el.classList.contains("en") || el.classList.contains("sub")))
      el.classList.toggle("ar-sub", hasAr);
  }
  function applyDOM() {
    var els = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = resolve(els[i].getAttribute("data-i18n"));
      fixSubCaps(els[i]);
    }
    var tt = document.querySelectorAll("[data-i18n-title]");
    for (var j = 0; j < tt.length; j++) tt[j].setAttribute("title", resolve(tt[j].getAttribute("data-i18n-title")));
    var ph = document.querySelectorAll("[data-i18n-ph]");
    for (var m = 0; m < ph.length; m++) ph[m].setAttribute("placeholder", resolve(ph[m].getAttribute("data-i18n-ph")));
    var al = document.querySelectorAll("[data-i18n-aria]");
    for (var n = 0; n < al.length; n++) al[n].setAttribute("aria-label", resolve(al[n].getAttribute("data-i18n-aria")));
    var sw = document.querySelectorAll("#langSw button");
    for (var k = 0; k < sw.length; k++)
      sw[k].className = "sw-btn" + (sw[k].getAttribute("data-lang") === cur ? " on" : "");
    var lsw = document.querySelectorAll("#lgLang button");
    for (var q = 0; q < lsw.length; q++)
      lsw[q].className = (lsw[q].getAttribute("data-lg") === cur ? "on" : "");
  }

  /* ---------- language switching ---------- */
  function onChange(fn) { listeners.push(fn); }
  function setLang(l, silent) {
    if (l !== "ar" && l !== "en" && l !== "tr") l = "ar";
    if (l === cur) { applyDOM(); return; }
    cur = l;
    try { localStorage.setItem(LS_KEY, l); } catch (e) { }
    var de = document.documentElement;
    de.setAttribute("lang", l);
    de.setAttribute("dir", dir());
    document.title = t("doc_title");
    if (window.MaribCore && MaribCore.utils) {
      MaribCore.utils.fmtInt = function (n) { return fmtInt(n); };
      MaribCore.utils.fmtNum = function (n, d) { return fmtNum(n, d); };
      MaribCore.utils.fmtPct = function (x, d) { return fmtPct(x, d == null ? 2 : d); };
    }
    if (window.MaribCharts && MaribCharts.setDir) MaribCharts.setDir(dir());
    applyDOM();
    if (!silent) for (var i = 0; i < listeners.length; i++) { try { listeners[i](l); } catch (e) { } }
  }
  function restore() {
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) { }
    if (saved === cur) { applyDOM(); return; }
    if (saved === "en" || saved === "tr") setLang(saved, true); else applyDOM();
  }

  /* auto-restore at load (scripts sit at end of <body>, DOM already parsed) */
  restore();

  return {
    t: t, ta: ta, tv: tv, ts: ts, tb: tb, is: is, dir: dir, listSep: listSep,
    fmtInt: fmtInt, fmtNum: fmtNum, fmtPct: fmtPct, pctV: pctV, pts: pts, kFmt: kFmt, dec: dec,
    dayFull: dayFull, dayShort: dayShort, heatDays: heatDays,
    count: count, lineN: lineN, sectionN: sectionN, sectionName: sectionName, machN: machN, dayTitle: dayTitle,
    drTitleSec: drTitleSec, drTitleLine: drTitleLine, drTitlePm: drTitlePm, drTitlePmLine: drTitlePmLine,
    subTargetPcs: subTargetPcs, subActualOf: subActualOf, subOtOf: subOtOf, subAbsentWorkers: subAbsentWorkers,
    subBestLine: subBestLine, subBestMachine: subBestMachine, subOfAvail: subOfAvail, subSecOutput: subSecOutput, subInclOtPcs: subInclOtPcs,
    subProducedOf: subProducedOf, subOtSplit: subOtSplit, subMinOf: subMinOf, subEffOf: subEffOf, subPeakDay: subPeakDay,
    subOtMin: subOtMin, subMinRec: subMinRec, heroChip: heroChip, dateChip: dateChip,
    toastCsv: toastCsv, toastReadErr: toastReadErr, toastParsed: toastParsed,
    applyDOM: applyDOM, fixSubCaps: fixSubCaps, setLang: setLang, onChange: onChange, lang: function () { return cur; }
  };
})();
