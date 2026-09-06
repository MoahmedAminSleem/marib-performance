/* ============================================================
   Marib Performance App — red-brand edition · round 3 (trilingual)
   7 pages, quick-period + custom range, data labels everywhere,
   drill-through modal + rich tooltips. Full AR/EN/TR i18n via I18N:
   UI strings, KPI sub-lines, chart tips, tables, CSV, toasts,
   locale number formats (tr: 210.161 · %82,83) and RTL/LTR layout.
   ============================================================ */
var App = (function () {
  "use strict";
  var U = MaribCore.utils;
  var C = MaribCharts;
  var TH = JSON.parse(JSON.stringify(MaribCore.DEFAULT_CONFIG.thresholds));
  /* round 11: denim/leather palette — gold thread accent, denim blues */
  var C_ACCENT = "#D9A86B", C_ACCENT2 = "#E9C68A", C_MUTED = "#A9B7C7",
      C_GOOD = "#4FD98D", C_WARN = "#F0BE55", C_BAD = "#F87C7C", C_F = "#7E92A8";
  var LS_KEY = "marib_live_v2";
  var LS_TH = "marib_targets_v1";
  var LS_ROLES = "marib_roles_v1";   /* round 23: server role overrides mirror */

  /* user-editable targets (round 7): load persisted values over the
     defaults at startup so every chart/gauge/status chip follows them */
  function loadTargets() {
    try {
      var raw = localStorage.getItem(LS_TH);
      if (!raw) return;
      var o = JSON.parse(raw);
      ["achievement", "efficiency", "overtime", "attendance"].forEach(function (k) {
        if (o[k] && isFinite(o[k].good)) TH[k].good = o[k].good;
        if (o[k] && isFinite(o[k].warn)) TH[k].warn = o[k].warn;
      });
    } catch (err) { }
  }
  loadTargets();

  var state = { tables: null, model: null, k: null, page: "overview", busy: false, source: "embed", qp: "all", cmp: {},
    tmode: "both", supView: "sup", months: [], roles: {}, dimSets: null,
    scopeSrc: null, scopeMode: null, scopeOut: null };

  /* ---------------- round 23: people classification (roles) ----------------
     Each name in the supervisors/leaders/managers union lands in ONE of
     the three sub-tabs. Explicit overrides come from the server (set by
     the admin in Settings); anything unassigned follows its natural
     dimension: DD/PM supervisor → مشرف قسم, else leader, else manager. */
  function loadRoleOverrides() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_ROLES));
      return (o && typeof o === "object") ? o : {};
    } catch (e) { return {}; }
  }
  state.roles = loadRoleOverrides();
  function computeDimSets() {
    var m = state.model, s = { sup: {}, leader: {}, manager: {} };
    if (!m) return s;
    (m.supervisors || []).forEach(function (x) { s.sup[x] = 1; });
    (m.leaders || []).forEach(function (x) { s.leader[x] = 1; });
    (m.managers || []).forEach(function (x) { s.manager[x] = 1; });
    return s;
  }
  function effCat(name) {
    if (state.roles[name]) return state.roles[name];
    if (!state.dimSets) state.dimSets = computeDimSets();
    var s = state.dimSets;
    if (s.sup[name]) return "sup";
    if (s.leader[name]) return "leader";
    if (s.manager[name]) return "manager";
    return "sup";
  }
  function allPeople() {
    var m = state.model;
    if (!m) return [];
    var seen = {}, out = [];
    (m.supervisors || []).concat(m.leaders || [], m.managers || []).forEach(function (n) {
      if (n != null && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out.sort();
  }
  function fetchRoles() {
    fetch("/api/settings", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok && j.roles && typeof j.roles === "object") {
          state.roles = j.roles;
          state.dimSets = null;
          try { localStorage.setItem(LS_ROLES, JSON.stringify(j.roles)); } catch (e) { }
          if (state.model) render();
        }
      }).catch(function () { });
  }

  /* ---------------- i18n helpers ---------------- */
  var T = I18N.t, TP = I18N.ta, TV = I18N.tv, TS = I18N.ts, TB = I18N.tb;
  function fmtInt(v) { return I18N.fmtInt(v); }
  function fmtPct(v, d) { return I18N.fmtPct(v, d); }
  function pctF(d) { return function (v) { return I18N.pctV(v, d); }; }
  function wd(iso) { return I18N.dayFull(U.isoDayOfWeek(iso)); }
  function machShort(n) { return I18N.is("ar") ? "ماكينة " + n : (I18N.is("tr") ? "Makine " + n : "Machine " + n); }
  function otSrcLine(n) { return I18N.is("ar") ? "أوفر · خط " + n : (I18N.is("tr") ? "FM · Hat " + n : "OT · Line " + n); }
  function setSub(el, txt) { el.innerHTML = txt; I18N.fixSubCaps(el); }

  /* ---------------- tiny helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
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
        '<div class="ring"><svg viewBox="0 0 92 92">' +
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
  /* ---------------- round 23: time-mode scoped model ----------------
     base/ot run the SAME compute() over a channel-scoped copy of the
     model (see MaribCore.scopeModel); "both" passes the model through
     untouched — byte-identical to previous rounds. */
  function scopedModel() {
    var m = state.model;
    if (!m || state.tmode === "both" || !MaribCore.scopeModel) return m;
    if (state.scopeSrc !== m || state.scopeMode !== state.tmode) {
      state.scopeSrc = m; state.scopeMode = state.tmode;
      state.scopeOut = MaribCore.scopeModel(m, state.tmode);
    }
    return state.scopeOut;
  }

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
        k2 = MaribCore.compute(scopedModel(), { from: info.from, to: info.to, line: f.line, section: f.section, sup: f.sup }, { noPrev: true });
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
      sub: I18N.subOtOf(k.otMinutes, k.totalMinAvail),
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
          tip: [[T("t_actual"), fmtInt(s.loA)], [T("t_target"), fmtInt(s.loT)], [T("t_achv"), fmtPct(s.achv)], [T("t_ot_pct"), fmtPct(s.otPct, 2)]],
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
          tip: [[T("t_achv"), fmtPct(L.achv)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_ot_pct"), fmtPct(L.otPct, 2)]],
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
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_out"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_real"), fmtPct(S.achv)], [T("t_ot_pct"), fmtPct(S.otPct, 2)]],
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
        { name: T("lg_att"), color: C_GOOD, points: ser.map(function (s) { return { label: s.label, y: s.attPct == null ? null : s.attPct * 100, tipTitle: wd(s.date) + " " + s.label, tip: [[T("t_att"), fmtPct(s.attPct)], [T("t_absent"), fmtInt(s.absent)], [T("t_ot_pct"), fmtPct(s.otPct, 2)]], drill: { type: "date", value: s.date, domain: "att" } }; }) }
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
          tip: [[T("t_line"), I18N.lineN(L.line)], [T("t_achv"), fmtPct(L.achv)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_ot_pct"), fmtPct(L.otPct, 2)], [T("t_sam"), L.avgSAM == null ? "—" : I18N.dec(L.avgSAM.toFixed(2))]],
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
          tip: [[T("t_line"), I18N.lineN(L.line)], [T("t_actual"), fmtInt(L.actual)], [T("t_target"), fmtInt(L.target)], [T("t_achv"), fmtPct(L.achv)], [T("t_ot_pct"), fmtPct(L.otPct, 2)]],
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
     PAGE: SUPERVISORS
     ============================================================ */
  /* ---- round 23: supervisors page has 3 sub-tabs (supervisors /
     leaders / managers); each person appears in the ONE sub-tab chosen
     by the admin (Settings → People Classification, server-stored) or
     by their natural dimension. Leaders/managers aggregate from Daily
     Data rows (their OT minutes come from the OT sheet rows, which
     carry the same person columns). ---- */
  function supViewList(k, view) {
    var cat = view || state.supView || "sup";
    if (cat === "leader") {
      return (k.byLeader || []).filter(function (p) { return effCat(p.person) === "leader"; })
        .map(function (p) { return { name: p.person, target: p.target, actual: p.actual, achv: p.achv, otPct: p.otPct, minProd: p.minProd }; });
    }
    if (cat === "manager") {
      return (k.byManager || []).filter(function (p) { return effCat(p.person) === "manager"; })
        .map(function (p) { return { name: p.person, target: p.target, actual: p.actual, achv: p.achv, otPct: p.otPct, minProd: p.minProd }; });
    }
    return (k.bySupervisor || []).filter(function (p) { return effCat(p.supervisor) === "sup"; })
      .map(function (p) { return { name: p.supervisor, target: p.target, actual: p.actual, achv: p.achv, otPct: p.otPct, minProd: p.minProd }; });
  }
  function supNouns(view) {
    var AR = { sup: "المشرفين", leader: "رؤساء الخطوط", manager: "مديري الصالة" };
    var EN = { sup: "SUPERVISORS", leader: "LINE LEADERS", manager: "HALL MANAGERS" };
    var TR = { sup: "Bölüm Şefleri", leader: "Hat Liderleri", manager: "Salon Müdürleri" };
    var lang = I18N.is("ar") ? "ar" : (I18N.is("tr") ? "tr" : "en");
    var title = lang === "ar" ? AR[view] : (lang === "tr" ? TR[view] : EN[view].charAt(0) + EN[view].slice(1).toLowerCase());
    var sub = (lang === "en") ? AR[view] : EN[view];
    return { title: title, sub: sub, person: T(view === "leader" ? "t_leader" : view === "manager" ? "t_manager" : "t_sup") };
  }
  function setCardHead(chartId, main, sub) {
    var el = $(chartId); if (!el) return;
    var card = el.closest ? el.closest(".card") : null; if (!card) return;
    var h = card.querySelector("h4"), e = card.querySelector(".en");
    if (h) h.textContent = main;
    if (e) setSub(e, sub);
  }
  function renderSups(k, m) {
    var view = state.supView || "sup";
    var byS = supViewList(k, view);
    var drillable = view === "sup";
    var N = supNouns(view);
    var wrap = $("svKpis"); wrap.innerHTML = "";
    var best = byS[0], worst = byS[byS.length - 1];
    var avgA = byS.length ? byS.reduce(function (s, x) { return s + (x.achv || 0); }, 0) / byS.length : null;

    wrap.appendChild(kpiTile({ id: "sv1", title: N.title, en: N.sub, fmt: fmtInt, unit: T("u_sup") }));
    wrap.appendChild(kpiTile({
      id: "sv2", title: TV("k_sv_best"), en: TS("k_sv_best"), badge: TB("k_sv_best"),
      fmt: pctF(1),
      sub: best ? "<b>" + esc(best.name) + "</b>" : ""
    }));
    wrap.appendChild(kpiTile({ id: "sv3", title: TV("k_sv_avg"), en: TS("k_sv_avg"), badge: TB("k_sv_avg"), fmt: pctF(1) }));
    wrap.appendChild(kpiTile({
      id: "sv4", title: TV("k_sv_min"), en: TS("k_sv_min"), badge: TB("k_sv_min"),
      fmt: fmtInt, unit: T("u_min"), sub: I18N.subOfAvail(k.totalMinAvail)
    }));

    setKpi("sv1", byS.length, fmtInt);
    setKpi("sv2", best ? best.achv * 100 : null, pctF(1));
    setKpi("sv3", avgA * 100, pctF(1));
    setKpi("sv4", k.minProduced, fmtInt);

    var cmpList2 = function (k2) {
      var v2 = view;
      if (v2 === "leader") return (k2.byLeader || []).filter(function (p) { return effCat(p.person) === "leader"; }).map(function (p) { return [shortName(p.person), p.achv == null ? null : p.achv * 100]; });
      if (v2 === "manager") return (k2.byManager || []).filter(function (p) { return effCat(p.person) === "manager"; }).map(function (p) { return [shortName(p.person), p.achv == null ? null : p.achv * 100]; });
      return (k2.bySupervisor || []).filter(function (p) { return effCat(p.supervisor) === "sup"; }).map(function (p) { return [shortName(p.supervisor), p.achv == null ? null : p.achv * 100]; });
    };
    var cmpSvTop = cmpCard("svTop", function (cmp, k2) {
      cmp.cmpMap = {}; cmpList2(k2).forEach(function (pv) { cmp.cmpMap[pv[0]] = pv[1]; });
      cmp.cells = [{ name: TV("k_sv_avg"), cur: avgA == null ? null : avgA * 100, cmp: k2.factoryAchv == null ? null : k2.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.hbar($("svTop"), {
      items: byS.slice(0, 10).map(function (S) {
        var st = stOf(S.achv, TH.achievement);
        return {
          label: shortName(S.name), value: Math.round((S.achv || 0) * 1000) / 10, color: stColor(st),
          tip: [[N.person, S.name], [T("t_achv"), fmtPct(S.achv)], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_ot_pct"), fmtPct(S.otPct, 2)]],
          drill: drillable ? { type: "sup", value: S.name } : null
        };
      }),
      fmt: pctF(0), valueName: T("vn_achv"),
      goal: { value: TH.achievement.good * 100 }, rowH: 34, labelW: 132,
      cmp: cmpSvTop
    });

    var bottom = byS.slice(-6).filter(function (S) { return S.achv != null; });
    var cmpSvB = cmpCard("svBottom", function (cmp, k2) {
      cmp.cmpMap = {}; cmpList2(k2).forEach(function (pv) { cmp.cmpMap[pv[0]] = pv[1]; });
      cmp.cells = [{ name: TV("k_sv_avg"), cur: avgA == null ? null : avgA * 100, cmp: k2.factoryAchv == null ? null : k2.factoryAchv * 100, fmt: pctF(0), goodUp: true }];
      cmp.fmt = pctF(0);
    });
    C.hbar($("svBottom"), {
      items: bottom.map(function (S) {
        return {
          label: shortName(S.name), value: Math.round((S.achv || 0) * 1000) / 10, color: C_BAD,
          tip: [[N.person, S.name], [T("t_achv"), fmtPct(S.achv)], [T("t_target"), fmtInt(S.target)], [T("t_gap"), fmtInt(Math.max(0, S.target - S.actual))], [T("t_ot_pct"), fmtPct(S.otPct, 2)]],
          drill: drillable ? { type: "sup", value: S.name } : null
        };
      }),
      fmt: pctF(0), valueName: T("vn_achv"), sort: "asc",
      goal: { value: TH.achievement.good * 100 }, rowH: 34, labelW: 132,
      cmp: cmpSvB
    });

    var rows = byS.map(function (S, i) {
      var st = stOf(S.achv, TH.achievement);
      var otst = S.otPct == null ? null : stOf(S.otPct, TH.overtime, true);
      var pre = drillable ? "<tr class='drill-row' data-dt='sup' data-dv='" + esc(S.name) + "'>" : "<tr>";
      return pre + "<td><span class='rank num" + (i < 3 ? " top" : "") + "'>" + (i + 1) + "</span></td>" +
        "<td class='t-name'><b>" + esc(S.name) + "</b></td>" +
        "<td class='num'>" + fmtInt(S.target) + "</td>" +
        "<td class='num'>" + fmtInt(S.actual) + "</td>" +
        "<td class='num' style='color:" + stColor(st) + ";font-weight:800'>" + fmtPct(S.achv) + "</td>" +
        "<td class='num' style='color:" + (otst ? stColor(otst) : C_MUTED) + ";font-weight:800'>" + fmtPct(S.otPct, 2) + "</td>" +
        "<td>" + stChip(S.achv, TH.achievement) + "</td></tr>";
    }).join("");
    var ths = T("th_sups").slice();
    ths[1] = N.person;
    $("svTable").innerHTML = "<thead><tr>" + ths.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody>";
    setCardHead("svTable", (I18N.is("tr") ? N.title + " Performans" : I18N.is("en") ? N.title + " Performance" : "أداء " + N.title),
      (I18N.is("en") ? "أداء " + (view === "sup" ? "المشرفين" : view === "leader" ? "رؤساء الخطوط" : "مديري الصالة") : (view === "sup" ? "SUPERVISOR" : view === "leader" ? "LINE LEADERS" : "HALL MANAGERS") + " DETAILS"));
    $("svTblChip").textContent = byS.length + " " + T("rl_cnt");
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
    wrap.appendChild(kpiTile({
      id: "sc4", title: TV("k_sc_ot"), en: TS("k_sc_ot"), badge: TB("k_sc_ot"),
      fmt: fmtInt, unit: T("u_min"),
      sub: I18N.subSecOutput(totActual)
    }));

    setKpi("sc1", secs.length, fmtInt);
    setKpi("sc2", best ? best.achv * 100 : null, pctF(1));
    setKpi("sc3", avgA * 100, pctF(1));
    setKpi("sc4", totOT, fmtInt);

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
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_real"), fmtPct(S.achv)], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_maxatt"), fmtInt(S.maxAtt)]],
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
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_actual"), fmtInt(S.actual)], [T("t_target"), fmtInt(S.target)], [T("t_real"), fmtPct(S.achv)], [T("t_ot_pct"), fmtPct(S.otPct, 2)]],
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
      sub: T("ot_sub_of_avail"),
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
    wrap.appendChild(kpiTile({
      id: "ot4", title: TV("k_ot_eff"), en: TS("k_ot_eff"), badge: TB("k_ot_eff"),
      fmt: pctF(1),
      sub: I18N.subEffOf(k.eff),
      drill: { type: "period", value: null, domain: "ot" }
    }));

    setKpi("ot1", k.otPct == null ? null : k.otPct * 100, pctF(2));
    setKpi("ot2", avgOt == null ? null : avgOt * 100, pctF(2));
    setKpi("ot3", peak ? peak.otPct * 100 : null, pctF(2));
    setKpi("ot4", k.eff == null ? null : k.eff * 100, pctF(1));

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
          tip: [[T("t_ot_pct"), fmtPct(s.otPct, 2)], [T("t_ot_min"), fmtInt(s.otMin)], [T("t_avail"), fmtInt(s.totalMinAvail)]],
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
          tip: [[T("t_sec"), I18N.sectionN(S.section)], [T("t_ot_pct"), fmtPct(S.otPct, 2)], [T("t_ot_min2"), fmtInt(S.otMin)], [T("t_secout"), fmtInt(S.actual)], [T("t_real"), fmtPct(S.achv)]],
          drill: { type: "section", value: S.section, domain: "ot" }
        };
      }),
      fmt: pctF(1), valueName: TV("k_ot_pct"),
      goal: { value: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" },
      cmp: cmpOtSec
    });

    /* sources of available minutes — a % composition donut */
    var cmpSrc = cmpCard("otSrc", function (cmp, k2) {
      cmp.cells = [{ name: TV("k_ot_pct"), cur: k.otPct == null ? null : k.otPct * 100, cmp: k2.otPct == null ? null : k2.otPct * 100, fmt: pctF(2), goodUp: false }];
    });
    C.donut($("otSrc"), {
      height: 245,
      items: [
        { label: T("os_daily"), value: k.ddMinAvail, color: C_ACCENT, tip: [[T("t_src"), T("os_daily_src")], [T("t_share"), k.totalMinAvail ? I18N.pctV(k.ddMinAvail / k.totalMinAvail * 100, 1) : "—"]] },
        { label: T("os_ot"), value: k.otMinAvail, color: C_WARN, tip: [[T("t_src"), T("os_ot_src")], [T("t_share"), k.totalMinAvail ? I18N.pctV(k.otMinAvail / k.totalMinAvail * 100, 1) : "—"]] },
        { label: T("os_pm"), value: k.pmMinAvail, color: C_ACCENT2, tip: [[T("t_src"), T("os_pm_src")], [T("t_share"), k.totalMinAvail ? I18N.pctV(k.pmMinAvail / k.totalMinAvail * 100, 1) : "—"]] }
      ].filter(function (x) { return x.value > 0; }),
      center: { big: fmtPct(k.otPct, 2), small: T("dk_ot") },
      valueName: T("t_share"),
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
          tip: [[T("t_sup"), b.supervisor], [T("t_ot_pct"), fmtPct(b.otPct, 2)], [T("t_ot_min"), fmtInt(b.otMin)], [T("t_minprod"), fmtInt(b.minProd)]],
          drill: { type: "sup", value: b.supervisor, domain: "ot" }
        };
      }),
      fmt: pctF(1), valueName: TV("k_ot_pct"), rowH: 34, labelW: 132,
      goal: { value: TH.overtime.good * 100, color: C_GOOD, tipTitle: "t_goal_safe" },
      cmp: cmpOtSup
    });

    /* OT daily details table — minutes stay plain numbers here;
       efficiency shows — on days with impossible/unrecorded minutes */
    var rows = ser.map(function (s) {
      var st = s.otPct == null ? null : stOf(s.otPct, TH.overtime, true);
      var effOKd = s.eff != null && isFinite(s.eff) && s.eff <= 1.5 && (s.minProd || 0) > 0;
      return "<tr class='drill-row' data-dt='date' data-domain='ot' data-dv='" + s.date + "'><td class='t-name'><b>" + wd(s.date) + " " + s.label + "</b></td>" +
        "<td class='num'>" + fmtInt(s.totalMinAvail) + "</td>" +
        "<td class='num'>" + fmtInt(s.otMin) + "</td>" +
        "<td class='num' style='color:" + (st ? stColor(st) : C_MUTED) + ";font-weight:800'>" + fmtPct(s.otPct, 2) + "</td>" +
        "<td class='num'>" + fmtInt(s.minProd) + "</td>" +
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
    var m = state.model;
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
    var agg = { target: 0, actual: 0, minProd: 0, cap: 0, otMin: 0 };
    dd.forEach(function (r) { agg.target += r.target || 0; agg.actual += r.actualProd || 0; agg.minProd += r.minProd || 0; agg.cap += r.minAvail || 0; });
    ot.forEach(function (r) { agg.otMin += r.minAvail || 0; agg.cap += r.minAvail || 0; agg.minProd += r.minProd || 0; agg.actual += r.actualProd || 0; agg.target += r.target || 0; });
    pm.forEach(function (r) {
      agg.cap += (r.minAvail || 0) + (r.otMin || 0); agg.otMin += r.otMin || 0; agg.minProd += r.minProd || 0;
      agg.actual += (r.actualProd || 0) + (r.otProd || 0); agg.target += r.target || 0;
    });
    lo.forEach(function (r) { if (type === "line" || type === "date") { agg.target += r.target || 0; agg.actual += r.actual || 0; } });
    var achv = agg.target ? agg.actual / agg.target : null;
    var eff = agg.cap ? agg.minProd / agg.cap : null;
    var attPct = att.length ? att.reduce(function (s, r) { return s + (r.score || 0); }, 0) / att.length : null;

    var kpiDefs;
    var otPct = agg.cap ? agg.otMin / agg.cap : null;
    if (domain === "ot") {
      kpiDefs = [
        [T("dk_ot"), fmtPct(otPct, 2), agg.otMin ? I18N.subOtMin(agg.otMin) : ""],
        [T("t_availmin"), fmtInt(agg.cap), ""],
        [T("t_ot_min2"), fmtInt(agg.otMin), ""],
        [T("dk_min_eff"), fmtPct(eff), ""]
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
      function dslot(d) { if (!dayAgg[d]) dayAgg[d] = { cap: 0, ot: 0, mp: 0, sc: 0, n: 0 }; return dayAgg[d]; }
      rd.forEach(function (r) { var s = dslot(r.date); s.cap += r.minAvail || 0; s.mp += r.minProd || 0; });
      ro.forEach(function (r) { var s = dslot(r.date); s.cap += r.minAvail || 0; s.ot += r.minAvail || 0; s.mp += r.minProd || 0; });
      rp.forEach(function (r) { var s = dslot(r.date); s.cap += (r.minAvail || 0) + (r.otMin || 0); s.ot += r.otMin || 0; s.mp += r.minProd || 0; });
      ra.forEach(function (r) { var s = dslot(r.date); s.sc += r.score || 0; s.n++; });
      var ddK = Object.keys(dayAgg).sort();
      var pts = ddK.map(function (d) {
        var s = dayAgg[d], y = null, tip;
        if (domain === "ot") {
          y = s.cap ? s.ot / s.cap * 100 : null;
          tip = [[T("t_ot_pct"), fmtPct(s.cap ? s.ot / s.cap : null, 2)], [T("t_ot_min"), fmtInt(s.ot)], [T("t_availmin"), fmtInt(s.cap)]];
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
          rows.push([wday(r), r.supervisor || "—", r.line != null ? I18N.lineN(r.line) : "—", fmtInt(r.minAvail)]);
        });
        pm.forEach(function (r) {
          if ((r.otMin || 0) > 0) rows.push([wday(r), r.supervisor || "—", machShort(r.machine || "—") + (r.line != null ? " · " + I18N.lineN(r.line) : ""), fmtInt(r.otMin)]);
        });
      } else {
        cols = T("th_dr_otp");
        var byDayOT = {};
        ot.forEach(function (r) { var s = byDayOT[r.date] = byDayOT[r.date] || { cap: 0, ot: 0, mp: 0 }; s.cap += r.minAvail || 0; s.ot += r.minAvail || 0; s.mp += r.minProd || 0; });
        pm.forEach(function (r) { var s = byDayOT[r.date] = byDayOT[r.date] || { cap: 0, ot: 0, mp: 0 }; s.cap += (r.minAvail || 0) + (r.otMin || 0); s.ot += r.otMin || 0; s.mp += r.minProd || 0; });
        dd.forEach(function (r) { var s = byDayOT[r.date] = byDayOT[r.date] || { cap: 0, ot: 0, mp: 0 }; s.cap += r.minAvail || 0; s.mp += r.minProd || 0; });
        rows = Object.keys(byDayOT).sort().map(function (d) {
          var s = byDayOT[d];
          return [dayTitle(d), fmtInt(s.cap), fmtInt(s.ot), fmtPct(s.cap ? s.ot / s.cap : null, 2), fmtPct(s.cap ? s.mp / s.cap : null)];
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
  /* ---------------- round 23: month chip + auto month by date ----------------
     The file/month dropdown is GONE: the active month follows the picked
     date range (max-overlap month of [from,to]), the chip shows which
     month is loaded, and the date inputs span the WHOLE archive. */
  function lastDayOfKey(key) {
    var y = +key.slice(0, 4), mth = +key.slice(5, 7);
    return new Date(Date.UTC(y, mth, 0)).getUTCDate();
  }
  function updateMonthChip() {
    var el = $("monthChip");
    if (!el) return;
    var key = (window.MaribStore && MaribStore.activeMonthKey) ? MaribStore.activeMonthKey() : null;
    if (key && I18N.monthLabel) el.textContent = I18N.monthLabel(key);
    el.style.display = key ? "" : "none";
  }
  function archiveBounds() {
    var ms = state.months || [];
    if (!ms.length) {
      var m = state.model;
      return { min: m && m.dateMin, max: m && m.dateMax };
    }
    var first = ms[ms.length - 1].key, last = ms[0].key;   /* desc order */
    return { min: first + "-01", max: last + "-" + (lastDayOfKey(last) < 10 ? "0" + lastDayOfKey(last) : lastDayOfKey(last)) };
  }
  function pickMonthFor(from, to) {
    /* candidates = the months of the range ENDPOINTS only (max overlap
       between the two). A range whose endpoints live in no archived
       month (or a mid-edit transitional span) never triggers a jump. */
    var ms = state.months || [];
    if (!ms.length || (!from && !to)) return null;
    var keys = {};
    ms.forEach(function (m) { keys[m.key] = m; });
    var cands = [];
    [from, to].forEach(function (d) {
      if (!d) return;
      var k = d.slice(0, 7);
      if (keys[k] && cands.indexOf(k) < 0) cands.push(k);
    });
    if (!cands.length) return null;
    var best = null, bestDays = -1;
    cands.forEach(function (k) {
      var e = k + "-" + (lastDayOfKey(k) < 10 ? "0" + lastDayOfKey(k) : lastDayOfKey(k));
      var s = k + "-01";
      var a = from > s ? from : s, b = to < e ? to : e;
      var days = (a <= b) ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : 0;
      if (days > bestDays) { bestDays = days; best = k; }
    });
    return best;
  }
  function autoMonth() {
    if (!window.MaribStore || !MaribStore.switchMonth || !(state.months || []).length) return false;
    var fF = $("fFrom"), fT = $("fTo");
    var a = fF.value, b = fT.value;
    if (!a && !b) return false;
    var from = a < b ? a : b, to = a < b ? b : a;
    if (!from) { from = to; }
    if (!to) { to = from; }
    var key = pickMonthFor(from, to);
    var active = MaribStore.activeMonthKey();
    if (key && key !== active) {
      MaribStore.switchMonth(key).then(function (rec) {
        if (!rec) { toast(T("toast_no_month"), "err"); render(); return; }
        updateMonthChip();
      });
      return true;
    }
    if (!key) toast(T("toast_no_month"), "err");
    return false;
  }

  function fillFilters(keep) {
    var m = state.model;
    var lSel = $("fLine"), sSel = $("fSup"), cSel = $("fSection");
    var lv = keep ? lSel.value : "", sv = keep ? sSel.value : "", cv = keep ? cSel.value : "";
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

    var fF = $("fFrom"), fT = $("fTo");
    var gb = archiveBounds();
    if (gb.min) { fF.min = gb.min; fT.min = gb.min; }
    if (gb.max) { fF.max = gb.max; fT.max = gb.max; }
    updateMonthChip();
  }

  /* quick-period chips write the range into the date inputs; the
     inputs are the single source of truth for readFilters() */
  function prevCalendarMonth(iso) {
    /* iso "YYYY-MM-DD" → first day of the PREVIOUS calendar month */
    var y = +iso.slice(0, 4), mth = +iso.slice(5, 7) - 1;   /* 0-based */
    mth -= 1;
    if (mth < 0) { mth = 11; y -= 1; }
    var mm = (mth + 1) < 10 ? "0" + (mth + 1) : "" + (mth + 1);
    return y + "-" + mm + "-01";
  }
  function lastDayOfMonth(y, mth0) {
    var d = new Date(Date.UTC(y, mth0 + 1, 0));   /* 0 → last day of mth0 */
    return d.getUTCDate();
  }
  function applyQP(qp) {
    state.qp = qp;
    var m = state.model;
    var fF = $("fFrom"), fT = $("fTo");
    if (m && m.dateMax) {
      if (qp === "last1") { fF.value = m.dateMax; fT.value = m.dateMax; }
      else if (qp === "last7") { fF.value = U.isoAddDays(m.dateMax, -6); fT.value = m.dateMax; }
      else if (qp === "last30") {
        /* "last month" = the previous CALENDAR month (Sept → August),
           even if only a few days are recorded — not a 30-day window.
           Reference: real today, falling back to the data's latest month
           when the calendar month has no records at all. */
        var now = new Date();
        var ref = now.getUTCFullYear() + "-" + (now.getUTCMonth() + 1 < 10 ? "0" + (now.getUTCMonth() + 1) : now.getUTCMonth() + 1) + "-01";
        var from = prevCalendarMonth(ref);
        var fy = +from.slice(0, 4), fm = +from.slice(5, 7) - 1;
        var to = from.slice(0, 8) + (lastDayOfMonth(fy, fm) < 10 ? "0" + lastDayOfMonth(fy, fm) : lastDayOfMonth(fy, fm));
        if (m.dateMin && (to < m.dateMin || from > m.dateMax)) {
          /* previous real calendar month has no records → fall back to
             the LATEST data month (the last month we actually have) */
          var dFrom = m.dateMax.slice(0, 8) + "01";
          var dy = +dFrom.slice(0, 4), dm = +dFrom.slice(5, 7) - 1;
          var dLast = lastDayOfMonth(dy, dm);
          var dTo = dFrom.slice(0, 8) + (dLast < 10 ? "0" + dLast : dLast);
          from = dFrom > m.dateMin ? dFrom : m.dateMin;
          to = dTo < m.dateMax ? dTo : m.dateMax;
        }
        fF.value = from; fT.value = to;
      }
    }
    if (qp === "all") { fF.value = ""; fT.value = ""; }
    document.querySelectorAll(".qp-btn").forEach(function (b) {
      b.className = "qp-btn" + (b.getAttribute("data-qp") === qp ? " on" : "");
    });
    /* round 23: "last month" may target ANOTHER archived month (e.g. in
       October it points at September) — let the auto-switch load it */
    if (qp === "last30") { if (!autoMonth()) render(); return; }
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

  function render() {
    if (!state.model) return;
    cmpCache = {};   /* round 8: compare windows are re-resolved per render */
    var f = readFilters();
    var k = MaribCore.compute(scopedModel(), f);
    state.k = k;
    var days = (k.datesInRange || []).length;
    var fromTxt = f.from || state.model.dateMin, toTxt = f.to || state.model.dateMax;
    $("dateChip").textContent =
      (fromTxt ? U.isoShort(fromTxt) : "—") + " — " + (toTxt ? U.isoShort(toTxt) : "—") + I18N.dateChip(days);
    if (state.page === "overview") renderOverview(k, state.model);
    else if (state.page === "lines") renderLines(k, state.model);
    else if (state.page === "sections") renderSections(k, state.model);
    else if (state.page === "sups") renderSups(k, state.model);
    else if (state.page === "pm") renderPM(k, state.model);
    else if (state.page === "ot") renderOT(k, state.model);
    else if (state.page === "att") renderAtt(k, state.model);
    syncCmpBtns();
    /* round 14: every rendered state change (page / filters / compare)
       is persisted so ANOTHER TAB opened from a sidebar link lands on
       the same view with the same filters (deep link wins for the page) */
    saveUI();
  }

  /* round 8: ⇄ button states follow the per-card compare modes */
  function syncCmpBtns() {
    document.querySelectorAll(".cmp-btn").forEach(function (b) {
      b.classList.toggle("on", !!state.cmp[b.getAttribute("data-cmp")]);
    });
  }

  var PAGES = ["overview", "lines", "sections", "sups", "pm", "ot", "att"];
  /* round 13: the URL hash carries the active page (#ot, #pm, ...) —
     links become shareable, refresh-stable and right-click/open-in-
     new-tab works on the sidebar tabs (they are real <a href> now) */
  function pageFromHash() {
    var h = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
    return PAGES.indexOf(h) >= 0 ? h : null;
  }

  function goToPage(page) {
    state.page = page;
    document.querySelectorAll(".page").forEach(function (p) {
      p.className = "page" + (p.id === "page-" + page ? " on" : "");
    });
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.className = "nav-btn" + (b.getAttribute("data-page") === page ? " on" : "");
    });
    var t = TP("pg_" + page) || ["", ""];
    $("pageTitle").innerHTML = t[0];
    setSub($("pageSub"), t[1]);
    var ct = document.querySelector(".content");
    if (ct) ct.scrollTop = 0;
    render();
    /* keep the URL in sync without adding history entries — the
       browser Back button behaves exactly like before */
    try {
      if (location.hash !== "#" + page) history.replaceState(history.state, "", "#" + page);
    } catch (e) { }
  }

  /* ============================================================
     Data loading (folder / files / drop) — zero dialogs
     round 23: files are grouped per MONTH (each monthly Excel packs
     and upserts on its own) — re-uploading a file UPDATES that month
     exactly: added rows are added, removed rows removed, changed
     values changed (the server pack is REPLACED, not merged).
     ============================================================ */
  /* ============================================================
     round 23b: an upload boots its month — if the current date
     range doesn't touch that month at all, snap the inputs to the
     month's span (custom period). Uploading August while a
     September-only range is active must never leave the dashboard
     blank: every row of the fresh month would be filtered out.
     An empty range ("الكل") already shows the whole month — kept.
     ============================================================ */
  function snapRangeToMonth(key) {
    if (!/^\d{4}-\d{2}$/.test(String(key || ""))) return;
    var fF = $("fFrom"), fT = $("fTo");
    var a = fF.value, b = fT.value;
    if (!a && !b) return;                    /* "all" covers the month */
    var from, to;
    if (a && b) { from = a < b ? a : b; to = a < b ? b : a; }
    else { from = to = (a || b); }
    var s = key + "-01";
    var ld = lastDayOfKey(key);
    var e = key + "-" + (ld < 10 ? "0" + ld : ld);
    if (to < s || from > e) {                /* no intersection → snap */
      fF.value = s; fT.value = e;
      state.qp = "custom";
      document.querySelectorAll(".qp-btn").forEach(function (btn) { btn.className = "qp-btn"; });
    }
  }

  function collectFiles(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (/^~\$/.test(f.name)) continue;
      if (!/\.(xlsx|xlsm)$/i.test(f.name)) continue;
      files.push(f);
    }
    if (!files.length) { toast(T("toast_noexcel"), "err"); return; }
    if (window.MaribAuth && MaribAuth.canUpload && !MaribAuth.canUpload()) {
      toast(T("cloud_err_no_perm"), "err");
      return;
    }
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

  function mergedTables(fileRecs) {
    var acc = { dd: [], ot: [], pm: [], att: [], lo: [] };
    fileRecs.forEach(function (pf) {
      for (var key in acc) if (acc[key]) acc[key] = acc[key].concat(pf.tables[key] || []);
    });
    return acc;
  }

  function parseFiles(files) {
    var btn = $("btnData");
    btn.classList.add("busy"); state.busy = true;
    var cfg = MaribCore.DEFAULT_CONFIG;
    var report = { errors: [], warnings: [], sheetsMissing: [], rows: {} };
    var parsed = [];   /* { name, tables } — one record per file */
    var done = 0;
    Array.prototype.forEach.call(files, function (f) {
      readFile(f).then(function (buf) {
        try {
          var t = MaribCore.parseWorkbook(new Uint8Array(buf), XLSX, cfg, report);
          parsed.push({ name: f.name, tables: t });
        } catch (e) { report.errors.push(f.name + ": " + e.message); }
        done++;
        if (done === files.length) finish();
      }).catch(function () { done++; if (done === files.length) finish(); });
    });
    function finish() {
      btn.classList.remove("busy"); state.busy = false;
      if (report.errors.length) { toast(I18N.toastReadErr(report.errors.length), "err"); return; }
      /* group the parsed files by their month — a folder may carry
         several months, and a single sheet carries one */
      var groups = {};
      parsed.forEach(function (pf) {
        var key = null;
        try { key = (window.MaribStore && MaribStore.monthKeyOf) ? MaribStore.monthKeyOf(packTables(pf.tables)) : null; } catch (e) { key = null; }
        if (!key) key = "__na";
        if (!groups[key]) groups[key] = [];
        groups[key].push(pf);
      });
      var keys = Object.keys(groups).filter(function (k) { return k !== "__na"; })
        .filter(function (k) { var t = mergedTables(groups[k]); return t.dd.length || t.lo.length; });
      if (!keys.length) { toast(T("toast_nodata"), "err"); return; }
      keys.sort();
      var newest = keys[keys.length - 1];
      /* round 23b: the active month follows the upload IMMEDIATELY (the
         chip never shows a stale month while the POSTs are in flight),
         and a date range that misses the uploaded month snaps to it */
      if (window.MaribStore && MaribStore.setActiveMonth) MaribStore.setActiveMonth(newest);
      snapRangeToMonth(newest);
      /* boot the NEWEST uploaded month locally (same numbers the server
         now holds for it) */
      state.tables = mergedTables(groups[newest]);
      state.source = "folder";
      boot("folder", groups[newest].map(function (pf) { return pf.name; }));
      /* upsert every month on the server — replacing the pack is exactly
         the "update" semantics: deleted rows disappear, added appear */
      keys.forEach(function (key) {
        var pack = packTables(mergedTables(groups[key]));
        var mnames = groups[key].map(function (pf) { return pf.name; });
        if (window.MaribStore && MaribStore.saveMonth) {
          MaribStore.saveMonth(key, pack, mnames, function (err, label) {
            if (err) { toast(T(err), "err"); return; }
            if (MaribStore.setActiveMonth) MaribStore.setActiveMonth(key);
            if (keys.length === 1) toast(I18N.toastUploaded ? I18N.toastUploaded(label) : T("toast_uploaded"), "ok");
          });
        } else {
          if (keys.length === 1) toast(I18N.toastParsed(1), "ok");
        }
      });
      if (keys.length > 1) {
        var labels = keys.map(function (k) { return I18N.monthLabel ? I18N.monthLabel(k) : k; });
        toast(T("toast_months_saved") + labels.join(I18N.listSep ? I18N.listSep() : "، "), "ok");
      }
      /* refresh the archive list (new months may have appeared) */
      if (window.MaribStore && MaribStore.getMonths) {
        MaribStore.getMonths().then(function (ms) {
          state.months = ms || [];
          fillFilters(true);
          updateMonthChip();
        }).catch(function () { });
      }
    }
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

  /* ---------------- boot ---------------- */
  function boot(source, fileNames) {
    var cfg = MaribCore.DEFAULT_CONFIG;
    var model = MaribCore.buildModel(state.tables, cfg);
    state.model = model;
    state.dimSets = null;                 /* round 23: recompute person sets */
    state.scopeSrc = null; state.scopeOut = null;   /* scope cache follows the model */
    /* round 10: data arrived — clear the empty state + note */
    var nd = $("noData"); if (nd) nd.classList.remove("on");
    var dn = $("dpNote"); if (dn) dn.classList.remove("on");
    fillFilters();
    render();
  }

  /* ============================================================
     round 14: cross-tab session state
     - UI snapshot (page / period / filters / compare modes) saved on
       every render, restored after a data restore
     - tables restored from MaribStore (IndexedDB) at open time
     - BroadcastChannel: an upload in one tab reaches the others
     ============================================================ */
  var uiSaveT = null;
  function uiSnapshot() {
    var attBtn = document.querySelector(".att-tab.on");
    return {
      v: 1,
      page: state.page,
      qp: state.qp || "custom",
      from: $("fFrom").value || "",
      to: $("fTo").value || "",
      line: $("fLine").value || "",
      section: $("fSection").value || "",
      sup: $("fSup").value || "",
      cmp: state.cmp || {},
      attView: attBtn ? (attBtn.getAttribute("data-attview") || "workers") : "workers",
      tmode: state.tmode || "both",
      supView: state.supView || "sup"
    };
  }
  function saveUI() {
    if (!window.MaribStore) return;
    clearTimeout(uiSaveT);
    uiSaveT = setTimeout(function () {
      try { MaribStore.saveUI(uiSnapshot()); } catch (e) { }
    }, 250);
  }
  function applySavedUI() {
    if (!window.MaribStore) return;
    var o;
    try { o = MaribStore.loadUI(); } catch (e) { return; }
    if (!o || o.v !== 1) return;
    /* filters — the inputs are the single source of truth */
    if (o.from) $("fFrom").value = o.from;
    if (o.to) $("fTo").value = o.to;
    if (o.line) $("fLine").value = o.line;
    if (o.section) $("fSection").value = o.section;
    if (o.sup) $("fSup").value = o.sup;
    state.qp = o.qp || "custom";
    document.querySelectorAll(".qp-btn").forEach(function (b) {
      b.className = "qp-btn" + (b.getAttribute("data-qp") === state.qp ? " on" : "");
    });
    if (o.cmp && typeof o.cmp === "object") state.cmp = o.cmp;
    /* round 23: time-mode + supervisors sub-tab */
    if (o.tmode === "base" || o.tmode === "ot") state.tmode = o.tmode; else state.tmode = "both";
    document.querySelectorAll("#tm .tm-btn").forEach(function (b) {
      b.className = "tm-btn" + (b.getAttribute("data-tm") === state.tmode ? " on" : "");
    });
    if (o.supView === "leader" || o.supView === "manager") state.supView = o.supView; else state.supView = "sup";
    document.querySelectorAll("#supTabs .att-tab").forEach(function (b) {
      b.className = "att-tab" + (b.getAttribute("data-supview") === state.supView ? " on" : "");
    });
    if (o.attView) {
      var tb = document.querySelector('.att-tab[data-attview="' + o.attView + '"]');
      if (tb) tb.click();
    }
    /* the deep-link hash wins (right-click "open in new tab" → #page);
     otherwise fall back to the page the user was on */
    var hashPage = pageFromHash();
    var target = hashPage || (PAGES.indexOf(o.page) >= 0 ? o.page : null);
    if (target && target !== state.page) goToPage(target);
    else render();
  }

  var restoredCbs = [];
  function notifyRestored() {
    var cbs = restoredCbs.splice(0);
    cbs.forEach(function (f) { try { f(); } catch (e) { } });
  }
  function restoreSession() {
    if (!window.MaribStore || !MaribStore.loadData) return;
    state.restoring = true;
    MaribStore.loadData().then(function (saved) {
      var done = function () { state.restoring = false; notifyRestored(); };
      if (!saved || !saved.pack) { done(); return; }
      var t;
      try { t = unpackTables(saved.pack); } catch (e) { done(); return; }
      if (!t || (!t.dd.length && !t.lo.length)) { done(); return; }
      state.tables = t;
      state.source = "restored";
      state.months = saved.months || state.months || [];
      boot("restored", saved.names || []);
      applySavedUI();
      /* round 21: notify AFTER boot — a waiter (MaribAuth enterApp)
         must see the final hasData() state, or it opens the upload
         prompt over data that already arrived */
      done();
      fetchRoles();
      toast(T("toast_restored"), "ok");
    }).catch(function () {
      state.restoring = false;
      notifyRestored();
    });
  }

  function init() {
    /* logo */
    $("brandLogo").src = "data:image/png;base64," + EMBED.logo;

    /* language switcher */
    document.querySelectorAll("#langSw .sw-btn").forEach(function (b) {
      b.addEventListener("click", function () { I18N.setLang(b.getAttribute("data-lang")); });
    });
    I18N.onChange(function () {
      closeDrill();
      updateMonthChip();
      if (!state.model) return;
      fillFilters(true);
      var t = TP("pg_" + state.page) || ["", ""];
      $("pageTitle").innerHTML = t[0];
      setSub($("pageSub"), t[1]);
      render();
    });

    /* nav — round 13: tabs are real links. Plain left-click stays
       inside the SPA (preventDefault); ctrl/cmd/shift/alt-click and
       middle-click are left to the browser so "open in new tab" and
       the right-click link menu work natively */
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        if (ev.defaultPrevented) return;
        if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        goToPage(b.getAttribute("data-page"));
      });
    });
    /* live hash edits (paste a link / back-forward) switch the page */
    window.addEventListener("hashchange", function () {
      var p = pageFromHash();
      if (p && p !== state.page) goToPage(p);
    });
    /* deep link: #page present at open time (new tab / refresh / shared
       link) — applied now; after sign-in + folder upload the requested
       page is the one that comes alive */
    var hashPage = pageFromHash();
    if (hashPage && hashPage !== state.page) goToPage(hashPage);

    /* quick period chips */
    document.querySelectorAll(".qp-btn").forEach(function (b) {
      b.addEventListener("click", function () { applyQP(b.getAttribute("data-qp")); });
    });

    /* custom range inputs (manual change = custom period) — round 23:
       a range in ANOTHER archived month auto-loads that month */
    ["fFrom", "fTo"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        state.qp = "custom";
        document.querySelectorAll(".qp-btn").forEach(function (b) { b.className = "qp-btn"; });
        if (!autoMonth()) render();
      });
    });

    /* round 23: time-mode segmented control (base / ot / both) — a
       GLOBAL filter visible on every page; "both" = exact previous
       behavior */
    document.querySelectorAll("#tm .tm-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-tm");
        if (state.tmode === v) return;
        state.tmode = v;
        document.querySelectorAll("#tm .tm-btn").forEach(function (x) {
          x.className = "tm-btn" + (x.getAttribute("data-tm") === v ? " on" : "");
        });
        render();
      });
    });

    /* round 23: supervisors page sub-tabs (supervisors / leaders /
       managers) — same page, different person list */
    document.querySelectorAll("#supTabs .att-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-supview");
        if (state.supView === v) return;
        state.supView = v;
        document.querySelectorAll("#supTabs .att-tab").forEach(function (x) {
          x.className = "att-tab" + (x === b ? " on" : "");
        });
        if (state.model) render();
        saveUI();
      });
    });

    /* other filters */
    ["fLine", "fSection", "fSup"].forEach(function (id) {
      $(id).addEventListener("change", render);
    });

    /* drill rows in tables (event delegation) — round 8: rows may carry a
       data-domain so OT/attendance rows open the matching detail page */
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

    /* data menu — opens as a CENTERED modal dialog (direction-safe, never
       clipped by the sidebar scroll). Closes on backdrop click, ✕ or Esc.
       round 23: TWO actions — upload a months FOLDER (each month packed
       and upserted on its own) or upload a single Excel SHEET (updates
       that month exactly: added→added, removed→removed, changed→changed) */
    var pop = $("dataPop");
    function openPop() {
      var n = $("dpNote"); if (n) n.classList.toggle("on", !state.model);
      pop.classList.add("on");
    }
    function closePop() { pop.classList.remove("on"); }
    $("btnData").addEventListener("click", function (e) {
      e.stopPropagation();
      if (pop.classList.contains("on")) { closePop(); } else { openPop(); }
    });
    pop.addEventListener("click", function (e) { if (e.target === this) closePop(); });
    $("dpClose").addEventListener("click", closePop);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });
    $("actFolder").addEventListener("click", function () {
      closePop();
      $("dirPick").click();
    });
    $("actFile").addEventListener("click", function () {
      closePop();
      $("filePick").click();
    });
    $("dirPick").addEventListener("change", function (e) { collectFiles(e.target.files); e.target.value = ""; });
    $("filePick").addEventListener("change", function (e) { collectFiles(e.target.files); e.target.value = ""; });

    /* round 10: the big button on the empty state opens the same data modal */
    if ($("ndBtn")) $("ndBtn").addEventListener("click", openPop);

    /* ---- round 23: SETTINGS modal (sidebar button) — two tabs:
       targets & thresholds (round 7 UI, moved here from the filter bar)
       + people classification (which name shows under Supervisors /
       Leaders / Managers; admin edits, server-stored, everyone sees) ---- */
    var tg = $("setPop");
    var DEF_TH = MaribCore.DEFAULT_CONFIG.thresholds;
    var TG_FIELDS = [
      ["tgAchvGood", "achievement", "good"], ["tgAchvWarn", "achievement", "warn"],
      ["tgEffGood", "efficiency", "good"], ["tgEffWarn", "efficiency", "warn"],
      ["tgOtGood", "overtime", "good"], ["tgOtWarn", "overtime", "warn"],
      ["tgAttGood", "attendance", "good"], ["tgAttWarn", "attendance", "warn"]
    ];
    function tgFill() {
      TG_FIELDS.forEach(function (fd) {
        $(fd[0]).value = Math.round(TH[fd[1]][fd[2]] * 1000) / 10;
      });
    }
    function isAdminUser() {
      try {
        var me = window.MaribAuth && MaribAuth.me ? MaribAuth.me() : null;
        return !!me && (me.role === "dev" || me.role === "admin");
      } catch (e) { return false; }
    }
    function selectSetTab(v) {
      document.querySelectorAll("#setTabs .att-tab").forEach(function (x) {
        x.className = "att-tab" + (x.getAttribute("data-setview") === v ? " on" : "");
      });
      $("setTargets").className = "set-view" + (v === "targets" ? " on" : "");
      $("setRoles").className = "set-view" + (v === "roles" ? " on" : "");
    }
    function openSet(tab) {
      tgFill();
      buildRolesList();
      var admin = isAdminUser();
      var tabRoles = $("setTabRoles");
      if (tabRoles) tabRoles.style.display = admin ? "" : "none";
      selectSetTab(tab === "roles" && admin ? "roles" : "targets");
      tg.classList.add("on");
    }
    function closeSet() { tg.classList.remove("on"); }
    $("btnSettings").addEventListener("click", function (e) {
      e.stopPropagation();
      if (tg.classList.contains("on")) { closeSet(); } else { openSet(); }
    });
    tg.addEventListener("click", function (e) { if (e.target === this) closeSet(); });
    $("setClose").addEventListener("click", closeSet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSet(); });
    document.querySelectorAll("#setTabs .att-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        selectSetTab(b.getAttribute("data-setview"));
      });
    });
    function buildRolesList() {
      var list = $("rlList");
      if (!list) return;
      var people = allPeople();
      var admin = isAdminUser();
      if (!people.length) {
        list.innerHTML = '<p class="rl-empty">' + esc(T("dp_empty")) + "</p>";
      } else {
        var html = "";
        people.forEach(function (n) {
          var cat = effCat(n);
          html += '<div class="rl-row" data-name="' + esc(n) + '">' +
            '<span class="rl-name">' + esc(n) + '</span>' +
            '<div class="rl-seg">' +
            ["sup", "leader", "manager"].map(function (c) {
              return '<button type="button" class="rl-opt' + (cat === c ? " on" : "") + '" data-cat="' + c + '"' + (admin ? "" : " disabled") + ' data-i18n="sv_tab_' + c + '">' + esc(T("sv_tab_" + c)) + "</button>";
            }).join("") +
            "</div></div>";
        });
        list.innerHTML = html;
      }
      var note = $("rlAdminNote"); if (note) note.style.display = admin ? "none" : "";
      var save = $("rlSave"); if (save) save.style.display = admin ? "" : "none";
    }
    $("rlList").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".rl-opt") : null;
      if (!b || b.disabled) return;
      var row = b.closest(".rl-row");
      if (!row) return;
      row.querySelectorAll(".rl-opt").forEach(function (x) { x.classList.toggle("on", x === b); });
    });
    $("rlSave").addEventListener("click", function () {
      var roles = {};
      document.querySelectorAll("#rlList .rl-row").forEach(function (r) {
        var b = r.querySelector(".rl-opt.on");
        if (b) roles[r.getAttribute("data-name")] = b.getAttribute("data-cat");
      });
      fetch("/api/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: roles })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok) {
          state.roles = roles;
          state.dimSets = null;
          try { localStorage.setItem(LS_ROLES, JSON.stringify(roles)); } catch (err) { }
          closeSet();
          render();
          toast(T("rl_saved"), "ok");
        } else {
          toast(T(j && (j.error === "forbidden" || j.error === "auth") ? "cloud_err_no_perm" : "rl_err"), "err");
        }
      }).catch(function () { toast(T("rl_err"), "err"); });
    });
    $("tgSave").addEventListener("click", function () {
      var ok = true, o = {};
      TG_FIELDS.forEach(function (fd) {
        var v = parseFloat($(fd[0]).value);
        if (!isFinite(v) || v <= 0 || v > 100) { ok = false; return; }
        o[fd[1]] = o[fd[1]] || {};
        o[fd[1]][fd[2]] = v / 100;
      });
      if (!ok) { toast(T("tg_bad"), "bad"); return; }
      ["achievement", "efficiency", "overtime", "attendance"].forEach(function (k) {
        if (o[k]) {
          if (isFinite(o[k].good)) TH[k].good = o[k].good;
          if (isFinite(o[k].warn)) TH[k].warn = o[k].warn;
        }
      });
      try { localStorage.setItem(LS_TH, JSON.stringify(o)); } catch (err) { }
      closeTg();
      render();
      toast(T("tg_saved"), "ok");
    });
    $("tgReset").addEventListener("click", function () {
      ["achievement", "efficiency", "overtime", "attendance"].forEach(function (k) {
        TH[k].good = DEF_TH[k].good; TH[k].warn = DEF_TH[k].warn;
      });
      try { localStorage.removeItem(LS_TH); } catch (err) { }
      tgFill();
      render();
      toast(T("tg_reset_ok"), "ok");
    });

    /* ---- attendance sub-tabs: workers / supervisors ---- */
    document.querySelectorAll(".att-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-attview");
        document.querySelectorAll(".att-tab").forEach(function (x) {
          x.className = "att-tab" + (x === b ? " on" : "");
        });
        $("attWorkers").className = "att-view" + (v === "workers" ? " on" : "");
        $("attSups").className = "att-view" + (v === "sups" ? " on" : "");
        /* round 9: a view that was hidden while its page re-rendered drew
           its charts at the 260px fallback — re-fit them now it is visible */
        C.redrawIn(v === "workers" ? $("attWorkers") : $("attSups"));
        /* round 14: the sub-tab choice is part of the saved UI state */
        saveUI();
      });
    });

    /* ---- round 8: OT gauge + sources card click → full OT details ---- */
    ["otGauge", "otSrc"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.classList.add("drillable");
      el.addEventListener("click", function () { openDrill("period", null, { domain: "ot" }); });
    });

    /* ============================================================
       round 8: COMPARE — a ⇄ button on every chart card opens a small
       popover; the chosen period re-renders that chart with a compare
       strip, ghost series and per-bar deltas.
       ============================================================ */
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

    /* drag & drop (files or folders) */
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

    /* round 10 — NO bundled data: the old embedded August sheet is
       gone; the app opens EMPTY for a first-time visitor.
       round 14 — BUT a returning visitor (or a NEW TAB opened from a
       sidebar link) gets the last session's tables back from
       IndexedDB: no re-login (MaribAuth session), no re-upload. */
    state.tables = { dd: [], ot: [], pm: [], att: [], lo: [] };
    state.source = "none";
    var nd0 = $("noData"); if (nd0) nd0.classList.add("on");
    restoreSession();

    /* another tab uploaded fresh data → reload it here too */
    if (window.MaribStore && MaribStore.onDataMessage) {
      MaribStore.onDataMessage(function () {
        MaribStore.loadData().then(function (saved) {
          if (!saved || !saved.pack) return;
          var t;
          try { t = unpackTables(saved.pack); } catch (e) { return; }
          if (!t || (!t.dd.length && !t.lo.length)) return;
          state.tables = t;
          state.source = "restored";
          state.months = saved.months || state.months || [];
          boot("restored", saved.names || []);
          updateMonthChip();
          toast(T("toast_restored"), "ok");
        }).catch(function () { });
      });
    }

    /* subtle re-draw on resize handled by MaribCharts registry */
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    state: state, render: render, goToPage: goToPage, openDrill: openDrill, applyQP: applyQP,
    /* round 21 (online): month switch + cloud restore retry after login */
    setTables: function (t, src) {
      if (!t) return;
      state.tables = t;
      state.source = src || "restored";
      boot("restored", []);
    },
    unpackTables: unpackTables, packTables: packTables,
    retryRestore: function () { restoreSession(); },
    hasData: function () { return !!state.model; },
    /* round 14: cross-tab restore handshake (MaribAuth waits for the
       IndexedDB restore before deciding to prompt for an upload) */
    isRestoring: function () { return !!state.restoring; },
    onRestored: function (fn) {
      if (!state.restoring) { try { fn(); } catch (e) { } return; }
      restoredCbs.push(fn);
    },
    promptData: function () {
      var p = $("dataPop");
      if (!p) return;
      var n = $("dpNote"); if (n) n.classList.toggle("on", !state.model);
      p.classList.add("on");
    }
  };
})();
