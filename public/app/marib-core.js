/* ============================================================
   MaribCore — parsing + model computation
   Mirrors the user's Power BI semantic model EXACTLY:
   - Same tables (Daily Data / OT / Pocket Machines / Attendance / Line Output)
   - Same relationships & filter propagation
   - Same measure formulas (42 measures)
   - Line Output unpivot + Target merge like the PQ queries
   Works in browser (global) and Node (module.exports) for testing.
   ============================================================ */
var MaribCore = (function () {
  "use strict";

  /* ---------------- default config ---------------- */
  var DEFAULT_CONFIG = {
    version: 1,
    appName: "لوحة أداء مصنع مأرب",
    dataFolderHint: "C:\\Sewing Factory Data",
    dateFormat: "dmy",            // 'dmy' | 'mdy'
    sheets: {
      daily:  ["daily data", "dailydata", "بيانات يومية"],
      ot:     ["ot", "overtime"],
      pm:     ["pocket machines", "pocketmachines", "ماكينات الجيوب"],
      otp:    ["ot pocket", "otpocket", "أوفر تايم الجيوب", "ot الجيوب"],
      att:    ["attendance", "الحضور"],
      lo:     ["line output", "lineoutput"]
    },
    columns: {
      daily: { date: ["date", "التاريخ"], day: ["day", "اليوم"], client: ["client", "العميل"],
        line: ["line", "الخط"], section: ["section", "القسم"],
        manager: ["manager name", "managername", "اسم المدير"],
        leader: ["leader name", "leadername", "اسم الليدر"],
        supervisor: ["supervisor name", "supervisorname", "اسم المشرف"],
        target: ["target", "الهدف"], regWorkers: ["regular workers", "regularworkers"],
        actWorkers: ["actual workers", "actualworkers"], regMin: ["regular min", "regularmin"],
        absent: ["absent workers", "absentworkers", "الغياب"],
        actualProd: ["actual production", "actualproduction", "الإنتاج الفعلي"],
        achv: ["achievement %", "achievement", "نسبة التحقيق"],
        attWorkers: ["attendence workers", "attendance workers", "attendanceworkers", "الحضور"],
        minAvail: ["min available", "minavailable"], sam: ["sam"],
        minPiece: ["actual min piece", "actualminpiece"],
        prodEff: ["production efficiency", "productionefficiency"],
        minProd: ["min produced", "minproduced"], defects: ["defects unit", "defectsunit"] },
      ot: { date: ["date"], day: ["day"], client: ["client"], line: ["line"], section: ["section"],
        manager: ["manager name"], leader: ["leader name"], supervisor: ["supervisor name"],
        target: ["target"], attWorkers: ["attendence workers", "attendance workers"],
        regMin: ["regular min"], actualProd: ["actual production"], achv: ["achievement %"],
        minAvail: ["min available"], sam: ["sam"], minPiece: ["actual min piece"],
        prodEff: ["production efficiency"], minProd: ["min produced"], defects: ["defects unit"] },
      pm: { date: ["date"], day: ["day"], supervisor: ["supervisor name"],
        worker: ["worker name", "workername"], client: ["client"], po: ["po"], style: ["style"],
        line: ["line"], machine: ["machine code", "machinecode"], target: ["target"],
        actualProd: ["actual production"], otProd: ["ot production", "otproduction"],
        plannedMin: ["planned minutes", "plannedminutes"],
        minAvail: ["min available/actual min", "minavailable/actualmin", "min available actual min"],
        otMin: ["ot min", "otmin"], sam: ["sam"], minProd: ["min produced"],
        achv: ["achievement %"], eff: ["efficiency %", "efficiency"], notes: ["notes"] },
      /* round 19: OT Pocket sheet (September structure) — mirrors PM but
         the OT quantities live in their own columns */
      otp: { date: ["date"], day: ["day"], supervisor: ["supervisor name"],
        worker: ["worker name", "workername"], client: ["client"], po: ["po"], style: ["style"],
        line: ["line"], machine: ["machine code", "machinecode"], target: ["target"],
        otProd: ["ot production", "otproduction"],
        plannedMin: ["planned minutes", "plannedminutes"],
        otMin: ["ot min", "otmin"], sam: ["sam"],
        otMinProd: ["ot min produced", "otminproduced"],
        otAchv: ["ot achievement %", "achievement %"],
        otEff: ["ot efficiency %", "efficiency", "efficiency %"], notes: ["notes"] },
      att: { date: ["date"], day: ["day"], name: ["employee name", "employeename", "الاسم"],
        score: ["discipline score", "disciplinescore", "الانضباط"] },
      lo: { date: ["date"], day: ["day"] }
    },
    thresholds: {
      achievement: { good: 0.85, warn: 0.70 },
      efficiency:  { good: 0.78, warn: 0.60 },
      overtime:    { good: 0.10, warn: 0.20 },
      attendance:  { good: 0.95, warn: 0.90 }
    }
  };

  function deepMerge(base, over) {
    var out = JSON.parse(JSON.stringify(base));
    if (!over || typeof over !== "object") return out;
    Object.keys(over).forEach(function (k) {
      if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) &&
          out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k], over[k]);
      } else { out[k] = over[k]; }
    });
    return out;
  }

  /* ---------------- utils ---------------- */
  var AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  function normDigits(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var idx = AR_DIGITS.indexOf(s[i]);
      out += idx >= 0 ? String(idx) : s[i];
    }
    return out;
  }
  function nk(v) { // normalized key for column matching
    return normDigits(String(v == null ? "" : v).trim().toLowerCase())
      .replace(/[^\u0600-\u06FFa-z0-9]/g, "");
  }
  function parseNum(v) {
    if (v == null) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = normDigits(String(v).trim()).replace(/,/g, "").replace(/%/g, "");
    if (s === "" || s === "-" || s === "N/A" || s === "—") return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseDateStr(v, pref) {
    var s = normDigits(String(v).trim());
    var m = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
    if (!m) {
      var t = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
      if (t) return t[1] + "-" + pad(+t[2]) + "-" + pad(+t[3]);
      return null;
    }
    var a = +m[1], b = +m[2], c = +m[3];
    if (m[1].length === 4) return a + "-" + pad(b) + "-" + pad(c); // ymd
    // a=day or month
    if (a > 12 && b <= 12) return c + "-" + pad(b) + "-" + pad(a);      // dmy
    if (b > 12 && a <= 12) return c + "-" + pad(a) + "-" + pad(b);      // mdy
    return (pref === "mdy")
      ? c + "-" + pad(a) + "-" + pad(b)
      : c + "-" + pad(b) + "-" + pad(a);
  }
  function parseDate(v, pref) {
    if (v == null) return null;
    if (typeof v === "string") {
      if (/^\d+(\.\d+)?$/.test(v.trim())) { var s = parseFloat(v); return s > 20000 ? serialToISO(s) : null; }
      return parseDateStr(v, pref);
    }
    if (typeof v === "number") return v > 20000 ? serialToISO(v) : null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return v.getUTCFullYear ? (v.getUTCFullYear() + "-" + pad(v.getUTCMonth() + 1) + "-" + pad(v.getUTCDate()))
                              : (v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate()));
    }
    return null;
  }
  function serialToISO(serial) {
    var ms = Math.round((serial - 25569) * 86400000);
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function isoToDate(iso) { return new Date(iso + "T00:00:00Z"); }
  function dateToIso(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function isoAddDays(iso, n) { var d = isoToDate(iso); d.setUTCDate(d.getUTCDate() + n); return dateToIso(d); }
  function isoDayOfWeek(iso) { return isoToDate(iso).getUTCDay(); } // 0=Sun
  var AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  var AR_DAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  function isoMonthLabel(iso) { return AR_MONTHS[+iso.slice(5, 7) - 1] + " " + iso.slice(0, 4); }
  function isoShort(iso) { return (+iso.slice(8, 10)) + "/" + (+iso.slice(5, 7)); }
  function weekStartISO(iso) { // Saturday-start week (regional convention)
    var dow = isoDayOfWeek(iso); // 0 Sun .. 6 Sat
    var back = (dow + 1) % 7;   // Sat -> 0, Sun -> 1, ... Fri -> 6
    return isoAddDays(iso, -back);
  }
  function fmtInt(n) { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
  function fmtPct(x, dec) { return x == null || !isFinite(x) ? "—" : (x * 100).toFixed(dec == null ? 2 : dec) + "%"; }
  function fmtNum(n, dec) { return n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: dec == null ? 0 : dec, minimumFractionDigits: dec == null ? 0 : dec }); }
  function sum(arr, key) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) { var v = arr[i][key]; if (v != null) s += v; }
    return s;
  }
  function mean(arr, key) {
    var s = 0, n = 0;
    for (var i = 0; i < arr.length; i++) { var v = arr[i][key]; if (v != null) { s += v; n++; } }
    return n ? s / n : null;
  }
  function nonEmpty(s) { s = String(s == null ? "" : s).trim(); return s === "" ? null : s; }
  function normLine(v) {
    if (v == null) return null;
    if (typeof v === "number") return String(Math.round(v));
    var s = normDigits(String(v).trim());
    if (/^\d+(\.0+)?$/.test(s)) return String(Math.round(parseFloat(s)));
    return s === "" ? null : s;
  }
  function statusOf(x, th) {
    if (x == null || !isFinite(x)) return "neutral";
    if (x >= th.good) return "good";
    if (x >= th.warn) return "warn";
    return "bad";
  }
  // overtime thresholds are inverted (lower is better)
  function statusInv(x, th) {
    if (x == null || !isFinite(x)) return "neutral";
    if (x <= th.good) return "good";
    if (x <= th.warn) return "warn";
    return "bad";
  }

  /* ---------------- workbook parsing ---------------- */
  function aliasMap(cols) {
    var m = {};
    Object.keys(cols).forEach(function (field) {
      cols[field].forEach(function (a) { m[nk(a)] = field; });
    });
    return m;
  }
  function findHeader(rows, aliases) {
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var r = rows[i] || [];
      var hits = 0, nonNull = 0;
      for (var j = 0; j < r.length; j++) {
        if (r[j] == null || String(r[j]).trim() === "") continue;
        nonNull++;
        if (aliases[nk(r[j])]) hits++;
      }
      if (hits >= 2 && nonNull >= 3) return i;
    }
    return -1;
  }
  function mapRow(headerRow, r, amap) {
    var o = {};
    for (var j = 0; j < headerRow.length; j++) {
      var field = amap[nk(headerRow[j])];
      if (field && !(field in o)) o[field] = r[j];
    }
    return o;
  }

  function parseWorkbook(data, XLSX, cfg, report) {
    var tables = { dd: [], ot: [], pm: [], att: [], lo: [] };
    var wb;
    try { wb = XLSX.read(data, { type: "array", cellDates: false, cellText: false }); }
    catch (e) { report.errors.push("تعذر فتح الملف كملف إكسل: " + e.message); return tables; }

    var sheetTargets = [
      { key: "dd", names: cfg.sheets.daily,  amap: aliasMap(cfg.columns.daily) },
      { key: "ot", names: cfg.sheets.ot,     amap: aliasMap(cfg.columns.ot) },
      { key: "pm", names: cfg.sheets.pm,     amap: aliasMap(cfg.columns.pm) },
      { key: "att", names: cfg.sheets.att,   amap: aliasMap(cfg.columns.att) },
      { key: "lo", names: cfg.sheets.lo,     amap: aliasMap(cfg.columns.lo) },
      /* round 19: September workbooks carry a separate "OT Pocket" sheet
         (Aug/Sep OT split). Rows fold into the pm table exactly the way
         the Results sheet sums them for pocket-machine supervisors:
         Actual += OT Production, Min Available += OT Min, Min Produced
         += OT Min Produced. Optional sheet — August files simply skip it. */
      { key: "otp", names: cfg.sheets.otp,   amap: aliasMap(cfg.columns.otp) }
    ];
    var lowerMap = {};
    wb.SheetNames.forEach(function (n) { lowerMap[nk(n)] = n; });

    sheetTargets.forEach(function (t) {
      var sheetName = null;
      for (var i = 0; i < t.names.length; i++) { if (lowerMap[nk(t.names[i])] != null) { sheetName = lowerMap[nk(t.names[i])]; break; } }
      if (sheetName == null) { if (t.key !== "otp") report.sheetsMissing.push(t.key); return; }
      var ws = wb.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!rows.length) { report.warnings.push("شيت \"" + sheetName + "\" فارغ."); return; }
      var hIdx = findHeader(rows, t.amap);
      if (hIdx < 0) { report.warnings.push("لم أجد صف العناوين في شيت \"" + sheetName + "\"."); return; }
      var header = rows[hIdx];

      if (t.key === "lo") { parseLineOutput(rows, hIdx, tables.lo, cfg, report); return; }

      for (var ri = hIdx + 1; ri < rows.length; ri++) {
        var r = rows[ri] || [];
        var allEmpty = true;
        for (var ci = 0; ci < r.length; ci++) if (r[ci] != null && String(r[ci]).trim() !== "") { allEmpty = false; break; }
        if (allEmpty) continue;
        var o = mapRow(header, r, t.amap);
        var row = t.key === "att" ? parseAttRow(o, cfg) :
                  t.key === "pm"  ? parsePmRow(o, cfg) :
                  t.key === "ot"  ? parseOtRow(o, cfg) :
                  t.key === "otp" ? parseOtpRow(o, cfg) : parseDdRow(o, cfg);
        if (row) (t.key === "otp" ? tables.pm : tables[t.key]).push(row);
      }
      if (t.key === "otp") report.rows.pm = (report.rows.pm || 0) + tables.pm.length;
      else report.rows[t.key] = (report.rows[t.key] || 0) + tables[t.key].length;
    });
    return tables;
  }

  function parseLineOutput(rows, hIdx, out, cfg, report) {
    var header = rows[hIdx];
    var lineCols = [], targetCols = [], dateCol = -1, dayCol = -1;
    for (var j = 0; j < header.length; j++) {
      var raw = header[j], k = nk(raw);
      if (k === "date" || k === "التاريخ") dateCol = j;
      else if (k === "day" || k === "اليوم") dayCol = j;
      else if (/^\d+$/.test(k)) lineCols.push({ j: j, line: k });
      else { var m = k.match(/^target(\d+)$/); if (m) targetCols.push({ j: j, line: m[1] }); }
    }
    if (dateCol < 0) { report.warnings.push("شيت Line Output بدون عمود تاريخ."); return; }
    var tgtByLine = {};
    targetCols.forEach(function (tc) { tgtByLine[tc.line] = tc.j; });
    for (var ri = hIdx + 1; ri < rows.length; ri++) {
      var r = rows[ri] || [];
      var date = parseDate(r[dateCol], cfg.dateFormat);
      if (date == null) continue; // PQ: FilteredRows [Date] <> null
      var day = parseNum(r[dayCol]);
      lineCols.forEach(function (lc) {
        var actual = parseNum(r[lc.j]);
        var target = tgtByLine[lc.line] != null ? parseNum(r[tgtByLine[lc.line]]) : null;
        if (actual == null && target == null) return;
        out.push({ date: date, day: day, line: lc.line, actual: actual, target: target });
      });
    }
  }

  function parseDdRow(o, cfg) {
    var date = parseDate(o.date, cfg.dateFormat);
    if (date == null) return null;
    return {
      date: date, day: parseNum(o.day), client: nonEmpty(o.client),
      line: normLine(o.line), section: nonEmpty(o.section),
      manager: nonEmpty(o.manager), leader: nonEmpty(o.leader), supervisor: nonEmpty(o.supervisor),
      target: parseNum(o.target), regWorkers: parseNum(o.regWorkers), actWorkers: parseNum(o.actWorkers),
      regMin: parseNum(o.regMin), absent: parseNum(o.absent), actualProd: parseNum(o.actualProd),
      achv: parseNum(o.achv), attWorkers: parseNum(o.attWorkers), minAvail: parseNum(o.minAvail),
      sam: parseNum(o.sam), minPiece: parseNum(o.minPiece), prodEff: parseNum(o.prodEff),
      minProd: parseNum(o.minProd), defects: parseNum(o.defects)
    };
  }
  function parseOtRow(o, cfg) {
    var r = parseDdRow(o, cfg); // same shared fields
    if (!r) return null;
    r.absent = null;
    return r;
  }
  function parsePmRow(o, cfg) {
    var date = parseDate(o.date, cfg.dateFormat);
    if (date == null) return null;
    return {
      date: date, day: parseNum(o.day), supervisor: nonEmpty(o.supervisor), worker: nonEmpty(o.worker),
      client: nonEmpty(o.client), po: parseNum(o.po), style: nonEmpty(o.style), line: normLine(o.line),
      machine: parseNum(o.machine), target: parseNum(o.target), actualProd: parseNum(o.actualProd),
      otProd: parseNum(o.otProd), plannedMin: parseNum(o.plannedMin), minAvail: parseNum(o.minAvail),
      otMin: parseNum(o.otMin), sam: parseNum(o.sam), minProd: parseNum(o.minProd),
      achv: parseNum(o.achv), eff: parseNum(o.eff), notes: nonEmpty(o.notes)
    };
  }
  function parseOtpRow(o, cfg) {
    /* an "OT Pocket" record folded into the pm table with the exact
       semantics the Results sheet uses when it sums PM + OT Pocket for
       pocket-machine supervisors (see the SUMIFS pairs in Results D/H/I).
       Every quantity rides ONE channel only — the app's aggregations all
       add actual+otProd and minAvail+otMin, so a folded row must carry
       its OT production in otProd (actualProd=0) and its OT minutes in
       otMin (minAvail=0) to be counted exactly once everywhere. */
    var date = parseDate(o.date, cfg.dateFormat);
    if (date == null) return null;
    var otProd = parseNum(o.otProd), otMin = parseNum(o.otMin);
    return {
      date: date, day: parseNum(o.day), supervisor: nonEmpty(o.supervisor), worker: nonEmpty(o.worker),
      client: nonEmpty(o.client), po: parseNum(o.po), style: nonEmpty(o.style), line: normLine(o.line),
      machine: parseNum(o.machine), target: 0,
      actualProd: 0, otProd: otProd, plannedMin: parseNum(o.plannedMin), minAvail: 0,
      otMin: otMin, sam: parseNum(o.sam), minProd: parseNum(o.otMinProd),
      achv: parseNum(o.otAchv), eff: parseNum(o.otEff), notes: nonEmpty(o.notes)
    };
  }
  function parseAttRow(o, cfg) {
    var date = parseDate(o.date, cfg.dateFormat);
    if (date == null) return null;
    return { date: date, day: parseNum(o.day), name: nonEmpty(o.name), score: parseNum(o.score) };
  }

  /* ---------------- model build ---------------- */
  function buildModel(allTables, cfg) {
    var model = {
      dd: allTables.dd, ot: allTables.ot, pm: allTables.pm, att: allTables.att, lo: allTables.lo,
      cfg: cfg,
      dates: [], dateMin: null, dateMax: null, months: [],
      lines: [], sections: [], supervisors: [], managers: [], leaders: []
    };
    var i, seen = {};
    for (i = 0; i < model.dd.length; i++) { var d = model.dd[i].date; if (d && !seen[d]) { seen[d] = 1; model.dates.push(d); } }
    model.dates.sort();
    model.dateMin = model.dates[0] || null;
    model.dateMax = model.dates[model.dates.length - 1] || null;

    var mSeen = {};
    model.dates.forEach(function (d) { var k = d.slice(0, 7); if (!mSeen[k]) { mSeen[k] = 1; model.months.push({ key: k, label: isoMonthLabel(d) }); } });

    // Dim Lines = VALUES('Line Output'[Line])
    var lSeen = {};
    model.lo.forEach(function (r) { if (r.line != null && !lSeen[r.line]) { lSeen[r.line] = 1; model.lines.push(r.line); } });
    model.lines.sort(function (a, b) { return (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999) || String(a).localeCompare(String(b)); });

    // Dim Sections / Leaders / Managers from Daily Data (non blank)
    function dimFrom(rows, field) {
      var s = {}, list = [];
      rows.forEach(function (r) { var v = r[field]; if (v != null && !s[v]) { s[v] = 1; list.push(v); } });
      return list.sort();
    }
    model.sections = dimFrom(model.dd, "section");
    model.leaders = dimFrom(model.dd, "leader");
    model.managers = dimFrom(model.dd, "manager");
    // Dim Supervisors = DISTINCT(UNION(DD, PM))
    var sv = {};
    model.supervisors = [];
    model.dd.forEach(function (r) { if (r.supervisor != null && !sv[r.supervisor]) { sv[r.supervisor] = 1; model.supervisors.push(r.supervisor); } });
    model.pm.forEach(function (r) { if (r.supervisor != null && !sv[r.supervisor]) { sv[r.supervisor] = 1; model.supervisors.push(r.supervisor); } });
    model.supervisors.sort();
    return model;
  }

  /* ---------------- filter + compute (mirrors DAX filter propagation) ---------------- */
  function dateOK(iso, f) {
    if (f.from && iso < f.from) return false;
    if (f.to && iso > f.to) return false;
    if (f.month && f.month.size && !f.month.has(iso.slice(0, 7))) return false;
    return true;
  }
  function compute(model, f, opts) {
    opts = opts || {};
    f = f || {};
    f.month = f.month && f.month.size ? f.month : null;
    var dd = [], ot = [], pm = [], att = [], lo = [];
    var i, r;
    for (i = 0; i < model.dd.length; i++) { r = model.dd[i];
      if (dateOK(r.date, f) && (!f.line || f.line.has(r.line)) && (!f.section || f.section.has(r.section)) && (!f.sup || f.sup.has(r.supervisor))) dd.push(r); }
    for (i = 0; i < model.ot.length; i++) { r = model.ot[i];
      if (dateOK(r.date, f) && (!f.line || f.line.has(r.line)) && (!f.section || f.section.has(r.section)) && (!f.sup || f.sup.has(r.supervisor))) ot.push(r); }
    for (i = 0; i < model.pm.length; i++) { r = model.pm[i]; // PM: only Date + Supervisor relationships
      if (dateOK(r.date, f) && (!f.sup || f.sup.has(r.supervisor))) pm.push(r); }
    for (i = 0; i < model.att.length; i++) { r = model.att[i]; // Attendance: only Date relationship
      if (dateOK(r.date, f)) att.push(r); }
    for (i = 0; i < model.lo.length; i++) { r = model.lo[i]; // Line Output: Date + Line
      if (dateOK(r.date, f) && (!f.line || f.line.has(r.line))) lo.push(r); }

    /* ---- headline KPIs (exact measure formulas) ---- */
    var factoryActual = sum(lo, "actual");            // Factory Actual
    var factoryTarget = sum(lo, "target");            // Factory Target
    var ddMinAvail = sum(dd, "minAvail"), otMinAvail = sum(ot, "minAvail");
    var pmMinAvail = sum(pm, "minAvail") + sum(pm, "otMin");   // PM Min Available
    var totalMinAvail = ddMinAvail + otMinAvail + pmMinAvail; // Total Min Available
    var totalOT = otMinAvail + sum(pm, "otMin");      // Total OT Minutes
    var minProduced = sum(dd, "minProd") + sum(pm, "minProd"); // Min Produced
    var k = {
      factoryActual: factoryActual,
      factoryTarget: factoryTarget,
      factoryAchv: factoryTarget ? factoryActual / factoryTarget : null,   // Factory Achievement %
      eff: totalMinAvail ? minProduced / totalMinAvail : null,             // Efficiency %
      otPct: totalMinAvail ? totalOT / totalMinAvail : null,               // Factory Overtime %
      otMinutes: totalOT,
      totalMinAvail: totalMinAvail,
      minProduced: minProduced,
      ddMinAvail: ddMinAvail, otMinAvail: otMinAvail, pmMinAvail: pmMinAvail,
      attendance: att.length ? sum(att, "score") / att.length : null,      // Attendance %
      absent: sum(dd, "absent"),                                           // Total Absent Workers
      absenteeism: (sum(dd, "regWorkers") + sum(dd, "absent")) ? sum(dd, "absent") / (sum(dd, "regWorkers") + sum(dd, "absent")) : null,
      avgSAM: mean(dd, "sam"),                                             // Avg SAM
      supTarget: sum(dd, "target") + sum(pm, "target"),                    // Supervisor Target
      supActual: sum(dd, "actualProd") + sum(pm, "actualProd") + sum(pm, "otProd"), // Supervisor Actual
      attRows: att.length, ddRows: dd.length
    };
    k.supAchv = k.supTarget ? k.supActual / k.supTarget : null;

    var supSet = {};
    dd.forEach(function (x) { if (x.supervisor != null) supSet[x.supervisor] = 1; });
    pm.forEach(function (x) { if (x.supervisor != null) supSet[x.supervisor] = 1; });
    k.supCount = Object.keys(supSet).length;

    // Max attendance per date (factory / line / section)
    var byDateAtt = {};
    dd.forEach(function (x) { if (x.attWorkers != null) byDateAtt[x.date] = (byDateAtt[x.date] || 0) + x.attWorkers; });
    k.maxAttendance = 0;
    Object.keys(byDateAtt).forEach(function (d) { if (byDateAtt[d] > k.maxAttendance) k.maxAttendance = byDateAtt[d]; });

    /* ---- daily series ---- */
    var daily = {};
    function slot(d) { if (!daily[d]) daily[d] = { date: d, loA: 0, loT: 0, ddAttW: 0, ddMinAvail: 0, otAvail: 0, pmOT: 0, pmMinAvail: 0, pmReg: 0, minProd: 0, attScore: 0, attCount: 0, absent: 0, regWorkers: 0 }; return daily[d]; }
    lo.forEach(function (x) { var s = slot(x.date); s.loA += x.actual || 0; s.loT += x.target || 0; });
    dd.forEach(function (x) { var s = slot(x.date); s.ddAttW += x.attWorkers || 0; s.ddMinAvail += x.minAvail || 0; s.minProd += x.minProd || 0; s.absent += x.absent || 0; s.regWorkers += x.regWorkers || 0; });
    ot.forEach(function (x) { var s = slot(x.date); s.otAvail += x.minAvail || 0; s.minProd += x.minProd || 0; });
    pm.forEach(function (x) { var s = slot(x.date); s.pmOT += x.otMin || 0; var ma = (x.minAvail || 0) + (x.otMin || 0); s.pmMinAvail += ma; s.pmReg += (x.minAvail || 0); s.minProd += x.minProd || 0; });
    att.forEach(function (x) { var s = slot(x.date); s.attScore += x.score || 0; s.attCount += 1; });
    var dates = Object.keys(daily).sort();
    var series = dates.map(function (d) {
      var s = daily[d];
      var tot = s.ddMinAvail + s.otAvail + s.pmMinAvail;
      return {
        date: d, label: isoShort(d), weekday: AR_DAYS[isoDayOfWeek(d)],
        achv: s.loT ? s.loA / s.loT : null,
        loA: s.loA, loT: s.loT,
        otPct: tot ? (s.otAvail + s.pmOT) / tot : null,
        otMin: s.otAvail + s.pmOT,
        totalMinAvail: tot,
        eff: tot ? s.minProd / tot : null,
        minProd: s.minProd,
        attPct: s.attCount ? s.attScore / s.attCount : null,
        absent: s.absent,
        ddAttW: s.ddAttW
      };
    });
    k.series = series;
    k.datesInRange = dates;

    /* ---- by line ---- */
    var byLine = {};
    var lineMin = {};   /* per-line minutes (for OT %) — DD + OT + PM capacity */
    lo.forEach(function (x) {
      if (x.line == null) return;
      if (!byLine[x.line]) byLine[x.line] = { line: x.line, target: 0, actual: 0, sam: [], attByDate: {} };
      byLine[x.line].target += x.target || 0; byLine[x.line].actual += x.actual || 0;
    });
    dd.forEach(function (x) {
      if (x.line == null) return;
      if (!byLine[x.line]) byLine[x.line] = { line: x.line, target: 0, actual: 0, sam: [], attByDate: {} };
      if (x.sam != null) byLine[x.line].sam.push(x.sam);
      if (x.attWorkers != null) {
        var key = x.date;
        byLine[x.line].attByDate[key] = (byLine[x.line].attByDate[key] || 0) + x.attWorkers;
      }
      if (!lineMin[x.line]) lineMin[x.line] = { avail: 0, ot: 0 };
      lineMin[x.line].avail += x.minAvail || 0;
    });
    ot.forEach(function (x) {
      if (x.line == null) return;
      if (!lineMin[x.line]) lineMin[x.line] = { avail: 0, ot: 0 };
      lineMin[x.line].avail += x.minAvail || 0; lineMin[x.line].ot += x.minAvail || 0;
    });
    pm.forEach(function (x) {
      if (x.line == null) return;
      if (!lineMin[x.line]) lineMin[x.line] = { avail: 0, ot: 0 };
      lineMin[x.line].avail += (x.minAvail || 0) + (x.otMin || 0); lineMin[x.line].ot += x.otMin || 0;
    });
    k.byLine = Object.keys(byLine).map(function (L) {
      var b = byLine[L];
      var maxAtt = 0; Object.keys(b.attByDate).forEach(function (d) { if (b.attByDate[d] > maxAtt) maxAtt = b.attByDate[d]; });
      var samArr = b.sam; var samMean = null;
      if (samArr.length) { var s2 = 0; for (var q = 0; q < samArr.length; q++) s2 += samArr[q]; samMean = s2 / samArr.length; }
      var lm = lineMin[L] || { avail: 0, ot: 0 };
      return { line: L, target: b.target, actual: b.actual, achv: b.target ? b.actual / b.target : null, avgSAM: samMean, maxAtt: maxAtt, otMin: lm.ot, otPct: lm.avail ? lm.ot / lm.avail : null };
    }).sort(function (a, b) { return (parseInt(a.line, 10) || 999) - (parseInt(b.line, 10) || 999); });

    /* ---- by section ---- */
    var bySec = {};
    var secAvail = {};
    dd.forEach(function (x) {
      if (x.section == null) return;
      if (!bySec[x.section]) bySec[x.section] = { section: x.section, target: 0, actual: 0, attByDate: {}, otMin: 0 };
      bySec[x.section].target += x.target || 0; bySec[x.section].actual += x.actualProd || 0;
      if (x.attWorkers != null) bySec[x.section].attByDate[x.date] = (bySec[x.section].attByDate[x.date] || 0) + x.attWorkers;
      secAvail[x.section] = (secAvail[x.section] || 0) + (x.minAvail || 0);
    });
    ot.forEach(function (x) { if (x.section != null) { if (!bySec[x.section]) bySec[x.section] = { section: x.section, target: 0, actual: 0, attByDate: {}, otMin: 0 }; bySec[x.section].otMin += x.minAvail || 0; secAvail[x.section] = (secAvail[x.section] || 0) + (x.minAvail || 0); } });
    k.bySection = Object.keys(bySec).map(function (S) {
      var b = bySec[S];
      var maxAtt = 0; Object.keys(b.attByDate).forEach(function (d) { if (b.attByDate[d] > maxAtt) maxAtt = b.attByDate[d]; });
      var av = secAvail[S] || 0;
      return { section: S, target: b.target, actual: b.actual, achv: b.target ? b.actual / b.target : null, maxAtt: maxAtt, otMin: b.otMin, otPct: av ? b.otMin / av : null };
    }).sort(function (a, b) { return b.actual - a.actual; });

    /* ---- by supervisor (DD + PM like the model) ---- */
    var bySup = {};
    var supMin = {};
    dd.forEach(function (x) {
      if (x.supervisor == null) return;
      if (!bySup[x.supervisor]) bySup[x.supervisor] = { supervisor: x.supervisor, target: 0, actual: 0, pmTarget: 0, pmActual: 0, otProd: 0, minProd: 0, rows: 0 };
      bySup[x.supervisor].target += x.target || 0; bySup[x.supervisor].actual += x.actualProd || 0;
      if (!supMin[x.supervisor]) supMin[x.supervisor] = { avail: 0, ot: 0 };
      supMin[x.supervisor].avail += x.minAvail || 0;
      bySup[x.supervisor].minProd += x.minProd || 0; bySup[x.supervisor].rows++;
    });
    pm.forEach(function (x) {
      if (x.supervisor == null) return;
      if (!bySup[x.supervisor]) bySup[x.supervisor] = { supervisor: x.supervisor, target: 0, actual: 0, pmTarget: 0, pmActual: 0, otProd: 0, minProd: 0, rows: 0 };
      bySup[x.supervisor].pmTarget += x.target || 0;
      bySup[x.supervisor].pmActual += x.actualProd || 0;
      bySup[x.supervisor].otProd += x.otProd || 0;
      if (!supMin[x.supervisor]) supMin[x.supervisor] = { avail: 0, ot: 0 };
      supMin[x.supervisor].avail += (x.minAvail || 0) + (x.otMin || 0);
      supMin[x.supervisor].ot += x.otMin || 0;
    });
    ot.forEach(function (x) {
      if (x.supervisor == null) return;
      if (!supMin[x.supervisor]) supMin[x.supervisor] = { avail: 0, ot: 0 };
      supMin[x.supervisor].avail += x.minAvail || 0;
      supMin[x.supervisor].ot += x.minAvail || 0;
    });
    k.bySupervisor = Object.keys(bySup).map(function (S) {
      var b = bySup[S];
      var t = b.target + b.pmTarget, a = b.actual + b.pmActual + b.otProd;
      var sm = supMin[S] || { avail: 0, ot: 0 };
      return { supervisor: S, target: t, actual: a, achv: t ? a / t : null, pmPart: b.pmActual + b.otProd, minProd: b.minProd, rows: b.rows, otMin: sm.ot, otPct: sm.avail ? sm.ot / sm.avail : null };
    }).sort(function (a, b) { return b.achv - a.achv; });

    /* ---- sections: daily trend per section (for sections page + drill) ---- */
    var secDaily = {};
    dd.forEach(function (x) {
      if (x.section == null || x.date == null) return;
      if (!secDaily[x.date]) secDaily[x.date] = {};
      if (!secDaily[x.date][x.section]) secDaily[x.date][x.section] = { target: 0, actual: 0 };
      secDaily[x.date][x.section].target += x.target || 0;
      secDaily[x.date][x.section].actual += x.actualProd || 0;
    });
    k.sectionDaily = secDaily;

    /* ---- sections: per-section per-line detail ---- */
    var secLine = {};
    dd.forEach(function (x) {
      if (x.section == null) return;
      var key = x.section + "|" + (x.line == null ? "—" : x.line);
      if (!secLine[key]) secLine[key] = { section: x.section, line: x.line, target: 0, actual: 0 };
      secLine[key].target += x.target || 0;
      secLine[key].actual += x.actualProd || 0;
    });
    k.bySectionLine = Object.keys(secLine).map(function (key) {
      var b = secLine[key];
      return { section: b.section, line: b.line, target: b.target, actual: b.actual, achv: b.target ? b.actual / b.target : null };
    }).sort(function (a, b) { return (parseInt(a.line, 10) || 999) - (parseInt(b.line, 10) || 999) || String(a.section).localeCompare(String(b.section)); });

    /* ---- pocket machines aggregates (PM page + drill) ---- */
    var pmAgg = { rows: pm.length, target: 0, actual: 0, otProd: 0, plannedMin: 0, minAvail: 0, otMin: 0, minProd: 0 };
    pm.forEach(function (x) {
      pmAgg.target += x.target || 0;
      pmAgg.actual += x.actualProd || 0;
      pmAgg.otProd += x.otProd || 0;
      pmAgg.plannedMin += x.plannedMin || 0;
      pmAgg.minAvail += x.minAvail || 0;
      pmAgg.otMin += x.otMin || 0;
      pmAgg.minProd += x.minProd || 0;
    });
    pmAgg.cap = pmAgg.minAvail + pmAgg.otMin;
    pmAgg.achv = pmAgg.target ? (pmAgg.actual + pmAgg.otProd) / pmAgg.target : null;
    pmAgg.eff = pmAgg.cap ? pmAgg.minProd / pmAgg.cap : null;
    k.pmAgg = pmAgg;

    /* PM by supervisor */
    var pmByS = {};
    pm.forEach(function (x) {
      if (x.supervisor == null) return;
      if (!pmByS[x.supervisor]) pmByS[x.supervisor] = { supervisor: x.supervisor, rows: 0, target: 0, actual: 0, otProd: 0, minAvail: 0, otMin: 0, minProd: 0 };
      var b = pmByS[x.supervisor];
      b.rows++; b.target += x.target || 0; b.actual += x.actualProd || 0; b.otProd += x.otProd || 0;
      b.minAvail += x.minAvail || 0; b.otMin += x.otMin || 0; b.minProd += x.minProd || 0;
    });
    k.byPmSup = Object.keys(pmByS).map(function (S) {
      var b = pmByS[S], cap = b.minAvail + b.otMin;
      return { supervisor: S, rows: b.rows, target: b.target, actual: b.actual + b.otProd,
        achv: b.target ? (b.actual + b.otProd) / b.target : null,
        cap: cap, minProd: b.minProd, eff: cap ? b.minProd / cap : null };
    }).sort(function (a, b) { return b.actual - a.actual; });

    /* PM by machine */
    var pmByM = {};
    pm.forEach(function (x) {
      if (x.machine == null) return;
      var key = String(x.machine);
      if (!pmByM[key]) pmByM[key] = { machine: key, lines: {}, rows: 0, target: 0, actual: 0, otProd: 0, minAvail: 0, otMin: 0, minProd: 0 };
      var b = pmByM[key];
      b.rows++; b.target += x.target || 0; b.actual += x.actualProd || 0; b.otProd += x.otProd || 0;
      b.minAvail += x.minAvail || 0; b.otMin += x.otMin || 0; b.minProd += x.minProd || 0;
      if (x.line != null) b.lines[x.line] = 1;
    });
    k.byPmMachine = Object.keys(pmByM).map(function (M) {
      var b = pmByM[M], cap = b.minAvail + b.otMin;
      return { machine: M, lines: Object.keys(b.lines).sort(function (a, c) { return (parseInt(a, 10) || 999) - (parseInt(c, 10) || 999); }), rows: b.rows,
        target: b.target, actual: b.actual + b.otProd, achv: b.target ? (b.actual + b.otProd) / b.target : null,
        cap: cap, minProd: b.minProd, eff: cap ? b.minProd / cap : null };
    }).sort(function (a, b) { return (parseInt(a.machine, 10) || 999) - (parseInt(b.machine, 10) || 999); });

    /* PM by line */
    var pmByL = {};
    pm.forEach(function (x) {
      if (x.line == null) return;
      var key = String(x.line);
      if (!pmByL[key]) pmByL[key] = { line: key, rows: 0, target: 0, actual: 0, otProd: 0, minAvail: 0, otMin: 0, minProd: 0 };
      var b = pmByL[key];
      b.rows++; b.target += x.target || 0; b.actual += x.actualProd || 0; b.otProd += x.otProd || 0;
      b.minAvail += x.minAvail || 0; b.otMin += x.otMin || 0; b.minProd += x.minProd || 0;
    });
    k.byPmLine = Object.keys(pmByL).map(function (L) {
      var b = pmByL[L], cap = b.minAvail + b.otMin;
      return { line: L, rows: b.rows, target: b.target, actual: b.actual + b.otProd,
        achv: b.target ? (b.actual + b.otProd) / b.target : null, cap: cap, minProd: b.minProd, eff: cap ? b.minProd / cap : null };
    }).sort(function (a, b) { return (parseInt(a.line, 10) || 999) - (parseInt(b.line, 10) || 999); });

    /* PM daily series */
    var pmDaily = {};
    pm.forEach(function (x) {
      if (x.date == null) return;
      if (!pmDaily[x.date]) pmDaily[x.date] = { date: x.date, target: 0, actual: 0, otProd: 0, minAvail: 0, otMin: 0, minProd: 0, rows: 0 };
      var s = pmDaily[x.date];
      s.rows++; s.target += x.target || 0; s.actual += x.actualProd || 0; s.otProd += x.otProd || 0;
      s.minAvail += x.minAvail || 0; s.otMin += x.otMin || 0; s.minProd += x.minProd || 0;
    });
    k.pmDaily = Object.keys(pmDaily).sort().map(function (d) {
      var s = pmDaily[d], cap = s.minAvail + s.otMin;
      return { date: d, label: isoShort(d), weekday: AR_DAYS[isoDayOfWeek(d)], target: s.target,
        actual: s.actual + s.otProd, minAvail: s.minAvail, otMin: s.otMin, minProd: s.minProd,
        cap: cap, eff: cap ? s.minProd / cap : null, rows: s.rows };
    });

    /* ---- OT by supervisor (OT minutes from OT sheet + PM OT minutes) ---- */
    var otByS = {};
    var otSupAvail = {};
    ot.forEach(function (x) {
      if (x.supervisor == null) return;
      if (!otByS[x.supervisor]) otByS[x.supervisor] = { supervisor: x.supervisor, otMin: 0, minAvail: 0, minProd: 0, rows: 0, avail: 0 };
      otByS[x.supervisor].otMin += x.minAvail || 0; otByS[x.supervisor].minAvail += x.minAvail || 0;
      otByS[x.supervisor].minProd += x.minProd || 0; otByS[x.supervisor].rows++;
      otSupAvail[x.supervisor] = (otSupAvail[x.supervisor] || 0) + (x.minAvail || 0);
    });
    pm.forEach(function (x) {
      if (x.supervisor == null) return;
      if (!otByS[x.supervisor]) otByS[x.supervisor] = { supervisor: x.supervisor, otMin: 0, minAvail: 0, minProd: 0, rows: 0, avail: 0 };
      otByS[x.supervisor].otMin += x.otMin || 0; otByS[x.supervisor].minProd += x.minProd || 0;
      otSupAvail[x.supervisor] = (otSupAvail[x.supervisor] || 0) + (x.minAvail || 0) + (x.otMin || 0);
    });
    dd.forEach(function (x) {
      if (x.supervisor == null) return;
      otSupAvail[x.supervisor] = (otSupAvail[x.supervisor] || 0) + (x.minAvail || 0);
    });
    k.otBySup = Object.keys(otByS).map(function (S) {
      var b = otByS[S];
      var av = otSupAvail[S] || 0;
      b.avail = av; b.otPct = av ? b.otMin / av : null;
      return b;
    })
      .filter(function (b) { return b.otMin > 0; })
      .sort(function (a, b) { return b.otMin - a.otMin; });

    /* ---- attendance by weekday + heatmap ---- */
    var byDow = {};
    att.forEach(function (x) {
      var dw = isoDayOfWeek(x.date);
      if (!byDow[dw]) byDow[dw] = { dw: dw, score: 0, count: 0 };
      byDow[dw].score += x.score || 0; byDow[dw].count++;
    });
    k.byDow = Object.keys(byDow).map(function (dw) {
      var b = byDow[dw];
      return { name: AR_DAYS[dw], order: +dw, pct: b.count ? b.score / b.count : null, count: b.count };
    }).sort(function (a, b) { return a.order - b.order; });

    var heat = {};
    att.forEach(function (x) {
      var wk = weekStartISO(x.date), dw = isoDayOfWeek(x.date), key = wk + "|" + dw;
      if (!heat[key]) heat[key] = { week: wk, dw: +dw, score: 0, count: 0 };
      heat[key].score += x.score || 0; heat[key].count++;
    });
    k.heatmap = Object.keys(heat).map(function (key) {
      var h = heat[key];
      return { week: h.week, dw: h.dw, label: AR_DAYS[h.dw], pct: h.count ? h.score / h.count : null, count: h.count };
    });
    k.weeks = Object.keys(heat).map(function (key) { return heat[key].week; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();

    /* ---- previous period (for deltas) ---- */
    var from = f.from || model.dateMin, to = f.to || model.dateMax;
    if (from && to && !opts.noPrev) {
      var durMs = isoToDate(to) - isoToDate(from) + 86400000;
      var days = Math.round(durMs / 86400000);
      var prevFrom = isoAddDays(from, -days), prevTo = isoAddDays(from, -1);
      var pf = { from: prevFrom, to: prevTo, line: f.line, section: f.section, sup: f.sup, month: null };
      var prev = compute(model, pf, { noPrev: true });
      if (prev.factoryTarget || prev.ddRows) k.prev = {
        achv: prev.factoryAchv, eff: prev.eff, otPct: prev.otPct, attendance: prev.attendance,
        absent: prev.absent, actual: prev.factoryActual, target: prev.factoryTarget
      };
    }
    return k;
  }

  return {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    deepMerge: deepMerge,
    parseWorkbook: parseWorkbook,
    buildModel: buildModel,
    compute: compute,
    utils: {
      nk: nk, parseNum: parseNum, parseDate: parseDate, isoAddDays: isoAddDays,
      isoDayOfWeek: isoDayOfWeek, weekStartISO: weekStartISO, isoShort: isoShort,
      isoMonthLabel: isoMonthLabel, AR_DAYS: AR_DAYS, AR_MONTHS: AR_MONTHS,
      fmtInt: fmtInt, fmtPct: fmtPct, fmtNum: fmtNum,
      statusOf: statusOf, statusInv: statusInv
    }
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = MaribCore;