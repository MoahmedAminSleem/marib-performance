/* ============================================================
   Marib Performance App — core module (R52 refactoring: عرض الصفحات
   في app_pages.js · إدخال البيانات في app_entries.js · الإدارة في
   app_admin.js — كلها بتوصل للرموز هنا عبر __maribCtx)
   Marib Performance App — red-brand edition · round 3 (trilingual)
   7 pages, quick-period + custom range, data labels everywhere,
   drill-through modal + rich tooltips. Full AR/EN/TR i18n via I18N:
   UI strings, KPI sub-lines, chart tips, tables, CSV, toasts,
   locale number formats (tr: 210.161 · %82,83) and RTL/LTR layout.
   ============================================================ */
var App = (function () {
  "use strict";
  /* R42: حماية من التحميل المزدوج (نفس تعليق app_manpower) */
  if (window.__maribApp42) return window.__maribApp42;
  var U = MaribCore.utils;
  var C = MaribCharts;
  var TH = JSON.parse(JSON.stringify(MaribCore.DEFAULT_CONFIG.thresholds));
  /* round 11: denim/leather palette — gold thread accent, denim blues */
  var C_ACCENT = "#D9A86B", C_ACCENT2 = "#E9C68A", C_MUTED = "#A9B7C7",
      C_GOOD = "#4FD98D", C_WARN = "#F0BE55", C_BAD = "#F87C7C", C_F = "#7E92A8";
  /* R23/R24: targets & groups live on the SERVER (marib_setting) — they
     arrive via App.cloudLoad() → applySettings() and are applied per
     date range by applyTargetsForRange() (retro / from-now rules). */

  var state = { tables: null, model: null, k: null, page: "overview", busy: false, source: "cloud", qp: "all", cmp: {},
                scope: "both", suView: null, attView: "workers", groups: null, targetsMeta: null, monthsMeta: [],
                mhome: null, mhGran: "day" };   /* R30: manager-home visibility + GÜN/HAFTA/AY granularity */

  /* R25: the incoming URL is captured at script-load time — BEFORE the
     first render calls syncUrl() and rewrites the query string. Without
     this, opening ?qp=prevMonth&from=.. in a new tab would lose its state:
     boot → snap-to-latest → render → syncUrl would overwrite the query
     before applyQueryState() ever got to read it. */
  var bootQuery = "";
  try { bootQuery = location.search || ""; } catch (e) { }

  /* R26: link token — tabs opened FROM a link (right-click → open in
     new tab / Ctrl / middle click) can't inherit this tab's sessionStorage
     (Chromium only copies it for target=_blank / window.open). So every
     tab-link href carries _st=<token>; the newly opened tab sees it,
     matches it against the shared localStorage copy and adopts the
     session. A URL typed fresh / bookmarked never has _st → login gate. */
  var LINK_TOK = "";
  try {
    LINK_TOK = localStorage.getItem("marib_link") || "";
    if (!LINK_TOK) {
      LINK_TOK = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
        : String(Math.random()).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem("marib_link", LINK_TOK);
    }
  } catch (e) { /* storage blocked — links simply lose the bridge */ }

  /* ---------------- i18n helpers ---------------- */
  var T = I18N.t, TP = I18N.ta, TV = I18N.tv, TS = I18N.ts, TB = I18N.tb;
  function fmtInt(v) { return I18N.fmtInt(v); }
  function fmtPct(v, d) { return I18N.fmtPct(v, d); }
  function pctF(d) { return function (v) { return I18N.pctV(v, d); }; }
  function wd(iso) { return I18N.dayFull(U.isoDayOfWeek(iso)); }
  function machShort(n) { return I18N.is("tr") ? "Makine " + n : "Machine " + n; }
  function otSrcLine(n) { return I18N.is("tr") ? "FM · Hat " + n : "OT · Line " + n; }
  function setSub(el, txt) { el.innerHTML = txt; I18N.fixSubCaps(el); }

  /* ---------------- tiny helpers ---------------- */
  function $(id) { return document.getElementById(id); }

  /* ---------------- lazy SheetJS (R24 perf) ----------------
     xlsx.full.min.js is ~950KB and is ONLY needed when an Excel file
     is parsed (upload) or exported (activity log). Loading it upfront
     made the first paint heavy; it now loads on first use and is
     cached by the browser afterwards.
     R59: المصدر الوحيد بقى MaribKit.ensureXLSX (kit.js) — نفس السلوك
     بالظبط (الوعد المخزن + إعادة المحاولة عند الفشل) بس مرة واحدة
     للموقع كله بدل نسخة هنا ونسخة في الاتزان. */
  function ensureXLSX() { return MaribKit.ensureXLSX(); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function stOf(v, t, inv) { return inv ? U.statusInv(v, t) : U.statusOf(v, t); }
  function stColor(st) { return st === "good" ? C_GOOD : st === "warn" ? C_WARN : C_BAD; }
  function chip(txt) { return '<span class="chip num">' + txt + "</span>"; }
  function stChip(v, t, inv) {
    var st = stOf(v, t, inv), lbl = T("st_" + st);
    return '<span class="st ' + st + '"><i></i>' + lbl + "</span>";
  }
  function toast(msg, cls) {
    var t = $("toast");
    t.textContent = msg; t.className = "on " + (cls || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = ""; }, 3800);
  }

  /* tooltip (own impl — app-level charts) */
  var tipEl = null;
  function tipOn(node, htmlFn) {
    node.addEventListener("mousemove", function (ev) {
      tipEl = tipEl || $("tip");
      tipEl.innerHTML = htmlFn();
      tipEl.style.display = "block";
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var x = ev.clientX - w - 14; if (x < 6) x = ev.clientX + 14;
      var y = ev.clientY + 12; if (y + h > innerHeight - 8) y = ev.clientY - h - 10;
      tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
    });
    node.addEventListener("mouseleave", function () { if (tipEl) tipEl.style.display = "none"; });
  }

  /* count-up animation */
  function countUp(el, target, fmt, ms) {
    if (target == null || !isFinite(target)) { el.textContent = fmt(target); return; }
    ms = ms || 750;
    var t0 = performance.now(), from = 0;
    try { from = parseFloat(el.getAttribute("data-cur")) || 0; } catch (e) { }
    function frame(t) {
      var p = Math.min(1, (t - t0) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      var v = from + (target - from) * e;
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(frame);
      else el.setAttribute("data-cur", String(target));
    }
    requestAnimationFrame(frame);
  }

  var UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14.5 12 8l7 6.5"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.5 12 16l7-6.5"/></svg>';

  /* ---------------- KPI tile builders ---------------- */
  function kpiTile(o) {
    var d = document.createElement("div");
    d.className = "kpi";
    var deltaHTML = "";
    if (o.delta != null && isFinite(o.delta)) {
      var up = o.delta > 0, good = o.goodUp ? up : !up;
      deltaHTML = '<div class="kpi-delta ' + (o.delta === 0 ? "flat" : good ? "up" : "down") + '">' +
        (o.delta === 0 ? "≈" : (up ? UP : DOWN) + (o.deltaFmt ? o.deltaFmt(o.delta) : fmtInt(Math.abs(o.delta)))) +
        '<span style="font-weight:600;margin-inline-start:2px">' + (o.deltaLabel || T("d_label")) + "</span></div>";
    }
    d.innerHTML =
      '<div class="kpi-head"><div class="kpi-tt"><h5>' + o.title + "</h5>" +
        '<span class="en">' + o.en + "</span></div>" +
        (o.badge ? '<span class="kpi-badge num">' + o.badge + "</span>" : "") + "</div>" +
      '<div class="kpi-val"><b class="num" id="' + o.id + '" data-cur="0">0</b>' +
        (o.unit ? '<span class="unit">' + o.unit + "</span>" : "") + "</div>" +
      (o.sub ? '<div class="kpi-sub">' + o.sub + "</div>" : "") +
      deltaHTML;
    /* round 8: KPI tiles can open the drill-through of their domain
       (OT cards → full OT details page, etc.) */
    if (o.drill && window.__maribDrill) {
      d.classList.add("kpi-drill");
      d.setAttribute("role", "button");
      d.addEventListener("click", function () { window.__maribDrill(o.drill.type, o.drill.value, o.drill); });
    }
    return d;
  }

  function kpiRingTile(o) {
    var d = document.createElement("div");
    d.className = "kpi";
    var CIRC = 2 * Math.PI * 40;
    d.innerHTML =
      '<div class="kpi-head"><div class="kpi-tt"><h5>' + o.title + "</h5>" +
        '<span class="en">' + o.en + "</span></div>" +
        (o.badge ? '<span class="kpi-badge num">' + o.badge + "</span>" : "") + "</div>" +
      '<div class="kpi-ring">' +
        '<div class="mring"><svg viewBox="0 0 92 92">' +
          '<circle class="track" cx="46" cy="46" r="40"/>' +
          '<circle class="bar" id="' + o.id + '" cx="46" cy="46" r="40" stroke-dasharray="' + CIRC + '" stroke-dashoffset="' + CIRC + '"/>' +
        '</svg><div class="val num" id="' + o.id + 'v">0%</div></div>' +
        '<div class="ring-col">' +
          '<div class="kpi-sub" style="margin:0 0 6px">' + o.sub + "</div>" +
          (o.delta != null && isFinite(o.delta) ? deltaHTML_(o) : "") +
        "</div>" +
      "</div>";
    return d;
  }
  function deltaHTML_(o) {
    var up = o.delta > 0, good = o.goodUp ? up : !up;
    return '<div class="kpi-delta ' + (o.delta === 0 ? "flat" : good ? "up" : "down") + '">' +
      (o.delta === 0 ? "≈" : (up ? UP : DOWN)) +
      (o.deltaFmt ? o.deltaFmt(Math.abs(o.delta)) : fmtInt(Math.abs(o.delta))) + "</div>";
  }

  function setKpi(id, val, fmt) { var el = $(id); if (el) countUp(el, val, fmt); }

  /* ring helper for values in 0..1 (pct) */
  function animateRing(id, v) {
    var bar = $(id), lab = $(id + "v");
    if (!bar) return;
    var CIRC = 2 * Math.PI * 40;
    var off = v == null ? CIRC : CIRC * (1 - Math.max(0, Math.min(1, v)));
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.strokeDashoffset = off; }); });
    if (lab) countUp(lab, v == null ? 0 : v * 100, pctF(1));
  }

  /* ============================================================
     COMPARE ENGINE (round 8)
     Each chart card has a small ⇄ button. The chosen comparison mode
     resolves a period of the SAME shape as the current selection
     (previous period / previous month / two months back / same month
     last year), the model is recomputed for that window with the same
     line/section/supervisor filters, and charts get a compare strip +
     ghost series + per-bar deltas.
     ============================================================ */
  var cmpCache = {};   /* mode -> {info, k} — rebuilt on every render */

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function monthShift(y, m1, back) {
    var t = y * 12 + (m1 - 1) - back;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  }
  function cmpInfoOf(mode, f) {
    var md = state.model;
    if (!md) return null;
    var from = f.from || md.dateMin, to = f.to || md.dateMax;
    if (!from || !to) return null;
    if (mode === "prev") {
      var days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
      var pFrom = U.isoAddDays(from, -days), pTo = U.isoAddDays(from, -1);
      return { from: pFrom, to: pTo, label: T("cmp_prev") + " · " + U.isoShort(pFrom) + " — " + U.isoShort(pTo) };
    }
    if (mode === "py") {
      var yFrom = (from.slice(0, 4) * 1 - 1) + from.slice(4);
      var yTo = (to.slice(0, 4) * 1 - 1) + to.slice(4);
      return { from: yFrom, to: yTo, label: T("cmp_py") + " · " + U.isoShort(yFrom) + " — " + U.isoShort(yTo) };
    }
    var back = mode === "pm" ? 1 : 2;
    var y = +from.slice(0, 4), mth = +from.slice(5, 7);
    var mm = monthShift(y, mth, back);
    var lastD = new Date(Date.UTC(mm.y, mm.m, 0)).getUTCDate();
    var fS = mm.y + "-" + pad2(mm.m) + "-01";
    var tS = mm.y + "-" + pad2(mm.m) + "-" + pad2(lastD);
    return { from: fS, to: tS, label: T(mode === "pm" ? "cmp_pm" : "cmp_pm2") + " · " + fS.slice(0, 7) };
  }
  function cmpK2(mode) {
    if (cmpCache[mode]) return cmpCache[mode];
    var f = readFilters();
    var info = cmpInfoOf(mode, f);
    var k2 = null;
    if (info) {
      try {
        k2 = MaribCore.compute((window.App && App.scopedModel ? App.scopedModel() : state.model) || state.model, { from: info.from, to: info.to, line: f.line, section: f.section, sup: f.sup }, { noPrev: true });
      } catch (e) { k2 = null; }
      if (k2 && !k2.factoryTarget && !k2.ddRows && !k2.attRows) k2 = null;  /* window has no records */
    }
    cmpCache[mode] = { info: info, k: k2 };
    return cmpCache[mode];
  }
  /* builds the per-card cmp object; `build` fills cells/ghost/cmpMap
     from the compared-period kpi set (k2) */
  function cmpCard(cardId, build) {
    var mode = state.cmp[cardId];
    if (!mode) return null;
    var c = cmpK2(mode);
    if (!c || !c.info) return null;
    var cmp = { label: c.info.label, empty: !c.k, cells: [], ghost: null, cmpMap: null, goodUp: true, fmt: fmtInt };
    if (build && c.k) build(cmp, c.k);
    return cmp;
  }

  /* ============================================================
     PAGE: OVERVIEW
     ============================================================ */
  /* display-safe daily efficiency: a day whose recorded minutes are
     physically impossible (or not recorded at all) shows no point —
     the aggregate KPIs stay exactly as the source data computes them */
  function effOK(s) {
    return s.eff != null && isFinite(s.eff) && s.eff <= 1.5 && (s.minProd || 0) > 0;
  }

  function shortName(s) {
    var parts = String(s || "").trim().split(/\s+/);
    return parts.length > 2 ? parts[0] + " " + parts[1] : String(s || "");
  }

  /* ============================================================
     PAGE: SUPERVISORS — R23 #6/#7 + R24 #2/#7
     Three groups: مشرفي الأقسام / رؤساء الخطوط / مديري الصالة.
     The page stays EMPTY until a group is chosen (like attendance),
     the lists follow the settings classification (assignments first,
     data-derived defaults otherwise), and the "needs attention" chart
     shows ONLY the people below target.
     ============================================================ */
  function inRange(iso, f) {
    if (f.from && iso < f.from) return false;
    if (f.to && iso > f.to) return false;
    return true;
  }

  /* round 8: domain-aware drill-through — OT / attendance / efficiency
     clicks now open a detail page that matches what was clicked, instead
     of the generic production sheet. type "period" (from OT cards) shows
     the whole active range. */
  function openDrill(type, value, drill) {
    if (!state.model) return;
    var m = scopedModel() || state.model;
    var f = readFilters();
    var domain = (drill && drill.domain) || "prod";

    var baseTitles = {
      sup: [value, T("dr_sub_sup")],
      section: [I18N.drTitleSec(value), T("dr_sub_sec")],
      line: [I18N.drTitleLine(value), T("dr_sub_line")],
      date: [dayTitle(value), T("dr_sub_date")],
      pmachine: [I18N.drTitlePm(value), T("dr_sub_pmach")],
      pmline: [I18N.drTitlePmLine(value), T("dr_sub_pmline")],
      period: [T("dr_t_period"), ""]
    };
    var subKeys = { ot: "dr_sub_ot", att: "dr_sub_att", eff: "dr_sub_eff" };
    var t = baseTitles[type] || [String(value), "DETAILS"];
    if (subKeys[domain]) t = [type === "period" ? T("dr_t_period") : t[0], T(subKeys[domain])];
    $("drillTitle").textContent = t[0];
    setSub($("drillSub"), t[1]);

    /* entity-filtered raw rows (same predicate logic as MaribCore.compute) */
    var dd = [], ot = [], pm = [], lo = [], att = [];
    m.dd.forEach(function (r) {
      if (!inRange(r.date, f)) return;
      if (f.line && !f.line.has(r.line)) return;
      if (f.section && !f.section.has(r.section)) return;
      if (f.sup && !f.sup.has(r.supervisor)) return;
      if (type === "sup" && r.supervisor !== value) return;
      if (type === "section" && r.section !== value) return;
      if (type === "line" && String(r.line) !== String(value)) return;
      if (type === "date" && r.date !== value) return;
      dd.push(r);
    });
    m.ot.forEach(function (r) {
      if (!inRange(r.date, f)) return;
      if (f.line && !f.line.has(r.line)) return;
      if (f.section && !f.section.has(r.section)) return;
      if (f.sup && !f.sup.has(r.supervisor)) return;
      if (type === "sup" && r.supervisor !== value) return;
      if (type === "section" && r.section !== value) return;
      if (type === "line" && String(r.line) !== String(value)) return;
      if (type === "date" && r.date !== value) return;
      ot.push(r);
    });
    m.pm.forEach(function (r) {
      if (!inRange(r.date, f)) return;
      if (f.sup && !f.sup.has(r.supervisor)) return;
      if (type === "sup" && r.supervisor !== value) return;
      if (type === "date" && r.date !== value) return;
      if (type === "pmachine" && String(r.machine) !== String(value)) return;
      if (type === "pmline" && String(r.line) !== String(value)) return;
      pm.push(r);
    });
    m.lo.forEach(function (r) {
      if (!inRange(r.date, f)) return;
      if (f.line && !f.line.has(r.line)) return;
      if (type === "line" && String(r.line) !== String(value)) return;
      if (type === "date" && r.date !== value) return;
      lo.push(r);
    });
    m.att.forEach(function (r) {
      if (!inRange(r.date, f)) return;
      if (type === "date" && r.date !== value) return;
      att.push(r);
    });

    /* ---- KPI cards ---- */
    var agg = { target: 0, actual: 0, minProd: 0, cap: 0, otMin: 0, ddW: 0, otW: 0 };
    dd.forEach(function (r) { agg.target += r.target || 0; agg.actual += r.actualProd || 0; agg.minProd += r.minProd || 0; agg.cap += r.minAvail || 0; agg.ddW += r.attWorkers || 0; });
    ot.forEach(function (r) { agg.otMin += r.minAvail || 0; agg.cap += r.minAvail || 0; agg.minProd += r.minProd || 0; agg.actual += r.actualProd || 0; agg.target += r.target || 0; agg.otW += r.attWorkers || 0; });
    pm.forEach(function (r) {
      agg.cap += (r.minAvail || 0) + (r.otMin || 0); agg.otMin += r.otMin || 0; agg.minProd += r.minProd || 0;
      agg.actual += (r.actualProd || 0) + (r.otProd || 0); agg.target += r.target || 0;
    });
    lo.forEach(function (r) { if (type === "line" || type === "date") { agg.target += r.target || 0; agg.actual += r.actual || 0; } });
    var achv = agg.target ? agg.actual / agg.target : null;
    var eff = agg.cap ? agg.minProd / agg.cap : null;
    var attPct = att.length ? att.reduce(function (s, r) { return s + (r.score || 0); }, 0) / att.length : null;

    var kpiDefs;
    var otPct = (agg.ddW + agg.otW) ? agg.otW / (agg.ddW + agg.otW) : null; /* R34: worker-based */
    if (domain === "ot") {
      kpiDefs = [
        [T("dk_ot"), fmtPct(otPct, 2), (agg.ddW + agg.otW) ? I18N.subOtWrk(agg.otW, agg.ddW + agg.otW) : ""],
        [T("t_dd_wrk"), fmtInt(agg.ddW), ""],
        [T("t_ot_wrk"), fmtInt(agg.otW), ""],
        [T("t_ot_min2"), fmtInt(agg.otMin), ""]
      ];
    } else if (domain === "att") {
      kpiDefs = [
        [T("t_att"), attPct == null ? "—" : I18N.pctV(attPct * 100, 1), I18N.count(att.length, "rec")],
        [T("t_present"), fmtInt(dd.reduce(function (s, r) { return s + (r.attWorkers || 0); }, 0)), ""],
        [T("t_absent"), fmtInt(dd.reduce(function (s, r) { return s + (r.absent || 0); }, 0)), ""],
        [T("t_recs"), fmtInt(att.length), ""]
      ];
    } else if (domain === "eff") {
      kpiDefs = [
        [T("t_eff"), fmtPct(eff), ""],
        [T("t_prodmin"), fmtInt(agg.minProd), ""],
        [T("t_availmin"), fmtInt(agg.cap), ""],
        [T("dk_ot"), fmtPct(otPct, 2), ""]
      ];
    } else if (type === "date") {
      kpiDefs = [
        [T("t_actual"), fmtInt(agg.actual), T("u_pcs")],
        [T("t_target"), fmtInt(agg.target), T("u_pcs")],
        [T("t_real"), fmtPct(achv), ""],
        [T("t_att"), attPct == null ? "—" : I18N.pctV(attPct * 100, 1), I18N.count(att.length, "rec")]
      ];
    } else if (type === "pmachine" || type === "pmline") {
      kpiDefs = [
        [T("t_target"), fmtInt(agg.target), T("u_pcs")],
        [T("t_actual"), fmtInt(agg.actual), T("u_pcs")],
        [T("t_real"), fmtPct(achv), ""],
        [T("dk_ot"), fmtPct(otPct, 2), agg.otMin ? I18N.subOtMin(agg.otMin) : ""]
      ];
    } else {
      kpiDefs = [
        [T("t_target"), fmtInt(agg.target), T("u_pcs")],
        [T("t_actual"), fmtInt(agg.actual), T("u_pcs")],
        [T("t_real"), fmtPct(achv), achv == null ? "" : stChip(achv, TH.achievement)],
        [T("dk_ot"), fmtPct(otPct, 2), agg.otMin ? I18N.subOtMin(agg.otMin) : ""]
      ];
    }
    var kpiHtml = kpiDefs.map(function (x) {
      return '<div class="dk"><h6>' + x[0] + '</h6><div><b class="num">' + x[1] + "</b><small>" + x[2] + "</small></div></div>";
    }).join("");
    $("drillKpis").innerHTML = kpiHtml;

    /* ---- trend chart ---- */
    $("drillChartTitle").textContent = domain === "ot" ? T("dr_ct_ot")
      : domain === "att" ? T("dr_ct_att")
      : domain === "eff" ? T("dr_ct_eff")
      : (type === "date" ? T("dr_ct_sups") : TV("c_drillTrend"));
    var chartHost = $("drillChart");
    chartHost.innerHTML = "";
    /* show the modal FIRST so the chart measures a real container width */
    $("drill").classList.add("on");
    $("drill").querySelector(".drill-panel").scrollTop = 0;

    if (domain === "ot" || domain === "att" || domain === "eff") {
      /* daily series in the clicked domain — for a single-day drill the
         whole active range is drawn so the day keeps its context */
      var useRange = type === "date" || type === "period";
      var rd = useRange ? [] : dd, ro = useRange ? [] : ot, rp = useRange ? [] : pm, ra = useRange ? [] : att;
      if (useRange) {
        m.dd.forEach(function (r) { if (inRange(r.date, f) && (!f.line || f.line.has(r.line)) && (!f.section || f.section.has(r.section)) && (!f.sup || f.sup.has(r.supervisor))) rd.push(r); });
        m.ot.forEach(function (r) { if (inRange(r.date, f) && (!f.line || f.line.has(r.line)) && (!f.section || f.section.has(r.section)) && (!f.sup || f.sup.has(r.supervisor))) ro.push(r); });
        m.pm.forEach(function (r) { if (inRange(r.date, f) && (!f.sup || f.sup.has(r.supervisor))) rp.push(r); });
        m.att.forEach(function (r) { if (inRange(r.date, f)) ra.push(r); });
      }
      var dayAgg = {};
      function dslot(d) { if (!dayAgg[d]) dayAgg[d] = { cap: 0, ot: 0, mp: 0, sc: 0, n: 0, ddW: 0, otW: 0 }; return dayAgg[d]; }
      rd.forEach(function (r) { var s = dslot(r.date); s.cap += r.minAvail || 0; s.mp += r.minProd || 0; s.ddW += r.attWorkers || 0; });
      ro.forEach(function (r) { var s = dslot(r.date); s.cap += r.minAvail || 0; s.ot += r.minAvail || 0; s.mp += r.minProd || 0; s.otW += r.attWorkers || 0; });
      rp.forEach(function (r) { var s = dslot(r.date); s.cap += (r.minAvail || 0) + (r.otMin || 0); s.ot += r.otMin || 0; s.mp += r.minProd || 0; });
      ra.forEach(function (r) { var s = dslot(r.date); s.sc += r.score || 0; s.n++; });
      var ddK = Object.keys(dayAgg).sort();
      var pts = ddK.map(function (d) {
        var s = dayAgg[d], y = null, tip;
        if (domain === "ot") {
          y = (s.ddW + s.otW) ? s.otW / (s.ddW + s.otW) * 100 : null;
          tip = [[T("t_ot_pct"), fmtPct((s.ddW + s.otW) ? s.otW / (s.ddW + s.otW) : null, 2)], [T("t_ot_wrk"), fmtInt(s.otW)], [T("t_dd_wrk"), fmtInt(s.ddW)], [T("t_tot_wrk"), fmtInt(s.ddW + s.otW)], [T("t_ot_min"), fmtInt(s.ot)], [T("t_availmin"), fmtInt(s.cap)]];
        } else if (domain === "eff") {
          y = s.cap ? s.mp / s.cap * 100 : null;
          tip = [[T("t_eff"), fmtPct(s.cap ? s.mp / s.cap : null)], [T("t_prodmin"), fmtInt(s.mp)], [T("t_availmin"), fmtInt(s.cap)]];
        } else {
          y = s.n ? s.sc / s.n * 100 : null;
          tip = [[T("t_att"), fmtPct(s.n ? s.sc / s.n : null)], [T("t_recs"), fmtInt(s.n)]];
        }
        return { label: U.isoShort(d), y: y, tipTitle: wd(d) + " " + U.isoShort(d), tip: tip };
      });
      C.line(chartHost, {
        height: 230, dataLabels: true, points: pts,
        color: domain === "ot" ? C_WARN : domain === "att" ? C_GOOD : C_ACCENT2,
        yFmt: pctF(0), fmt: pctF(0), pctScale: true,
        refLines: domain === "ot" ? [{ y: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" }]
          : domain === "att" ? [{ y: TH.attendance.good * 100, color: C_WARN }] : []
      });
    } else if (type === "date") {
      var bySup = {};
      dd.forEach(function (r) {
        if (r.supervisor == null) return;
        if (!bySup[r.supervisor]) bySup[r.supervisor] = { supervisor: r.supervisor, target: 0, actual: 0 };
        bySup[r.supervisor].target += r.target || 0; bySup[r.supervisor].actual += r.actualProd || 0;
      });
      pm.forEach(function (r) {
        if (r.supervisor == null) return;
        if (!bySup[r.supervisor]) bySup[r.supervisor] = { supervisor: r.supervisor, target: 0, actual: 0 };
        bySup[r.supervisor].target += r.target || 0; bySup[r.supervisor].actual += (r.actualProd || 0) + (r.otProd || 0);
      });
      var items = Object.keys(bySup).map(function (S) { return bySup[S]; })
        .sort(function (a, b) { return b.actual - a.actual; });
      C.vbar(chartHost, {
        height: Math.max(210, Math.min(11, items.length) * 40 + 50),
        items: items.map(function (S) {
          var st = S.target ? S.actual / S.target : null;
          return { label: shortName(S.supervisor), value: S.actual, color: st ? stColor(stOf(st, TH.achievement)) : C_MUTED, tip: [[T("t_sup"), S.supervisor], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)]] };
        }),
        fmt: fmtInt, valueName: T("vn_actual")
      });
    } else {
      var daily = {};
      function slot(d) { if (!daily[d]) daily[d] = { d: d, actual: 0 }; return daily[d]; }
      dd.forEach(function (r) { slot(r.date).actual += r.actualProd || 0; });
      ot.forEach(function (r) { slot(r.date).actual += r.actualProd || 0; });
      pm.forEach(function (r) { slot(r.date).actual += (r.actualProd || 0) + (r.otProd || 0); });
      lo.forEach(function (r) { if (type === "line") slot(r.date).actual += r.actual || 0; });
      var dates = Object.keys(daily).sort();
      C.line(chartHost, {
        height: 230, dataLabels: true,
        points: dates.map(function (d) {
          return {
            label: U.isoShort(d), y: daily[d].actual,
            tipTitle: wd(d) + " " + U.isoShort(d),
            tip: [[T("t_actual"), fmtInt(daily[d].actual)]]
          };
        }),
        color: C_ACCENT,
        yFmt: function (v) { return fmtInt(Math.round(v)); },
        fmt: function (v) { return fmtInt(Math.round(v)); }
      });
    }

    /* ---- records table ---- */
    var cols, rows;
    if (domain === "ot") {
      if (type === "date") {
        cols = T("th_dr_otd");
        rows = [];
        function wday(r) { return r.date ? wd(r.date) + " " + U.isoShort(r.date) : ""; }
        ot.forEach(function (r) {
          rows.push([wday(r), r.supervisor || "—", r.line != null ? I18N.lineN(r.line) : "—", fmtInt(r.attWorkers), fmtInt(r.minAvail)]);
        });
        pm.forEach(function (r) {
          if ((r.otMin || 0) > 0) rows.push([wday(r), r.supervisor || "—", machShort(r.machine || "—") + (r.line != null ? " · " + I18N.lineN(r.line) : ""), "1", fmtInt(r.otMin)]);
        });
      } else {
        cols = T("th_dr_otp");
        var byDayOT = {};
        ot.forEach(function (r) { var s = byDayOT[r.date] = byDayOT[r.date] || { cap: 0, ot: 0, mp: 0, ddW: 0, otW: 0 }; s.cap += r.minAvail || 0; s.ot += r.minAvail || 0; s.mp += r.minProd || 0; s.otW += r.attWorkers || 0; });
        pm.forEach(function (r) { var s = byDayOT[r.date] = byDayOT[r.date] || { cap: 0, ot: 0, mp: 0, ddW: 0, otW: 0 }; s.cap += (r.minAvail || 0) + (r.otMin || 0); s.ot += r.otMin || 0; s.mp += r.minProd || 0; });
        dd.forEach(function (r) { var s = byDayOT[r.date] = byDayOT[r.date] || { cap: 0, ot: 0, mp: 0, ddW: 0, otW: 0 }; s.cap += r.minAvail || 0; s.mp += r.minProd || 0; s.ddW += r.attWorkers || 0; });
        rows = Object.keys(byDayOT).sort().map(function (d) {
          var s = byDayOT[d];
          return [dayTitle(d), fmtInt(s.ddW), fmtInt(s.otW), fmtInt(s.ddW + s.otW), fmtPct((s.ddW + s.otW) ? s.otW / (s.ddW + s.otW) : null, 2), fmtInt(s.ot)];
        });
      }
    } else if (domain === "att") {
      if (type === "date") {
        cols = T("th_dr_attd");
        rows = att.map(function (r) { return [r.name || "—", r.score ? T("st_present") : T("st_absent")]; });
      } else {
        cols = T("th_att");
        var byDayA = {};
        att.forEach(function (r) { var s = byDayA[r.date] = byDayA[r.date] || { sc: 0, n: 0, att: 0, ab: 0 }; s.sc += r.score || 0; s.n++; });
        dd.forEach(function (r) { var s = byDayA[r.date] = byDayA[r.date] || { sc: 0, n: 0, att: 0, ab: 0 }; s.att += r.attWorkers || 0; s.ab += r.absent || 0; });
        rows = Object.keys(byDayA).sort().map(function (d) {
          var s = byDayA[d];
          return [dayTitle(d), fmtPct(s.n ? s.sc / s.n : null), fmtInt(s.att), fmtInt(s.ab)];
        });
      }
    } else if (domain === "eff") {
      cols = T("th_dr_effp");
      var byDayE = {};
      function eslot(d) { if (!byDayE[d]) byDayE[d] = { cap: 0, mp: 0 }; return byDayE[d]; }
      dd.forEach(function (r) { var s = eslot(r.date); s.cap += r.minAvail || 0; s.mp += r.minProd || 0; });
      ot.forEach(function (r) { var s = eslot(r.date); s.cap += r.minAvail || 0; s.mp += r.minProd || 0; });
      pm.forEach(function (r) { var s = eslot(r.date); s.cap += (r.minAvail || 0) + (r.otMin || 0); s.mp += r.minProd || 0; });
      rows = Object.keys(byDayE).sort().map(function (d) {
        var s = byDayE[d];
        return [dayTitle(d), fmtInt(s.cap), fmtInt(s.mp), fmtPct(s.cap ? s.mp / s.cap : null)];
      });
    } else if (type === "sup") {
      cols = T("th_dr_sup");
      rows = [];
      function wday(r) { return r.date ? wd(r.date) + " " + U.isoShort(r.date) : ""; }
      dd.forEach(function (r) {
        rows.push([wday(r), I18N.lineN(r.line || "—") + " · " + (r.section ? I18N.sectionName(r.section) : "—"), fmtInt(r.target), fmtInt(r.actualProd), fmtPct(r.target ? r.actualProd / r.target : null)]);
      });
      ot.forEach(function (r) {
        rows.push([wday(r), otSrcLine(r.line || "—"), fmtInt(r.target), fmtInt(r.actualProd), fmtPct(r.target ? r.actualProd / r.target : null)]);
      });
      pm.forEach(function (r) {
        rows.push([wday(r), machShort(r.machine || "—") + (r.client ? " · " + r.client : ""), fmtInt(r.target), fmtInt((r.actualProd || 0) + (r.otProd || 0)), fmtPct(r.achv)]);
      });
    } else if (type === "section") {
      cols = T("th_dr_sec");
      var byS = {};
      dd.forEach(function (r) {
        var key = (r.supervisor || "—") + "|" + (r.line || "—");
        if (!byS[key]) byS[key] = { supervisor: r.supervisor, line: r.line, target: 0, actual: 0 };
        byS[key].target += r.target || 0; byS[key].actual += r.actualProd || 0;
      });
      rows = Object.keys(byS).map(function (key) {
        var b = byS[key];
        return [b.supervisor || "—", I18N.lineN(b.line || "—"), fmtInt(b.target), fmtInt(b.actual), fmtPct(b.target ? b.actual / b.target : null)];
      });
    } else if (type === "line") {
      cols = T("th_dr_line");
      var bySec = {};
      dd.forEach(function (r) {
        var key = r.date + "|" + (r.section || "—");
        if (!bySec[key]) bySec[key] = { date: r.date, section: r.section, target: 0, actual: 0 };
        bySec[key].target += r.target || 0; bySec[key].actual += r.actualProd || 0;
      });
      rows = Object.keys(bySec).sort().map(function (key) {
        var b = bySec[key];
        return [U.isoShort(b.date), b.section ? I18N.sectionName(b.section) : "—", fmtInt(b.target), fmtInt(b.actual), fmtPct(b.target ? b.actual / b.target : null)];
      });
    } else if (type === "date") {
      cols = T("th_dr_date");
      rows = dd.map(function (r) {
        return [r.supervisor || "—", I18N.lineN(r.line || "—"), r.section ? I18N.sectionName(r.section) : "—", fmtInt(r.target), fmtInt(r.actualProd)];
      });
    } else { /* pmachine / pmline */
      cols = T("th_dr_pm");
      rows = pm.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (r) {
        return [U.isoShort(r.date), I18N.lineN(r.line || "—"), r.client || "—", r.po == null ? "—" : r.po, fmtInt(r.target), fmtInt((r.actualProd || 0) + (r.otProd || 0)), fmtPct(r.achv), fmtPct(r.eff)];
      });
    }
    var thead = "<thead><tr>" + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead>";
    var tbody = "<tbody>" + rows.slice(0, 400).map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody>";
    $("drillTable").innerHTML = thead + tbody;
    $("drillTblChip").textContent = I18N.count(rows.length, "rec");

  }

  function dayTitle(iso) {
    if (!iso) return "—";
    return wd(iso) + " " + U.isoShort(iso);
  }
  window.__maribDrill = openDrill;

  function closeDrill() { $("drill").classList.remove("on"); }

  /* ============================================================
     Filters / nav / render
     ============================================================ */
  function fillFilters(keep) {
    var m = state.model;
    var lSel = $("fLine"), sSel = $("fSup"), cSel = $("fSection"), mSel = $("fMonth");
    var lv = keep ? lSel.value : "", sv = keep ? sSel.value : "", cv = keep ? cSel.value : "", mv = keep ? mSel.value : "";
    lSel.innerHTML = "";
    lSel.add(new Option(T("f_all_lines"), ""));
    (m.lines || []).forEach(function (v) { lSel.add(new Option(I18N.lineN(v), v)); });

    cSel.innerHTML = "";
    cSel.add(new Option(T("f_all_sections"), ""));
    (m.sections || []).forEach(function (v) { cSel.add(new Option(I18N.sectionN(v), v)); });

    sSel.innerHTML = "";
    sSel.add(new Option(T("f_all_sups"), ""));
    (m.supervisors || []).forEach(function (v) { sSel.add(new Option(v, v)); });
    if (lv) lSel.value = lv;
    if (cv) cSel.value = cv;
    if (sv) sSel.value = sv;

    /* month switcher — every month that actually carries data (R23) */
    mSel.innerHTML = "";
    mSel.add(new Option(T("m_all"), ""));
    (m.months || []).forEach(function (mo) { mSel.add(new Option(mo.label, mo.key)); });
    if (mv) mSel.value = mv;

    var fF = $("fFrom"), fT = $("fTo");
    if (m.dateMin) { fF.min = m.dateMin; fT.min = m.dateMin; }
    if (m.dateMax) { fF.max = m.dateMax; fT.max = m.dateMax; }
    /* R36: manager-home month + year selects — refilled on every model
       rebuild / language switch (selection kept while still valid) */
    AppPages.fillMhomeMY(keep);
  }

  function clearQP() {
    document.querySelectorAll(".qp-btn").forEach(function (b) { b.className = "qp-btn"; });
  }

  /* R23: picking/uploading a month pins the date range to that month
     (clamped to the days that actually carry data).
     R25: shares monthRange() with the month quick-filters. */
  function snapToMonth(key, quiet) {
    var m = state.model;
    if (!m || !key || !/^\d{4}-\d{2}$/.test(key)) return;
    var rng = monthRange(key, m);
    $("fFrom").value = rng.from;
    $("fTo").value = rng.to;
    $("fMonth").value = key;
    state.qp = "custom";
    clearQP();
    render();
    if (!quiet) {
      var mo = (m.months || []).filter(function (x) { return x.key === key; })[0];
      if (mo) toast(T("m_jump") + mo.label, "ok");
    }
  }

  /* quick-period chips write the range into the date inputs; the
     inputs are the single source of truth for readFilters() */
  function lastDayOfMonth(y, mth0) {
    var d = new Date(Date.UTC(y, mth0 + 1, 0));   /* 0 → last day of mth0 */
    return d.getUTCDate();
  }
  /* whole calendar month of key "YYYY-MM" as an iso range, clamped to
     the days that actually carry data */
  function monthRange(key, m) {
    var y = +key.slice(0, 4), mth = +key.slice(5, 7) - 1;
    var lastD = lastDayOfMonth(y, mth);
    var first = key + "-01";
    var last = key + "-" + (lastD < 10 ? "0" : "") + lastD;
    if (m.dateMin && first < m.dateMin) first = m.dateMin;
    if (m.dateMax && last > m.dateMax) last = m.dateMax;
    if (first > last) { first = m.dateMin; last = m.dateMax; }
    return { from: first, to: last };
  }
  function applyQP(qp) {
    state.qp = qp;
    var m = state.model;
    var fF = $("fFrom"), fT = $("fTo"), mSel = $("fMonth");
    if (m && m.dateMax) {
      if (qp === "last1") { fF.value = m.dateMax; fT.value = m.dateMax; if (mSel) mSel.value = ""; }
      else if (qp === "last7") { fF.value = U.isoAddDays(m.dateMax, -6); fT.value = m.dateMax; if (mSel) mSel.value = ""; }
      else if (qp === "curMonth" || qp === "prevMonth") {
        /* R25: month quick-filters are driven by the UPLOADED months —
           "الشهر الحالي" = the whole latest month we have a file for,
           "الشهر السابق" = the whole month before it (user request:
           each shows the FULL month, not just days with records). */
        var keys = (m.months || []).map(function (x) { return x.key; }).sort();
        var idx = keys.length - (qp === "curMonth" ? 1 : 2);
        if (idx >= 0 && keys[idx]) {
          var rng = monthRange(keys[idx], m);
          fF.value = rng.from; fT.value = rng.to;
          if (mSel) mSel.value = keys[idx];
        } else {
          fF.value = ""; fT.value = ""; if (mSel) mSel.value = "";
        }
      }
    }
    if (qp === "all") { fF.value = ""; fT.value = ""; if (mSel) mSel.value = ""; }
    document.querySelectorAll(".qp-btn").forEach(function (b) {
      b.className = "qp-btn" + (b.getAttribute("data-qp") === qp ? " on" : "");
    });
    render();
  }

  function readFilters() {
    var m = state.model, f = { from: null, to: null, line: null, section: null, sup: null };
    var a = $("fFrom").value, b = $("fTo").value;
    if (a && b) { f.from = a < b ? a : b; f.to = a < b ? b : a; }
    else if (a) { f.from = a; f.to = a; }
    else if (b) { f.from = b; f.to = b; }
    if (f.from && m && m.dateMin && f.from < m.dateMin) f.from = m.dateMin;
    if (f.to && m && m.dateMax && f.to > m.dateMax) f.to = m.dateMax;
    if ($("fLine").value) f.line = new Set([$("fLine").value]);
    if ($("fSection").value) f.section = new Set([$("fSection").value]);
    if ($("fSup").value) f.sup = new Set([$("fSup").value]);
    return f;
  }

  /* ============================================================
     R25 — URL state (open the dashboard in a new tab / share a link
     and land on the SAME page with the SAME filters)
     The full view state lives in the query string:
       ?page=lines&qp=curMonth&from=..&to=..&month=2026-09
        &line=3&section=Front&sup=..&scope=base&su=sec&att=sups
     syncUrl() runs after every render (single funnel); the session
     cookie keeps the user logged in in the new tab, so restoring
     the URL = restoring the whole view. No history entries are
     created — replaceState only, the back button stays clean.
     ============================================================ */
  /* ============================================================
     R30 — Manager home ("Grafik" view, GÜN / HAFTA / AY)
     Mirrors the manager's Turkish Excel Grafik sheet: a 3-box
     granularity switch (daily / weekly / monthly) driving the 6
     metric charts (VERİMLİLİK + target · output per man-shift ·
     total workers · avg model time · overtime % · absenteeism %).
     It lives BESIDE the classic overview — nothing is removed: the
     dev picks who sees it (settings → رئيسية المدير) and everyone
     else keeps the classic home. On this page only the date-range +
     line + section filters apply (qp / scope / month / supervisor
     are hidden — and any supervisor selection is cleared on entry
     so nothing filters the data invisibly).
     ============================================================ */
  function mhomeActive() {
    var me = window.MaribAuth ? MaribAuth.me() : null;
    if (!me || !state.mhome || !state.mhome.users || !state.mhome.users.length) return false;
    var uid = String(me.uid);
    for (var i = 0; i < state.mhome.users.length; i++) {
      if (String(state.mhome.users[i]) === uid) return true;
    }
    return false;
  }

  function currentQuery() {
    var p = new URLSearchParams();
    if (state.page && state.page !== "overview") p.set("page", state.page);
    if (state.qp && state.qp !== "custom" && state.qp !== "all") p.set("qp", state.qp);
    var fF = $("fFrom"), fT = $("fTo"), mSel = $("fMonth");
    if (fF && fF.value) p.set("from", fF.value);
    if (fT && fT.value) p.set("to", fT.value);
    if (mSel && mSel.value) p.set("month", mSel.value);
    if ($("fLine") && $("fLine").value) p.set("line", $("fLine").value);
    if ($("fSection") && $("fSection").value) p.set("section", $("fSection").value);
    if ($("fSup") && $("fSup").value) p.set("sup", $("fSup").value);
    if (state.scope && state.scope !== "both") p.set("scope", state.scope);
    if (state.suView) p.set("su", state.suView);
    if (state.attView && state.attView !== "workers") p.set("att", state.attView);
    return p;
  }

  /* R26: the nav tabs + sub-tabs are real links now — after every render
     their hrefs are refreshed to carry the CURRENT filters + the link
     token, so "open in new tab" (right-click / Ctrl-click / middle-click)
     lands on the same page with the same data AND the same session. */
  function syncLinkHrefs() {
    document.querySelectorAll("a.nav-btn").forEach(function (a) {
      var p = currentQuery();
      var pg = a.getAttribute("data-page") || "overview";
      if (pg !== "overview") p.set("page", pg); else p.delete("page");
      /* sub-view params only make sense on their own pages */
      if (pg !== "sups") p.delete("su");
      if (pg !== "att") p.delete("att");
      if (LINK_TOK) p.set("_st", LINK_TOK);
      a.setAttribute("href", p.toString() ? "?" + p.toString() : location.pathname);
    });
    document.querySelectorAll("a.su-tab").forEach(function (a) {
      var p = currentQuery();
      p.set("page", "sups");
      p.set("su", a.getAttribute("data-suview") || "sup");
      p.delete("att");
      if (LINK_TOK) p.set("_st", LINK_TOK);
      a.setAttribute("href", "?" + p.toString());
    });
    document.querySelectorAll("a.att-tab").forEach(function (a) {
      var p = currentQuery();
      p.set("page", "att");
      p.set("att", a.getAttribute("data-attview") || "workers");
      p.delete("su");
      if (LINK_TOK) p.set("_st", LINK_TOK);
      a.setAttribute("href", "?" + p.toString());
    });
  }

  function syncUrl() {
    try {
      if (!state.model || !history || !history.replaceState) {
        try { syncLinkHrefs(); } catch (e2) { }
        return;
      }
      var q = currentQuery().toString();
      history.replaceState(null, "", q ? "?" + q : location.pathname);
    } catch (e) { /* URL writing must never break the app */ }
    try { syncLinkHrefs(); } catch (e) { }
  }

  /* boot-time restore: reads the query string back into the DOM
     controls + state, then renders once. Returns true when the URL
     carried a view (so the caller can skip the default snap). */
  function applyQueryState() {
    try {
      if (!state.model) return false;
      var p = new URLSearchParams(bootQuery);   /* captured at load — syncUrl can't clobber it */
      if (!Array.from(p.keys()).length) return false;
      var from = p.get("from"), to = p.get("to");
      if (from) $("fFrom").value = from;
      if (to) $("fTo").value = to;
      var qp = p.get("qp");
      if (qp) state.qp = qp;
      else if (from || to) state.qp = "custom";
      document.querySelectorAll(".qp-btn").forEach(function (b) {
        b.className = "qp-btn" + (qp && b.getAttribute("data-qp") === qp ? " on" : "");
      });
      var mv = p.get("month");
      if (mv && $("fMonth")) { try { $("fMonth").value = mv; } catch (e) { } }
      var selMap = { line: "fLine", section: "fSection", sup: "fSup" };
      Object.keys(selMap).forEach(function (k) {
        var v = p.get(k);
        if (v !== null) { var el = $(selMap[k]); if (el) { try { el.value = v; } catch (e) { } } }
      });
      var scope = p.get("scope");
      if (scope === "base" || scope === "ot" || scope === "both") {
        state.scope = scope;
        document.querySelectorAll(".scope-btn").forEach(function (x) {
          x.classList.toggle("on", x.getAttribute("data-scope") === scope);
        });
      }
      var su = p.get("su");
      if (su) state.suView = su;
      var att = p.get("att");
      if (att === "sups" || att === "workers") setAttView(att);
      var page = p.get("page");
      if (page && $("page-" + page)) goToPage(page);
      else render();
      return true;
    } catch (e) { return false; }
  }

  /* attendance sub-view switch, shared by the tab buttons and the
     URL restore (keeps one code path) */
  function setAttView(v) {
    state.attView = v;
    document.querySelectorAll(".att-tab").forEach(function (x) {
      x.className = "att-tab" + (x.getAttribute("data-attview") === v ? " on" : "");
    });
    if ($("attWorkers")) $("attWorkers").className = "att-view" + (v === "workers" ? " on" : "");
    if ($("attSups")) $("attSups").className = "att-view" + (v === "sups" ? " on" : "");
    if (window.MaribCharts && MaribCharts.redrawIn) {
      MaribCharts.redrawIn(v === "workers" ? $("attWorkers") : $("attSups"));
    }
  }

  /* R23 #8 — scope segment: أساسي (regular time only) / إضافي (overtime
     only) / الاثنين. The OT tab is inherently overtime-only, so the
     segment is hidden there and the full model is used (R24 #5). */
  function scopedModel() {
    var m = state.model;
    if (!m) return null;
    if (!state.scope || state.scope === "both" || state.page === "ot") return m;
    var o = {};
    for (var key in m) o[key] = m[key];
    if (state.scope === "base") {
      o.ot = [];
      o.pm = (m.pm || []).map(function (r) {
        var c = {}; for (var kk in r) c[kk] = r[kk];
        c.otProd = 0; c.otMin = 0;
        return c;
      });
    }
    if (state.scope === "ot") {
      o.dd = []; o.lo = []; o.att = []; o.pm = [];
    }
    return o;
  }

  /* R24 #10 — pick the target revision that applies to the viewed range:
     latest revision with effectiveFrom <= range end. A purely-old range
     keeps the old targets; a range that touches newer dates takes the NEW
     target (exactly the user's rule). Retroactive revisions apply always. */
  function applyTargetsForRange(f) {
    var t = state.targetsMeta;
    if (!t) return;
    var rangeEnd = (f && f.to) || (state.model && state.model.dateMax) || new Date().toISOString().slice(0, 10);
    function pick(v) {
      ["achievement", "efficiency", "overtime", "attendance"].forEach(function (k) {
        if (v && v[k]) {
          if (isFinite(v[k].good)) TH[k].good = v[k].good;
          if (isFinite(v[k].warn)) TH[k].warn = v[k].warn;
        }
      });
    }
    var hist = (t.history || []).filter(function (h) { return h && h.v; });
    var curFrom = (t.retroactive || !t.effectiveFrom) ? "0000-01-01" : t.effectiveFrom;
    if (curFrom <= rangeEnd) { pick(t); return; }
    /* the newest revision starts after the viewed range → fall back to the
       latest revision that was already in effect */
    var cands = hist.filter(function (h) { return (h.from || "0000-01-01") <= rangeEnd; });
    if (cands.length) pick(cands[cands.length - 1].v);
    else if (hist.length) pick(hist[0].v);
  }

  function render() {
    /* R44: لوجوهات شريط العنوان — الصفحة الرئيسية بس (مهام كذا الطريق اللي الصفحة بتتغير بيه) */
    document.body.classList.toggle("pg-home", state.page === "mhome" || state.page === "overview");
    if (!state.model) return;
    /* R31: a dev-picked manager-home user never lands on the classic
       overview — any render that finds him there hops to his home. */
    if (state.page === "overview" && mhomeActive()) { goToPage("mhome"); return; }
    cmpCache = {};   /* round 8: compare windows are re-resolved per render */
    var f = readFilters();
    applyTargetsForRange(f);
    var sm = scopedModel() || state.model;
    var k = MaribCore.compute(sm, f);
    state.k = k;
    var days = (k.datesInRange || []).length;
    var fromTxt = f.from || state.model.dateMin, toTxt = f.to || state.model.dateMax;
    $("dateChip").textContent =
      (fromTxt ? U.isoShort(fromTxt) : "—") + " — " + (toTxt ? U.isoShort(toTxt) : "—") + I18N.dateChip(days);
    if (state.page === "overview") AppPages.overview(k, sm);
    else if (state.page === "mhome") AppPages.mhome();
    else if (state.page === "lines") AppPages.lines(k, sm);
    else if (state.page === "sections") AppPages.sections(k, sm);
    else if (state.page === "sups") AppPages.sups(k, sm);
    else if (state.page === "pm") AppPages.pm(k, sm);
    else if (state.page === "ot") AppPages.ot(k, sm);
    else if (state.page === "att") AppPages.att(k, sm);
    else if (state.page === "data") renderDataPage();
    /* R24 #5: the 3 scope buttons never show on the OT tab */
    var seg = $("scopeSeg");
    if (seg) seg.classList.toggle("hidden", state.page === "ot");
    /* R24 #7: supervisors tab stays empty until a group is chosen */
    var suP = $("suPrompt"), suV = $("suView");
    if (suP && suV) {
      var hasView = !!state.suView;
      suP.style.display = hasView ? "none" : "";
      suV.className = "su-view" + (hasView ? " on" : "");
      document.querySelectorAll(".su-tab").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-suview") === state.suView);
      });
    }
    syncCmpBtns();
    syncUrl();   /* R25: every render refreshes the shareable URL */
  }

  /* round 8: ⇄ button states follow the per-card compare modes */
  function syncCmpBtns() {
    document.querySelectorAll(".cmp-btn").forEach(function (b) {
      b.classList.toggle("on", !!state.cmp[b.getAttribute("data-cmp")]);
    });
  }

  /* R24 #1 — the browser tab title follows the open site tab;
     the login screen shows the company name instead */
  function updateTitle() {
    var me = window.MaribAuth ? MaribAuth.me() : null;
    if (!me) { document.title = T("brand_name"); return; }
    var label = T("nav_" + (state.page || "overview"));
    document.title = label + " — Marib";
  }

  function goToPage(page) {
    /* R30: the manager home replaces the classic overview for users the
       dev picked in settings (settings → رئيسية المدير) — and only them. */
    if (page === "overview" && mhomeActive()) page = "mhome";
    if (page === "mhome" && !mhomeActive()) page = "overview";
    state.page = page;
    document.body.classList.toggle("pg-mhome", page === "mhome");
    /* R44: لوجوهات الإعدادات/البيانات/المستخدمين في شريط العنوان —
     الصفحة الرئيسية بس */
    document.body.classList.toggle("pg-home", page === "mhome" || page === "overview");
    if (page === "mhome") {
      /* supervisor filter + scope segment are HIDDEN here — clear any active
         selection so nothing filters the manager's numbers invisibly. */
      var fs = $("fSup"); if (fs && fs.value) fs.value = "";
      if (state.scope !== "both") {
        state.scope = "both";
        document.querySelectorAll(".scope-btn").forEach(function (x) {
          x.classList.toggle("on", x.getAttribute("data-scope") === "both");
        });
      }
      /* R36: the يومي/أسبوعي/شهري buttons bucket the CHOSEN month —
         arriving here with a wider range (الكل / URL restore / quick
         filter) snaps back to a single month, then the selects show it */
      var mF = $("fFrom"), mT = $("fTo");
      var ka = mF && mF.value, kb = mT && mT.value;
      var single = (ka && kb && ka.slice(0, 7) === kb.slice(0, 7)) ? ka.slice(0, 7) : "";
      var hasM = function (k) {
        return ((state.model && state.model.months) || []).some(function (mo) { return mo.key === k; });
      };
      if (single && hasM(single)) AppPages.syncMhomeMY();
      else if (state.model && state.model.dateMax && hasM(state.model.dateMax.slice(0, 7))) {
        snapToMonth(state.model.dateMax.slice(0, 7), true);
        AppPages.syncMhomeMY();
      }
    }
    document.querySelectorAll(".page").forEach(function (p) {
      p.className = "page" + (p.id === "page-" + page ? " on" : "");
    });
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      var dp = b.getAttribute("data-page");
      b.className = "nav-btn" + (dp === page || (page === "mhome" && dp === "overview") ? " on" : "");
    });
    var rawKey = "pg_" + page;
    var raw = T(rawKey);
    var t = (raw === rawKey) ? [T("nav_" + page), ""] : TP(rawKey);
    $("pageTitle").innerHTML = t[0];
    setSub($("pageSub"), t[1]);
    var ct = document.querySelector(".content");
    if (ct) ct.scrollTop = 0;
    updateTitle();
    render();
  }


  /* ============================================================
     Cloud sync status chip (replaces the unlabeled pulsing dot — R24 #6)
     ============================================================ */
  var curSyncMode = "busy";
  function setSync(mode) {
    curSyncMode = mode;
    var chip = $("syncChip");
    if (!chip) return;
    var lab = chip.querySelector("span");
    var key = "sync_" + (mode === "ok" ? "ok" : mode === "busy" ? "busy" : "err");
    chip.className = mode;
    if (lab) {
      lab.textContent = T(key);
      lab.setAttribute("data-i18n", key);
    }
  }

  /* ============================================================
     Data loading — cloud edition (R23 #9)
     folder / file / drop → parse locally → POST per month (full sync)
     ============================================================ */
  function collectFiles(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (/^~\$/.test(f.name)) continue;
      if (!/\.(xlsx|xlsm)$/i.test(f.name)) continue;
      files.push(f);
    }
    if (!files.length) { toast(T("toast_noexcel"), "err"); return; }
    parseFiles(files);
  }

  function readFile(f) {
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error("read error")); };
      fr.readAsArrayBuffer(f);
    });
  }

  /* one workbook may carry rows from more than one month — split it */
  function splitByMonth(t) {
    var out = {};
    ["dd", "ot", "pm", "att", "lo"].forEach(function (k) {
      (t[k] || []).forEach(function (r) {
        if (!r.date) return;
        var mo = String(r.date).slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(mo)) return;
        if (!out[mo]) out[mo] = { dd: [], ot: [], pm: [], att: [], lo: [] };
        out[mo][k].push(r);
      });
    });
    return out;
  }

  /* full cloud sync: every parsed month is REPLACED on the server, so
     re-uploading the same file updates rows and deletes missing ones.
     After the sync the dashboard jumps to the newest synced month (R23b). */
  function parseFiles(files) {
    /* uploads replace server data — admin/dev only */
    if (window.MaribAuth && MaribAuth.isAdmin && !MaribAuth.isAdmin()) {
      toast(T("toast_need_admin"), "err");
      return;
    }
    state.busy = true;
    setSync("busy");
    var busyBtns = [];
    ["dtFolder", "dtExcel", "ndBtn"].forEach(function (id) {
      var b = $(id); if (b) { b.classList.add("busy"); busyBtns.push(b); }
    });
    var synced = [], names = [];
    var chain = Promise.resolve();
    Array.prototype.forEach.call(files, function (f) {
      chain = chain.then(function () {
        return readFile(f).then(function (buf) {
          return ensureXLSX().then(function (XLSXlib) {
            var report = { errors: [], warnings: [], sheetsMissing: [], rows: {} };
            var t = MaribCore.parseWorkbook(new Uint8Array(buf), XLSXlib, MaribCore.DEFAULT_CONFIG, report);
            if (report.errors.length) throw new Error(f.name);
            names.push(f.name);
            var byMonth = splitByMonth(t);
            var keys = Object.keys(byMonth).sort();
            var inner = Promise.resolve();
            keys.forEach(function (mo) {
              inner = inner.then(function () {
                return MaribCloud.dataSync(mo, packTables(byMonth[mo]), [f.name]).then(function () {
                  synced.push(mo);
                });
              });
            });
            return inner;
          });
        });
      });
    });
    chain.then(function () {
      busyBtns.forEach(function (b) { b.classList.remove("busy"); });
      state.busy = false;
      toast(T("toast_synced"), "ok");
      return cloudLoad().then(function () {
        if (synced.length) snapToMonth(synced[synced.length - 1]);
        if (state.page === "data") renderDataPage();
      });
    }).catch(function () {
      busyBtns.forEach(function (b) { b.classList.remove("busy"); });
      state.busy = false;
      setSync("err");
      toast(T("toast_sync_err"), "err");
    });
  }

  function packTables(t) {
    var out = {};
    Object.keys(t).forEach(function (name) {
      var rows = t[name];
      if (!Array.isArray(rows) || !rows.length) { out[name] = { c: [], r: [] }; return; }
      var keys = Object.keys(rows[0]);
      out[name] = {
        c: keys,
        r: rows.map(function (r) {
          return keys.map(function (key) {
            var v = r[key];
            if (v === undefined || v === null) return null;
            if (typeof v === "number") return v;
            return String(v);
          });
        })
      };
    });
    return out;
  }

  function unpackTables(p) {
    var out = {};
    Object.keys(p).forEach(function (name) {
      var o = p[name], c = o.c, r = o.r;
      out[name] = r.map(function (arr) {
        var row = {};
        c.forEach(function (key, i) { if (arr[i] !== null && arr[i] !== undefined) row[key] = arr[i]; });
        return row;
      });
    });
    return out;
  }

  /* ============================================================
     R42 — مدير الثيمات: الدنيم الكلاسيكي + 3 ثيمات جديدة.
     التطبيق فوري على الموقع كله (الهيكل والاتزان والبوابة والدخول
     والمودالات والرسومات) — الرسومات بتقرأ ألوانها من CSS vars
     فبتتحدث مع أي ثيم. الحفظ: localStorage فورًا + السيرفر للأدمن
     (يبقى الثيم الافتراضي للجميع).
     ============================================================ */
  /* R44: ثيم فاتح واحد بس (بدل التلاتة اللي كانوا بيوجعوا العين) —
     اللي كان مختار أي ثيم فاتح بيتنقل عليه تلقائيًا */
  var THEMES = ["denim", "light"];
  var LEGACY_THEMES = { energy: "light", growth: "light", creative: "light" };
  function applyTheme(id, silent) {
    if (LEGACY_THEMES[id]) id = LEGACY_THEMES[id];
    if (THEMES.indexOf(id) < 0) id = "denim";
    var html = document.documentElement;
    if (id === "denim") html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", id);
    try { localStorage.setItem("marib_theme", id); } catch (e) { }
    syncThemeCards();
    if (!silent) toast(T("th_saved_local"), "ok");
  }
  function currentTheme() {
    var v = (document.documentElement.getAttribute("data-theme") || "denim");
    return THEMES.indexOf(v) >= 0 ? v : "denim";
  }
  function syncThemeCards() {
    var cur = currentTheme();
    document.querySelectorAll("#themeGrid .theme-card").forEach(function (c) {
      c.classList.toggle("on", c.getAttribute("data-theme-id") === cur);
    });
  }
  function bootTheme() {
    var saved = null;
    try { saved = localStorage.getItem("marib_theme"); } catch (e) { }
    if (saved && (THEMES.indexOf(saved) >= 0 || LEGACY_THEMES[saved])) applyTheme(saved, true);
    /* localStorage فاضي؟ هنستنى إعدادات السيرفر (الثيم الافتراضي) —
       applySettings بتعمل بقية الشغل */
  }
  function bindTheme() {
    bootTheme();
    var grid = $("themeGrid");
    if (!grid || grid._bound42) return;
    grid._bound42 = true;
    grid.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".theme-card") : null;
      if (!card) return;
      var id = card.getAttribute("data-theme-id") || "denim";
      applyTheme(id);
      /* الأدمن بيحفظ الثيم افتراضيًا للموقع كله */
      if (MaribAuth.isAdmin && MaribAuth.isAdmin() && window.MaribCloud) {
        MaribCloud.settingsPut("theme", id).then(function () {
          toast(T("th_saved"), "ok");
        }).catch(function () { });
      }
    });
  }

  function applySettings(s) {
    if (s && s.targets) state.targetsMeta = s.targets;
    if (s && s.groups) state.groups = s.groups;
    state.mhome = (s && s.mhome) || null;   /* R30: { users: [id, ...] } — dev-picked viewers of the manager home */
    /* R42: ثيم الموقع الافتراضي (من السيرفر) — بس لو المستخدم مختارش
       واحد على جهازه */
    if (s && s.theme) {
      var local = null;
      try { local = localStorage.getItem("marib_theme"); } catch (e) { }
      if (!local && (THEMES.indexOf(s.theme) >= 0 || LEGACY_THEMES[s.theme])) applyTheme(s.theme, true);
    }
  }

  /* R36: the no-data box has two faces — LOADING (صلي علي النبي) while
     the server data is on its way, EMPTY (upload prompt) only when the
     server truly has no months or the sync failed. The old code showed
     the empty face during the load too, which read as a false alarm. */
  function ndSet(loading) {
    var nd = $("noData"), box = nd ? nd.querySelector(".nd-box") : null;
    if (!nd || !box) return;
    if (loading) { nd.classList.add("on"); box.classList.add("loading"); }
    else box.classList.remove("loading");
  }

  /* fetch server data + settings — called after login/session and after
     every upload; the boot veil is owned by MaribAuth (R23 #5: no flash) */
  function cloudLoad() {
    setSync("busy");
    /* R36: nothing in hand yet → the loading face while the fetch runs */
    if (!state.model || !state.model.dates || !state.model.dates.length) ndSet(true);
    return Promise.all([
      MaribCloud.dataGet(),
      MaribCloud.settingsGet().catch(function () { return {}; })
    ]).then(function (res) {
      var d = res[0] || {}, s = res[1] || {};
      var months = d.months || [];
      applySettings(s);
      if (months.length) {
        var tables = { dd: [], ot: [], pm: [], att: [], lo: [] };
        var monthsMeta = [];
        months.forEach(function (mo) {
          var t = unpackTables(d.pack[mo] || {});
          var cnt = 0;
          Object.keys(tables).forEach(function (k) { tables[k] = tables[k].concat(t[k] || []); cnt += (t[k] || []).length; });
          monthsMeta.push({ key: mo, rows: cnt, last: (d.lastSync || {})[mo] || null });
        });
        state.tables = tables;
        state.monthsMeta = monthsMeta;
        state.source = "cloud";
        boot("cloud", months);
        snapToMonth(months[months.length - 1], true);
        /* R25: a URL that carries a view (?page=..&from=..) wins over the
           default "snap to latest month" — opening the link in a new tab
           (or refreshing it) rebuilds exactly the view it was shared from */
        applyQueryState();
        var nd = $("noData"); if (nd) nd.classList.remove("on");
        ndSet(false);
        /* R25: React hydration can restore the SSR <title> once, AFTER
           the app already set the tab title (dev-mode race). Re-assert
           the correct title a few times — by the last tap hydration has
           settled for good, and this never fights the user. */
        [700, 1800, 3600].forEach(function (ms) {
          setTimeout(function () { if (state.model) updateTitle(); }, ms);
        });
      } else {
        state.tables = { dd: [], ot: [], pm: [], att: [], lo: [] };
        state.monthsMeta = [];
        state.source = "none";
        var nd2 = $("noData"); if (nd2) nd2.classList.add("on");
        ndSet(false);
        boot("cloud", []);
      }
      /* R44: لو الأوفرلاي مفتوح (رفع من البوابة/الاتزان) حدّث جدول الأشهر */
      var dpp2 = $("dpPop");
      if (dpp2 && dpp2.classList.contains("on")) dpRenderMonths();
      setSync("ok");
    }).catch(function () {
      setSync("err");
      toast(T("toast_offline"), "err");
      ndSet(false);   /* R36: sync failed → the upload face + error toast */
    });
  }

  /* ---------- data tab: months table + totals ---------- */
  function monthLabelOf(key) {
    var ms = (state.model && state.model.months) || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].key === key) return ms[i].label;
    return key;
  }
  function renderDataPage() {
    var host = $("dtMonths");
    if (!host) return;
    var mm = (state.monthsMeta || []).slice().sort(function (a, b) { return a.key < b.key ? 1 : -1; });
    var total = 0;
    mm.forEach(function (x) { total += x.rows; });
    var chip = $("dtSyncChip");
    if (chip) chip.textContent = I18N.fmtInt(total) + " / " + I18N.count(mm.length, "rec");
    if (!mm.length) {
      host.innerHTML = "<tbody><tr><td style='padding:20px;color:#A9B7C7'>" + T("dt_empty") + "</td></tr></tbody>";
      return;
    }
    var head = "<thead><tr><th>" + T("dt_month") + "</th><th>" + T("dt_rows") + "</th><th>" + T("dt_last_sync") + "</th></tr></thead>";
    var rows = mm.map(function (x) {
      var last = x.last ? esc(x.last.actor) + " · " + auWhen(x.last.at) : "—";
      return "<tr><td><b>" + esc(monthLabelOf(x.key)) + "</b></td><td class='num'>" + I18N.fmtInt(x.rows) + "</td><td>" + last + "</td></tr>";
    }).join("");
    host.innerHTML = head + "<tbody>" + rows + "</tbody>";
  }

  /* ============================================================
     Settings panel (R27 — categorized boxes → views)
     Level 1: role-filtered grid of category boxes. Level 2: one
     section's settings + a back button. Inner IDs unchanged.
     ============================================================ */
  var SET_VIEWS = {
    theme: "set_theme",
    targets: "set_targets",
    groups: "set_groups",
    audit: "set_audit",
    storage: "set_storage",
    mhome: "set_mhome",
    perms: "set_perms"   /* R46-2: لوحة الصلاحيات */
  };
  var setCurView = null; /* last opened view — kept for future "reopen
     where you left" behaviour (review#10: currently write-only) */

  function setSettingsHead(view) {
    var h = $("setTitle"), bk = $("setBack");
    if (!h) return;
    if (view) {
      h.setAttribute("data-i18n", SET_VIEWS[view] || "set_title");
      h.textContent = T(SET_VIEWS[view] || "set_title");
      if (bk) bk.hidden = false;
    } else {
      h.setAttribute("data-i18n", "set_title");
      h.textContent = T("set_title");
      if (bk) bk.hidden = true;
    }
  }

  function showSettingsView(view) {
    if (!SET_VIEWS[view]) return;
    setCurView = view;
    setSettingsHead(view);
    var home = $("setHome"), hint = document.querySelector(".set-home-hint");
    if (home) home.hidden = true;
    if (hint) hint.hidden = true;
    Object.keys(SET_VIEWS).forEach(function (v) {
      var el = $("setView-" + v);
      if (el) el.hidden = v !== view;
    });
    /* entering a view loads its data (same calls the old accordion did) */
    if (view === "groups") {
      /* R43: تصنيف المشرفين من البوابة/الاتزان — نجيب الداتا مرة واحدة
         من غير ما نلمس شاشة التحليل ونملأ القائمة على طول */
      if (state.model) {
        buildClsList();
      } else {
        var chost = $("clsPeople");
        if (chost) chost.innerHTML = "<div style='padding:16px;color:var(--muted);font-weight:700'>&#8230;</div>";
        var sec = (state.groups ? Promise.resolve(null) : MaribCloud.settingsGet().catch(function () { return null; }));
        Promise.all([MaribCloud.dataGet(), sec]).then(function (res) {
          var d = res[0], s = res[1];
          if (s && s.groups && !state.groups) state.groups = s.groups;   /* R44: التصنيف المحفوظ يبان من غير دخول الشاشة الرئيسية */
          var months = (d && d.months) || [];
          var m2 = null;
          if (months.length) {
            var tables = { dd: [], ot: [], pm: [], att: [], lo: [] };
            months.forEach(function (mo) {
              var t = unpackTables((d.pack || {})[mo] || {});
              Object.keys(tables).forEach(function (k) { tables[k] = tables[k].concat(t[k] || []); });
            });
            m2 = MaribCore.buildModel(tables, MaribCore.DEFAULT_CONFIG);
          }
          buildClsList(m2);
        }).catch(function () { buildClsList(null); });
      }
    }
    /* R55: تحميل بيانات كل خانة بصلاحيتها — السيرفر بيصد برضه */
    var canP2 = function (f, m) { return !!(MaribAuth.can && MaribAuth.can(f, m)); };
    if (view === "audit" && canP2("audit.view", "view")) AppAdmin.auditReset();
    if (view === "storage" && canP2("storage.view", "view")) AppAdmin.loadStorage();
    if (view === "mhome" && MaribAuth.isDev && MaribAuth.isDev()) AppAdmin.loadMhome();
    if (view === "perms" && canP2("users.manage", "view")) AppAdmin.loadPerms();
  }

  function goSettingsHome() {
    setCurView = null;
    setSettingsHead(null);
    var home = $("setHome"), hint = document.querySelector(".set-home-hint");
    if (home) home.hidden = false;
    if (hint) hint.hidden = false;
    Object.keys(SET_VIEWS).forEach(function (v) {
      var el = $("setView-" + v);
      if (el) el.hidden = true;
    });
  }

  /* ============================================================
     R44 — Data overlay: the Data button opens this over the gate or
     الاتزان WITHOUT entering the performance-analysis app (and without
     the eternal loading face — the months table loads on its own).
     ============================================================ */
  function dpRenderMonths() {
    var host = $("dpMonths"), chip = $("dpSyncChip");
    if (!host) return;
    var mm = (state.monthsMeta || []).slice().sort(function (a, b) { return a.key < b.key ? 1 : -1; });
    var total = 0; mm.forEach(function (x) { total += x.rows; });
    if (chip) chip.textContent = I18N.fmtInt(total) + " / " + I18N.count(mm.length, "rec");
    if (!mm.length) {
      host.innerHTML = "<tbody><tr><td style='padding:20px'>" + T("dt_empty") + "</td></tr></tbody>";
      return;
    }
    var head = "<thead><tr><th>" + T("dt_month") + "</th><th>" + T("dt_rows") + "</th><th>" + T("dt_last_sync") + "</th></tr></thead>";
    var rows = mm.map(function (x) {
      var last = x.last ? esc(x.last.actor) + " · " + auWhen(x.last.at) : "—";
      return "<tr><td><b>" + esc(dpMonthLabel(x.key)) + "</b></td><td class='num'>" + I18N.fmtInt(x.rows) + "</td><td>" + last + "</td></tr>";
    }).join("");
    host.innerHTML = head + "<tbody>" + rows + "</tbody>";
  }
  /* R44: شهر جميل حتى من غير ما الموديل يتحمل (من البوابة/الاتزان) */
  function dpMonthLabel(key) {
    var viaModel = monthLabelOf(key);
    if (viaModel !== key) return viaModel;
    var mk = "m_" + String(key).slice(5, 7);
    var mn = T(mk);
    return (mn !== mk ? mn : String(key).slice(5, 7)) + " " + String(key).slice(0, 4);
  }
  function openDataPop() {
    /* R55: جدول الشهور قراءة — محتاج data.view view بس */
    if (window.MaribAuth && MaribAuth.can && !MaribAuth.can("data.view", "view")) {
      toast(T("perm_denied"), "err");
      return;
    }
    var pop = $("dpPop");
    if (!pop) return;
    var host = $("dpMonths");
    if (host && !(state.monthsMeta && state.monthsMeta.length)) {
      host.innerHTML = "<tbody><tr><td style='padding:20px'>…</td></tr></tbody>";
    } else dpRenderMonths();
    pop.classList.add("on");
    /* the months arrive on their own — no model build, no eternal spinner */
    if (!(state.monthsMeta && state.monthsMeta.length)) {
      MaribCloud.dataGet().then(function (d) {
        var months = (d && d.months) || [];
        var meta = months.map(function (mo) {
          var pack = (d.pack || {})[mo] || {};
          var rows = 0;
          ["dd", "ot", "pm", "att", "lo"].forEach(function (k) {
            var t = pack[k]; if (t && t.r && t.r.length) rows += t.r.length;
          });
          return { key: mo, rows: rows, last: (d.lastSync || {})[mo] || null };
        });
        if (!state.monthsMeta || !state.monthsMeta.length) state.monthsMeta = meta;
        if (pop.classList.contains("on")) dpRenderMonths();
      }).catch(function () { dpRenderMonths(); });
    }
  }
  function closeDataPop() { var p = $("dpPop"); if (p) p.classList.remove("on"); }
  window.__maribDataPop = { open: openDataPop, refresh: dpRenderMonths };   /* used by الاتزان + gate */

  function openSettings() {
    var dev = MaribAuth.isDev ? MaribAuth.isDev() : false;
    var canP = function (f, m) { return !!(MaribAuth.can && MaribAuth.can(f, m)); };
    /* R55: الخانات بالصلاحية الفعلية مش بالدور — لوحة الصلاحيات بقت
       حقيقية: أي مفتاح بتغيره بيغير إيه اللي البيان هنا فعلًا:
       targets = settings.edit edit · groups/theme = settings.view ·
       audit = audit.view · storage = storage.view ·
       perms = users.manage view · mhome = dev بس (مفيش ليها مفتاح) */
    var bx = document.querySelectorAll("#setHome .set-box");
    bx.forEach(function (b) {
      var v = b.getAttribute("data-view");
      var show =
        v === "targets" ? canP("settings.edit", "edit") :
        (v === "groups" || v === "theme") ? canP("settings.view", "view") :
        v === "audit" ? canP("audit.view", "view") :
        v === "storage" ? canP("storage.view", "view") :
        v === "perms" ? canP("users.manage", "view") :
        v === "mhome" ? dev : true;
      b.style.display = show ? "" : "none";
    });
    syncThemeCards();
    /* R55: حفظ التصنيف محتاج settings.edit edit (السيرفر بيفحصها كمان) */
    var cs = $("clsSave"); if (cs) cs.disabled = !canP("settings.edit", "edit");
    goSettingsHome();
    tgFill();
    buildClsList();
    $("setPop").classList.add("on");
  }

  /* ---------- R26: الصورة الشخصية — MaribAuth بينادي MaribMe.set
     عند الدخول/الخروج عشان صورة الزرار الصغير تفضل متزامنة ---------- */
  function setAvPhoto(avEl, imgEl, txtEl, photo, username) {
    if (!avEl) return;
    if (photo) {
      if (imgEl) { imgEl.src = photo; imgEl.hidden = false; }
      else avEl.style.backgroundImage = 'url("' + photo + '")';
      avEl.classList.add("photo");
      if (txtEl) txtEl.textContent = "";
    } else {
      if (imgEl) { imgEl.hidden = true; imgEl.removeAttribute("src"); }
      else avEl.style.backgroundImage = "";
      avEl.classList.remove("photo");
      if (txtEl) txtEl.textContent = (username || "?").charAt(0).toUpperCase();
    }
  }

  /* window.MaribMe — MaribAuth calls this on login / logout / boot so
     the topbar mini chip (photo + name, top-left) stays in sync with
     the signed-in user. R31: the me-badge that sat beside the page
     title is gone — it duplicated the topbar chip. */
  /* R55: أدوات الرفع بتتقفل للي ماعندوش data.upload edit — قواعد الإخفاء
     في آخر app.css (القاعدة body.no-upload). بيندها مع كل دخول/خروج
     لأن MaribAuth بينادي MaribMe.set من refreshChrome بعد تحميل الصلاحيات. */
  function applyPermChrome() {
    var A = window.MaribAuth;
    var up = !!(A && A.can && A.can("data.upload", "edit"));
    document.body.classList.toggle("no-upload", !up);
  }

  window.MaribMe = {
    set: function (u) {
      setAvPhoto($("ucAv"), null, null, u ? u.photo : null, u ? u.username : "");
      applyPermChrome();
    }
  };

  /* ---------- targets section (R24 #10: admin-only + apply mode) ---------- */
  var DEF_TH = MaribCore.DEFAULT_CONFIG.thresholds;
  var TG_FIELDS = [
    ["tgAchvGood", "achievement", "good"], ["tgAchvWarn", "achievement", "warn"],
    ["tgEffGood", "efficiency", "good"], ["tgEffWarn", "efficiency", "warn"],
    ["tgOtGood", "overtime", "good"], ["tgOtWarn", "overtime", "warn"],
    ["tgAttGood", "attendance", "good"], ["tgAttWarn", "attendance", "warn"]
  ];

  function tgVals(src) {
    return {
      achievement: src && src.achievement, efficiency: src && src.efficiency,
      overtime: src && src.overtime, attendance: src && src.attendance
    };
  }
  function tgFill() {
    var t = state.targetsMeta || {};
    TG_FIELDS.forEach(function (fd) {
      var cur = (t[fd[1]] && isFinite(t[fd[1]][fd[2]])) ? t[fd[1]][fd[2]] : DEF_TH[fd[1]][fd[2]];
      $(fd[0]).value = Math.round(cur * 1000) / 10;
    });
    var mode = (t.retroactive || !t.effectiveFrom) ? "retro" : "now";
    var r = document.querySelector('input[name="tgApplyMode"][value="' + mode + '"]');
    if (r) r.checked = true;
  }

  function bindTargetsPanel() {
    $("tgSave").addEventListener("click", function () {
      /* R55: حفظ الأهداف محتاج settings.edit edit (نفس فحص السيرفر) */
      if (!(MaribAuth.can && MaribAuth.can("settings.edit", "edit"))) { toast(T("toast_need_admin"), "err"); return; }
      var ok = true, o = {};
      TG_FIELDS.forEach(function (fd) {
        var v = parseFloat($(fd[0]).value);
        if (!isFinite(v) || v <= 0 || v > 100) { ok = false; return; }
        o[fd[1]] = o[fd[1]] || {};
        o[fd[1]][fd[2]] = v / 100;
      });
      if (!ok) { toast(T("tg_bad"), "bad"); return; }
      var sel = document.querySelector('input[name="tgApplyMode"]:checked');
      var mode = sel ? sel.value : "now";
      var retro = mode === "retro";
      var today = new Date().toISOString().slice(0, 10);
      var prev = state.targetsMeta || {};
      var hist = (prev.history || []).slice();
      if (prev.achievement) {
        hist.push({
          v: tgVals(prev),
          from: (prev.retroactive || !prev.effectiveFrom) ? "0000-01-01" : prev.effectiveFrom,
          at: new Date().toISOString(),
          by: MaribAuth.me() ? MaribAuth.me().username : "?"
        });
      }
      var payload = {
        achievement: o.achievement, efficiency: o.efficiency, overtime: o.overtime, attendance: o.attendance,
        effectiveFrom: retro ? null : today,
        retroactive: retro,
        history: hist.slice(-8)
      };
      MaribCloud.settingsPut("targets", payload).then(function () {
        state.targetsMeta = payload;
        applyTargetsForRange(readFilters());
        render();
        toast(T("tg_saved"), "ok");
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_admin") : T("toast_sync_err"), "err");
      });
    });

    $("tgReset").addEventListener("click", function () {
      if (!(MaribAuth.isAdmin && MaribAuth.isAdmin())) { toast(T("toast_need_admin"), "err"); return; }
      var payload = {
        achievement: { good: DEF_TH.achievement.good, warn: DEF_TH.achievement.warn },
        efficiency: { good: DEF_TH.efficiency.good, warn: DEF_TH.efficiency.warn },
        overtime: { good: DEF_TH.overtime.good, warn: DEF_TH.overtime.warn },
        attendance: { good: DEF_TH.attendance.good, warn: DEF_TH.attendance.warn },
        effectiveFrom: null, retroactive: true,
        history: (state.targetsMeta && state.targetsMeta.history) || []
      };
      MaribCloud.settingsPut("targets", payload).then(function () {
        state.targetsMeta = payload;
        tgFill();
        applyTargetsForRange(readFilters());
        render();
        toast(T("tg_reset_ok"), "ok");
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_admin") : T("toast_sync_err"), "err");
      });
    });
  }

  /* ---------- classification section (R23 #7 / R24 #3) ---------- */
  var pendingAsg = {};
  function derivedGroupOf(name) {
    var m = state.model || clsModel || {};   /* R44: التصنيف من البوابة/الاتزان — الموديل اللي اتجاب */
    /* R45: مدير الصالة الأول، بعده رئيس الخط، وآخرهم مشرف القسم — اللي
       بيكون الاتنين بيتحسب للأعلى (قبل كده رئيس الخط اللي بيشرِف كمان
       كان بيتدفن في «مشرفي الأقسام» فالزرارين التانيين كانوا فاضيين) */
    if ((m.managers || []).indexOf(name) >= 0) return "mgr";
    if ((m.leaders || []).indexOf(name) >= 0) return "leader";
    return "sup";
  }
  function effectiveGroupOf(name) {
    var a = state.groups && state.groups.assignments;
    return (a && a[name]) || derivedGroupOf(name);
  }
  var clsModel = null;   /* R44: آخر موديل اتجاب للتصنيف — عشان زراير الفلتر
     (مشرفي الأقسام / رؤساء الخطوط / مديري الصالة) تشتغل حتى لو فتحت
     الإعدادات من البوابة أو الاتزان من غير ما الشاشة الرئيسية اتحملت */
  function buildClsList(m2) {
    var host = $("clsPeople");
    if (m2) clsModel = m2;
    var m = m2 || state.model || clsModel;   /* R43: بيقبل موديل جاهز — عشان الفتح من البوابة */
    if (!host || !m) return;
    var seen = {};
    var names = [];
    (m.supervisors || []).concat(m.leaders || []).concat(m.managers || []).forEach(function (n) {
      if (n == null || seen[n]) return;
      seen[n] = 1; names.push(n);
    });
    names.sort();
    var g = state.clsFilter || "sup";
    var rows = names.filter(function (n) { return effectiveGroupOf(n) === g; });
    host.innerHTML = "";
    rows.forEach(function (n) {
      var cur = pendingAsg[n] || effectiveGroupOf(n);
      var row = document.createElement("div");
      row.className = "cls-row";
      row.innerHTML =
        '<span class="nm">' + esc(n) + "</span>" +
        (pendingAsg[n] && pendingAsg[n] !== derivedGroupOf(n) ? '<span class="from">✓</span>' : "") +
        '<span class="seg-mini"></span>';
      var seg = row.querySelector(".seg-mini");
      [["sup", "su_sup"], ["leader", "su_leader"], ["mgr", "su_mgr"]].forEach(function (gd) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = T(gd[1]);
        if (cur === gd[0]) b.className = "on";
        b.addEventListener("click", function () {
          pendingAsg[n] = gd[0];
          seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
        });
        seg.appendChild(b);
      });
      host.appendChild(row);
    });
    var cc = $("clsCount");
    if (cc) cc.textContent = rows.length + T("cls_count");
  }
  function bindGroupsPanel() {
    document.querySelectorAll("#clsFilter .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.clsFilter = b.getAttribute("data-g");
        document.querySelectorAll("#clsFilter .seg-btn").forEach(function (x) { x.classList.toggle("on", x === b); });
        buildClsList();
      });
    });
    $("clsSave").addEventListener("click", function () {
      if (!(MaribAuth.isAdmin && MaribAuth.isAdmin())) { toast(T("toast_need_admin"), "err"); return; }
      var names = Object.keys(pendingAsg);
      if (!names.length) { toast(T("cls_saved"), "ok"); return; }
      var cur = (state.groups && JSON.parse(JSON.stringify(state.groups))) || { assignments: {} };
      cur.assignments = cur.assignments || {};
      names.forEach(function (n) { cur.assignments[n] = pendingAsg[n]; });
      MaribCloud.settingsPut("groups", cur).then(function () {
        state.groups = cur;
        pendingAsg = {};
        buildClsList();
        render();
        toast(T("cls_saved"), "ok");
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_admin") : T("toast_sync_err"), "err");
      });
    });
  }

  /* ---------- audit section (R24 #9 — Amin only) ---------- */
  /* R35: API timestamps are UTC (Neon TIMESTAMPTZ) — show them on the
     viewer's local clock, 24-hour, so صبح/ليل is unmistakable. Drives the
     audit panel, its Excel export and the Data page "last upload" column. */
  function auWhen(iso) {
    if (!iso) return "—";
    var s = String(iso), d = null;
    try { d = new Date(/[Zz]$|[+\-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z"); } catch (e) { d = null; }
    if (!d || isNaN(d.getTime())) return s.replace("T", " ").slice(0, 16);
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function initSpoolScroll() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var tracked = [];
    var raf = 0;
    /* R24 perf: the winding pattern repeats every 5.44px along x — the
       target wraps into that period (numbers stay tiny), and a style write
       fires ONLY when the shift visibly moved >=1.2px. Writing every frame
       invalidated the whole scroll subtree and made scrolling feel heavy. */
    var PERIOD = 5.44;
    function norm(v) { v = v % PERIOD; if (v < 0) v += PERIOD; return v; }
    function nearest(v, ref) {
      var k = Math.round((ref - v) / PERIOD);
      return v + k * PERIOD;
    }
    function loop() {
      var dirty = false;
      for (var i = 0; i < tracked.length; i++) {
        var el = tracked[i];
        var cur = el.__spoolCur || 0;
        var tgt = nearest(norm(el.__spoolTgt || 0), cur);
        if (Math.abs(tgt - cur) > 0.35) {
          cur += (tgt - cur) * 0.16;
          if (Math.abs(cur - (el.__spoolW || 0)) >= 1.2 || Math.abs(tgt - cur) < 0.5) {
            el.style.setProperty("--spool-shift", norm(cur).toFixed(1) + "px");
            el.__spoolW = cur;
          }
          el.__spoolCur = cur;
          dirty = true;
        }
      }
      raf = dirty ? requestAnimationFrame(loop) : 0;
    }
    document.addEventListener("scroll", function (e) {
      var t = e.target;
      if (t === document || t === window || !t.nodeType) t = document.scrollingElement;
      if (!t || t.nodeType !== 1) return;
      if (tracked.indexOf(t) < 0) tracked.push(t);
      var st = t.scrollTop || 0;
      var d = st - (t.__spoolLast || 0);
      t.__spoolLast = st;
      t.__spoolTgt = norm((t.__spoolTgt || 0) + d / 5);
      if (!raf) raf = requestAnimationFrame(loop);
    }, true);
  }

  function boot(source, fileNames) {
    var cfg = MaribCore.DEFAULT_CONFIG;
    var model = MaribCore.buildModel(state.tables, cfg);
    state.model = model;
    var nd = $("noData");
    if (nd) nd.classList.toggle("on", !(model.dates && model.dates.length));
    ndSet(false);
    fillFilters();
    render();
  }

  function init() {
    /* لوجو مأرب الأصلي — R54: رجّعنا اللوجو الحقيقي مكان أيقونة
       المصنع الـ 3D (كانت من R51). اللوجو أبيض شفاف → باين على
       الشريط الكحلي في الثيمين (denim + light). */
    $("brandLogo").src = "/app/logo.png?v=r54";

    /* R42: الثيمات — تفعيل المحفوظ قبل أي رسم + ربط كروت الثيمات
       + زراير البوابة (إعدادات / بيانات) من غير دخول تحليل الأداء */
    bindTheme();
    var mgS = $("mgSettings"), mgD = $("mgData"), mgU = $("mgUsers"), mgE = $("mgEntry");
    if (mgS) mgS.addEventListener("click", function () { openSettings(); });
    /* R44: البيانات بقت أوفرلاي فوق البوابة نفسها — مش دخول لشاشة التحليل */
    if (mgD) mgD.addEventListener("click", function () { openDataPop(); });
    if (mgU) mgU.addEventListener("click", function () {
      if (window.MaribAuth && MaribAuth.openUsers) MaribAuth.openUsers();
    });
    /* R50: الداتا إنتري بقى بطاقة في البوابة نفسها — مش زرار في التوب بار */
    if (mgE) mgE.addEventListener("click", function () { AppEntries.open(); });

    /* language switcher */
    document.querySelectorAll("#langSw .sw-btn").forEach(function (b) {
      b.addEventListener("click", function () { I18N.setLang(b.getAttribute("data-lang")); });
    });
    I18N.onChange(function () {
      closeDrill();
      updateTitle();
      setSync(curSyncMode);
      if (!state.model) return;
      fillFilters(true);
      var rawKey2 = "pg_" + state.page;
      var raw2 = T(rawKey2);
      var t2 = (raw2 === rawKey2) ? [T("nav_" + state.page), ""] : TP(rawKey2);
      $("pageTitle").innerHTML = t2[0];
      setSub($("pageSub"), t2[1]);
      render();
    });

    /* nav — R26: anchors; plain left click = SPA switch, modified
       clicks (Ctrl / Cmd / Shift / middle) fall through to the browser
       so "open in new tab" works natively with the live href. */
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        goToPage(b.getAttribute("data-page"));
      });
    });

    /* quick period chips */
    document.querySelectorAll(".qp-btn").forEach(function (b) {
      b.addEventListener("click", function () { applyQP(b.getAttribute("data-qp")); });
    });

    /* scope segment (R23 #8 / R24 #5) */
    document.querySelectorAll(".scope-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.scope = b.getAttribute("data-scope");
        document.querySelectorAll(".scope-btn").forEach(function (x) { x.classList.toggle("on", x === b); });
        render();
      });
    });

    /* R30 — manager home granularity boxes (GÜN / HAFTA / AY) */
    document.querySelectorAll("#mhSeg .mh-box").forEach(function (b) {
      b.addEventListener("click", function () {
        state.mhGran = b.getAttribute("data-mh");
        document.querySelectorAll("#mhSeg .mh-box").forEach(function (x) { x.classList.toggle("on", x === b); });
        render();
      });
    });

    /* month switcher (R23) */
    $("fMonth").addEventListener("change", function () {
      if (this.value) snapToMonth(this.value, true);
      else { $("fFrom").value = ""; $("fTo").value = ""; state.qp = "all"; render(); }
    });

    /* R36 — manager-home month + year: picking a month pins the range to
       it, so the يومي/أسبوعي/شهري buckets follow the chosen month + year */
    $("mhMonth").addEventListener("change", function () {
      var y = $("mhYear").value;
      if (y && this.value) snapToMonth(y + "-" + this.value, true);
    });
    $("mhYear").addEventListener("change", function () {
      AppPages.fillMhomeMY(true);          /* the month list rebuilds for the new year */
      var mSel = $("mhMonth");
      if (this.value && mSel.value) snapToMonth(this.value + "-" + mSel.value, true);
    });

    /* custom range inputs (manual change = custom period) */
    ["fFrom", "fTo"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        state.qp = "custom";
        clearQP();
        var v = ($("fFrom").value || $("fTo").value || "").slice(0, 7);
        var mSel = $("fMonth");
        var okMonth = v && (state.model && state.model.months || []).some(function (mo) { return mo.key === v; });
        if (mSel) mSel.value = okMonth ? v : "";
        render();
      });
    });

    /* other filters */
    ["fLine", "fSection", "fSup"].forEach(function (id) {
      $(id).addEventListener("change", render);
    });

    /* supervisors sub-tabs (R23 #6 / R24 #7 — nothing shows until chosen;
       R26: anchors with live hrefs — modified clicks open in a new tab) */
    document.querySelectorAll(".su-tab").forEach(function (b) {
      b.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        state.suView = b.getAttribute("data-suview");
        render();
      });
    });

    /* drill rows in tables (event delegation) */
    document.querySelectorAll(".tbl").forEach(function (tbl) {
      tbl.addEventListener("click", function (e) {
        var tr = e.target.closest ? e.target.closest("tr.drill-row") : null;
        if (tr && tr.getAttribute("data-dt")) {
          var dm = tr.getAttribute("data-domain") || null;
          openDrill(tr.getAttribute("data-dt"), tr.getAttribute("data-dv"), dm ? { domain: dm } : null);
        }
      });
    });

    /* drill modal close */
    $("drillClose").addEventListener("click", closeDrill);
    $("drill").addEventListener("click", function (e) { if (e.target === this) closeDrill(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrill(); });

    /* data page (R23 #9: folder + single Excel, cloud sync) */
    $("dtFolder").addEventListener("click", function () { $("dirPick").click(); });
    $("dtExcel").addEventListener("click", function () { $("xlsxPick").click(); });
    /* R57 (perf): أول لمسة لزر الإكسل بتشغل تنزيل xlsx (932KB) في
       الخلفية — لمّا المستخدم يختار الملف، التحليل يبدأ فورًا بدل
       ما يستنى التنزيل بعد الاختيار. silent — الفشل بيتساب للمسار
       الأصلي (ensureXLSX عند البارس) */
    $("dtExcel").addEventListener("pointerdown", function () { ensureXLSX().catch(function () {}); }, { passive: true });
    $("dirPick").addEventListener("change", function (e) { collectFiles(e.target.files); e.target.value = ""; });
    $("xlsxPick").addEventListener("change", function (e) { collectFiles(e.target.files); e.target.value = ""; });
    if ($("ndBtn")) $("ndBtn").addEventListener("click", function () { $("dirPick").click(); });

    /* R44: data overlay — upload buttons reuse the same pickers as the
       data page; closing = X, backdrop or Escape (same UX as settings) */
    var dpp = $("dpPop");
    if (dpp) {
      var dpF = $("dpFolder"), dpX = $("dpExcel");
      if (dpF) dpF.addEventListener("click", function () { $("dirPick").click(); });
      if (dpX) {
        dpX.addEventListener("click", function () { $("xlsxPick").click(); });
        /* R57 (perf): نفس التحميل المسبق بتاع زرار صفحة الداتا */
        dpX.addEventListener("pointerdown", function () { ensureXLSX().catch(function () {}); }, { passive: true });
      }
      var dpC = $("dpClose");
      if (dpC) dpC.addEventListener("click", closeDataPop);
      dpp.addEventListener("click", function (e) { if (e.target === dpp) closeDataPop(); });
    }
    /* R50: التوب بار بقى إعدادات + مستخدمين بس (بالأيموجي) —
       الداتا والداتا إنتري بقوا بطاقات في البوابة (الصفحة الرئيسية) */
    var tbS = $("tbSetBtn"), tbU = $("tbUsersBtn"), tbD = $("tbDataBtn");
    if (tbS) tbS.addEventListener("click", function () { openSettings(); });
    if (tbU) tbU.addEventListener("click", function () {
      if (window.MaribAuth && MaribAuth.openUsers) MaribAuth.openUsers();
    });
    /* R51: زرار البيانات في التوب بار — نفس بوب-أب البوابة */
    if (tbD) tbD.addEventListener("click", function () { openDataPop(); });
    /* R51: زرار إضافة مستخدم من صفحة الصلاحيات الفاضية */
    var pmAdd = $("pmAddUser");
    if (pmAdd) pmAdd.addEventListener("click", function () {
      if (window.MaribAuth && MaribAuth.openUsers) MaribAuth.openUsers();
    });

    /* settings panel (R27 — boxes → views) */
    var sp = $("setPop");
    /* R44: زرار الإعدادات الجانبي اتشال — اللوجو بقى في شريط العنوان */
    var bs = $("btnSettings");
    if (bs) bs.addEventListener("click", function (e) {
      e.stopPropagation();
      if (sp.classList.contains("on")) sp.classList.remove("on");
      else openSettings();
    });
    $("setClose").addEventListener("click", function () { sp.classList.remove("on"); });
    sp.addEventListener("click", function (e) { if (e.target === sp) sp.classList.remove("on"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { sp.classList.remove("on"); closeDataPop(); }
    });
    document.querySelectorAll("#setHome .set-box").forEach(function (b) {
      b.addEventListener("click", function () { showSettingsView(b.getAttribute("data-view")); });
    });
    var sbk = $("setBack");
    if (sbk) sbk.addEventListener("click", goSettingsHome);
    bindTargetsPanel();
    bindGroupsPanel();
    AppAdmin.bindAudit();
    AppAdmin.bindStorage();
    AppAdmin.bindMhome();   /* R30: manager-home visibility (dev) */

    /* attendance sub-tabs: workers / supervisors (R25: one shared
       setAttView() path — also used by the URL restore; R26: anchors) */
    document.querySelectorAll(".att-tab").forEach(function (b) {
      b.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        setAttView(b.getAttribute("data-attview"));
        syncUrl();
      });
    });

    /* OT gauge + sources card click → full OT details */
    ["otGauge", "otSrc"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.classList.add("drillable");
      el.addEventListener("click", function () { openDrill("period", null, { domain: "ot" }); });
    });

    /* ---- COMPARE — ⇄ button on every chart card ---- */
    document.querySelectorAll(".pages .card").forEach(function (card) {
      var chart = card.querySelector(".chart");
      var head = card.querySelector(".card-head");
      if (!chart || !head || !chart.id) return;
      if (chart.id === "drillChart") return;
      var btn = document.createElement("button");
      btn.className = "cmp-btn";
      btn.type = "button";
      btn.setAttribute("data-cmp", chart.id);
      btn.setAttribute("data-i18n-title", "cmp_title");
      btn.title = T("cmp_title");
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13l-3.2-3.2M20 17H7l3.2 3.2"/></svg>';
      head.appendChild(btn);
      btn.addEventListener("click", function (e) { e.stopPropagation(); openCmpPop(btn, chart.id); });
    });

    var cmpPop = document.createElement("div");
    cmpPop.className = "cmp-pop";
    cmpPop.id = "cmpPop";
    document.body.appendChild(cmpPop);
    function closeCmpPop() { cmpPop.classList.remove("on"); cmpPop._card = null; }
    function openCmpPop(btn, cardId) {
      var f = readFilters();
      var mode = state.cmp[cardId] || null;
      var opts = [["prev", "cmp_prev"], ["pm", "cmp_pm"], ["pm2", "cmp_pm2"], ["py", "cmp_py"]];
      var html = '<div class="cp-head"><b>' + esc(T("cmp_title")) + '</b>' +
        '<button class="cp-x" type="button" title="' + esc(T("dp_close")) + '">✕</button></div>';
      html += '<div class="cp-cur">' + esc(T("cmp_now")) + ': <span class="num">' +
        (f.from ? U.isoShort(f.from) : "—") + " — " + (f.to ? U.isoShort(f.to) : "—") + "</span></div>";
      html += '<p class="cp-hint">' + esc(T("cmp_hint")) + "</p>";
      opts.forEach(function (o) {
        var info = cmpInfoOf(o[0], f);
        var rng = info ? U.isoShort(info.from) + " — " + U.isoShort(info.to) : "—";
        html += '<button class="cp-opt' + (mode === o[0] ? " on" : "") + '" data-cp="' + o[0] + '" type="button"><span>' + esc(T(o[1])) + '</span><small class="num">' + rng + "</small></button>";
      });
      if (mode) html += '<button class="cp-off" data-cp="__off" type="button">' + esc(T("cmp_off")) + "</button>";
      cmpPop.innerHTML = html;
      cmpPop._card = cardId;
      cmpPop.classList.add("on");
      var r = btn.getBoundingClientRect();
      var pw = 250;
      var x = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), innerWidth - pw - 8);
      cmpPop.style.left = x + "px";
      cmpPop.style.top = Math.min(r.bottom + 8, innerHeight - 260) + "px";
    }
    cmpPop.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      if (b.classList.contains("cp-x")) { closeCmpPop(); return; }
      var cp = b.getAttribute("data-cp");
      if (!cp || !cmpPop._card) return;
      if (cp === "__off") delete state.cmp[cmpPop._card];
      else state.cmp[cmpPop._card] = cp;
      closeCmpPop();
      render();
    });
    document.addEventListener("click", function (e) {
      if (!cmpPop.classList.contains("on")) return;
      if (cmpPop.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".cmp-btn")) return;
      closeCmpPop();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCmpPop(); });

    /* drag & drop (files or folders) → cloud sync */
    var dz = $("dropZone"), depth = 0;
    function scanEntry(entry) {
      return new Promise(function (res) {
        if (entry.isFile) entry.file(function (f) { res([f]); }, function () { res([]); });
        else if (entry.isDirectory) {
          var reader = entry.createReader();
          var all = [];
          var readBatch = function () {
            reader.readEntries(function (ents) {
              if (!ents.length) {
                Promise.all(all.map(scanEntry)).then(function (rr) {
                  res([].concat.apply([], rr));
                });
              } else {
                ents.forEach(function (en) { all.push(en); });
                readBatch();
              }
            }, function () { res([]); });
          };
          readBatch();
        } else res([]);
      });
    }
    window.addEventListener("dragenter", function (e) { e.preventDefault(); depth++; dz.classList.add("on"); });
    window.addEventListener("dragover", function (e) { e.preventDefault(); });
    window.addEventListener("dragleave", function (e) { e.preventDefault(); depth--; if (depth <= 0) { depth = 0; dz.classList.remove("on"); } });
    window.addEventListener("drop", function (e) {
      e.preventDefault(); depth = 0; dz.classList.remove("on");
      var items = e.dataTransfer.items, files = [];
      var proms = [];
      if (items && items.length && items[0].webkitGetAsEntry) {
        for (var i = 0; i < items.length; i++) {
          var en = items[i].webkitGetAsEntry();
          if (en) proms.push(scanEntry(en));
        }
        Promise.all(proms).then(function (rr) {
          files = [].concat.apply([], rr);
          if (files.length) collectFiles(files);
        });
      } else if (e.dataTransfer.files) collectFiles(e.dataTransfer.files);
    });

    /* thread-spool scrollbar */
    initSpoolScroll();

    /* R37: the topbar ⇄ button re-opens the mode gate (تحليل الأداء / الاتزان) */
    var swp = $("btnSwap");
    if (swp) swp.addEventListener("click", function () {
      if (window.MaribAuth && MaribAuth.showGate) MaribAuth.showGate();
    });

    /* the session layer (MaribAuth) owns the boot veil and triggers
       cloudLoad() as soon as the session resolves — the dashboard itself
       starts empty and hidden behind the veil (no "upload" flash). */
    state.tables = { dd: [], ot: [], pm: [], att: [], lo: [] };
    state.source = "none";
    ndSet(true);   /* R36: the loading face (صلي علي النبي) until the data lands */
  }

  /* R42: init بعد ما الـ hydration يخلص — نفس سباق app_auth: أي ربط
     قبل كده React ممكن يمسحه لو أعاد بناء الشجرة (كل الأزرار كانت
     بتموت بصمت). */
  document.addEventListener("DOMContentLoaded", function () {
    if (document.readyState === "complete") setTimeout(init, 100);
    else window.addEventListener("load", function () { setTimeout(init, 120); });
  });

  /* R37 — enter the dashboard surface (from the mode gate / الاتزان).
     Same flow the old enterApp ran: fetch the server months once per
     session, then only re-use them (server stays light on every swap). */
  function enterDash(page) {
    /* R55: دخول شاشة التحليل محتاج data.view — السيرفر بيصد /api/data
       برضه (403)، دي حماية الواجهة من أول خطوة */
    if (window.MaribAuth && MaribAuth.can && !MaribAuth.can("data.view", "view")) {
      toast(T("perm_no_dash"), "err");
      if (MaribAuth.showGate) MaribAuth.showGate();
      return;
    }
    if (window.MaribManpower && MaribManpower.hide) { try { MaribManpower.hide(); } catch (e) { } }
    /* R43: الدخول من زرار «البيانات» في البوابة لازم يقفل البوابة نفسها */
    if (window.MaribAuth && MaribAuth.hideGate) { try { MaribAuth.hideGate(); } catch (e) { } }
    updateTitle();
    var loaded = !!(state.model && state.model.dates && state.model.dates.length);
    if (page && $("page-" + page)) {
      /* R44: مفيش شاشة تحليل من غير داتا — لو الموديل مش محمل نجيبه الأول
         عشان صندوق «صلي علي النبي» ميفضلش معلق للأبد */
      if (!loaded) cloudLoad().then(function () { goToPage(page); });
      else goToPage(page);
      return;
    }
    if (!loaded) {
      cloudLoad().then(function () {
        if (!(state.model && state.model.dates && state.model.dates.length)) {
          var nd = $("noData");
          if (nd) nd.classList.add("on");
          ndSet(false);
          goToPage("data");
        }
      });
    }
  }

  /* R52: جسر الإغلاق — الوحدات المنفصلة (pages/entries/admin) بتوصل
     لرموز app_main من هنا (نفس المراجع بالظبط — مفيش أي نسخ داتا) */
  window.__maribCtx = {
    $: $, esc: esc, toast: toast, chip: chip, stChip: stChip, tipOn: tipOn,
    fmtInt: fmtInt, fmtPct: fmtPct, pctF: pctF, wd: wd, machShort: machShort,
    stOf: stOf, stColor: stColor, countUp: countUp, kpiTile: kpiTile,
    kpiRingTile: kpiRingTile, deltaHTML_: deltaHTML_, setKpi: setKpi,
    animateRing: animateRing, cmpCard: cmpCard, effOK: effOK,
    dayTitle: dayTitle, inRange: inRange, shortName: shortName,
    ensureXLSX: ensureXLSX, readFilters: readFilters, snapToMonth: snapToMonth,
    syncUrl: syncUrl, syncLinkHrefs: syncLinkHrefs, render: render,
    goToPage: goToPage, mhomeActive: mhomeActive, monthLabelOf: monthLabelOf,
    auWhen: auWhen,
    state: state, T: T, TP: TP, TV: TV, TS: TS, TB: TB, U: U, C: C, TH: TH,
    C_ACCENT: C_ACCENT, C_ACCENT2: C_ACCENT2, C_MUTED: C_MUTED,
    C_GOOD: C_GOOD, C_WARN: C_WARN, C_BAD: C_BAD, C_F: C_F
  };

  var __appApi42 = {
    state: state, render: render, goToPage: goToPage, openDrill: openDrill, applyQP: applyQP,
    scopedModel: scopedModel,
    hasData: function () { return !!(state.model && state.model.dates && state.model.dates.length); },
    cloudLoad: cloudLoad,
    enterDash: enterDash,
    openSettings: openSettings,   /* R42: زراير الإعدادات في البوابة والاتزان */
    openDataPop: openDataPop,     /* R44: زرار البيانات من البوابة والاتزان */
    updateTitle: updateTitle,
    promptData: function () {
      var nd = $("noData");
      if (nd) nd.classList.add("on");
      ndSet(false);
      goToPage("data");
    }
  };
  window.__maribApp42 = __appApi42;
  return __appApi42;
})();
