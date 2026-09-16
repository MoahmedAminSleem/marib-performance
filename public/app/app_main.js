/* ============================================================
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
     cached by the browser afterwards. */
  var _xlsxP = null;
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!_xlsxP) {
      _xlsxP = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = "/app/xlsx.full.min.js";
        s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error("XLSX missing")); };
        s.onerror = function () { _xlsxP = null; rej(new Error("XLSX load failed")); };
        document.head.appendChild(s);
      });
    }
    return _xlsxP;
  }
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

  function renderOverview(k, m) {
    var wrap = $("ovKpis"); wrap.innerHTML = "";
    var d = k.prev || {};
    var dAchv = d.achv != null && k.factoryAchv != null ? (k.factoryAchv - d.achv) * 100 : null;
    var dEff = d.eff != null && k.eff != null ? (k.eff - d.eff) * 100 : null;
    var dOt = d.otPct != null && k.otPct != null ? (k.otPct - d.otPct) * 100 : null;
    var dAtt = d.attendance != null && k.attendance != null ? (k.attendance - d.attendance) * 100 : null;

    /* tile 1 — actual production */
    wrap.appendChild(kpiTile({
      id: "kpA", title: TV("k_ov_actual"), en: TS("k_ov_actual"), badge: TB("k_ov_actual"),
      unit: T("u_pcs"), fmt: fmtInt,
      sub: I18N.subTargetPcs(k.factoryTarget),
      delta: d.actual != null && k.factoryActual != null ? k.factoryActual - d.actual : null,
      deltaFmt: function (v) { return "+" + fmtInt(v); }, deltaLabel: T("d_label"), goodUp: true
    }));
    /* tile 2 — achievement ring */
    wrap.appendChild(kpiRingTile({
      id: "kpR", title: TV("k_ov_achv"), en: TS("k_ov_achv"), badge: TB("k_ov_achv"),
      sub: I18N.subActualOf(k.factoryActual, k.factoryTarget),
      delta: dAchv, deltaFmt: function (v) { return I18N.pts(v, 1); }, goodUp: true
    }));
    /* tile 3 — overtime */
    wrap.appendChild(kpiTile({
      id: "kpO", title: TV("k_ov_ot"), en: TS("k_ov_ot"), badge: TB("k_ov_ot"),
      fmt: pctF(2),
      sub: I18N.subOtWrk(k.otWorkers || 0, (k.otWorkers || 0) + (k.ddWorkers || 0)),
      delta: dOt, deltaFmt: function (v) { return I18N.pts(v, 2); }, goodUp: false
    }));
    /* tile 4 — attendance */
    wrap.appendChild(kpiTile({
      id: "kpAtt", title: TV("k_ov_att"), en: TS("k_ov_att"), badge: TB("k_ov_att"),
      fmt: pctF(1),
      sub: I18N.subAbsentWorkers(k.absent),
      delta: dAtt, deltaFmt: function (v) { return I18N.pts(v, 1); }, goodUp: true
    }));

    setKpi("kpA", k.factoryActual, fmtInt);
    setKpi("kpO", k.otPct == null ? null : k.otPct * 100, pctF(2));
    setKpi("kpAtt", k.attendance == null ? null : k.attendance * 100, pctF(1));
    animateRing("kpR", k.factoryAchv);
    if (k.factoryAchv != null) { var rb = $("kpR"); if (rb) { var st = stOf(k.factoryAchv, TH.achievement); rb.style.stroke = stColor(st); } }

    $("ovHeroChip").innerHTML = I18N.heroChip(k.factoryActual, (k.datesInRange || []).length);

    /* hero — daily production vs avg target */
    var ser = k.series || [];
    var avgT = 0, n = 0;
    ser.forEach(function (s) { if (s.loT) { avgT += s.loT; n++; } });
    avgT = n ? avgT / n : null;
    var cmpTrend = cmpCard("ovTrend", function (cmp, k2) {
      cmp.cells = [{ name: T("vn_actual"), cur: k.factoryActual, cmp: k2.factoryActual, fmt: fmtInt, goodUp: true }];
      cmp.ghost = [{ values: (k2.series || []).map(function (s) { return s.loA; }) }];
    });
    C.line($("ovTrend"), {
      height: 292,
      dataLabels: true,
      points: ser.map(function (s) {
        return {
          label: s.label, y: s.loA, tipTitle: wd(s.date) + " " + s.label,
          tip: [[T("t_actual"), fmtInt(s.loA)], [T("t_target"), fmtInt(s.loT)], [T("t_achv"), fmtPct(s.achv)], [T("t_ot_pct"), fmtPct(s.otPct, 2)], [T("t_ot_wrk"), fmtInt(s.otAttW)]],
          drill: { type: "date", value: s.date }
        };
      }),
      color: C_ACCENT,
      refLines: avgT ? [{ y: avgT, color: C_WARN }] : [],
      yFmt: I18N.kFmt,
      fmt: I18N.kFmt,
      cmp: cmpTrend,
      legend: [{ name: T("lg_actual_line"), color: C_ACCENT }, { name: T("lg_avg_target"), color: C_WARN }]
    });

    /* top 5 lines — own card, fully separated from the hero trend */
    var top5 = (k.byLine || []).slice().filter(function (L) { return L.achv != null; })
      .sort(function (a, b) { return b.achv - a.achv; }).slice(0, 5);
    var cmpTop = cmpCard("ovTop", function (cmp, k2) {
      var m2 = {};
      (k2.byLine || []).forEach(function (L) { m2[I18N.lineN(L.line)] = L.achv == null ? null : L.achv * 100; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: TV("k_ov_achv"), cur: k.factoryAchv == null ? null : k.factoryAchv * 100, cmp: k2.factoryAchv == null ? null : k2.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.vbar($("ovTop"), {
      height: 236,
      items: top5.map(function (L) {
        var st = stOf(L.achv, TH.achievement);
        return {
          label: I18N.lineN(L.line), value: Math.round((L.achv || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_achv"), fmtPct(L.achv)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_ot_pct"), fmtPct(L.otPct, 2)], [T("t_ot_wrk"), fmtInt(L.otW)]],
          drill: { type: "line", value: String(L.line) }
        };
      }),
      fmt: pctF(0), valueName: T("vn_achv"),
      goal: { value: TH.achievement.good * 100 },
      cmp: cmpTop
    });

    /* donut — sections (with inside data labels) */
    var cmpDonut = cmpCard("ovDonut", function (cmp, k2) {
      cmp.cells = [{ name: T("vn_actual"), cur: k.factoryActual, cmp: k2.factoryActual, fmt: fmtInt, goodUp: true }];
    });
    C.donut($("ovDonut"), {
      height: 262,
      items: (k.bySection || []).map(function (S, i) {
        return {
          label: I18N.sectionName(S.section), value: S.actual, color: C.SERIES[i % C.SERIES.length],
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_out"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_real"), fmtPct(S.achv)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_wrk"), fmtInt(S.otW)]],
          drill: { type: "section", value: S.section }
        };
      }),
      center: { big: fmtInt(k.factoryActual), small: T("dc_total_actual") },
      valueName: T("vn_out"), legendSide: false,
      cmp: cmpDonut
    });

    /* dual — efficiency + attendance (efficiency point hidden on
       impossible/unrecorded days so the scale stays decision-friendly) */
    var cmpDual = cmpCard("ovDual", function (cmp, k2) {
      cmp.cells = [
        { name: T("lg_eff"), cur: k.eff == null ? null : k.eff * 100, cmp: k2.eff == null ? null : k2.eff * 100, fmt: pctF(0), goodUp: true },
        { name: T("lg_att"), cur: k.attendance == null ? null : k.attendance * 100, cmp: k2.attendance == null ? null : k2.attendance * 100, fmt: pctF(0), goodUp: true }
      ];
      cmp.ghost = [
        { color: C_ACCENT2, values: (k2.series || []).map(function (s) { return effOK(s) && s.eff != null ? s.eff * 100 : null; }) },
        { color: C_GOOD, values: (k2.series || []).map(function (s) { return s.attPct == null ? null : s.attPct * 100; }) }
      ];
    });
    multiLine($("ovDual"), {
      height: 252,
      dataLabels: "ends",
      series: [
        { name: T("lg_eff"), color: C_ACCENT2, points: ser.map(function (s) { return { label: s.label, y: effOK(s) ? s.eff * 100 : null, tipTitle: wd(s.date) + " " + s.label, tip: [[T("t_eff"), effOK(s) ? fmtPct(s.eff) : "—"]], drill: { type: "date", value: s.date, domain: "eff" } }; }) },
        { name: T("lg_att"), color: C_GOOD, points: ser.map(function (s) { return { label: s.label, y: s.attPct == null ? null : s.attPct * 100, tipTitle: wd(s.date) + " " + s.label, tip: [[T("t_att"), fmtPct(s.attPct)], [T("t_absent"), fmtInt(s.absent)], [T("t_ot_pct"), fmtPct(s.otPct, 2)], [T("t_ot_wrk"), fmtInt(s.otAttW)]], drill: { type: "date", value: s.date, domain: "att" } }; }) }
      ],
      yFmt: pctF(0), pctScale: true,
      refCur: k.eff == null ? null : k.eff * 100,
      cmp: cmpDual
    });
  }

  /* ---------- multi-line chart (app-level, matches design language) ----------
     round 8: tooltips follow the hovered SERIES point (small hit band
     centered on the point, not a full-height column), the dashed target
     line carries no label and reveals goal/current/ratio on hover, and
     an optional compare ghost draws the compared period day-for-day. */
  function multiLine(container, opts) {
    container.innerHTML = "";
    if (opts.cmp && C.cmpStrip) C.cmpStrip(container, opts.cmp);
    var w = Math.max(container.clientWidth || 0, 320);
    var H = opts.height || 250;
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + H);
    svg.setAttribute("width", w); svg.setAttribute("height", H);
    if (!(opts.series || []).length) { container.appendChild(svg); return; }
    var m = { t: 16, r: 44, b: 28, l: 10 };
    var iw = w - m.l - m.r, ih = H - m.t - m.b;
    /* round 7: days where EVERY series is unrecorded are removed entirely;
       series-level nulls on kept days are bridged so no line ever breaks */
    var keepIdx = [];
    opts.series[0].points.forEach(function (p, i) {
      var any = opts.series.some(function (s) { return s.points[i] && s.points[i].y != null && isFinite(s.points[i].y); });
      if (any) keepIdx.push(i);
    });
    opts.series.forEach(function (s) {
      s.points = keepIdx.map(function (i) { return s.points[i]; });
    });
    var N = opts.series[0].points.length;
    var ys = [];
    opts.series.forEach(function (s) { s.points.forEach(function (p) { if (p.y != null && isFinite(p.y)) ys.push(p.y); }); });
    if (opts.cmp && !opts.cmp.empty) (opts.cmp.ghost || []).forEach(function (g) {
      (g.values || []).forEach(function (v) { if (v != null && isFinite(v)) ys.push(v); });
    });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (opts.pctScale) { lo = 0; hi = Math.max(hi, 100); }
    if (hi === lo) hi = lo + 1;
    var pad = (hi - lo) * .1; lo -= pad; hi += pad;
    var X = function (i) { return m.l + (N <= 1 ? iw / 2 : (i / (N - 1)) * iw); };
    var Y = function (v) { return m.t + ih - ((v - lo) / (hi - lo)) * ih; };
    function mtxt(x, y, s, o) {
      o = o || {};
      var t = document.createElementNS(NS, "text");
      var isAr = /[\u0600-\u06FF]/.test(String(s));
      var anchor = o.anchor || "start";
      var useAnchor = (isAr && anchor !== "middle") ? (anchor === "end" ? "start" : "end") : anchor;
      t.setAttribute("x", x); t.setAttribute("y", y);
      t.setAttribute("fill", o.fill || C_F);
      t.setAttribute("font-size", o.size || 10);
      t.setAttribute("text-anchor", useAnchor);
      t.setAttribute("font-weight", o.weight || 400);
      t.setAttribute("pointer-events", "none");
      t.setAttribute("direction", isAr ? "rtl" : "ltr");
      t.textContent = s;
      if (o.cls) t.setAttribute("class", o.cls);
      if (o.halo) {
        t.setAttribute("paint-order", "stroke");
        t.setAttribute("stroke", "#0D1726");
        t.setAttribute("stroke-width", o.haloW || 2.6);
        t.setAttribute("stroke-linejoin", "round");
      }
      svg.appendChild(t);
      return t;
    }
    /* grid */
    var ticks = 4;
    for (var ti = 0; ti <= ticks; ti++) {
      var tv = lo + (hi - lo) * ti / ticks;
      var g = document.createElementNS(NS, "line");
      g.setAttribute("x1", m.l); g.setAttribute("x2", m.l + iw);
      g.setAttribute("y1", Y(tv)); g.setAttribute("y2", Y(tv));
      g.setAttribute("stroke", "rgba(255,176,180,.10)"); svg.appendChild(g);
      mtxt(m.l + iw + 6, Y(tv) + 3.5, opts.yFmt ? opts.yFmt(tv) : U.fmtNum(tv), { size: 10 });
    }
    var step = Math.max(1, Math.ceil(N / Math.max(6, Math.floor(w / 88))));
    opts.series[0].points.forEach(function (p, i) {
      if (i % step === 0 || i === N - 1) {
        mtxt(X(i), H - 8, p.label, { size: 10, anchor: "middle" });
      }
    });
    /* ref line (round 8): dashed rule only — the value pops on hover */
    var goalHits = [];
    if (opts.pctScale) {
      var tv2 = TH.efficiency.good * 100;
      if (tv2 >= lo && tv2 <= hi) {
        var rl = document.createElementNS(NS, "line");
        rl.setAttribute("x1", m.l); rl.setAttribute("x2", m.l + iw);
        rl.setAttribute("y1", Y(tv2)); rl.setAttribute("y2", Y(tv2));
        rl.setAttribute("stroke", C_WARN); rl.setAttribute("stroke-width", 1.4);
        rl.setAttribute("stroke-dasharray", "7 5"); rl.setAttribute("opacity", .9);
        svg.appendChild(rl);
        var hit = document.createElementNS(NS, "rect");
        hit.setAttribute("x", m.l);
        hit.setAttribute("y", Math.max(m.t - 3, Y(tv2) - 11));
        hit.setAttribute("width", iw); hit.setAttribute("height", 22);
        hit.setAttribute("fill", "transparent");
        tipOn(hit, function () {
          var rf = { y: tv2, cur: opts.refCur != null ? opts.refCur : null };
          var ysF = [];
          opts.series.forEach(function (s) { s.points.forEach(function (p) { if (p.y != null && isFinite(p.y)) ysF.push(p.y); }); });
          var avg = ysF.length ? ysF.reduce(function (a, b) { return a + b; }, 0) / ysF.length : null;
          var gv = rf.y;
          var h = '<div class="t">' + esc(T("t_goal_line")) + "</div>";
          h += '<div class="r"><span>' + esc(T("ref_target")) + "</span><b>" + (opts.yFmt ? opts.yFmt(gv) : U.fmtNum(gv)) + "</b></div>";
          if (rf.cur != null && isFinite(rf.cur)) {
            h += '<div class="r"><span>' + esc(T("t_cur")) + "</span><b>" + (opts.yFmt ? opts.yFmt(rf.cur) : U.fmtNum(rf.cur)) + "</b></div>";
            if (gv) h += '<div class="r"><span>' + esc(T("t_ratio")) + "</span><b>" + I18N.pctV(rf.cur / gv * 100, 1) + "</b></div>";
          } else if (avg != null && isFinite(avg)) {
            h += '<div class="r"><span>' + esc(T("t_cur")) + "</span><b>" + (opts.yFmt ? opts.yFmt(avg) : U.fmtNum(avg)) + "</b></div>";
            if (gv) h += '<div class="r"><span>' + esc(T("t_ratio")) + "</span><b>" + I18N.pctV(avg / gv * 100, 1) + "</b></div>";
          }
          return h;
        });
        goalHits.push(hit);
      }
    }
    /* series — one continuous path per series (nulls bridged, not broken) */
    opts.series.forEach(function (s) {
      var seg = [];
      s.points.forEach(function (p, i) { if (p.y != null && isFinite(p.y)) seg.push({ i: i, p: p }); });
      if (seg.length) {
        var d = seg.map(function (q, j) { return (j ? "L" : "M") + X(q.i).toFixed(1) + " " + Y(q.p.y).toFixed(1); }).join(" ");
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", d); path.setAttribute("fill", "none");
        path.setAttribute("stroke", s.color); path.setAttribute("stroke-width", 2.3);
        path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("class", "aD");
        svg.appendChild(path);
        seg.forEach(function (q) {
          var c = document.createElementNS(NS, "circle");
          c.setAttribute("cx", X(q.i)); c.setAttribute("cy", Y(q.p.y));
          c.setAttribute("r", 2.6); c.setAttribute("fill", "#0D1726");
          c.setAttribute("stroke", s.color); c.setAttribute("stroke-width", 1.7);
          svg.appendChild(c);
        });
      }
      /* data labels: last point of every series; max point too when few series */
      if (opts.dataLabels) {
        var last = null, maxP = null;
        s.points.forEach(function (p) {
          if (p.y == null || !isFinite(p.y)) return;
          if (!last) last = p;
          if (!maxP || p.y > maxP.y) maxP = p;
        });
        var many = (opts.series || []).length > 3;
        var show = many ? [last] : [maxP, last];
        show.forEach(function (p) {
          if (!p) return;
          var sval = opts.yFmt ? opts.yFmt(p.y) : U.fmtNum(p.y);
          mtxt(Math.max(m.l + 18, Math.min(m.l + iw - 18, X(s.points.indexOf(p)))), Math.max(11, Y(p.y) - 9), sval,
            { size: 9, fill: s.color, anchor: "middle", weight: 800, cls: "num", halo: true });
        });
      }
      /* hover hits + drill (round 8): a small band centered on each POINT —
         the tooltip follows the hovered series, no more fixed-column cards */
      s.points.forEach(function (p, i) {
        if (p.y == null || !isFinite(p.y)) return;
        var colW = iw / Math.max(1, N);
        var hit = document.createElementNS(NS, "rect");
        hit.setAttribute("x", Math.max(m.l, X(i) - colW / 2));
        hit.setAttribute("y", Math.max(m.t, Y(p.y) - 12));
        hit.setAttribute("width", Math.min(colW, iw));
        hit.setAttribute("height", 24);
        hit.setAttribute("fill", "transparent");
        svg.appendChild(hit);
        tipOn(hit, function () {
          var h = '<div class="t">' + esc(p.tipTitle || p.label) +
            ' <b style="color:' + s.color + '">' + esc(s.name) + "</b></div>";
          (p.tip || [[T("t_value"), opts.yFmt ? opts.yFmt(p.y) : U.fmtNum(p.y)]]).forEach(function (r) {
            h += '<div class="r"><span>' + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>";
          });
          return h;
        });
        if (p.drill && window.__maribDrill) {
          hit.setAttribute("class", "drillable");
          hit.addEventListener("click", function () { window.__maribDrill(p.drill.type, p.drill.value, p.drill); });
        }
      });
    });
    /* compare ghost (round 8): the compared period stretched over the
       same width — dashed, same series color, day-for-day shape */
    if (opts.cmp && !opts.cmp.empty && (opts.cmp.ghost || []).length) {
      (opts.cmp.ghost || []).forEach(function (g) {
        var vals = (g.values || []).filter(function (v) { return v != null && isFinite(v); });
        if (vals.length < 2) return;
        var d = "";
        vals.forEach(function (v, j) {
          var x = m.l + (j / (vals.length - 1)) * iw;
          d += (j ? "L" : "M") + x.toFixed(1) + " " + Y(v).toFixed(1) + " ";
        });
        var path = document.createElementNS(NS, "path");
        path.setAttribute("d", d); path.setAttribute("fill", "none");
        path.setAttribute("stroke", g.color || C_MUTED);
        path.setAttribute("stroke-width", 1.8);
        path.setAttribute("stroke-dasharray", "3.5 4.5");
        path.setAttribute("opacity", .5);
        svg.appendChild(path);
      });
    }
    goalHits.forEach(function (h) { svg.appendChild(h); });
    container.appendChild(svg);
    /* legend */
    var lg = document.createElement("div"); lg.className = "legend";
    opts.series.forEach(function (s) {
      var li = document.createElement("span"); li.className = "li";
      li.innerHTML = '<span class="sw" style="background:' + s.color + '"></span>' + esc(s.name);
      lg.appendChild(li);
    });
    container.appendChild(lg);
  }

  /* ============================================================
     PAGE: LINES
     ============================================================ */
  function renderLines(k, m) {
    var byL = k.byLine || [];
    var wrap = $("lnKpis"); wrap.innerHTML = "";
    var best = byL.slice().filter(function (L) { return L.achv != null; }).sort(function (a, b) { return b.achv - a.achv; })[0];
    var avgA = byL.length ? byL.reduce(function (s, L) { return s + (L.achv || 0); }, 0) / byL.length : null;
    var sams = byL.map(function (L) { return L.avgSAM; }).filter(function (v) { return v != null; });
    var avgSAM = sams.length ? sams.reduce(function (a, b) { return a + b; }, 0) / sams.length : null;

    wrap.appendChild(kpiTile({ id: "ln1", title: TV("k_ln_count"), en: TS("k_ln_count"), badge: TB("k_ln_count"), fmt: fmtInt, unit: T("u_line") }));
    wrap.appendChild(kpiTile({
      id: "ln2", title: TV("k_ln_best"), en: TS("k_ln_best"), badge: TB("k_ln_best"),
      fmt: pctF(1),
      sub: best ? I18N.subBestLine(best.line, best.actual) : ""
    }));
    wrap.appendChild(kpiTile({ id: "ln3", title: TV("k_ln_avg"), en: TS("k_ln_avg"), badge: TB("k_ln_avg"), fmt: pctF(1) }));
    wrap.appendChild(kpiTile({ id: "ln4", title: TV("k_ln_sam"), en: TS("k_ln_sam"), badge: TB("k_ln_sam"), fmt: function (v) { return v == null ? "—" : I18N.dec(v.toFixed(2)); }, unit: T("u_min") }));

    setKpi("ln1", byL.length, fmtInt);
    setKpi("ln2", best ? best.achv * 100 : null, pctF(1));
    setKpi("ln3", avgA * 100, pctF(1));
    setKpi("ln4", avgSAM, function (v) { return v == null ? "—" : I18N.dec(v.toFixed(2)); });

    var cmpAchv = cmpCard("lnAchv", function (cmp, k2) {
      var m2 = {};
      (k2.byLine || []).forEach(function (L) { m2[I18N.lineN(L.line)] = L.achv == null ? null : L.achv * 100; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: TV("k_ln_avg"), cur: avgA == null ? null : avgA * 100, cmp: k2.factoryAchv == null ? null : k2.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.vbar($("lnAchv"), {
      height: Math.max(230, byL.length * 46 + 40),
      items: byL.map(function (L) {
        var st = stOf(L.achv, TH.achievement);
        return {
          label: I18N.lineN(L.line), value: Math.round((L.achv || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_line"), I18N.lineN(L.line)], [T("t_achv"), fmtPct(L.achv)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_ot_pct"), fmtPct(L.otPct, 2)], [T("t_ot_wrk"), fmtInt(L.otW)], [T("t_sam"), L.avgSAM == null ? "—" : I18N.dec(L.avgSAM.toFixed(2))]],
          drill: { type: "line", value: String(L.line) }
        };
      }),
      fmt: pctF(0), valueName: T("vn_achv"),
      goal: { value: TH.achievement.good * 100 },
      cmp: cmpAchv
    });

    var cmpActual = cmpCard("lnActual", function (cmp, k2) {
      var m2 = {};
      (k2.byLine || []).forEach(function (L) { m2[I18N.lineN(L.line)] = L.actual || 0; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: T("vn_actual"), cur: k.factoryActual, cmp: k2.factoryActual, fmt: fmtInt, goodUp: true }];
    });
    C.hbar($("lnActual"), {
      items: byL.slice().sort(function (a, b) { return b.actual - a.actual; }).map(function (L) {
        return {
          label: I18N.lineN(L.line), value: L.actual || 0, color: C_ACCENT,
          tip: [[T("t_line"), I18N.lineN(L.line)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_achv"), fmtPct(L.achv)], [T("t_ot_pct"), fmtPct(L.otPct, 2)], [T("t_ot_wrk"), fmtInt(L.otW)]],
          drill: { type: "line", value: String(L.line) }
        };
      }),
      fmt: fmtInt, sort: "desc", valueName: T("vn_actual"),
      cmp: cmpActual
    });

    /* table — OT % sits right next to the achievement column */
    var rows = byL.map(function (L, i) {
      var st = stOf(L.achv, TH.achievement);
      var otst = L.otPct == null ? null : stOf(L.otPct, TH.overtime, true);
      return "<tr class='drill-row' data-dt='line' data-dv='" + esc(L.line) + "'><td><span class='rank num" + (i < 3 ? " top" : "") + "'>" + (i + 1) + "</span></td>" +
        "<td class='t-name'><b>" + esc(I18N.lineN(L.line)) + "</b></td>" +
        "<td class='num'>" + fmtInt(L.target) + "</td>" +
        "<td class='num'>" + fmtInt(L.actual) + "</td>" +
        "<td class='num' style='color:" + stColor(st) + ";font-weight:800'>" + fmtPct(L.achv) + "</td>" +
        "<td class='num' style='color:" + (otst ? stColor(otst) : C_MUTED) + ";font-weight:800'>" + fmtPct(L.otPct, 2) + "</td>" +
        "<td>" + stChip(L.achv, TH.achievement) + "</td>" +
        "<td class='num'>" + (L.avgSAM == null ? "—" : I18N.dec(L.avgSAM.toFixed(2))) + "</td>" +
        "<td class='num'>" + fmtInt(L.maxAtt) + "</td></tr>";
    }).join("");
    $("lnTable").innerHTML = "<thead><tr>" + T("th_lines").map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    $("lnTblChip").textContent = I18N.count(byL.length, "line");
  }

  /* short display name for charts: first two words — full name stays in tooltips/tables */
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
  function groupOf(name) {
    var a = state.groups && state.groups.assignments;
    if (a && a[name]) return a[name];
    var m = state.model || {};
    if ((m.leaders || []).indexOf(name) >= 0 && (m.supervisors || []).indexOf(name) < 0) return "leader";
    if ((m.managers || []).indexOf(name) >= 0 && (m.supervisors || []).indexOf(name) < 0) return "mgr";
    return "sup";
  }

  /* leader / manager metrics = the SAME measure engine re-pointed at the
     leader or manager column (remap supervisor, then recompute) */
  function groupK(k, m, G) {
    if (!G || G === "sup") return k;
    var col = G === "leader" ? "leader" : "manager";
    var remap = function (rows) {
      return (rows || []).map(function (r) {
        var c = {}; for (var kk in r) c[kk] = r[kk];
        c.supervisor = r[col] != null ? r[col] : null;
        return c;
      }).filter(function (r) { return r.supervisor != null; });
    };
    var m2 = {};
    for (var key in m) m2[key] = m[key];
    m2.dd = remap(m.dd);
    m2.ot = remap(m.ot);
    m2.pm = [];   /* pocket-machine rows carry the section supervisor only */
    return MaribCore.compute(m2, readFilters());
  }

  function suNote(id, key) {
    var host = $(id);
    if (host) host.innerHTML = '<div class="su-empty-note">' + T(key) + "</div>";
  }

  function renderSups(k, m) {
    var G = state.suView;
    if (!G) return;   /* the prompt state is handled by render() */

    var k2 = groupK(k, m, G);
    var bySAll = k2.bySupervisor || [];
    var byS = bySAll.filter(function (S) { return groupOf(S.supervisor) === G; });
    var wrap = $("svKpis"); wrap.innerHTML = "";

    if (!byS.length) {
      suNote("svTop", "su_nogroup");
      suNote("svBottom", "su_nogroup");
      $("svTable").innerHTML = "<tbody><tr><td style='padding:16px;color:#A9B7C7'>" + T("su_nogroup") + "</td></tr></tbody>";
      $("svTblChip").textContent = "";
      return;
    }

    var best = byS[0];
    var avgA = byS.length ? byS.reduce(function (s, x) { return s + (x.achv || 0); }, 0) / byS.length : null;

    wrap.appendChild(kpiTile({ id: "sv1", title: TV("k_sv_count"), en: TS("k_sv_count"), badge: TB("k_sv_count"), fmt: fmtInt, unit: T("u_sup") }));
    wrap.appendChild(kpiTile({
      id: "sv2", title: TV("k_sv_best"), en: TS("k_sv_best"), badge: TB("k_sv_best"),
      fmt: pctF(1),
      sub: best ? "<b>" + esc(best.supervisor) + "</b>" : ""
    }));
    wrap.appendChild(kpiTile({ id: "sv3", title: TV("k_sv_avg"), en: TS("k_sv_avg"), badge: TB("k_sv_avg"), fmt: pctF(1) }));
    wrap.appendChild(kpiTile({
      id: "sv4", title: TV("k_sv_min"), en: TS("k_sv_min"), badge: TB("k_sv_min"),
      fmt: fmtInt, unit: T("u_min"), sub: I18N.subOfAvail(k2.totalMinAvail)
    }));

    setKpi("sv1", byS.length, fmtInt);
    setKpi("sv2", best ? best.achv * 100 : null, pctF(1));
    setKpi("sv3", avgA * 100, pctF(1));
    setKpi("sv4", k2.minProduced, fmtInt);

    var cmpSvTop = cmpCard("svTop", function (cmp, kC) {
      var m2 = {};
      (kC.bySupervisor || []).forEach(function (S) { m2[shortName(S.supervisor)] = S.achv == null ? null : S.achv * 100; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: TV("k_sv_avg"), cur: avgA == null ? null : avgA * 100, cmp: kC.factoryAchv == null ? null : kC.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.hbar($("svTop"), {
      items: byS.slice(0, 10).map(function (S) {
        var st = stOf(S.achv, TH.achievement);
        return {
          label: shortName(S.supervisor), value: Math.round((S.achv || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_sup"), S.supervisor], [T("t_achv"), fmtPct(S.achv)], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_wrk"), fmtInt(S.otW)]],
          drill: { type: "sup", value: S.supervisor }
        };
      }),
      fmt: pctF(0), valueName: T("vn_achv"),
      goal: { value: TH.achievement.good * 100 }, rowH: 34, labelW: 132,
      cmp: cmpSvTop
    });

    /* R24 #2 — "يحتاجون متابعة" shows ONLY the people below target;
       when everyone is above target the card says so instead */
    var bottom = byS.filter(function (S) { return S.achv != null && S.achv < TH.achievement.good; })
      .sort(function (a, b) { return (a.achv || 0) - (b.achv || 0); });
    var cmpSvB = cmpCard("svBottom", function (cmp, kC) {
      var m2 = {};
      (kC.bySupervisor || []).forEach(function (S) { m2[shortName(S.supervisor)] = S.achv == null ? null : S.achv * 100; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: TV("k_sv_avg"), cur: avgA == null ? null : avgA * 100, cmp: kC.factoryAchv == null ? null : kC.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    if (bottom.length) {
      C.hbar($("svBottom"), {
        items: bottom.map(function (S) {
          return {
            label: shortName(S.supervisor), value: Math.round((S.achv || 0) * 1000) / 10, color: C_BAD,
            tip: [[T("t_sup"), S.supervisor], [T("t_achv"), fmtPct(S.achv)], [T("t_target"), fmtInt(S.target)], [T("t_gap"), fmtInt(Math.max(0, S.target - S.actual))], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_wrk"), fmtInt(S.otW)]],
            drill: { type: "sup", value: S.supervisor }
          };
        }),
        fmt: pctF(0), valueName: T("vn_achv"), sort: "asc",
        goal: { value: TH.achievement.good * 100 }, rowH: 34, labelW: 132,
        cmp: cmpSvB
      });
    } else {
      $("svBottom").innerHTML = '<div class="su-empty-note"><b>' + T("su_allgood") + "</b> ✓</div>";
    }

    var rows = byS.map(function (S, i) {
      var st = stOf(S.achv, TH.achievement);
      var otst = S.otPct == null ? null : stOf(S.otPct, TH.overtime, true);
      return "<tr class='drill-row' data-dt='sup' data-dv='" + esc(S.supervisor) + "'><td><span class='rank num" + (i < 3 ? " top" : "") + "'>" + (i + 1) + "</span></td>" +
        "<td class='t-name'><b>" + esc(S.supervisor) + "</b></td>" +
        "<td class='num'>" + fmtInt(S.target) + "</td>" +
        "<td class='num'>" + fmtInt(S.actual) + "</td>" +
        "<td class='num' style='color:" + stColor(st) + ";font-weight:800'>" + fmtPct(S.achv) + "</td>" +
        "<td class='num' style='color:" + (otst ? stColor(otst) : C_MUTED) + ";font-weight:800'>" + fmtPct(S.otPct, 2) + "</td>" +
        "<td>" + stChip(S.achv, TH.achievement) + "</td></tr>";
    }).join("");
    $("svTable").innerHTML = "<thead><tr>" + T("th_sups").map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    $("svTblChip").textContent = I18N.count(byS.length, "sup");
  }

  /* ============================================================
     PAGE: SECTIONS
     ============================================================ */
  function renderSections(k, m) {
    var secs = k.bySection || [];
    var wrap = $("scKpis"); wrap.innerHTML = "";
    var best = secs.slice().filter(function (s) { return s.achv != null; }).sort(function (a, b) { return b.achv - a.achv; })[0];
    var avgA = secs.length ? secs.reduce(function (s, x) { return s + (x.achv || 0); }, 0) / secs.length : null;
    var totOT = secs.reduce(function (s, x) { return s + (x.otMin || 0); }, 0);
    var totActual = secs.reduce(function (s, x) { return s + (x.actual || 0); }, 0);

    wrap.appendChild(kpiTile({ id: "sc1", title: TV("k_sc_count"), en: TS("k_sc_count"), badge: TB("k_sc_count"), fmt: fmtInt, unit: T("u_sec") }));
    wrap.appendChild(kpiTile({
      id: "sc2", title: TV("k_sc_best"), en: TS("k_sc_best"), badge: TB("k_sc_best"),
      fmt: pctF(1),
      sub: best ? "<b>" + esc(I18N.sectionName(best.section)) + "</b>" : ""
    }));
    wrap.appendChild(kpiTile({ id: "sc3", title: TV("k_sc_avg"), en: TS("k_sc_avg"), badge: TB("k_sc_avg"), fmt: pctF(1) }));
    var totOTW = secs.reduce(function (s, x) { return s + (x.otW || 0); }, 0);
    wrap.appendChild(kpiTile({
      id: "sc4", title: TV("k_sc_ot"), en: TS("k_sc_ot"), badge: TB("k_sc_ot"),
      fmt: fmtInt, unit: T("u_worker"),
      sub: totOT ? I18N.subOtMin(totOT) : ""
    }));

    setKpi("sc1", secs.length, fmtInt);
    setKpi("sc2", best ? best.achv * 100 : null, pctF(1));
    setKpi("sc3", avgA * 100, pctF(1));
    setKpi("sc4", totOTW, fmtInt);

    var cmpScAchv = cmpCard("scAchv", function (cmp, k2) {
      var m2 = {};
      (k2.bySection || []).forEach(function (S) { m2[I18N.sectionName(S.section)] = S.achv == null ? null : S.achv * 100; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: TV("k_sc_avg"), cur: avgA == null ? null : avgA * 100, cmp: k2.factoryAchv == null ? null : k2.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.vbar($("scAchv"), {
      height: Math.max(230, secs.length * 56 + 40),
      items: secs.map(function (S) {
        var st = stOf(S.achv, TH.achievement);
        return {
          label: I18N.sectionName(S.section), value: Math.round((S.achv || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_real"), fmtPct(S.achv)], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_wrk"), fmtInt(S.otW)], [T("t_maxatt"), fmtInt(S.maxAtt)]],
          drill: { type: "section", value: S.section }
        };
      }),
      fmt: pctF(0), valueName: T("vn_real"),
      goal: { value: TH.achievement.good * 100 },
      cmp: cmpScAchv
    });

    var cmpScActual = cmpCard("scActual", function (cmp, k2) {
      var m2 = {};
      (k2.bySection || []).forEach(function (S) { m2[I18N.sectionName(S.section)] = S.actual || 0; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: T("vn_actual"), cur: k.factoryActual, cmp: k2.factoryActual, fmt: fmtInt, goodUp: true }];
    });
    C.hbar($("scActual"), {
      items: secs.slice().sort(function (a, b) { return b.actual - a.actual; }).map(function (S, i) {
        return {
          label: I18N.sectionName(S.section), value: S.actual || 0, color: C.SERIES[i % C.SERIES.length],
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_real"), fmtPct(S.achv)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_wrk"), fmtInt(S.otW)]],
          drill: { type: "section", value: S.section }
        };
      }),
      fmt: fmtInt, sort: "desc", valueName: T("vn_actual"), rowH: 34,
      cmp: cmpScActual
    });

    /* daily trend per section */
    var dates = k.datesInRange || [];
    var sd = k.sectionDaily || {};
    var cmpScTrend = cmpCard("scTrend", function (cmp, k2) {
      cmp.cells = [{ name: T("vn_actual"), cur: k.factoryActual, cmp: k2.factoryActual, fmt: fmtInt, goodUp: true }];
      cmp.ghost = secs.map(function (S, i) {
        return {
          color: C.SERIES[i % C.SERIES.length],
          values: (k2.datesInRange || []).map(function (d) {
            var cell = k2.sectionDaily && k2.sectionDaily[d] && k2.sectionDaily[d][S.section];
            return cell ? cell.actual : null;
          })
        };
      });
    });
    multiLine($("scTrend"), {
      height: 272,
      dataLabels: "ends",
      series: secs.map(function (S, i) {
        return {
          name: I18N.sectionName(S.section), color: C.SERIES[i % C.SERIES.length],
          points: dates.map(function (d) {
            var cell = sd[d] && sd[d][S.section];
            return {
              label: U.isoShort(d), y: cell ? cell.actual : null,
              tipTitle: wd(d) + " " + U.isoShort(d),
              tip: [[T("t_out"), cell ? fmtInt(cell.actual) : "—"], [T("t_target"), cell ? fmtInt(cell.target) : "—"]],
              drill: { type: "date", value: d }
            };
          })
        };
      }),
      yFmt: I18N.kFmt,
      cmp: cmpScTrend
    });
    $("scTrendChip").textContent = I18N.count(dates.length, "day");

    /* details table — OT % next to achievement, minutes stay plain numbers */
    var rows = secs.map(function (S, i) {
      var st = stOf(S.achv, TH.achievement);
      var otst = S.otPct == null ? null : stOf(S.otPct, TH.overtime, true);
      return "<tr class='drill-row' data-dt='section' data-dv='" + esc(S.section) + "'><td><span class='rank num" + (i < 3 ? " top" : "") + "'>" + (i + 1) + "</span></td>" +
        "<td class='t-name'><b>" + esc(I18N.sectionName(S.section)) + "</b></td>" +
        "<td class='num'>" + fmtInt(S.target) + "</td>" +
        "<td class='num'>" + fmtInt(S.actual) + "</td>" +
        "<td class='num' style='color:" + stColor(st) + ";font-weight:800'>" + fmtPct(S.achv) + "</td>" +
        "<td class='num' style='color:" + (otst ? stColor(otst) : C_MUTED) + ";font-weight:800'>" + fmtPct(S.otPct, 2) + "</td>" +
        "<td>" + stChip(S.achv, TH.achievement) + "</td>" +
        "<td class='num'>" + fmtInt(S.maxAtt) + "</td>" +
        "<td class='num'>" + fmtInt(S.otMin) + "</td></tr>";
    }).join("");
    $("scTable").innerHTML = "<thead><tr>" + T("th_secs").map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    $("scTblChip").textContent = I18N.count(secs.length, "sec");
  }

  /* ============================================================
     PAGE: POCKET MACHINES
     ============================================================ */
  function renderPM(k, m) {
    var agg = k.pmAgg || { rows: 0, target: 0, actual: 0, otProd: 0, otMin: 0, cap: 0, minProd: 0, achv: null, eff: null };
    var wrap = $("pmKpis"); wrap.innerHTML = "";
    var machs = k.byPmMachine || [];
    /* round 12: first card = BEST MACHINE BY EFFICIENCY (replaces the
       plain records-count card) — highest minProd/availableMin ratio */
    var bestM = machs.slice().filter(function (M) { return M.eff != null && isFinite(M.eff); })
      .sort(function (a, b) { return b.eff - a.eff; })[0];

    wrap.appendChild(kpiTile({
      id: "pm1", title: TV("k_pm_best"), en: TS("k_pm_best"), badge: TB("k_pm_best"),
      fmt: pctF(1),
      sub: bestM ? I18N.subBestMachine(bestM.machine, bestM.minProd, bestM.cap) : ""
    }));
    wrap.appendChild(kpiTile({
      id: "pm2", title: TV("k_pm_out"), en: TS("k_pm_out"), badge: TB("k_pm_out"),
      fmt: fmtInt, unit: T("u_pcs"),
      sub: I18N.subInclOtPcs(agg.otProd)
    }));
    wrap.appendChild(kpiTile({
      id: "pm3", title: TV("k_pm_ot"), en: TS("k_pm_ot"), badge: TB("k_pm_ot"),
      fmt: fmtInt, unit: T("u_min")
    }));
    wrap.appendChild(kpiTile({
      id: "pm4", title: TV("k_pm_eff"), en: TS("k_pm_eff"), badge: TB("k_pm_eff"),
      fmt: pctF(1),
      sub: I18N.subProducedOf(agg.minProd, agg.cap)
    }));

    setKpi("pm1", bestM ? bestM.eff * 100 : null, pctF(1));
    setKpi("pm2", agg.actual, fmtInt);
    setKpi("pm3", agg.otMin, fmtInt);
    setKpi("pm4", agg.eff == null ? null : agg.eff * 100, pctF(1));

    /* daily trend */
    var cmpPmT = cmpCard("pmTrend", function (cmp, k2) {
      cmp.cells = [{ name: T("vn_pm_out"), cur: agg.actual + agg.otProd, cmp: ((k2.pmAgg || {}).actual || 0) + ((k2.pmAgg || {}).otProd || 0), fmt: fmtInt, goodUp: true }];
      cmp.ghost = [{ color: C_ACCENT2, values: (k2.pmDaily || []).map(function (s) { return s.actual; }) }];
    });
    C.line($("pmTrend"), {
      height: 252,
      dataLabels: true,
      points: (k.pmDaily || []).map(function (s) {
        return {
          label: s.label, y: s.actual, tipTitle: wd(s.date) + " " + s.label,
          tip: [[T("t_pmout"), fmtInt(s.actual)], [T("t_target"), fmtInt(s.target)], [T("t_recs"), fmtInt(s.rows)], [T("t_eff"), fmtPct(s.eff)]],
          drill: { type: "date", value: s.date }
        };
      }),
      color: C_ACCENT2,
      refLines: (k.pmDaily || []).length ? [{ y: avgOf((k.pmDaily || []).map(function (s) { return s.target; })), color: C_WARN }] : [],
      yFmt: function (v) { return fmtInt(Math.round(v)); },
      fmt: function (v) { return fmtInt(Math.round(v)); },
      cmp: cmpPmT
    });

    /* machine achievement */
    var cmpPmM = cmpCard("pmMach", function (cmp, k2) {
      var m2 = {};
      (k2.byPmMachine || []).forEach(function (M) { m2[machShort(M.machine)] = M.achv == null ? null : M.achv * 100; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: T("vn_real"), cur: agg.achv == null ? null : agg.achv * 100, cmp: (k2.pmAgg || {}).achv == null ? null : (k2.pmAgg || {}).achv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.vbar($("pmMach"), {
      height: Math.max(230, machs.length * 44 + 40),
      items: machs.map(function (M) {
        var st = stOf(M.achv, TH.achievement);
        return {
          label: machShort(M.machine), value: Math.round((M.achv || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_mach"), I18N.machN(M.machine)], [T("t_lines"), M.lines.map(function (l) { return I18N.lineN(l); }).join(I18N.listSep())], [T("t_real"), fmtPct(M.achv)], [T("t_actual"), fmtInt(M.actual)], [T("t_target"), fmtInt(M.target)], [T("t_recs"), fmtInt(M.rows)]],
          drill: { type: "pmachine", value: M.machine }
        };
      }),
      fmt: pctF(0), valueName: T("vn_real"),
      goal: { value: TH.achievement.good * 100 },
      cmp: cmpPmM
    });

    /* by line */
    var byL = k.byPmLine || [];
    var cmpPmL = cmpCard("pmLine", function (cmp, k2) {
      var m2 = {};
      (k2.byPmLine || []).forEach(function (L) { m2[I18N.lineN(L.line)] = L.actual || 0; });
      cmp.cmpMap = m2;
      cmp.cells = [{ name: T("vn_pm_out"), cur: agg.actual + agg.otProd, cmp: ((k2.pmAgg || {}).actual || 0) + ((k2.pmAgg || {}).otProd || 0), fmt: fmtInt, goodUp: true }];
    });
    C.hbar($("pmLine"), {
      items: byL.map(function (L) {
        return {
          label: I18N.lineN(L.line), value: L.actual || 0, color: C_ACCENT2,
          tip: [[T("t_line"), I18N.lineN(L.line)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_real"), fmtPct(L.achv)], [T("t_recs"), fmtInt(L.rows)]],
          drill: { type: "pmline", value: L.line }
        };
      }),
      fmt: fmtInt, sort: "desc", valueName: T("vn_pm_out"), rowH: 34,
      cmp: cmpPmL
    });

    /* target vs actual grouped */
    var cmpPmTV = cmpCard("pmTVsA", function (cmp, k2) {
      cmp.cells = [{ name: T("vn_actual"), cur: agg.actual + agg.otProd, cmp: ((k2.pmAgg || {}).actual || 0) + ((k2.pmAgg || {}).otProd || 0), fmt: fmtInt, goodUp: true }];
    });
    C.vbar($("pmTVsA"), {
      height: 252,
      items: byL.map(function (L) {
        return {
          label: I18N.lineN(L.line), drill: { type: "pmline", value: L.line },
          values: [
            { name: T("lg_target"), v: L.target || 0, color: "rgba(169,183,199,.42)" },
            { name: T("lg_actual2"), v: L.actual || 0, color: C_ACCENT }
          ]
        };
      }),
      fmt: fmtInt, valueName: T("vn_pcs"),
      legend: [{ name: T("lg_target"), color: "rgba(169,183,199,.7)" }, { name: T("lg_actual2"), color: C_ACCENT }],
      cmp: cmpPmTV
    });

    /* details table (by machine) */
    var rows = machs.map(function (M, i) {
      var st = stOf(M.achv, TH.achievement);
      return "<tr class='drill-row' data-dt='pmachine' data-dv='" + esc(M.machine) + "'><td><span class='rank num" + (i < 3 ? " top" : "") + "'>" + (i + 1) + "</span></td>" +
        "<td class='t-name'><b>" + esc(I18N.machN(M.machine)) + "</b></td>" +
        "<td class='num'>" + M.lines.map(function (l) { return esc(I18N.lineN(l)); }).join(I18N.listSep()) + "</td>" +
        "<td class='num'>" + fmtInt(M.rows) + "</td>" +
        "<td class='num'>" + fmtInt(M.target) + "</td>" +
        "<td class='num'>" + fmtInt(M.actual) + "</td>" +
        "<td class='num' style='color:" + stColor(st) + ";font-weight:800'>" + fmtPct(M.achv) + "</td>" +
        "<td class='num'>" + fmtInt(M.cap) + "</td>" +
        "<td class='num'>" + fmtInt(M.minProd) + "</td>" +
        "<td class='num'>" + fmtPct(M.eff) + "</td></tr>";
    }).join("");
    $("pmTable").innerHTML = "<thead><tr>" + T("th_pm").map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    $("pmTblChip").textContent = I18N.count(machs.length, "mach");
  }
  function avgOf(arr) {
    var v = 0, n = 0;
    arr.forEach(function (x) { if (x != null && isFinite(x)) { v += x; n++; } });
    return n ? v / n : null;
  }

  /* ============================================================
     PAGE: OVERTIME — round 8: everything reads in PERCENTAGES.
     Minute sums live only in tooltips and the drill-through page;
     every card/chart clicks through to the full OT details.
     ============================================================ */
  function renderOT(k, m) {
    var ser = k.series || [];
    var wrap = $("otKpis"); wrap.innerHTML = "";

    var otDays = ser.filter(function (s) { return s.otPct != null; });
    var avgOt = otDays.length ? otDays.reduce(function (s2, x) { return s2 + x.otPct; }, 0) / otDays.length : null;
    var peak = otDays.length ? otDays.slice().sort(function (a, b) { return b.otPct - a.otPct; })[0] : null;

    wrap.appendChild(kpiTile({
      id: "ot1", title: TV("k_ot_pct"), en: TS("k_ot_pct"), badge: TB("k_ot_pct"),
      fmt: pctF(2),
      sub: T("ot_sub_of_wrk"),
      drill: { type: "period", value: null, domain: "ot" }
    }));
    wrap.appendChild(kpiTile({
      id: "ot2", title: TV("k_ot_avg"), en: TS("k_ot_avg"), badge: TB("k_ot_avg"),
      fmt: pctF(2),
      sub: I18N.count(otDays.length, "day"),
      drill: { type: "period", value: null, domain: "ot" }
    }));
    wrap.appendChild(kpiTile({
      id: "ot3", title: TV("k_ot_peak"), en: TS("k_ot_peak"), badge: TB("k_ot_peak"),
      fmt: pctF(2),
      sub: peak ? I18N.subPeakDay(wd(peak.date), peak.label) : "",
      drill: peak ? { type: "date", value: peak.date, domain: "ot" } : null
    }));
    /* R34: overtime told in WORKER COUNTS — the two numbers the owner
       actually records: basic-time workers (Daily Data) + OT workers (OT
       sheet). Minutes efficiency stays as the 6th card. */
    var sumDdW = ser.reduce(function (s2, x) { return s2 + (x.ddAttW || 0); }, 0);
    var sumOtW = ser.reduce(function (s2, x) { return s2 + (x.otAttW || 0); }, 0);
    var avgDdW = ser.length ? sumDdW / ser.length : null;
    var avgOtW = ser.length ? sumOtW / ser.length : null;
    wrap.appendChild(kpiTile({
      id: "ot4", title: TV("k_ot_ddw"), en: TS("k_ot_ddw"), badge: TB("k_ot_ddw"),
      fmt: fmtInt, unit: T("u_worker"),
      sub: I18N.subWrkTot(sumDdW, ser.length),
      drill: { type: "period", value: null, domain: "att" }
    }));
    wrap.appendChild(kpiTile({
      id: "ot5", title: TV("k_ot_otw"), en: TS("k_ot_otw"), badge: TB("k_ot_otw"),
      fmt: fmtInt, unit: T("u_worker"),
      sub: I18N.subWrkTot(sumOtW, ser.length),
      drill: { type: "period", value: null, domain: "ot" }
    }));
    wrap.appendChild(kpiTile({
      id: "ot6", title: TV("k_ot_eff"), en: TS("k_ot_eff"), badge: TB("k_ot_eff"),
      fmt: pctF(1),
      sub: I18N.subEffOf(k.eff),
      drill: { type: "period", value: null, domain: "ot" }
    }));

    setKpi("ot1", k.otPct == null ? null : k.otPct * 100, pctF(2));
    setKpi("ot2", avgOt == null ? null : avgOt * 100, pctF(2));
    setKpi("ot3", peak ? peak.otPct * 100 : null, pctF(2));
    setKpi("ot4", avgDdW == null ? null : Math.round(avgDdW), fmtInt);
    setKpi("ot5", avgOtW == null ? null : Math.round(avgOtW), fmtInt);
    setKpi("ot6", k.eff == null ? null : k.eff * 100, pctF(1));

    /* daily OT % — clicking a day opens the OT details of that day */
    var cmpOtD = cmpCard("otDaily", function (cmp, k2) {
      cmp.cells = [{ name: TV("k_ot_pct"), cur: k.otPct == null ? null : k.otPct * 100, cmp: k2.otPct == null ? null : k2.otPct * 100, fmt: pctF(2), goodUp: false }];
      cmp.ghost = [{ color: C_WARN, values: (k2.series || []).map(function (s) { return s.otPct == null ? null : s.otPct * 100; }) }];
    });
    C.line($("otDaily"), {
      height: 250,
      dataLabels: true,
      points: ser.map(function (s) {
        return {
          label: s.label, y: s.otPct == null ? null : s.otPct * 100, tipTitle: wd(s.date) + " " + s.label,
          tip: [[T("t_ot_pct"), fmtPct(s.otPct, 2)], [T("t_ot_wrk"), fmtInt(s.otAttW)], [T("t_dd_wrk"), fmtInt(s.ddAttW)], [T("t_tot_wrk"), fmtInt((s.ddAttW || 0) + (s.otAttW || 0))], [T("t_ot_min"), fmtInt(s.otMin)], [T("t_avail"), fmtInt(s.totalMinAvail)]],
          drill: { type: "date", value: s.date, domain: "ot" }
        };
      }),
      color: C_WARN, yFmt: pctF(1),
      fmt: pctF(1),
      refLines: [{ y: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" }],
      cmp: cmpOtD
    });

    var cmpGauge = cmpCard("otGauge", function (cmp, k2) {
      cmp.cells = [{ name: TV("k_ot_pct"), cur: k.otPct == null ? null : k.otPct * 100, cmp: k2.otPct == null ? null : k2.otPct * 100, fmt: pctF(2), goodUp: false }];
    });
    C.gauge($("otGauge"), {
      value: k.otPct, height: 235,
      thresholds: { good: TH.overtime.good, warn: TH.overtime.warn }, label: T("g_ot_label"),
      cmp: cmpGauge
    });

    /* OT by section — bars are OT %, minutes ride in the tooltip */
    var secs = (k.bySection || []).filter(function (S) { return S.otPct != null && (S.otMin || 0) > 0; });
    var cmpOtSec = cmpCard("otSec", function (cmp, k2) {
      var m2 = {};
      (k2.bySection || []).forEach(function (S) { m2[I18N.sectionName(S.section)] = S.otPct == null ? null : S.otPct * 100; });
      cmp.cmpMap = m2;
      cmp.fmt = pctF(1);
      cmp.cells = [{ name: TV("k_ot_pct"), cur: k.otPct == null ? null : k.otPct * 100, cmp: k2.otPct == null ? null : k2.otPct * 100, fmt: pctF(2), goodUp: false }];
    });
    C.hbar($("otSec"), {
      items: secs.slice().sort(function (a, b) { return (b.otPct || 0) - (a.otPct || 0); }).map(function (S) {
        var st = stOf(S.otPct, TH.overtime, true);
        return {
          label: I18N.sectionName(S.section), value: Math.round((S.otPct || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_wrk"), fmtInt(S.otW)], [T("t_dd_wrk"), fmtInt(S.ddW)], [T("t_tot_wrk"), fmtInt((S.ddW || 0) + (S.otW || 0))], [T("t_wrk_max"), fmtInt(S.maxAtt)], [T("t_ot_min2"), fmtInt(S.otMin)]],
          drill: { type: "section", value: S.section, domain: "ot" }
        };
      }),
      fmt: pctF(1), valueName: TV("k_ot_pct"),
      goal: { value: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" },
      cmp: cmpOtSec
    });

    /* OT by line — OT % bars, minutes ride in the tooltip (R29) */
    var otLn = (k.byLine || []).filter(function (L) { return L.otPct != null && (L.otMin || 0) > 0; });
    var cmpSrc = cmpCard("otSrc", function (cmp, k2) {
      var m2 = {};
      (k2.byLine || []).forEach(function (L) { m2[I18N.lineN(L.line)] = L.otPct == null ? null : L.otPct * 100; });
      cmp.cmpMap = m2;
      cmp.fmt = pctF(1);
      cmp.cells = [{ name: TV("k_ot_pct"), cur: k.otPct == null ? null : k.otPct * 100, cmp: k2.otPct == null ? null : k2.otPct * 100, fmt: pctF(2), goodUp: false }];
    });
    C.hbar($("otSrc"), {
      items: otLn.slice().sort(function (a, b) { return (b.otPct || 0) - (a.otPct || 0); }).map(function (L) {
        var st = stOf(L.otPct, TH.overtime, true);
        return {
          label: I18N.lineN(L.line), value: Math.round((L.otPct || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_line"), I18N.lineN(L.line)], [T("t_ot_pct"), fmtPct(L.otPct, 2)], [T("t_ot_wrk"), fmtInt(L.otW)], [T("t_dd_wrk"), fmtInt(L.ddW)], [T("t_tot_wrk"), fmtInt((L.ddW || 0) + (L.otW || 0))], [T("t_wrk_max"), fmtInt(L.maxAtt)], [T("t_ot_min2"), fmtInt(L.otMin)]],
          drill: { type: "line", value: String(L.line), domain: "ot" }
        };
      }),
      fmt: pctF(1), valueName: TV("k_ot_pct"), rowH: 34,
      goal: { value: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" },
      cmp: cmpSrc
    });

    /* OT by supervisor — OT % bars, minutes in the tooltip */
    var byOS = k.otBySup || [];
    var cmpOtSup = cmpCard("otSup", function (cmp, k2) {
      var m2 = {};
      (k2.otBySup || []).forEach(function (b) { m2[shortName(b.supervisor)] = b.otPct == null ? null : b.otPct * 100; });
      cmp.cmpMap = m2;
      cmp.fmt = pctF(1);
      cmp.cells = [{ name: TV("k_ot_pct"), cur: k.otPct == null ? null : k.otPct * 100, cmp: k2.otPct == null ? null : k2.otPct * 100, fmt: pctF(2), goodUp: false }];
    });
    C.hbar($("otSup"), {
      items: byOS.slice(0, 12).sort(function (a, b) { return (b.otPct || 0) - (a.otPct || 0); }).map(function (b) {
        var st = b.otPct == null ? null : stOf(b.otPct, TH.overtime, true);
        return {
          label: shortName(b.supervisor), value: b.otPct == null ? 0 : Math.round(b.otPct * 1000) / 10, color: st ? stColor(st) : C_WARN,
          tip: [[T("t_sup"), b.supervisor], [T("t_ot_pct"), fmtPct(b.otPct, 2)], [T("t_ot_wrk"), fmtInt(b.otW)], [T("t_dd_wrk"), fmtInt(b.ddW)], [T("t_ot_min"), fmtInt(b.otMin)]],
          drill: { type: "sup", value: b.supervisor, domain: "ot" }
        };
      }),
      fmt: pctF(1), valueName: TV("k_ot_pct"), rowH: 34, labelW: 132,
      goal: { value: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" },
      cmp: cmpOtSup
    });

    /* OT daily details table — R34: worker counts first (basic-time from
       Daily Data, overtime from the OT sheet), then the ratio; minutes and
       efficiency follow. A Friday with OT-only rows now reads 0 + 4 = 100%. */
    var rows = ser.map(function (s) {
      var st = s.otPct == null ? null : stOf(s.otPct, TH.overtime, true);
      var effOKd = s.eff != null && isFinite(s.eff) && s.eff <= 1.5 && (s.minProd || 0) > 0;
      return "<tr class='drill-row' data-dt='date' data-domain='ot' data-dv='" + s.date + "'><td class='t-name'><b>" + wd(s.date) + " " + s.label + "</b></td>" +
        "<td class='num'>" + fmtInt(s.ddAttW) + "</td>" +
        "<td class='num'>" + fmtInt(s.otAttW) + "</td>" +
        "<td class='num'><b>" + fmtInt((s.ddAttW || 0) + (s.otAttW || 0)) + "</b></td>" +
        "<td class='num' style='color:" + (st ? stColor(st) : C_MUTED) + ";font-weight:800'>" + fmtPct(s.otPct, 2) + "</td>" +
        "<td class='num'>" + fmtInt(s.otMin) + "</td>" +
        "<td class='num'>" + (effOKd ? fmtPct(s.eff) : "—") + "</td></tr>";
    }).join("");
    $("otTable").innerHTML = "<thead><tr>" + T("th_ot").map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    $("otTblChip").textContent = I18N.count(ser.length, "day");
  }

  /* ============================================================
     PAGE: ATTENDANCE
     ============================================================ */
  function renderAtt(k, m) {
    var ser = k.series || [];
    var wrap = $("atKpis"); wrap.innerHTML = "";

    wrap.appendChild(kpiTile({ id: "at1", title: TV("k_at_rate"), en: TS("k_at_rate"), badge: TB("k_at_rate"), fmt: pctF(1) }));
    wrap.appendChild(kpiTile({ id: "at2", title: TV("k_at_abs"), en: TS("k_at_abs"), badge: TB("k_at_abs"), fmt: fmtInt, unit: T("u_worker") }));
    wrap.appendChild(kpiTile({
      id: "at3", title: TV("k_at_peak"), en: TS("k_at_peak"), badge: TB("k_at_peak"),
      fmt: fmtInt, unit: T("u_worker"),
      sub: (function () { var b = ser.slice().sort(function (a, c) { return (c.ddAttW || 0) - (a.ddAttW || 0); })[0]; return b ? I18N.subPeakDay(wd(b.date), b.label) : ""; })()
    }));
    wrap.appendChild(kpiTile({ id: "at4", title: TV("k_at_rows"), en: TS("k_at_rows"), badge: TB("k_at_rows"), fmt: fmtInt, unit: T("u_rec") }));

    setKpi("at1", k.attendance == null ? null : k.attendance * 100, pctF(1));
    setKpi("at2", k.absent, fmtInt);
    setKpi("at3", k.maxAttendance, fmtInt);
    setKpi("at4", k.attRows, fmtInt);

    var cmpHeat = cmpCard("atHeat", function (cmp, k2) {
      cmp.cells = [{ name: TV("k_at_rate"), cur: k.attendance == null ? null : k.attendance * 100, cmp: k2.attendance == null ? null : k2.attendance * 100, fmt: pctF(1), goodUp: true }];
    });
    C.heat($("atHeat"), { weeks: k.weeks || [], cells: k.heatmap || [], cell: 36, cmp: cmpHeat });
    /* color scale legend under heatmap (weak=red → excellent=green, matches heatColor) */
    var sc = document.createElement("div");
    sc.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:10px;font-size:10.5px;color:#7E92A8;font-weight:600;justify-content:flex-end";
    var gdir = I18N.dir() === "ltr" ? "to right" : "to left";
    sc.innerHTML =
      '<span>' + T("hs_low") + '</span>' +
      '<span style="flex:0 0 170px;height:8px;border-radius:6px;background:linear-gradient(' + gdir + ',#F87C7C,#F0BE55,#4FD98D)"></span>' +
      '<span>' + T("hs_high") + "</span>";
    $("atHeat").appendChild(sc);

    var cmpDow = cmpCard("atDow", function (cmp, k2) {
      var m2 = {};
      (k2.byDow || []).forEach(function (d) { m2[I18N.dayShort(d.order)] = d.pct == null ? null : d.pct * 100; });
      cmp.cmpMap = m2;
      cmp.fmt = pctF(1);
      cmp.cells = [{ name: TV("k_at_rate"), cur: k.attendance == null ? null : k.attendance * 100, cmp: k2.attendance == null ? null : k2.attendance * 100, fmt: pctF(1), goodUp: true }];
    });
    C.vbar($("atDow"), {
      height: 240,
      items: (k.byDow || []).map(function (d) {
        var st = stOf(d.pct, TH.attendance);
        return {
          label: I18N.dayShort(d.order), value: Math.round((d.pct || 0) * 1000) / 10, color: stColor(st),
          tip: [[T("t_day"), I18N.dayFull(d.order)], [T("t_avgatt"), fmtPct(d.pct)], [T("t_recs"), fmtInt(d.count)]]
        };
      }),
      fmt: pctF(1), valueName: T("vn_avg_att"),
      goal: { value: TH.attendance.good * 100, color: C_WARN },
      cmp: cmpDow
    });

    var cmpAtD = cmpCard("atDaily", function (cmp, k2) {
      cmp.cells = [{ name: TV("k_at_rate"), cur: k.attendance == null ? null : k.attendance * 100, cmp: k2.attendance == null ? null : k2.attendance * 100, fmt: pctF(1), goodUp: true }];
      cmp.ghost = [{ color: C_GOOD, values: (k2.series || []).map(function (s) { return s.attPct == null ? null : s.attPct * 100; }) }];
    });
    C.line($("atDaily"), {
      height: 250,
      dataLabels: true,
      points: ser.map(function (s) {
        return {
          label: s.label, y: s.attPct == null ? null : s.attPct * 100, tipTitle: wd(s.date) + " " + s.label,
          tip: [[T("t_att"), fmtPct(s.attPct)], [T("t_absent"), fmtInt(s.absent)], [T("t_present"), fmtInt(s.ddAttW)]],
          drill: { type: "date", value: s.date, domain: "att" }
        };
      }),
      color: C_GOOD, pctScale: true, yFmt: pctF(0),
      fmt: pctF(0),
      refLines: [{ y: TH.attendance.good * 100, color: C_WARN }],
      cmp: cmpAtD
    });

    /* absences by weekday from series */
    var byW = {};
    ser.forEach(function (s) {
      var dw = U.isoDayOfWeek(s.date);
      if (!byW[dw]) byW[dw] = { dw: dw, absent: 0, n: 0 };
      byW[dw].absent += s.absent || 0; byW[dw].n++;
    });
    var order = [6, 0, 1, 2, 3, 4];
    var cmpAbsent = cmpCard("atAbsent", function (cmp, k2) {
      var m2 = {};
      (k2.series || []).forEach(function (s) {
        var dw = U.isoDayOfWeek(s.date);
        m2[dw] = (m2[dw] || 0) + (s.absent || 0);
      });
      var mm2 = {};
      Object.keys(m2).forEach(function (dw) { mm2[I18N.dayShort(+dw)] = m2[dw]; });
      cmp.cmpMap = mm2;
      cmp.goodUp = false;
      cmp.cells = [{ name: T("vn_tot_abs"), cur: k.absent, cmp: k2.absent, fmt: fmtInt, goodUp: false }];
    });
    C.vbar($("atAbsent"), {
      height: 250,
      items: order.filter(function (dw) { return byW[dw]; }).map(function (dw) {
        var b = byW[dw];
        return { label: I18N.dayShort(dw), value: b.absent, color: C_BAD, tip: [[T("t_totabs"), fmtInt(b.absent)], [T("t_days"), b.n], [T("t_avg"), fmtInt(Math.round(b.absent / b.n))]] };
      }),
      fmt: fmtInt, valueName: T("vn_tot_abs"),
      cmp: cmpAbsent
    });

    /* daily attendance details table */
    var rows = ser.map(function (s) {
      var st = s.attPct == null ? null : stOf(s.attPct, TH.attendance);
      return "<tr class='drill-row' data-dt='date' data-domain='att' data-dv='" + s.date + "'><td class='t-name'><b>" + wd(s.date) + " " + s.label + "</b></td>" +
        "<td class='num' style='color:" + (st ? stColor(st) : C_MUTED) + ";font-weight:800'>" + fmtPct(s.attPct) + "</td>" +
        "<td class='num'>" + fmtInt(s.ddAttW) + "</td>" +
        "<td class='num'>" + fmtInt(s.absent) + "</td></tr>";
    }).join("");
    $("atTable").innerHTML = "<thead><tr>" + T("th_att").map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    $("atTblChip").textContent = I18N.count(ser.length, "day");

    renderAttSups(k, m);
  }

  /* ---- supervisors view: discipline sheet filtered to line supervisors,
     respecting the active date range (workers view above is dd-based) ---- */
  function renderAttSups(k, m) {
    var supSet = {};
    (m.supervisors || []).forEach(function (s) { supSet[s] = 1; });
    var f = readFilters();
    var rows = (m.att || []).filter(function (r) {
      if (!supSet[r.name]) return false;
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      return true;
    });

    /* per-supervisor presence */
    var per = {}, dates = {};
    rows.forEach(function (r) {
      per[r.name] = per[r.name] || { present: 0, absent: 0 };
      dates[r.date] = dates[r.date] || { present: 0, total: 0 };
      if (r.score) { per[r.name].present++; dates[r.date].present++; }
      else per[r.name].absent++;
      dates[r.date].total++;
    });
    var names = Object.keys(per).sort();
    var nDates = Object.keys(dates).sort();
    var totalSlots = names.length * nDates.length;
    var presentSlots = names.reduce(function (a, n) { return a + per[n].present; }, 0);
    var supRate = totalSlots ? presentSlots / totalSlots : null;
    var perfect = names.filter(function (n) { return per[n].absent === 0; }).length;

    var wrap = $("asKpis"); wrap.innerHTML = "";
    wrap.appendChild(kpiTile({ id: "as1", title: TV("k_as_rate"), en: TS("k_as_rate"), badge: TB("k_as_rate"), fmt: pctF(1) }));
    wrap.appendChild(kpiTile({ id: "as2", title: TV("k_as_count"), en: TS("k_as_count"), badge: TB("k_as_count"), fmt: fmtInt, unit: T("u_sup") }));
    wrap.appendChild(kpiTile({ id: "as3", title: TV("k_as_abs"), en: TS("k_as_abs"), badge: TB("k_as_abs"), fmt: fmtInt, unit: T("u_day") }));
    wrap.appendChild(kpiTile({ id: "as4", title: TV("k_as_perfect"), en: TS("k_as_perfect"), badge: TB("k_as_perfect"), fmt: fmtInt, unit: T("u_sup") }));
    setKpi("as1", supRate == null ? null : supRate * 100, pctF(1));
    setKpi("as2", names.length, fmtInt);
    setKpi("as3", totalSlots - presentSlots, fmtInt);
    setKpi("as4", perfect, fmtInt);

    C.line($("asDaily"), {
      /* round 9: taller + tightMin zoom (the line used to sit in the top
         quarter of a 0-22 axis while the data is 15-20) */
      height: 285,
      dataLabels: true,
      points: nDates.map(function (d) {
        var b = dates[d];
        return {
          label: b.label || d.slice(8), y: b.total ? b.present : null, tipTitle: wd(d),
          tip: [[T("t_date"), U.isoShort(d)], [T("t_present"), fmtInt(b.present)], [T("t_supscount"), fmtInt(b.total)]],
          drill: { type: "date", value: d, domain: "att" }
        };
      }),
      color: C_ACCENT2, tightMin: true, yFmt: fmtInt, fmt: fmtInt
    });

    var th = T("th_as");
    var trows = names.map(function (n) {
      var p = per[n];
      var rate = p.present + p.absent ? p.present / (p.present + p.absent) : null;
      var st = rate == null ? null : stOf(rate, TH.attendance);
      return "<tr class='drill-row' data-dt='sup' data-dv='" + esc(n) + "'><td class='t-name'><b>" + esc(shortName(n)) + "</b></td>" +
        "<td class='num'>" + fmtInt(p.present) + "</td>" +
        "<td class='num'>" + fmtInt(p.absent) + "</td>" +
        "<td class='num' style='color:" + (st ? stColor(st) : C_MUTED) + ";font-weight:800'>" + fmtPct(rate) + "</td>" +
        "<td class='num'>" + stChip(rate, TH.attendance) + "</td></tr>";
    }).join("");
    $("asTable").innerHTML = "<thead><tr>" + th.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + trows + "</tbody>";
    $("asTblChip").textContent = I18N.count(names.length, "sup");
  }

  /* ============================================================
     DRILL-THROUGH (Power BI style): click any visual element
     → detail page for that entity within the active period.
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
    fillMhomeMY(keep);
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

  function mhIsoWeek(iso) {
    var d = new Date(iso + "T00:00:00Z");
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - y0) / 86400000) + 1) / 7);
  }

  function mhMonthLabel(key) {
    var ms = (state.model && state.model.months) || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].key === key) return ms[i].label;
    return key;
  }

  /* R36 — manager-home month + year selects. They WRITE the range
     (fFrom/fTo via snapToMonth), so the يومي/أسبوعي/شهري buttons
     always bucket inside the chosen month; the hidden من/إلى inputs
     stay the single source of truth, which keeps URLs and the other
     pages in sync with the same range. Options list only the months
     that actually carry data (per the picked year). */
  function mhYears() {
    var ys = {};
    ((state.model && state.model.months) || []).forEach(function (mo) { ys[mo.key.slice(0, 4)] = 1; });
    return Object.keys(ys).sort().reverse();   /* newest year first */
  }
  function mhMonthsOfYear(y) {
    return ((state.model && state.model.months) || [])
      .filter(function (mo) { return mo.key.slice(0, 4) === String(y); })
      .map(function (mo) { return mo.key; }).sort();
  }
  function mhMonthName(key) { return T("m_" + key.slice(5, 7)); }
  function fillMhomeMY(keep) {
    var ySel = $("mhYear"), mSel = $("mhMonth");
    if (!ySel || !mSel || !state.model) return;
    var yv = keep ? ySel.value : "", mv = keep ? mSel.value : "";
    var years = mhYears();
    ySel.innerHTML = "";
    years.forEach(function (y) { ySel.add(new Option(y, y)); });
    if (!yv || years.indexOf(yv) < 0) yv = years[0] || "";
    ySel.value = yv;
    var keys = mhMonthsOfYear(yv);
    mSel.innerHTML = "";
    keys.forEach(function (k) { mSel.add(new Option(mhMonthName(k), k.slice(5, 7))); });
    if (!mv || keys.indexOf(yv + "-" + mv) < 0) {
      /* keep the month NUMBER when that month exists in the new year;
         otherwise slide to the closest month that carries data */
      var want = mv || (($("fFrom") || {}).value || "").slice(5, 7);
      var nums = keys.map(function (k) { return +k.slice(5, 7); });
      var best = null;
      if (want && nums.length) {
        var w = +want;
        best = nums.reduce(function (a, b) { return Math.abs(b - w) < Math.abs(a - w) ? b : a; });
      } else if (nums.length) best = nums[nums.length - 1];
      mv = best != null ? (best < 10 ? "0" + best : String(best)) : "";
    }
    mSel.value = mv;
  }
  function syncMhomeMY() {
    /* mirror the live range into the two selects (after uploads, URL
       restores, quick-filters) — display only, never re-renders */
    var ySel = $("mhYear"), mSel = $("mhMonth");
    if (!ySel || !mSel || !state.model) return;
    var a = $("fFrom").value, b = $("fTo").value;
    var key = (a && b && a.slice(0, 7) === b.slice(0, 7)) ? a.slice(0, 7)
      : String(b || a || state.model.dateMax || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    var yv = key.slice(0, 4), mv = key.slice(5, 7);
    if (mhYears().indexOf(yv) < 0) return;
    if (ySel.value !== yv) { ySel.value = yv; fillMhomeMY(true); }
    if (mhMonthsOfYear(yv).indexOf(yv + "-" + mv) >= 0) mSel.value = mv;
  }

  function mhBuckets() {
    var ser = (state.k && state.k.series) || [];
    var gran = state.mhGran || "day";
    var out = {}, order = [];
    ser.forEach(function (s) {
      var key, label;
      if (gran === "week") {
        var w = mhIsoWeek(s.date);
        key = s.date.slice(0, 4) + "-W" + (w < 10 ? "0" : "") + w;
        label = "W" + w;
      } else if (gran === "month") {
        key = s.date.slice(0, 7);
        label = mhMonthLabel(key);
      } else {
        key = s.date;
        label = s.label;
      }
      if (!out[key]) { out[key] = { key: key, label: label, rows: [] }; order.push(key); }
      out[key].rows.push(s);
    });
    order.sort();
    return order.map(function (k) { return out[k]; });
  }

  function mhAgg(rows) {
    var a = { days: rows.length, loA: 0, loT: 0, minProd: 0, avail: 0, otMin: 0,
              absent: 0, reg: 0, wrk: 0, otW: 0, samSum: 0, samCnt: 0, first: rows[0] && rows[0].date };
    rows.forEach(function (s) {
      a.loA += s.loA || 0; a.loT += s.loT || 0; a.minProd += s.minProd || 0;
      a.avail += s.totalMinAvail || 0; a.otMin += s.otMin || 0; a.absent += s.absent || 0;
      a.reg += s.regWorkers || 0; a.wrk += s.ddAttW || 0; a.otW += s.otAttW || 0;
      if (s.sam != null) { a.samSum += s.sam; a.samCnt += 1; }
    });
    a.eff = a.avail ? a.minProd / a.avail : null;
    a.otPct = (a.wrk + a.otW) ? a.otW / (a.wrk + a.otW) : null; /* R34: OT workers / total workers */
    a.absPct = a.reg ? a.absent / a.reg : null; /* R32: absent / regular workers ONLY — the base list is not the present workers, so it never absorbs the absent */
    a.pcsW = a.wrk ? a.loA / a.wrk : null;
    a.avgWrk = a.days ? a.wrk / a.days : null;
    a.sam = a.samCnt ? a.samSum / a.samCnt : null;
    return a;
  }

  function renderMhome() {
    syncMhomeMY();   /* R36: the month/year selects stay glued to the live range */
    var bk = mhBuckets();
    var agg = bk.map(function (b) { return mhAgg(b.rows); });
    var gran = state.mhGran || "day";
    function drill(b, domain) {
      return gran === "day" && b.rows[0] ? { type: "date", value: b.rows[0].date, domain: domain } : null;
    }
    /* 1 — VERİMLİLİK: efficiency bars + dashed target line (Excel combo) */
    C.vbar($("mhEff"), {
      items: bk.map(function (b, i) {
        var a = agg[i], st = stOf(a.eff, TH.efficiency);
        return { label: b.label, value: a.eff == null ? 0 : Math.round(a.eff * 1000) / 10, color: stColor(st),
          tip: [[T("t_eff"), fmtPct(a.eff, 1)], [T("t_minprod"), fmtInt(a.minProd)], [T("t_availmin"), fmtInt(a.avail)], [T("t_days"), String(a.days)]],
          drill: drill(b, "eff") };
      }),
      fmt: pctF(0), valueName: T("t_eff"),
      goal: { value: TH.efficiency.good * 100, color: C_GOOD, tipTitle: "t_goal_line" },
      height: 260
    });
    /* 2 — ÜRETİM ADETİ / ADAM·VARDİYA: output pieces per worker
       R33: bars open the day-details drill now (like the other five) */
    C.vbar($("mhProd"), {
      items: bk.map(function (b, i) {
        var a = agg[i];
        return { label: b.label, value: a.pcsW == null ? 0 : Math.round(a.pcsW * 10) / 10, color: C_ACCENT,
          tip: [[T("t_actual"), fmtInt(a.loA)], [T("t_wrk"), fmtInt(a.wrk)], [T("t_pcs_w"), a.pcsW == null ? "—" : I18N.dec(a.pcsW.toFixed(1))], [T("t_days"), String(a.days)]],
          drill: drill(b, "prod") };
      }),
      valueName: T("t_pcs_w"), height: 260
    });
    /* 3 — TOPLAM ÇALIŞAN K.Ş.: total workers (avg of days on week/month) */
    C.vbar($("mhWrk"), {
      items: bk.map(function (b, i) {
        var a = agg[i];
        var v = gran === "day" ? a.wrk : (a.avgWrk == null ? 0 : Math.round(a.avgWrk));
        return { label: b.label, value: v, color: C_ACCENT2,
          tip: [[T("t_wrk"), fmtInt(Math.round(v))], [T("t_days"), String(a.days)]],
          drill: drill(b, "att") };
      }),
      valueName: T("t_wrk"), height: 260
    });
    /* 4 — ORT. MODEL ZAMANI: average model time (SAM)
       R33: bars open the day-details drill now (like the other five) */
    C.vbar($("mhSam"), {
      items: bk.map(function (b, i) {
        var a = agg[i];
        return { label: b.label, value: a.sam == null ? 0 : Math.round(a.sam * 100) / 100, color: C_WARN,
          tip: [[T("t_sam"), a.sam == null ? "—" : I18N.dec(a.sam.toFixed(2))], [T("t_days"), String(a.days)]],
          drill: drill(b, "prod") };
      }),
      valueName: T("t_sam"), height: 260
    });
    /* 5 — FAZLA MESAİ ORANI: overtime % (inverted thresholds + safe goal) */
    C.vbar($("mhOt"), {
      items: bk.map(function (b, i) {
        var a = agg[i], st = stOf(a.otPct, TH.overtime, true);
        return { label: b.label, value: a.otPct == null ? 0 : Math.round(a.otPct * 1000) / 10, color: stColor(st),
          tip: [[T("t_ot_pct"), fmtPct(a.otPct, 2)], [T("t_ot_wrk"), fmtInt(a.otW)], [T("t_dd_wrk"), fmtInt(a.wrk)], [T("t_tot_wrk"), fmtInt(a.wrk + a.otW)], [T("t_ot_min2"), fmtInt(a.otMin)]],
          drill: drill(b, "ot") };
      }),
      fmt: pctF(1), valueName: T("t_ot_pct"),
      goal: { value: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" },
      height: 260
    });
    /* 6 — DEVAMSIZLIK ORANI: absenteeism % — R32: absent / regular workers (was / (reg + absent)) */
    C.vbar($("mhAbs"), {
      items: bk.map(function (b, i) {
        var a = agg[i];
        return { label: b.label, value: a.absPct == null ? 0 : Math.round(a.absPct * 1000) / 10, color: C_BAD,
          tip: [[T("t_abs_rate"), fmtPct(a.absPct, 1)], [T("t_absent"), fmtInt(a.absent)], [T("t_reg"), fmtInt(a.reg)], [T("t_days"), String(a.days)]],
          drill: drill(b, "att") };
      }),
      fmt: pctF(1), valueName: T("t_abs_rate"), height: 260
    });
  }

  /* R26: the current view as a URLSearchParams — shared by syncUrl()
     (writes the address bar) and syncLinkHrefs() (keeps the tab links
     pointing at this exact view so right-click → new tab reopens it). */
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
    if (state.page === "overview") renderOverview(k, sm);
    else if (state.page === "mhome") renderMhome();
    else if (state.page === "lines") renderLines(k, sm);
    else if (state.page === "sections") renderSections(k, sm);
    else if (state.page === "sups") renderSups(k, sm);
    else if (state.page === "pm") renderPM(k, sm);
    else if (state.page === "ot") renderOT(k, sm);
    else if (state.page === "att") renderAtt(k, sm);
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
      if (single && hasM(single)) syncMhomeMY();
      else if (state.model && state.model.dateMax && hasM(state.model.dateMax.slice(0, 7))) {
        snapToMonth(state.model.dateMax.slice(0, 7), true);
        syncMhomeMY();
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
    if (view === "audit" && MaribAuth.isDev && MaribAuth.isDev()) auditReset();
    if (view === "storage" && MaribAuth.isDev && MaribAuth.isDev()) loadStorage();
    if (view === "mhome" && MaribAuth.isDev && MaribAuth.isDev()) loadMhome();
    if (view === "perms" && MaribAuth.isAdmin && MaribAuth.isAdmin()) loadPerms();
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
    var admin = MaribAuth.isAdmin ? MaribAuth.isAdmin() : false;
    var dev = MaribAuth.isDev ? MaribAuth.isDev() : false;
    /* role-filter the category boxes (R27):
       targets = admin+ · groups = everyone · audit/storage = dev only ·
       perms (R46-2) = admin+ (admin can manage regular users; dev sees all) */
    var bx = document.querySelectorAll("#setHome .set-box");
    bx.forEach(function (b) {
      var v = b.getAttribute("data-view");
      var show = v === "targets" ? admin : (v === "groups" || v === "theme" ? true : (v === "perms" ? admin : dev));
      b.style.display = show ? "" : "none";
    });
    syncThemeCards();
    var cs = $("clsSave"); if (cs) cs.disabled = !admin;
    goSettingsHome();
    tgFill();
    buildClsList();
    $("setPop").classList.add("on");
  }

  /* ============================================================
     R46-8 — Data entry popup (Production / Absence / Overtime)
     Opens a full-screen modal with 3 tabs. Each tab loads its entries
     for the current month via /api/entries/* and lets the user add +
     delete. The absence tab has download/upload template buttons.
     ============================================================ */
  var entModal = null;
  var entActiveTab = "production";
  var entMonth = (function () {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
  })();
  function openEntries() {
    if (entModal) { entModal.remove(); entModal = null; }
    var m = document.createElement("div");
    m.className = "ent-pop";
    m.id = "entPop";
    m.innerHTML =
      '<div class="ent-panel">' +
        '<div class="ent-head">' +
          '<h3><i class="tb-em" aria-hidden="true">📝</i> ' + esc(T("ent_title")) + '</h3>' +
          '<div class="ent-tools">' +
            '<label class="ent-month"><span>' + esc(T("mp_month")) + '</span><input type="month" id="entMonth" value="' + entMonth + '"></label>' +
            '<button type="button" class="ent-x" aria-label="' + esc(T("dp_close")) + '">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ent-tabs">' +
          '<button type="button" class="ent-tab on" data-tab="production"><i class="tb-em" aria-hidden="true">🏭</i> ' + esc(T("ent_prod_tab")) + '</button>' +
          '<button type="button" class="ent-tab" data-tab="absence"><i class="tb-em" aria-hidden="true">📋</i> ' + esc(T("ent_abs_tab")) + '</button>' +
          '<button type="button" class="ent-tab" data-tab="overtime"><i class="tb-em" aria-hidden="true">⏱️</i> ' + esc(T("ent_ot_tab")) + '</button>' +
        '</div>' +
        '<div class="ent-body" id="entBody"></div>' +
      '</div>';
    document.body.appendChild(m);
    entModal = m;
    m.addEventListener("click", function (e) {
      if (e.target === m) closeEntries();
    });
    m.querySelector(".ent-x").addEventListener("click", closeEntries);
    m.querySelector("#entMonth").addEventListener("change", function () {
      entMonth = m.querySelector("#entMonth").value || entMonth;
      entRender();
    });
    m.querySelectorAll(".ent-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        entActiveTab = t.getAttribute("data-tab");
        m.querySelectorAll(".ent-tab").forEach(function (x) { x.classList.toggle("on", x === t); });
        entRender();
      });
    });
    entRender();
  }
  function closeEntries() {
    if (entModal) { entModal.remove(); entModal = null; }
  }
  function entRender() {
    var body = entModal ? entModal.querySelector("#entBody") : null;
    if (!body) return;
    body.innerHTML = '<div class="ent-loading">…</div>';
    if (entActiveTab === "production") return entLoadProduction(body);
    if (entActiveTab === "absence") return entLoadAbsence(body);
    if (entActiveTab === "overtime") return entLoadOvertime(body);
  }
  /* ---- production ---- */
  function entLoadProduction(body) {
    fetch("/api/entries/production?month=" + encodeURIComponent(entMonth), { credentials: "include" })
      .then(function (r) { if (!r.ok) throw { s: r.status }; return r.json(); })
      .then(function (d) { entRenderProduction(body, d.entries || []); })
      .catch(function () { body.innerHTML = '<p class="ent-err">' + esc(T("toast_sync_err")) + '</p>'; });
  }
  function entRenderProduction(body, entries) {
    var html = '<div class="ent-actions">' +
      '<button type="button" class="ent-add" id="entProdAdd">' + esc(T("ent_add")) + '</button>' +
      '<span class="ent-count"><b>' + entries.length + '</b> ' + esc(T("mp_rows")) + '</span>' +
    '</div>';
    if (!entries.length) {
      html += '<p class="ent-empty">' + esc(T("ent_no_data")) + '</p>';
    } else {
      html += '<table class="ent-tbl"><thead><tr>' +
        '<th>' + esc(T("ent_date")) + '</th>' +
        '<th>' + esc(T("ent_dept")) + '</th>' +
        '<th>' + esc(T("ent_line")) + '</th>' +
        '<th>' + esc(T("ent_po")) + '</th>' +
        '<th>' + esc(T("ent_qty")) + '</th>' +
        '<th>' + esc(T("ent_note")) + '</th>' +
        '<th>' + esc(T("ent_actions")) + '</th>' +
        '</tr></thead><tbody>';
      entries.forEach(function (e) {
        html += '<tr>' +
          '<td>' + esc(e.date) + '</td>' +
          '<td>' + esc(e.dept_name || "—") + '</td>' +
          '<td>' + esc(e.line_id || "—") + '</td>' +
          '<td>' + esc(e.po_number || "—") + '</td>' +
          '<td class="num">' + esc(e.qty) + '</td>' +
          '<td>' + esc(e.note || "") + '</td>' +
          '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="production">' + esc(T("ent_deleted")) + '</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }
    body.innerHTML = html;
    var add = body.querySelector("#entProdAdd");
    if (add) add.addEventListener("click", function () { entOpenProdForm(); });
    body.querySelectorAll(".ent-del").forEach(function (b) {
      b.addEventListener("click", function () { entDelete("production", b.getAttribute("data-id")); });
    });
  }
  /* R50: أقسام الإنتاج الخمسة الثابتة + الخمسة خطوط — دي أقسام
     الأرضية الفعلية، مش شجرة الاتزان كلها (طلب المالك) */
  var ENT_SECTIONS = ["الصدر", "الضهر", "التجميع", "التجهيزات", "البوكت"];
  var ENT_LINES = ["1", "2", "3", "4", "5"];
  function entSecOptions(sel) {
    var h = '<option value="">' + esc(T("ent_sec_prod")) + '</option>';
    for (var i = 0; i < ENT_SECTIONS.length; i++) {
      h += '<option value="' + esc(ENT_SECTIONS[i]) + '">' + esc(ENT_SECTIONS[i]) + "</option>";
    }
    return h;
  }
  function entLineOptions() {
    var h = '<option value="">' + esc(T("ent_line_n")) + "</option>";
    for (var i = 0; i < ENT_LINES.length; i++) {
      h += '<option value="' + esc(ENT_LINES[i]) + '">' + esc(I18N.lang() === "tr" ? "Hat " + ENT_LINES[i] : "خط " + ENT_LINES[i]) + "</option>";
    }
    return h;
  }
  function entOpenProdForm() {
    var today = new Date().toISOString().slice(0, 10);
    var html =
      '<div class="ent-form-row"><label>' + esc(T("ent_date")) + '<input type="date" id="efDate" value="' + today + '"></label></div>' +
      '<div class="ent-form-row two">' +
        '<label>' + esc(T("ent_dept")) + '<select id="efSec">' + entSecOptions() + '</select></label>' +
        '<label>' + esc(T("ent_line")) + '<select id="efLine">' + entLineOptions() + '</select></label>' +
      '</div>' +
      '<div class="ent-form-row two">' +
        '<label>' + esc(T("ent_po")) + '<input type="text" id="efPo" placeholder="PO-123"></label>' +
        '<label>' + esc(T("ent_qty")) + '<input type="number" id="efQty" min="1" value="1"></label>' +
      '</div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_note")) + '<input type="text" id="efNote" placeholder=""></label></div>';
    entOpenForm(T("ent_add") + " — " + T("ent_prod_tab"), html, function (fm) {
      var data = {
        date: fm.querySelector("#efDate").value,
        dept: (fm.querySelector("#efSec") || {}).value || "",
        line: (fm.querySelector("#efLine") || {}).value || "",
        po_number: fm.querySelector("#efPo").value,
        qty: parseInt(fm.querySelector("#efQty").value, 10) || 0,
        note: fm.querySelector("#efNote").value,
      };
      if (!data.date || data.qty <= 0 || !data.dept || !data.line) { toast(T("toast_fill"), "err"); return false; }
      entSubmitForm("/api/entries/production", data);
      return true;
    });
  }
  /* ---- absence ---- */
  function entLoadAbsence(body) {
    fetch("/api/entries/absence?month=" + encodeURIComponent(entMonth), { credentials: "include" })
      .then(function (r) { if (!r.ok) throw { s: r.status }; return r.json(); })
      .then(function (d) { entRenderAbsence(body, d.entries || []); })
      .catch(function () { body.innerHTML = '<p class="ent-err">' + esc(T("toast_sync_err")) + '</p>'; });
  }
  function entRenderAbsence(body, entries) {
    var html = '<div class="ent-actions">' +
      '<button type="button" class="ent-add" id="entAbsAdd">' + esc(T("ent_add")) + '</button>' +
      '<button type="button" class="ent-add ghost" id="entAbsTpl">' + esc(T("ent_download_tpl")) + '</button>' +
      '<button type="button" class="ent-add ghost" id="entAbsUpload">' + esc(T("ent_upload_tpl")) + '</button>' +
      '<span class="ent-count"><b>' + entries.length + '</b> ' + esc(T("mp_rows")) + '</span>' +
    '</div>';
    if (!entries.length) {
      html += '<p class="ent-empty">' + esc(T("ent_no_data")) + '</p>';
    } else {
      html += '<table class="ent-tbl"><thead><tr>' +
        '<th>' + esc(T("ent_date")) + '</th>' +
        '<th>' + esc(T("ent_code")) + '</th>' +
        '<th>' + esc(T("ent_name")) + '</th>' +
        '<th>' + esc(T("mp_dept")) + '</th>' +
        '<th>' + esc(T("ent_reason")) + '</th>' +
        '<th>' + esc(T("ent_matched")) + '</th>' +
        '<th>' + esc(T("ent_actions")) + '</th>' +
        '</tr></thead><tbody>';
      entries.forEach(function (e) {
        html += '<tr class="' + (e.matched ? "" : "unmatched") + '">' +
          '<td>' + esc(e.date) + '</td>' +
          '<td>' + esc(e.emp_code || "—") + '</td>' +
          '<td>' + esc(e.emp_name || "—") + '</td>' +
          '<td>' + esc(e.dept_name || "—") + '</td>' +
          '<td>' + esc(e.reason || "") + '</td>' +
          '<td>' + (e.matched ? esc(T("ent_matched")) : '<b class="bad">' + esc(T("ent_unmatched")) + '</b>') + '</td>' +
          '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="absence">' + esc(T("ent_deleted")) + '</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }
    body.innerHTML = html;
    var add = body.querySelector("#entAbsAdd");
    if (add) add.addEventListener("click", function () { entOpenAbsForm(); });
    var tpl = body.querySelector("#entAbsTpl");
    if (tpl) tpl.addEventListener("click", function () { entDownloadAbsTemplate(); });
    var upl = body.querySelector("#entAbsUpload");
    if (upl) upl.addEventListener("click", function () { entUploadAbsTemplate(); });
    body.querySelectorAll(".ent-del").forEach(function (b) {
      b.addEventListener("click", function () { entDelete("absence", b.getAttribute("data-id")); });
    });
  }
  function entOpenAbsForm() {
    var today = new Date().toISOString().slice(0, 10);
    var html =
      '<div class="ent-form-row"><label>' + esc(T("ent_date")) + '<input type="date" id="efDate" value="' + today + '"></label></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_code")) + '<input type="text" id="efCode" placeholder="17007"></label></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_name")) + '<input type="text" id="efName" placeholder="اسم الموظف"></label></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_reason")) + '<input type="text" id="efReason" placeholder=""></label></div>';
    entOpenForm(T("ent_add") + " — " + T("ent_abs_tab"), html, function (fm) {
      var data = {
        date: fm.querySelector("#efDate").value,
        emp_code: fm.querySelector("#efCode").value.trim(),
        emp_name: fm.querySelector("#efName").value.trim(),
        reason: fm.querySelector("#efReason").value.trim(),
      };
      if (!data.date || (!data.emp_code && !data.emp_name)) { toast(T("toast_fill"), "err"); return false; }
      entSubmitForm("/api/entries/absence", data, function (r) {
        if (r && r.matched === false) {
          toast(T("ent_unmatched") + " — " + (r.id ? "id " + r.id : ""), "warn");
        } else {
          toast(T("ent_saved"), "ok");
        }
      });
      return true;
    });
  }
  function entDownloadAbsTemplate() {
    fetch("/api/entries/absence?template=1", { credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error("t" + r.status); return r.blob(); })
      .then(function (b) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        var d = new Date();
        function p2(n) { return (n < 10 ? "0" : "") + n; }
        a.download = "Absence-Template-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + ".xlsx";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
        toast(T("mp_tmpl_done"), "ok");
      })
      .catch(function () { toast(T("toast_sync_err"), "err"); });
  }
  function entUploadAbsTemplate() {
    var pick = document.createElement("input");
    pick.type = "file";
    pick.accept = ".xlsx,.xls";
    pick.addEventListener("change", function () {
      var f = pick.files && pick.files[0];
      if (!f) return;
      /* read with the existing XLSX lib if available, otherwise use a simple
         text approach. For now we delegate to a JSON upload of rows. */
      if (window.MaribCloud && MaribCloud.ensureXLSX) {
        MaribCloud.ensureXLSX().then(function (XLSX) {
          var fr = new FileReader();
          fr.onload = function (ev) {
            try {
              var wb = XLSX.read(ev.target.result, { type: "array" });
              var ws = wb.Sheets[wb.SheetNames[0]];
              var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
              /* find header row — same logic as manpower import */
              var hRow = 0;
              for (var i = 0; i < grid.length; i++) {
                var r = grid[i] || [];
                if (String(r[1] || "").indexOf("الكود") >= 0) { hRow = i; break; }
              }
              var rows = [];
              for (var j = hRow + 1; j < grid.length; j++) {
                var g = grid[j] || [];
                if (!String(g[1] || "").trim() && !String(g[2] || "").trim()) continue;
                rows.push(["p", String(g[1] || "").trim(), String(g[2] || "").trim(), String(g[3] || "").trim()]);
              }
              entSubmitAbsImport(rows);
            } catch (e) { toast(T("toast_sync_err"), "err"); }
          };
          fr.readAsArrayBuffer(f);
        }).catch(function () { toast(T("toast_sync_err"), "err"); });
      } else {
        toast(T("toast_sync_err"), "err");
      }
    });
    pick.click();
  }
  function entSubmitAbsImport(rows) {
    /* ask for the date to apply */
    var today = new Date().toISOString().slice(0, 10);
    var html = '<div class="ent-form-row"><label>' + esc(T("ent_date")) + '<input type="date" id="efDate" value="' + today + '"></label></div>' +
      '<p class="ent-form-hint">' + esc(rows.length + " " + T("mp_rows")) + '</p>';
    entOpenForm(T("ent_upload_tpl"), html, function (fm) {
      var date = fm.querySelector("#efDate").value;
      if (!date) { toast(T("toast_fill"), "err"); return false; }
      fetch("/api/entries/absence?action=import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date: date, rows: rows }),
      })
        .then(function (r) { if (!r.ok) throw new Error("i" + r.status); return r.json(); })
        .then(function (d) {
          if (d.unmatched) {
            toast(T("ent_saved") + " — " + d.inserted + " · " + d.unmatched + " " + T("ent_unmatched"), "warn");
          } else {
            toast(T("ent_saved") + " — " + d.inserted, "ok");
          }
          entRender();
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); });
      return true;
    });
  }
  /* ---- overtime ---- */
  function entLoadOvertime(body) {
    fetch("/api/entries/overtime?month=" + encodeURIComponent(entMonth), { credentials: "include" })
      .then(function (r) { if (!r.ok) throw { s: r.status }; return r.json(); })
      .then(function (d) { entRenderOvertime(body, d.entries || []); })
      .catch(function () { body.innerHTML = '<p class="ent-err">' + esc(T("toast_sync_err")) + '</p>'; });
  }
  function entRenderOvertime(body, entries) {
    var html = '<div class="ent-actions">' +
      '<button type="button" class="ent-add" id="entOtAdd">' + esc(T("ent_add")) + '</button>' +
      '<span class="ent-count"><b>' + entries.length + '</b> ' + esc(T("mp_rows")) + '</span>' +
    '</div>';
    if (!entries.length) {
      html += '<p class="ent-empty">' + esc(T("ent_no_data")) + '</p>';
    } else {
      html += '<table class="ent-tbl"><thead><tr>' +
        '<th>' + esc(T("ent_date")) + '</th>' +
        '<th>' + esc(T("ent_code")) + '</th>' +
        '<th>' + esc(T("ent_name")) + '</th>' +
        '<th>' + esc(T("mp_dept")) + '</th>' +
        '<th>' + esc(T("ent_hours")) + '</th>' +
        '<th>' + esc(T("ent_note")) + '</th>' +
        '<th>' + esc(T("ent_matched")) + '</th>' +
        '<th>' + esc(T("ent_actions")) + '</th>' +
        '</tr></thead><tbody>';
      entries.forEach(function (e) {
        html += '<tr class="' + (e.matched ? "" : "unmatched") + '">' +
          '<td>' + esc(e.date) + '</td>' +
          '<td>' + esc(e.emp_code || "—") + '</td>' +
          '<td>' + esc(e.emp_name || "—") + '</td>' +
          '<td>' + esc(e.dept_name || "—") + '</td>' +
          '<td class="num">' + esc(e.hours) + '</td>' +
          '<td>' + esc(e.note || "") + '</td>' +
          '<td>' + (e.matched ? esc(T("ent_matched")) : '<b class="bad">' + esc(T("ent_unmatched")) + '</b>') + '</td>' +
          '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="overtime">' + esc(T("ent_deleted")) + '</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }
    body.innerHTML = html;
    var add = body.querySelector("#entOtAdd");
    if (add) add.addEventListener("click", function () { entOpenOtForm(); });
    body.querySelectorAll(".ent-del").forEach(function (b) {
      b.addEventListener("click", function () { entDelete("overtime", b.getAttribute("data-id")); });
    });
  }
  /* R50: كومبوبوكس الموظفين — بحث بالاسم أو الكود من الاتزان،
     مع إكمال تلقائي لباقي الكلمة، وزرار «إضافة كرقم» للي مش موجود */
  var entEmpCache = null;   /* [{code, name, nameTr, job, path}] */
  function entEmpList(cb) {
    if (entEmpCache) { cb(entEmpCache); return; }
    fetch("/api/manpower", { credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error("m"); return r.json(); })
      .then(function (d) {
        var byId = {}, kids = {};
        (d.depts || []).forEach(function (n) {
          byId[n[0]] = n[1];
          (kids[n[2] || ""] = kids[n[2] || ""] || []).push(n[0]);
        });
        var pathOf = {};
        (function walk(pid, pref) {
          (kids[pid] || []).forEach(function (k) {
            pathOf[k] = (pref ? pref + " — " : "") + (byId[k] || k);
            walk(k, pathOf[k]);
          });
        })("", "");
        entEmpCache = [];
        (d.emps || []).forEach(function (e) {
          if (e[6]) return; /* شواغر مش ناس */
          entEmpCache.push({
            code: String(e[1] || ""), name: String(e[2] || ""),
            nameTr: String(e[11] || ""), job: String(e[3] || ""),
            path: pathOf[e[4]] || "",
          });
        });
        cb(entEmpCache);
      })
      .catch(function () { cb([]); });
  }
  /* يبني ويربط كومبوبوكس جوه مودال الفورم — callback بالاختيار */
  function entBindCombo(root, onState) {
    var inp = root.querySelector("#efPerson");
    var list = root.querySelector("#efPersonList");
    var addBtn = root.querySelector("#efAddCode");
    if (!inp || !list) return;
    var state = { picked: null, raw: "" };   /* picked = {code,name} · raw = كود حر */
    var Lng = I18N.lang();
    function disp(e) { return (Lng === "tr" && e.nameTr ? e.nameTr : e.name) + " — " + e.code; }
    function renderList(q) {
      q = String(q || "").trim().toLowerCase();
      if (!q) { list.hidden = true; list.innerHTML = ""; return; }
      var hits = [];
      var n = 0;
      for (var i = 0; i < entEmpCache.length && n < 30; i++) {
        var e = entEmpCache[i];
        var hay = (e.name + " " + e.nameTr + " " + e.code).toLowerCase();
        if (hay.indexOf(q) >= 0) { hits.push(e); n++; }
      }
      var h = "";
      for (var j = 0; j < hits.length; j++) {
        h += '<div class="ent-cb-it" data-ix="' + j + '"><b>' + esc(Lng === "tr" && hits[j].nameTr ? hits[j].nameTr : hits[j].name) + "</b>" +
             '<i class="num">' + esc(hits[j].code) + "</i>" +
             (hits[j].path ? '<small class="faint">' + esc(hits[j].path) + "</small>" : "") + "</div>";
      }
      if (!h) h = '<div class="ent-cb-none faint">' + esc(T("mp_search_none")) + "</div>";
      list.innerHTML = h;
      list.hidden = false;
      list._hits = hits;
    }
    function pick(e) {
      state.picked = e; state.raw = "";
      inp.value = disp(e);
      list.hidden = true;
      if (addBtn) addBtn.hidden = true;
      if (onState) onState(state);
    }
    function markRaw() {
      state.picked = null;
      state.raw = inp.value.trim();
      if (addBtn) {
        addBtn.hidden = !state.raw;
        var lbl = addBtn.querySelector("b");
        if (lbl) lbl.textContent = state.raw;
      }
      if (onState) onState(state);
    }
    inp.addEventListener("input", function () {
      state.picked = null; state.raw = "";
      renderList(inp.value);
      /* R50-fix: الزرار يظهر طول ما فيه نص من غير اختيار — والضغط عليه
         هو اللي بيأكد «خد النص ده ككود» (class ok). مجرد الكتابة = اسم. */
      if (addBtn) {
        addBtn.hidden = !inp.value.trim();
        addBtn.classList.remove("ok");
        var lbl0 = addBtn.querySelector("b");
        if (lbl0) lbl0.textContent = inp.value.trim();
      }
      if (onState) onState(state);
    });
    inp.addEventListener("focus", function () { renderList(inp.value); });
    /* الخروج من الخانة يقفل القايمة — بتأخير صغير عشان الـ mousedown يشوط */
    inp.addEventListener("blur", function () { setTimeout(function () { list.hidden = true; }, 160); });
    inp.addEventListener("keydown", function (ev) {
      if (list.hidden || !list._hits || !list._hits.length) return;
      var cur = list.querySelector(".ent-cb-it.on");
      var items = list.querySelectorAll(".ent-cb-it");
      var ix = cur ? parseInt(cur.getAttribute("data-ix"), 10) : -1;
      if (ev.key === "ArrowDown") { ev.preventDefault(); ix = Math.min(ix + 1, items.length - 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); ix = Math.max(ix - 1, 0); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (cur) pick(list._hits[parseInt(cur.getAttribute("data-ix"), 10)]); return; }
      else return;
      items.forEach(function (x) { x.classList.toggle("on", parseInt(x.getAttribute("data-ix"), 10) === ix); });
    });
    list.addEventListener("mousedown", function (ev) {
      var it = ev.target.closest ? ev.target.closest(".ent-cb-it") : null;
      if (it && list._hits) { ev.preventDefault(); pick(list._hits[parseInt(it.getAttribute("data-ix"), 10)]); }
    });
    if (addBtn) addBtn.addEventListener("click", function () {
      markRaw();
      addBtn.classList.add("ok");
      toast(T("ent_add_code") + ": " + state.raw, "ok");
    });
    /* markRaw (الضغط) هو التأكيد الوحيد للكود الحر */
    /* البداية: من غير اختيار */
    if (onState) onState(state);
  }
  function entOpenOtForm() {
    var today = new Date().toISOString().slice(0, 10);
    var html =
      '<div class="ent-form-row"><label>' + esc(T("ent_date")) + '<input type="date" id="efDate" value="' + today + '"></label></div>' +
      '<div class="ent-form-row two">' +
        '<label>' + esc(T("ent_dept")) + '<select id="efSec">' + entSecOptions() + '</select></label>' +
        '<label>' + esc(T("ent_line")) + '<select id="efLine">' + entLineOptions() + '</select></label>' +
      '</div>' +
      '<div class="ent-form-row ent-cb-row"><label class="ent-cb-lbl">' + esc(T("ent_person")) + '</label>' +
        '<div class="ent-cb"><input type="text" id="efPerson" placeholder="' + esc(T("ent_person")) + '" autocomplete="off">' +
        '<div class="ent-cb-list" id="efPersonList" hidden></div></div>' +
        '<button type="button" class="ent-add-code" id="efAddCode" hidden title="' + esc(T("ent_add_code_hint")) + '">➕ ' + esc(T("ent_add_code")) + ': <b></b></button>' +
      '</div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_hours")) + '<input type="number" id="efHours" min="0.5" max="24" step="0.5" value="2"></label></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_note")) + '<input type="text" id="efNote" placeholder=""></label></div>';
    entOpenForm(T("ent_add") + " — " + T("ent_ot_tab"), html, function (fm) {
      var data = {
        date: fm.querySelector("#efDate").value,
        dept: (fm.querySelector("#efSec") || {}).value || "",
        line: (fm.querySelector("#efLine") || {}).value || "",
        hours: parseFloat(fm.querySelector("#efHours").value) || 0,
        note: fm.querySelector("#efNote").value.trim(),
      };
      /* الشخص: يا اختيار من الكومبوبوكس يا كود حر من زرار «إضافة كرقم» */
      var pinp = fm.querySelector("#efPerson");
      var addBtn = fm.querySelector("#efAddCode");
      if (pinp && pinp._picked) {
        data.emp_code = pinp._picked.code;
        data.emp_name = pinp._picked.name;
      } else if (pinp && addBtn && addBtn.classList.contains("ok") && pinp.value.trim()) {
        /* ضغط زرار «إضافة كرقم» = النص ده كود */
        data.emp_code = pinp.value.trim();
        data.emp_name = "";
      } else if (pinp && pinp.value.trim()) {
        data.emp_name = pinp.value.trim();
      }
      if (!data.date || (!data.emp_code && !data.emp_name) || data.hours <= 0 || !data.dept || !data.line) {
        toast(T("toast_fill"), "err");
        return false;
      }
      entSubmitForm("/api/entries/overtime", data, function (r) {
        if (r && r.matched === false) {
          toast(T("ent_unmatched") + " — " + (r.id ? "id " + r.id : ""), "warn");
        } else {
          toast(T("ent_saved"), "ok");
        }
      });
      return true;
    });
    /* اربط الكومبوبوكس بعد فتح المودال — الكاش من الاتزان */
    setTimeout(function () {
      var fm = document.querySelector(".ent-form-modal");
      if (!fm) return;
      entEmpList(function () {
        var pinp = fm.querySelector("#efPerson");
        if (pinp) pinp._picked = null;
        entBindCombo(fm, function (st) {
          if (pinp) pinp._picked = st.picked;
        });
      });
    }, 40);
  }
  /* ---- helpers ---- */
  /* R47-fix: onSave كان بيقرأ الحقول من entModal (البوب أب الكبير) وهي
     في الحقيقة في المودال الصغير المنفصل اللي بيتزق على body — فالقراءة
     كانت بترمي exception صامت والسجل مش بيتسجل أبداً. بقى onSave(fm)
     بياخد عنصر الفورم نفسه. */
  function entOpenForm(title, html, onSave) {
    var m = document.createElement("div");
    m.className = "ent-form-modal";
    m.innerHTML =
      '<div class="ent-form-card">' +
        '<div class="ent-form-head"><h4>' + esc(title) + '</h4>' +
          '<button type="button" class="ent-form-x" aria-label="' + esc(T("dp_close")) + '">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="ent-form-body">' + html + '</div>' +
        '<div class="ent-form-btns">' +
          '<button type="button" class="ent-form-cancel">' + esc(T("mp_cancel")) + '</button>' +
          '<button type="button" class="ent-form-save">' + esc(T("mp_save")) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    m.querySelector(".ent-form-x").addEventListener("click", function () { m.remove(); });
    m.querySelector(".ent-form-cancel").addEventListener("click", function () { m.remove(); });
    m.querySelector(".ent-form-save").addEventListener("click", function () {
      var ok = onSave(m);
      if (ok !== false) m.remove();
    });
  }
  function entSubmitForm(url, data, after) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    })
      .then(function (r) { if (!r.ok) throw new Error("s" + r.status); return r.json(); })
      .then(function (r) { if (after) after(r); else toast(T("ent_saved"), "ok"); entRender(); })
      .catch(function () { toast(T("toast_sync_err"), "err"); });
  }
  function entDelete(tab, id) {
    if (!id) return;
    if (!confirm(T("mp_confirm_del"))) return;
    fetch("/api/entries/" + tab + "?id=" + encodeURIComponent(id), {
      method: "DELETE",
      credentials: "include",
    })
      .then(function (r) { if (!r.ok) throw new Error("d" + r.status); return r.json(); })
      .then(function () { toast(T("ent_deleted"), "ok"); entRender(); })
      .catch(function () { toast(T("toast_sync_err"), "err"); });
  }

  /* ============================================================
     R26 — me-badge (user photo circle + name) & profile photo upload
     ============================================================ */
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
  window.MaribMe = {
    set: function (u) {
      setAvPhoto($("ucAv"), null, null, u ? u.photo : null, u ? u.username : "");
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
      if (!(MaribAuth.isAdmin && MaribAuth.isAdmin())) { toast(T("toast_need_admin"), "err"); return; }
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
  var auData = null;
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
  function auEntityPretty(x) {
    var e = x.entity || "";
    if (e.indexOf("data:") === 0) return T("dt_month") + " " + monthLabelOf(e.slice(5));
    if (e === "settings:targets") return T("set_targets");
    if (e === "settings:groups") return T("set_groups");
    if (e === "settings:storage_quota") return T("set_storage");
    if (e === "settings:mhome") return T("set_mhome");   /* R36: the raw key leaked into the table */
    if (e.indexOf("users:") === 0) return T("nav_users") + " · " + e.slice(6);
    if (e === "site") return T("au_site");   /* R36: was set_title (الإعدادات) — wrong face for login/logout rows */
    if (e === "manpower") return T("au_mp");           /* R37: الاتزان rows */
    if (e === "manpower-req") return T("au_mp_req");   /* R37: required-count edits */
    return e;
  }
  /* R35: date-first flow — the log never auto-loads on open. Step 1: the
     user picks a period (or "since site creation"). Step 2: he chooses
     view-on-site or the Excel export. auRange remembers which period
     auData holds, so the export can never ship a stale range. */
  var auAllMode = false, auRange = "";
  function auCurRange() {
    return auAllMode ? "all" : ($("auFrom").value + "|" + $("auTo").value);
  }
  function auValid() {
    return auAllMode || !!($("auFrom").value || $("auTo").value);
  }
  function auditSyncButtons() {
    var ok = auValid();
    $("auShow").disabled = !ok;
    $("auExport").disabled = !ok;
    var hint = $("auPickHint");
    if (hint) hint.hidden = ok;
  }
  function auditReset() {
    auData = null; auRange = ""; auAllMode = false;
    $("auFrom").value = ""; $("auTo").value = "";
    var tb = $("auTables"); if (tb) tb.hidden = true;
    var hint = $("auPickHint"); if (hint) hint.hidden = false;
    auditSyncButtons();
  }
  function loadAudit() {
    var from = $("auFrom").value, to = $("auTo").value;
    MaribCloud.auditGet(from, to).then(function (r) {
      auData = r;
      auRange = auCurRange();
      var tb = $("auTables"); if (tb) tb.hidden = false;
      renderAudit();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function renderAudit() {
    if (!auData) return;
    var ents = auData.entities || [];
    var eh = "<thead><tr><th>" + T("au_entities") + "</th><th>" + T("au_creator") + "</th><th>" + T("au_edits") + "</th><th>" + T("au_total_edits") + "</th></tr></thead>";
    var rows = ents.map(function (x) {
      var edits = (x.edits || []).map(function (ed) {
        return '<span class="au-chip edit">' + esc(ed.actor) + " · " + auWhen(ed.at) + "</span>";
      }).join(" ");
      if (!edits) edits = '<span style="color:#7E92A8">' + T("au_no_edits") + "</span>";
      return "<tr><td><b>" + esc(auEntityPretty(x)) + "</b>" + (x.label ? '<br><small style="color:#7E92A8">' + esc(x.label) + "</small>" : "") + "</td>" +
        '<td class="num"><b>' + esc(x.creator.actor) + "</b><br><small style='color:#7E92A8'>" + auWhen(x.creator.at) + "</small></td>" +
        "<td>" + edits + "</td><td class='num'>" + x.totalEdits + "</td></tr>";
    }).join("");
    if (!ents.length) rows = "<tr><td colspan='4' style='padding:16px;color:#A9B7C7'>" + T("au_empty") + "</td></tr>";
    $("auEntities").innerHTML = eh + "<tbody>" + rows + "</tbody>";

    var evs = auData.events || [];
    var vh = "<thead><tr><th>" + T("f_from") + "</th><th>" + T("t_sup") + "</th><th>—</th><th>" + T("dt_month") + "</th></tr></thead>";
    /* events table: time · actor · action · subject */
    vh = "<thead><tr><th>🕒</th><th></th><th></th><th></th></tr></thead>";
    var vrows = evs.map(function (ev) {
      var cls = "au-chip act-" + (/^[a-z]+$/.test(ev.action || "") ? ev.action : "edit");
      var subj = ev.entity && ev.entity.indexOf("data:") === 0 ? monthLabelOf(ev.entity.slice(5)) : auEntityPretty(ev);
      return "<tr><td class='num'>" + auWhen(ev.at) + "</td><td><b>" + esc(ev.actor) + "</b></td>" +
        '<td><span class="' + cls + '">' + esc(T("au_a_" + ev.action)) + "</span></td>" +
        "<td>" + esc(subj) + (ev.label ? ' <small style="color:#7E92A8">· ' + esc(ev.label) + "</small>" : "") + "</td></tr>";
    }).join("");
    if (!evs.length) vrows = "<tr><td colspan='4' style='padding:16px;color:#A9B7C7'>" + T("au_empty") + "</td></tr>";
    $("auEvents").innerHTML = "<thead><tr><th>" + T("au_c_time") + "</th><th>" + T("au_c_user") + "</th><th>" + T("au_c_action") + "</th><th>" + T("au_c_subject") + "</th></tr></thead><tbody>" + vrows + "</tbody>";
  }
  function exportAudit() {
    if (!auValid()) { toast(T("au_pick"), "err"); return; }
    var build = function () {
      if (!auData) { toast(T("toast_sync_err"), "err"); return; }
      /* SheetJS loads on demand (R24 perf) — the export waits for it once */
      ensureXLSX().then(function () {
      try {
        var wb = XLSX.utils.book_new();
        function xesc(v) {
          var sv = String(v == null ? "" : v);
          return /^[=+\-@]/.test(sv) ? "'" + sv : sv;   /* Excel formula-injection guard */
        }
        var ents = auData.entities || [];
        var r1 = [[T("au_entities")], [T("au_c_subject"), T("au_creator"), T("au_c_time"), T("au_edits"), T("au_total_edits")]];
        ents.forEach(function (x) {
          var edits = (x.edits || []).map(function (ed) { return ed.actor + " @ " + auWhen(ed.at); }).join(" | ");
          r1.push([xesc(auEntityPretty(x) + (x.label ? " · " + x.label : "")), xesc(x.creator.actor), auWhen(x.creator.at), xesc(edits || T("au_no_edits")), x.totalEdits]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r1), T("au_excel_sheet1"));
        var evs = auData.events || [];
        var r2 = [[T("au_c_time"), T("au_c_user"), T("au_c_action"), T("au_c_subject"), T("au_c_label")]];
        evs.forEach(function (ev) {
          r2.push([auWhen(ev.at), xesc(ev.actor), T("au_a_" + ev.action), xesc(auEntityPretty(ev)), xesc(ev.label || "")]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r2), T("au_excel_sheet2"));
        /* R35: the file name carries the exported period (ASCII-safe) */
        var fn = auAllMode ? "marib-audit-all.xlsx"
          : "marib-audit-" + ($("auFrom").value || "x") + "_" + ($("auTo").value || "x") + ".xlsx";
        XLSX.writeFile(wb, fn);
        toast(T("au_exported"), "ok");
      } catch (e) {
        toast(T("toast_sync_err"), "err");
      }
      }).catch(function () { toast(T("toast_sync_err"), "err"); });
    };
    /* R35: fetch the chosen range first if it is not already loaded */
    if (auData && auRange === auCurRange()) { build(); return; }
    MaribCloud.auditGet($("auFrom").value, $("auTo").value).then(function (r) {
      auData = r;
      auRange = auCurRange();
      build();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function bindAuditPanel() {
    /* R35: choosing a date no longer fires a request — it only arms the
       two action buttons; the request happens when the user clicks */
    ["auFrom", "auTo"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        if ($("auFrom").value || $("auTo").value) auAllMode = false;
        auditSyncButtons();
      });
    });
    $("auAll").addEventListener("click", function () {
      $("auFrom").value = ""; $("auTo").value = "";
      auAllMode = true;
      auditSyncButtons();
    });
    $("auShow").addEventListener("click", function () {
      if (!auValid()) { toast(T("au_pick"), "err"); return; }
      loadAudit();
    });
    $("auExport").addEventListener("click", exportAudit);
  }

  /* ---------- storage section (R24 #13 — Amin only) ---------- */
  function fmtBytes(n) {
    if (n == null || !isFinite(n)) return "—";
    var u = ["B", "KB", "MB", "GB", "TB"];
    var i = 0;
    while (n >= 1024 && i < 4) { n /= 1024; i++; }
    return (i ? n.toFixed(1) : Math.round(n)) + " " + u[i];
  }
  function loadStorage() {
    MaribCloud.storageGet().then(function (r) {
      var pct = r.quota ? (r.bytes / r.quota) * 100 : 0;
      var fill = $("stgFill");
      if (fill) {
        fill.style.width = Math.max(1.5, Math.min(100, pct)) + "%";
        fill.className = pct >= 85 ? "danger" : pct >= 60 ? "warn" : "";
      }
      $("stgUsed").textContent = fmtBytes(r.bytes);
      $("stgQuota").textContent = fmtBytes(r.quota);
      $("stgPct").textContent = pct < 0.1 ? "<0.1%" : I18N.pctV(pct, 1);
      $("stgRows").textContent = I18N.fmtInt(r.rows);
      $("stgMonths").textContent = I18N.fmtInt(r.months);
      $("stgQuotaIn").value = (r.quota / (1024 * 1024 * 1024)).toFixed(1);
      var t = $("stgTables");
      if (t) {
        t.innerHTML = "<thead><tr><th>" + T("stg_top") + "</th><th>" + T("stg_used") + "</th></tr></thead><tbody>" +
          (r.tables || []).map(function (x) {
            return "<tr><td>" + esc(x.name) + "</td><td class='num'>" + fmtBytes(x.bytes) + "</td></tr>";
          }).join("") + "</tbody>";
      }
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function bindStoragePanel() {
    $("stgSave").addEventListener("click", function () {
      var gb = parseFloat($("stgQuotaIn").value);
      if (!isFinite(gb) || gb <= 0) { toast(T("tg_bad"), "err"); return; }
      MaribCloud.settingsPut("storage_quota", { gb: gb }).then(function () {
        toast(T("stg_saved"), "ok");
        loadStorage();
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
      });
    });
  }

  /* ============================================================
     R30 — settings: "رئيسية المدير" (manager-home visibility, dev only)
     The dev picks which users see the Grafik-style home; everyone else
     keeps the classic overview. Stored as the "mhome" key in
     marib_setting → { users: [id, ...] } — purely additive: no user rows
     and no existing settings are ever touched.
     ============================================================ */
  function mhRoleKey(r) {
    return r === "dev" ? "us_role_dev" : r === "admin" ? "us_role_admin" : "us_role_user";
  }
  function syncMhomeCount() {
    var el = $("mhCount");
    if (el) {
      var n = document.querySelectorAll("#mhUsers input:checked").length;
      el.textContent = n + " " + T("mh_count");
    }
  }
  function loadMhome() {
    var box = $("mhUsers");
    if (!box) return;
    var sel = {};
    ((state.mhome && state.mhome.users) || []).forEach(function (id) { sel[String(id)] = true; });
    MaribCloud.usersList().then(function (r) {
      var users = (r && r.users) || [];
      box.innerHTML = users.map(function (u) {
        return '<label class="mh-user"><input type="checkbox" data-uid="' + esc(String(u.id)) + '"' + (sel[String(u.id)] ? " checked" : "") + '>'
          + '<span class="mh-uav">' + esc((u.username || "?").charAt(0).toUpperCase()) + '</span>'
          + '<span class="mh-utx"><b>' + esc(u.username || "?") + '</b><small>' + esc(T(mhRoleKey(u.role))) + '</small></span>'
          + '<i class="mh-dot"></i></label>';
      }).join("") || '<p class="cls-count">' + esc(T("mh_none")) + "</p>";
      syncMhomeCount();
    }).catch(function (e) {
      toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
    });
  }
  function bindMhomePanel() {
    var box = $("mhUsers");
    if (box) box.addEventListener("change", syncMhomeCount);
    $("mhSave").addEventListener("click", function () {
      var ids = Array.prototype.slice.call(document.querySelectorAll("#mhUsers input[type=checkbox]:checked"))
        .map(function (i) { return i.getAttribute("data-uid"); });
      MaribCloud.settingsPut("mhome", { users: ids }).then(function () {
        state.mhome = { users: ids };
        toast(T("mh_saved"), "ok");
        /* removed myself from the list while sitting on the manager home
           → fall back to the classic overview right away */
        if (state.page === "mhome" && !mhomeActive()) goToPage("overview");
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
      });
    });
  }

  /* ============================================================
     R46-2 — Permissions panel
     Loads the perm matrix (users × features) and renders it. The
     admin/dev sets per-user × per-feature one of: inherit | hidden |
     view | edit. Changes save immediately on dropdown change.
     ============================================================ */
  var PM_DATA = null;  /* { users: [{id,username,role,perms}], features: [...] } */
  function loadPerms() {
    var rowsHost = $("pmRows");
    var usersHead = $("pmUsersHead");
    var emptyEl = $("pmEmpty");
    if (!rowsHost || !usersHead) return;
    rowsHost.innerHTML = "";
    usersHead.innerHTML = "<div class='pm-uh'>…</div>";
    if (emptyEl) emptyEl.hidden = true;
    fetch("/api/perms", { credentials: "include" })
      .then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); })
      .then(function (data) {
        PM_DATA = data;
        renderPerms();
      })
      .catch(function (e) {
        usersHead.innerHTML = "";
        rowsHost.innerHTML = "<p style='padding:16px;color:var(--muted)'>" + esc(T("toast_sync_err")) + "</p>";
      });
  }
  function renderPerms() {
    if (!PM_DATA) return;
    var users = (PM_DATA.users || []).filter(function (u) { return u.role !== "dev"; });
    var allUsers = PM_DATA.users || [];
    var features = PM_DATA.features || [];
    var usersHead = $("pmUsersHead");
    var rowsHost = $("pmRows");
    var emptyEl = $("pmEmpty");
    /* header: one column per non-dev user */
    if (!users.length) {
      usersHead.innerHTML = "";
      rowsHost.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    usersHead.innerHTML = users.map(function (u) {
      var cls = u.role === "admin" ? "admin" : (u.role === "dev" ? "dev" : "");
      return '<div class="pm-uh ' + cls + '"><b>' + esc(u.username || "?") + "</b><small>" + esc(T("pm_role_" + (u.role || "user"))) + "</small></div>";
    }).join("");
    /* group features by group key */
    var groups = {};
    var groupOrder = ["manpower", "data", "users", "settings", "audit"];
    features.forEach(function (f) {
      var g = f.group || "audit";
      if (!groups[g]) groups[g] = [];
      groups[g].push(f);
    });
    var html = [];
    groupOrder.forEach(function (g) {
      if (!groups[g]) return;
      html.push('<div class="pm-group">' + esc(T("pm_group_" + g)) + "</div>");
      groups[g].forEach(function (f) {
        html.push('<div class="pm-feat"><b>' + esc(I18N.cur() === "ar" ? f.label_ar : f.label_en) + "</b><small>" + esc(I18N.cur() === "ar" ? f.desc_ar : f.desc_en) + "</small></div>");
        html.push('<div class="pm-cells">');
        users.forEach(function (u) {
          var cur = (u.perms && u.perms[f.key]) || "inherit";
          /* dev is full-edit, no overrides — show a fixed badge instead of a dropdown */
          if (u.role === "dev") {
            html.push('<div class="pm-cell dev-fixed">' + esc(T("pm_lg_edit")) + "</div>");
          } else {
            html.push('<div class="pm-cell"><select data-uid="' + esc(u.id) + '" data-feature="' + esc(f.key) + '" data-cur="' + esc(cur) + '">'
              + '<option value="inherit"' + (cur === "inherit" ? " selected" : "") + ">" + esc(T("pm_lg_inherit")) + "</option>"
              + '<option value="hidden"' + (cur === "hidden" ? " selected" : "") + ">" + esc(T("pm_lg_hidden")) + "</option>"
              + '<option value="view"' + (cur === "view" ? " selected" : "") + ">" + esc(T("pm_lg_view")) + "</option>"
              + '<option value="edit"' + (cur === "edit" ? " selected" : "") + ">" + esc(T("pm_lg_edit")) + "</option>"
              + "</select></div>");
          }
        });
        html.push("</div>");
      });
    });
    rowsHost.innerHTML = html.join("");
    /* attach change handlers */
    var sels = rowsHost.querySelectorAll("select[data-uid]");
    Array.prototype.slice.call(sels).forEach(function (sel) {
      sel.addEventListener("change", function () {
        var uid = sel.getAttribute("data-uid");
        var feat = sel.getAttribute("data-feature");
        var lvl = sel.value;
        sel.setAttribute("data-cur", lvl);
        savePerm(uid, feat, lvl, sel);
      });
    });
  }
  function savePerm(uid, feature, level, sel) {
    var orig = sel.getAttribute("data-cur");
    fetch("/api/perms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId: uid, feature: feature, level: level })
    })
      .then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); })
      .then(function () {
        toast(T("pm_saved"), "ok");
        /* update local cache so re-render keeps the new value */
        if (PM_DATA) {
          for (var i = 0; i < PM_DATA.users.length; i++) {
            if (PM_DATA.users[i].id === uid) {
              if (!PM_DATA.users[i].perms) PM_DATA.users[i].perms = {};
              PM_DATA.users[i].perms[feature] = level;
              break;
            }
          }
        }
      })
      .catch(function (e) {
        toast(e && e.status === 403 ? T("toast_need_dev") : T("toast_sync_err"), "err");
        /* revert the dropdown */
        sel.value = orig;
        sel.setAttribute("data-cur", orig);
      });
  }

  /* ============================================================
     Thread-spool scrollbar (R24 #11)
     The thumb is drawn as a wooden spool (CSS). While scrolling, the
     diagonal windings shift along the spool — pulling the thread out
     when scrolling down and winding it back when scrolling up.
     ============================================================ */
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
    /* logo (static file — no EMBED) */
    $("brandLogo").src = "/app/icons/factory.png";

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
    if (mgE) mgE.addEventListener("click", function () { openEntries(); });

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
      fillMhomeMY(true);          /* the month list rebuilds for the new year */
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
    $("dirPick").addEventListener("change", function (e) { collectFiles(e.target.files); e.target.value = ""; });
    $("xlsxPick").addEventListener("change", function (e) { collectFiles(e.target.files); e.target.value = ""; });
    if ($("ndBtn")) $("ndBtn").addEventListener("click", function () { $("dirPick").click(); });

    /* R44: data overlay — upload buttons reuse the same pickers as the
       data page; closing = X, backdrop or Escape (same UX as settings) */
    var dpp = $("dpPop");
    if (dpp) {
      var dpF = $("dpFolder"), dpX = $("dpExcel");
      if (dpF) dpF.addEventListener("click", function () { $("dirPick").click(); });
      if (dpX) dpX.addEventListener("click", function () { $("xlsxPick").click(); });
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
    bindAuditPanel();
    bindStoragePanel();
    bindMhomePanel();   /* R30: manager-home visibility (dev) */

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
