/* ============================================================
   Marib Performance — R52: وحدة عرض الصفحات (app_pages)
   اتقطعت من app_main.js بدون أي تغيير منطقي — نفس الدوال بالحرف،
   وبتوصل لرموز app_main (حالة التطبيق + الأدوات) عبر جسر __maribCtx
   اللي app_main بيبنيه قبل ما الملف ده يتحمل.
   المحتوى: 8 صفحات التحليل + البيت الشهري للمدير (Grafik) + multiLine.
   ============================================================ */
var AppPages = (function (ctx) {
  "use strict";
  var $ = ctx.$, esc = ctx.esc, toast = ctx.toast, chip = ctx.chip,
      stChip = ctx.stChip, tipOn = ctx.tipOn, fmtInt = ctx.fmtInt,
      fmtPct = ctx.fmtPct, pctF = ctx.pctF, wd = ctx.wd, machShort = ctx.machShort,
      stOf = ctx.stOf, stColor = ctx.stColor, countUp = ctx.countUp,
      kpiTile = ctx.kpiTile, kpiRingTile = ctx.kpiRingTile,
      deltaHTML_ = ctx.deltaHTML_, setKpi = ctx.setKpi,
      animateRing = ctx.animateRing, cmpCard = ctx.cmpCard, effOK = ctx.effOK,
      dayTitle = ctx.dayTitle, inRange = ctx.inRange, shortName = ctx.shortName,
      readFilters = ctx.readFilters, snapToMonth = ctx.snapToMonth,
      syncUrl = ctx.syncUrl, syncLinkHrefs = ctx.syncLinkHrefs,
      render = ctx.render, goToPage = ctx.goToPage,
      state = ctx.state, T = ctx.T, TP = ctx.TP, TV = ctx.TV, TS = ctx.TS, TB = ctx.TB,
      U = ctx.U, C = ctx.C, TH = ctx.TH,
      C_ACCENT = ctx.C_ACCENT, C_ACCENT2 = ctx.C_ACCENT2,
      C_MUTED = ctx.C_MUTED, C_GOOD = ctx.C_GOOD, C_WARN = ctx.C_WARN,
      C_BAD = ctx.C_BAD, C_F = ctx.C_F;

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

  /* R69-1: ارتفاع جرافات بيت المدير بيملي الصفحة (شكوى المالك:
     «محتاجة تكبر وتملي الصفحة عشان صغيرة»). كان ثابت 260px — على
     شاشة 1080 كان بيفضل ~90-400px فاضية تحت والجرافات صغيرة.
     دلوقتي: الارتفاع بيتحسب من مساحة المحتوى الحية (مصفوفة 3×2)،
     بحد أدنى 240 للقراءة وحد أقصى 700 — R70: الغلاف بقى full-bleed
     (100vh × عرض الشاشة) فالمساحة كبرت والسقف القديم 460 كان هيسيب
     فراغ تحت على الشاشات الطويلة. تحت
     1180 (عمود واحد) بيفضل 260 زي ما كان. الارتفاع بيتحسب وقت كل
     رسم، وتغيير مقاس النافذة بينادي renderMhome تاني (الواتش تحته)
     فبيتحدث معاه. */
  function mhChartH() {
    if (window.matchMedia("(max-width:1180px)").matches) return 260; /* عمود واحد — زي ما كان */
    var content = document.querySelector(".content");
    var seg = document.getElementById("mhSeg");
    if (!content || !seg || !content.clientHeight) return 260;
    /* موقع الشريط نفسه بيقيس كل اللي فوقه (بادنج المحتوى + شريط
       الفلاتر + الفواصل) — أضمن من طرحهم واحد واحد */
    var segTop = seg.getBoundingClientRect().top - content.getBoundingClientRect().top;
    if (segTop < 0) segTop = 0;
    var padB = parseFloat(getComputedStyle(content).paddingBottom) || 0;
    /* كروم الكارت بيتقاس من DOM الحي — الهيدر في الثيم الفاتح بانر
       غامق بيلف جوه بادنج الكارت (margin سالب فوق) فطوله 49px مقابل
       27px في الدنيم: ثابت واحد كان بيسبب overflow 20px في الفاتح.
       marginTop السالب بيتجمع في المعادلة فيلغي بادنج الكارت زي الواقع. */
    var CHROME = 71; /* احتياطي: بادنج 32 + هيدر 27 + مارجن 10 + بوردر 2 */
    var card = document.querySelector("#page-mhome .grid-3 .card");
    var head = card ? card.querySelector(".card-head") : null;
    if (card && head) {
      var ccs = getComputedStyle(card), hcs = getComputedStyle(head);
      var live = head.offsetHeight + (parseFloat(hcs.marginTop) || 0) + (parseFloat(hcs.marginBottom) || 0) +
        (parseFloat(ccs.paddingTop) || 0) + (parseFloat(ccs.paddingBottom) || 0) +
        (parseFloat(ccs.borderTopWidth) || 0) + (parseFloat(ccs.borderBottomWidth) || 0);
      if (live >= 40) CHROME = live;   /* أقل من كده = قياس مخفي — الثابت أأمن */
    }
    var avail = content.clientHeight - segTop - seg.offsetHeight - 16 /* margin الشريط */ - 16 /* margin الجريد */ - padB;
    var h = Math.floor((avail - 16 /* row gap */ - 2 * CHROME) / 2);
    return Math.max(240, Math.min(700, h));
  }

  /* R69-1: مقاس النافذة اتغير وبيت المدير هو الصفحة الحية → إعادة
     رسم مؤجلة. مكتبة الجرافات بترسم بعرض جديد بس بنفس الارتفاع
     المحفوظ جوه الـ closure بتاعها، فلازم renderMhome نفسه يتنادى
     عشان الارتفاع يتحسب من جديد. */
  var mhResizeTimer = null;
  window.addEventListener("resize", function () {
    if (!document.body.classList.contains("pg-mhome")) return;
    clearTimeout(mhResizeTimer);
    mhResizeTimer = setTimeout(function () {
      if (document.body.classList.contains("pg-mhome")) renderMhome();
    }, 220);
  });

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
      height: mhChartH()
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
      valueName: T("t_pcs_w"), height: mhChartH()
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
      valueName: T("t_wrk"), height: mhChartH()
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
      valueName: T("t_sam"), height: mhChartH()
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
      height: mhChartH()
    });
    /* 6 — DEVAMSIZLIK ORANI: absenteeism % — R32: absent / regular workers (was / (reg + absent)) */
    C.vbar($("mhAbs"), {
      items: bk.map(function (b, i) {
        var a = agg[i];
        return { label: b.label, value: a.absPct == null ? 0 : Math.round(a.absPct * 1000) / 10, color: C_BAD,
          tip: [[T("t_abs_rate"), fmtPct(a.absPct, 1)], [T("t_absent"), fmtInt(a.absent)], [T("t_reg"), fmtInt(a.reg)], [T("t_days"), String(a.days)]],
          drill: drill(b, "att") };
      }),
      fmt: pctF(1), valueName: T("t_abs_rate"), height: mhChartH()
    });
  }

  /* R26: the current view as a URLSearchParams — shared by syncUrl()
     (writes the address bar) and syncLinkHrefs() (keeps the tab links
     pointing at this exact view so right-click → new tab reopens it). */
  return {
    overview: renderOverview, lines: renderLines, sups: renderSups,
    sections: renderSections, pm: renderPM, ot: renderOT, att: renderAtt,
    attSups: renderAttSups, mhome: renderMhome, multiLine: multiLine,
    fillMhomeMY: fillMhomeMY, syncMhomeMY: syncMhomeMY
  };
})(window.__maribCtx);
