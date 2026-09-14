/* ============================================================
   MaribManpower — R38 الاتزان v2 (Marib 3)
   Tree: Marib 3 → الإدارة → القسم → القسم الداخلي →
         الاسم والكود (Expand) → الوظيفة.
   Owner's counting rule: every sheet row = one required position;
   a row with an empty name = a vacancy (ناقص ومحتاجينه), so
   required = rows, actual = filled, variance = actual − required
   (negative red · positive green · zero plain).
   + إدارة الأقسام from the site: rename / move inside / move out /
     add — and easy employee transfer (cascading قسم picker).
   + رفع شيت Manpower: full sync — "جديد" rows take their code the
     moment the owner re-uploads the sheet with codes typed in.
   + garment glossary: English terms display in AR/EN/TR (jeans
     industry wording).
   Server stays light: ONE small GET per session (~830 rows), all
   tree math client-side, one tiny POST per action.
   ============================================================ */
var MaribManpower = (function () {
  "use strict";
  var T = I18N.t;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toast(msg, cls) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "on " + (cls || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = ""; }, 3800);
  }

  /* ---------------- icons ---------------- */
  var ICO_DEPT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>';
  var ICO_JOB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V4h7z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>';
  var ICO_EMP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.4-3.8 4.2-5.7 7.5-5.7s6.1 1.9 7.5 5.7"/></svg>';
  var ICO_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var ICO_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>';
  var ICO_MOVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v4h4"/><path d="M3.5 11a9 9 0 1 1 2.6 6.4"/><path d="M12 7h9v9h-9" opacity=".0"/><path d="M12 8l2.5 2.5M12 8l-2.5 2.5"/><path d="M12 8v9"/></svg>';
  var ICO_GHOST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a7 7 0 0 0-7 7v9l2.3-2 2.2 2 2.5-2 2.5 2 2.2-2 2.3 2v-9a7 7 0 0 0-7-7z"/><circle cx="9.5" cy="11" r=".8"/><circle cx="14.5" cy="11" r=".8"/></svg>';
  var ICO_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
  var ICO_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ---------------- garment glossary (jeans industry wording) ----------
     Base = the term as written in the sheet. Display goes through TT():
     AR shows the factory Arabic · EN the English · TR the Turkish term.
     Terms NOT in the glossary (Arabic jobs, org codes like IAS) show
     as-is — they are the factory's own words. Search matches BOTH the
     original and the translated form. */
  var GLOSS = {
    "SEWING":            { ar: "الخياطة",              en: "Sewing",              tr: "Dikim" },
    "CUTTING":           { ar: "القص",                 en: "Cutting",             tr: "Kesim" },
    "Embrodiery":        { ar: "التطريز",              en: "Embroidery",          tr: "Nakış" },
    "Samples and Pilot": { ar: "السامبل والبايلوت",    en: "Samples & Pilot",     tr: "Numune ve Pilot" },
    "Fabric Warehouse":  { ar: "مخزن الأقمشة",         en: "Fabric Warehouse",    tr: "Kumaş Deposu" },
    "Accessories Warehouse": { ar: "مخزن المستلزمات",  en: "Accessories Warehouse", tr: "Aksesuar Deposu" },
    "إدارة":             { ar: "الإدارة",              en: "Administration",      tr: "Yönetim" },
    "ENGINEERING":       { ar: "الهندسة والصيانة",     en: "Engineering",         tr: "Mühendislik" },
    "Main warehouses":   { ar: "المخازن الرئيسية",     en: "Main Warehouses",     tr: "Ana Depolar" },
    "PATTERN":           { ar: "الباترون",             en: "Pattern",             tr: "Kalıp" },
    "PILOT":             { ar: "البايلوت",             en: "Pilot",               tr: "Pilot" },
    "SAMPLING ROOM MO":  { ar: "غرفة السامبل",         en: "Sampling Room",       tr: "Numune Odası" },
    "Sub-warehouses":    { ar: "المخازن الفرعية",      en: "Sub-warehouses",      tr: "Alt Depolar" },
    "front":             { ar: "أمامي",                en: "Front",               tr: "Ön" },
    "Back":              { ar: "خلفي",                 en: "Back",                tr: "Arka" },
    "montage":           { ar: "مونتاج",               en: "Montage",             tr: "Monte" },
    "Preparations":      { ar: "التحضيرات",            en: "Preparations",        tr: "Hazırlık" },
    "MO":                { ar: "مشغل ماكينة",          en: "Machine Operator",    tr: "Operatör" },
    "Helper":            { ar: "مساعد",                en: "Helper",              tr: "Yardımcı" },
    "Helpar":            { ar: "مساعد",                en: "Helper",              tr: "Yardımcı" },
    "Leader":            { ar: "ليدر",                 en: "Leader",              tr: "Lider" },
    "S.V":               { ar: "مشرف",                 en: "Supervisor",          tr: "Süpervizör" },
    "S.V {Q.A}":         { ar: "مشرف جودة",            en: "Supervisor (QA)",     tr: "Süpervizör (Kalite)" },
    "MANGMENT":          { ar: "الإدارة",              en: "Management",          tr: "Yönetim" },
    "General Maintenance": { ar: "الصيانة العامة",     en: "General Maintenance", tr: "Genel Bakım" },
    "FOLLOW UP":         { ar: "المتابعة",             en: "Follow Up",           tr: "Takip" },
    "PRO. - SEWING FOLLOW UP": { ar: "متابعة الخياطة", en: "Sewing Follow Up", tr: "Dikim Takibi" },  /* R39: new dept in the 2026-09 sheet */
    "IAS - IA - IAA":   { ar: "المراجعة الداخلية",    en: "Internal Audit",        tr: "İç Denetim" },          /* R39 */
    "INHOUSE ADM.IT":   { ar: "تكنولوجيا المعلومات",  en: "In-house IT Admin",     tr: "Bilgi İşlem" },         /* R39 */
    "PRO. - PROD.MAINT. - TECHNICIAN":  { ar: "صيانة الإنتاج",  en: "Production Maintenance", tr: "Üretim Bakım" },
    "PRO. - Q.A. - SEWING":             { ar: "جودة الخياطة",   en: "Sewing QA",              tr: "Dikim Kalite" },
    "PRO. - SEWING - MANAGEMENT":       { ar: "إدارة الخياطة",  en: "Sewing Management",      tr: "Dikim Yönetimi" },
    "Accountant":        { ar: "محاسب",                en: "Accountant",          tr: "Muhasebeci" },
    "Cleaner":           { ar: "عامل نظافة",           en: "Cleaner",             tr: "Temizlik Görevlisi" },
    "Control & Follow Up Manager": { ar: "مدير المتابعة والرقابة", en: "Control & Follow-up Manager", tr: "Kontrol ve Takip Müdürü" },
    "Cutter":            { ar: "قصاص",                 en: "Cutter",              tr: "Kesimci" },
    "Data Entry":        { ar: "إدخال بيانات",         en: "Data Entry",          tr: "Veri Girişi" },
    "Electric":          { ar: "كهربائي",              en: "Electrician",         tr: "Elektrikçi" },
    "Health & Saftey":   { ar: "سلامة وصحة مهنية",     en: "Health & Safety",     tr: "İş Güvenliği" },
    "IE":                { ar: "مهندس صناعي",          en: "Industrial Engineer", tr: "Endüstri Mühendisi" },
    "Internal Auditor":  { ar: "مراجع داخلي",          en: "Internal Auditor",    tr: "İç Denetçi" },
    "Leader Security":   { ar: "ليدر أمن",             en: "Security Leader",     tr: "Güvenlik Lideri" },
    "Maintenance Manager": { ar: "مدير الصيانة",       en: "Maintenance Manager", tr: "Bakım Müdürü" },
    "NETWORK RESPONSIBLE": { ar: "مسؤول الشبكة",       en: "Network Responsible", tr: "Ağ Sorumlusu" },
    "NURSE":             { ar: "ممرضة",                en: "Nurse",               tr: "Hemşire" },
    "OFICCE BOY":        { ar: "عامل مكتب",            en: "Office Boy",          tr: "Ofis Boy" },
    "Patronest":         { ar: "باترونيست",            en: "Patternist",          tr: "Kalıpçı" },
    "Planning":          { ar: "تخطيط",                en: "Planning",            tr: "Planlama" },
    "Production Manager": { ar: "مدير الإنتاج",        en: "Production Manager",  tr: "Üretim Müdürü" },
    "Q.A":               { ar: "جودة",                 en: "Q.A",                 tr: "Kalite" },
    "Q.A Manager":       { ar: "مدير الجودة",          en: "Q.A Manager",         tr: "Kalite Müdürü" },
    "Sample Technical":  { ar: "فني سامبل",            en: "Sample Technician",   tr: "Numune Teknikeri" },
    "Security":          { ar: "أمن",                  en: "Security",            tr: "Güvenlik" },
    "Store Manager":     { ar: "مدير مخزن",            en: "Store Manager",       tr: "Depo Müdürü" },
    "Storekeeper":       { ar: "أمين مخزن",            en: "Storekeeper",         tr: "Depocu" },
    "Technical Engineer": { ar: "مهندس فني",           en: "Technical Engineer",  tr: "Teknik Mühendis" },
    "Translator":        { ar: "مترجم",                en: "Translator",          tr: "Çevirmen" },
    "S.V  Cleaner":      { ar: "مشرف نظافة",           en: "Cleaning Supervisor", tr: "Temizlik Süpervizörü" },
    "S.V  Security":     { ar: "مشرف أمن",            en: "Security Supervisor", tr: "Güvenlik Süpervizörü" },
    "Overlocker":        { ar: "عامل أوفر",            en: "Overlocker",          tr: "Overlok Operatörü" },
    "Cover Operator":    { ar: "كوفر",                 en: "Coverstitch Operator", tr: "Coverstitch Operatörü" },
    "BT":                { ar: "زرار (BT)",            en: "Button (BT)",         tr: "Düğme (BT)" }
  };
  function TT(term) {
    var g = GLOSS[term];
    if (!g) return term == null ? "" : String(term);
    var L = I18N.lang();
    return g[L] || g.en || String(term);
  }
  /* sewing lines show as خط 1 / Line 1 / Hat 1 */
  function lineLabel(n) {
    var L = I18N.lang();
    var w = L === "ar" ? "خط" : L === "tr" ? "Hat" : "Line";
    return w + " " + n;
  }
  function deptLabel(node) {
    if (/^\d+$/.test(node.label) && node.parentLabel === "SEWING") return lineLabel(node.label);
    return TT(node.label);
  }
  /* original + translated haystack (search hits both) */
  function hay(term) {
    var g = GLOSS[term];
    return String(term || "") + (g ? " " + g.ar + " " + g.en + " " + g.tr : "");
  }

  /* ---------------- state ---------------- */
  var DATA = null;   /* {depts:[[id,name,parent,ord]], emps:[[id,code,name,job,deptId,hire,vac,note]], req:{}, transfers:[…]} */
  var ROOT = null;
  var expanded = {};   /* deptKey → true (root starts open) */
  var empOpen = {};    /* emp row id → true */
  var q = "";
  var archQ = "";
  var view = "tree";
  var loaded = false;
  var loading = false;
  var on = false;
  var ADMIN = false;
  var jobsAll = [];

  /* R39: natural compare — "خط 2" before "خط 10", digits compared as
     numbers (used as the tie-break of the ascending ord sort) */
  function natCmp(a, b) {
    var A = String(a == null ? "" : a), B = String(b == null ? "" : b);
    var re = /(\d+)|(\D+)/g, pa = [], pb = [], m;
    while ((m = re.exec(A)) !== null) pa.push(m[1] ? { n: parseInt(m[1], 10) } : { s: m[2] });
    var re2 = /(\d+)|(\D+)/g;
    while ((m = re2.exec(B)) !== null) pb.push(m[1] ? { n: parseInt(m[1], 10) } : { s: m[2] });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i], y = pb[i];
      if (!x) return -1;
      if (!y) return 1;
      if (x.n !== undefined && y.n !== undefined) { if (x.n !== y.n) return x.n - y.n; }
      else if (x.n !== undefined) return -1;
      else if (y.n !== undefined) return 1;
      else { var c = x.s.localeCompare(y.s, "ar"); if (c) return c; }
    }
    return 0;
  }

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (!d || isNaN(d.getTime())) return String(iso || "");
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  /* ---------------- data → tree ---------------- */
  function mkDept(row) {
    return { key: "d:" + row[0], id: row[0], label: row[1], parent: row[2] || "", ord: row[3] || 0,
             depth: 0, parentLabel: "", kids: [], emps: [], vacs: [],
             count: 0, rows: 0, own: null, eff: null, tCount: 0, tRows: 0 };
  }

  function buildTree() {
    ROOT = { key: "root", id: "", label: "Marib 3", depth: -1, kids: [], emps: [], vacs: [],
             count: 0, rows: 0, own: null, eff: null, tCount: 0, tRows: 0 };
    var byId = {};
    var i;
    for (i = 0; i < DATA.depts.length; i++) {
      var d = mkDept(DATA.depts[i]);
      byId[d.id] = d;
    }
    for (i = 0; i < DATA.emps.length; i++) {
      var e = DATA.emps[i];          /* [id, code, name, job, deptId, hire, vac, note] */
      var node = byId[e[4]];
      if (!node) node = ROOT;        /* safety net: orphan rows hang off Marib 3 */
      if (e[6]) node.vacs.push(e);
      else node.emps.push(e);
    }
    (function attach(n, parentLabel) {
      n.parentLabel = parentLabel;
      n.depth = n === ROOT ? -1 : (parentLabel === "" ? 0 : byId && 0); /* set below */
      var kids = [];
      for (var id in byId) {
        if (byId[id].parent === (n === ROOT ? "" : n.id)) kids.push(byId[id]);
      }
      kids.sort(function (a, b) { return a.ord - b.ord; });
      n.kids = kids;
      for (var k = 0; k < kids.length; k++) attach(kids[k], n === ROOT ? "" : n.label);
    })(ROOT, "");
    (function setDepth(n, d0) {
      n.depth = d0;
      for (var k = 0; k < n.kids.length; k++) setDepth(n.kids[k], d0 + 1);
    })(ROOT, -1);

    /* bottom-up roll: actual = filled rows, required = all rows
       (manual override wins, else direct rows + children effective) */
    (function roll(n) {
      n.count = n.emps.length;
      n.rows = n.emps.length + n.vacs.length;
      n.own = (n.key && DATA.req[n.key] !== undefined) ? DATA.req[n.key] : null;
      var sum = 0;
      for (var k = 0; k < n.kids.length; k++) {
        roll(n.kids[k]);
        n.count += n.kids[k].count;
        n.rows += n.kids[k].rows;
        sum += n.kids[k].eff;
      }
      n.eff = n.own !== null ? n.own : (n.emps.length + n.vacs.length + sum);
      n.tCount = n.count;
      n.tRows = n.rows;
    })(ROOT);

    /* R39: ترتيب تصاعدي ثابت — ترتيب الشيت (ord) الأول، وبين المتساويين
       مقارنة طبيعية للأسامي (خط 2 قبل خط 10). اللي كان قبل كده (الناقص
       الأول) هو اللي خلى الخطوط تطلع 4 ، 5 ، 1 ، 2 ، 3 بالظبط. */
    (function sortKids(n) {
      n.kids.sort(function (a, b) {
        if ((a.ord || 0) !== (b.ord || 0)) return (a.ord || 0) - (b.ord || 0);
        return natCmp(deptLabel(a), deptLabel(b));
      });
      for (var k = 0; k < n.kids.length; k++) sortKids(n.kids[k]);
    })(ROOT);

    /* datalist of jobs */
    var seen = {};
    jobsAll = [];
    for (i = 0; i < DATA.emps.length; i++) {
      var jb = DATA.emps[i][3];
      if (jb && !seen[jb]) { seen[jb] = 1; jobsAll.push(jb); }
    }
    jobsAll.sort();
  }

  /* full path of a dept node (original terms — as stored in the archive) */
  function nodePath(n) {
    var parts = [];
    var cur = n;
    var guard = 0;
    while (cur && cur !== ROOT && guard++ < 30) {
      parts.unshift(cur.label);
      cur = parentOf(cur);
    }
    return parts.join(" - ");
  }
  function parentOf(n) {
    if (!n || n === ROOT || !n.parent) return ROOT;
    for (var i = 0; i < DATA.depts.length; i++) {
      if (DATA.depts[i][0] === n.parent) {
        return findByKey("d:" + DATA.depts[i][0]);
      }
    }
    return ROOT;
  }
  var nodeIndex = {};
  function findByKey(key) {
    if (nodeIndex[key]) return nodeIndex[key];
    var found = null;
    (function walk(n) {
      if (found) return;
      if (n.key === key) { found = n; return; }
      for (var k = 0; k < n.kids.length; k++) walk(n.kids[k]);
    })(ROOT);
    nodeIndex[key] = found;
    return found;
  }
  function resetIndex() { nodeIndex = {}; }

  /* ---------------- search ---------------- */
  function nodeMatches(n, needle) {
    if (hay(n.label).toLowerCase().indexOf(needle) >= 0) return true;
    var i;
    for (i = 0; i < n.emps.length; i++) {
      var e = n.emps[i];
      if (hay(e[2]).toLowerCase().indexOf(needle) >= 0) return true;
      if (String(e[1]).toLowerCase().indexOf(needle) >= 0) return true;
      if (String(e[2]).toLowerCase().indexOf(needle) >= 0) return true;
      if (String(e[0]).indexOf(needle) >= 0) return true;
    }
    for (i = 0; i < n.vacs.length; i++) {
      if (hay(n.vacs[i][3]).toLowerCase().indexOf(needle) >= 0) return true;
    }
    for (var k = 0; k < n.kids.length; k++) if (nodeMatches(n.kids[k], needle)) return true;
    return false;
  }

  /* ---------------- render: hero ---------------- */
  function renderHero() {
    var h = $("mpHero");
    if (!h) return;
    var totReq = ROOT && ROOT.eff !== null ? ROOT.eff : null;
    var totVar = totReq === null ? null : ROOT.tCount - totReq;
    var vac = ROOT ? (ROOT.tRows - ROOT.tCount) : 0;
    function card(cls, big, label) {
      return '<div class="mph-card ' + (cls || "") + '"><b class="num"><bdi>' + big + '</bdi></b><small>' + esc(label) + "</small></div>";
    }
    var varCls = totVar === null ? "" : totVar < 0 ? "neg" : totVar > 0 ? "pos" : "zero";
    var varBig = totVar === null ? "—" : (totVar > 0 ? "+" : "") + totVar;
    h.innerHTML =
      '<div class="mph-lead"><b class="mph-root">Marib 3</b><small>' + esc(T("mg_mp_sub")) + "</small></div>" +
      card("", String(ROOT ? ROOT.tCount : 0), T("mp_total_emp")) +
      card("req", totReq === null ? "—" : String(totReq), T("mp_total_req")) +
      card(varCls, varBig, T("mp_total_var")) +
      card("", String(vac), T("mp_vac")) +
      card("", String(ROOT ? ROOT.kids.length : 0), T("mp_depts"));
  }

  /* ---------------- render: tree rows ---------------- */
  function hl(text, needle) {
    var s = String(text);
    if (!needle) return esc(s);
    var low = s.toLowerCase();
    var i = low.indexOf(needle);
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + needle.length)) + "</mark>" + esc(s.slice(i + needle.length));
  }

  function varBadge(count, eff) {
    if (eff === null) return '<b class="mv na">—</b>';
    var v = count - eff;
    var cls = v < 0 ? "neg" : v > 0 ? "pos" : "zero";
    var txt = v > 0 ? "+" + v : String(v);
    return '<b class="mv ' + cls + '"><bdi>' + txt + "</bdi></b>";
  }

  function reqChip(n) {
    var v = n.eff === null ? "—" : String(n.eff);
    var own = n.own !== null ? ' data-own="' + n.own + '"' : "";
    return '<b class="mn r' + (ADMIN ? " ed" : "") + '"' + own + ' data-rk="' + esc(n.key) + '" title="' + esc(T("mp_required")) + '"><bdi>' + v + "</bdi></b>";
  }

  function bar(n) {
    if (n.eff === null || !n.eff) return '<span class="mbar"></span>';
    var pct = Math.max(0, Math.min(100, Math.round(n.tCount / n.eff * 100)));
    var cls = n.tCount < n.eff ? "short" : n.tCount > n.eff ? "over" : "";
    return '<span class="mbar"><i class="' + cls + '" style="width:' + pct + '%"></i></span>';
  }

  function badgeHTML(n) {
    return '<b class="mn a"><bdi>' + n.tCount + "</bdi></b>" + reqChip(n) + varBadge(n.tCount, n.eff);
  }

  /* the Marib 3 root row — always the first row of the tree */
  function rootNodeRow() {
    var open = !!expanded["root"];
    var tw = '<button class="tw' + (open ? " open" : "") + '" type="button" aria-expanded="' + (open ? "true" : "false") + '" aria-label="Marib 3">' + ICO_CHEV + "</button>";
    var ico = '<span class="mi root">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>' + "</span>";
    return '<div class="mpr rootrow' + (open ? " ex" : "") + '" data-k="root" data-t="dept">' +
      tw + ico + '<span class="ml"><b class="mln rt">Marib 3</b></span>' + bar(ROOT) + badgeHTML(ROOT) + "</div>";
  }

  function deptRow(n, needle, anim, delay) {
    var isOpen = !!expanded[n.key];
    var hasKids = n.kids.length > 0 || n.emps.length > 0 || n.vacs.length > 0;
    var tw = hasKids
      ? '<button class="tw' + (isOpen ? " open" : "") + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-label="' + esc(n.label) + '">' + ICO_CHEV + "</button>"
      : '<span class="tw ghost"></span>';
    var ico = '<span class="mi dept">' + ICO_DEPT + "</span>";
    var label = '<span class="ml">' + hl(deptLabel(n), needle) +
      (n.own !== null ? '<i class="mls ov" title="' + esc(T("mp_req_own")) + '">✎</i>' : "") + "</span>";
    /* R39: زرار واحد بس — نفس المودال بيعمل التسمية والنقل مع بعض */
    var adm = ADMIN ? '<span class="mo rn" role="button" tabindex="0" title="' + esc(T("mp_dept_edit")) + '" data-rn="' + esc(n.id) + '">' + ICO_PEN + "</span>" : "";
    var style = "--d:" + n.depth + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    return '<div class="mpr dn' + (anim ? " in" : "") + '" style="' + style + '" data-k="' + esc(n.key) + '" data-t="dept">' +
      tw + ico + label + bar(n) + badgeHTML(n) + adm + "</div>";
  }

  /* employee row — الاسم والكود مع بعض (Expand ⇒ الوظيفة) */
  function empRow(e, needle, anim, delay) {
    var id = e[0], code = String(e[1] || ""), name = String(e[2] || "");
    var isOpen = !!empOpen[id];
    var isNew = !code || code === "جديد";
    var trs = transfersOf(id);
    var tw = '<button class="tw' + (isOpen ? " open" : "") + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-label="' + esc(name) + '">' + ICO_CHEV + "</button>";
    var ico = '<span class="mi emp">' + ICO_EMP + "</span>";
    var codeChip = isNew
      ? '<i class="mlc newc">' + esc(T("mp_code_new")) + "</i>"
      : '<i class="mlc num">' + hl(code, needle) + "</i>";
    var label = '<span class="ml"><b class="mln">' + hl(name, needle) + "</b>" + codeChip + "</span>";
    var pen = ADMIN ? '<span class="mo" role="button" tabindex="0" title="' + esc(T("mp_edit")) + '" data-ei="' + esc(id) + '">' + ICO_PEN + "</span>" : "";
    var style = "--d:" + (depthOf(e[4]) + 1) + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    /* R39: class "em" (NOT "en") — the dashboard's single-language rule
       ".en { display:none !important }" (R31) used to swallow these whole
       rows: names+codes went invisible, only vacancy (job) rows stayed. */
    return '<div class="mpr em' + (isOpen ? " ex" : "") + (anim ? " in" : "") + '" style="' + style + '" data-i="' + esc(id) + '" data-t="emp">' +
      tw + ico + label + '<span class="mflex"></span>' + (trs.length ? '<span class="mtr" title="' + esc(T("mp_emp_transfers")) + '">' + trs.length + "</span>" : "") + pen + "</div>";
  }

  /* vacancy row — a required position with nobody in it */
  function vacRow(e, needle, anim, delay) {
    var id = e[0], job = String(e[3] || "");
    var adm = ADMIN
      ? '<span class="mo vf" role="button" tabindex="0" title="' + esc(T("mp_fill")) + '" data-vf="' + esc(id) + '">' + ICO_PLUS + "</span>" +
        '<span class="mo vx" role="button" tabindex="0" title="' + esc(T("mp_vac_del")) + '" data-vx="' + esc(id) + '">' + ICO_X + "</span>"
      : "";
    var style = "--d:" + (depthOf(e[4]) + 1) + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    return '<div class="mpr vn' + (anim ? " in" : "") + '" style="' + style + '" data-i="' + esc(id) + '" data-t="vac">' +
      '<span class="tw ghost"></span><span class="mi vac">' + ICO_GHOST + "</span>" +
      '<span class="ml"><b class="mln vln">' + esc(T("mp_vac")) + " — " + hl(TT(job) || T("mp_no_job"), needle) + "</b>" +
      '<i class="mls">' + esc(T("mp_vac_need")) + (e[7] ? " · " + esc(e[7]) : "") + "</i></span>" +
      '<span class="mflex"></span>' + adm + "</div>";
  }

  function depthOf(deptId) {
    var n = findByKey("d:" + deptId);
    return n ? n.depth : 0;
  }

  /* employee detail — the job is the headline (Expand الاسم ⇒ الوظيفة) */
  function empDetail(e) {
    var id = e[0], code = String(e[1] || ""), name = String(e[2] || ""), job = String(e[3] || "");
    var isNew = !code || code === "جديد";
    var node = findByKey("d:" + e[4]);
    var trs = transfersOf(id);
    var rows = "";
    for (var i = 0; i < trs.length; i++) {
      var t = trs[i];
      var from = (t[4] || "—") + " / " + (t[5] || "—");
      var to = (t[6] || "—") + " / " + (t[7] || "—");
      rows += '<div class="dtr"><span class="num dtd">' + esc(fmtWhen(t[0])) + '</span><span class="dta">' + esc(t[1]) +
        '</span><span class="dtp">' + esc(from) + ' <b>←</b> ' + esc(to) + "</span>" +
        (t[9] ? '<span class="dtn">' + esc(t[9]) + "</span>" : "") + "</div>";
    }
    /* R39: الكود أول حاجة بعد الاسم — الوظيفة بعدها (الاسم هو عنوان الصف) */
    return '<div class="mpr-det">' +
      '<div class="drow"><span>' + esc(T("mp_code")) + '</span><b class="num">' + (isNew ? esc(T("mp_code_new")) : esc(code)) + "</b></div>" +
      '<div class="drow job"><span>' + esc(T("mp_job")) + "</span><b>" + esc(job ? TT(job) : T("mp_no_job")) + "</b></div>" +
      '<div class="drow"><span>' + esc(T("mp_hire")) + '</span><b class="num">' + esc(e[5] || "—") + "</b></div>" +
      '<div class="drow"><span>' + esc(T("mp_dept")) + "</span><b>" + esc(node ? nodePathTT(node) : "—") + "</b></div>" +
      (trs.length ? '<div class="dth">' + esc(T("mp_emp_transfers")) + " (" + trs.length + ')</div><div class="dtrs">' + rows + "</div>" : "") +
      /* R39: حذف موظف من الموقع — للادمن بس، وبتأكيد، وبتسجيل خروج في الأرشيف */
      (ADMIN ? '<div class="mpm-btns det-del"><button type="button" class="mp-del" data-del="' + esc(id) + '">' + esc(T("mp_del_emp")) + "</button></div>" : "") +
      "</div>";
  }
  function nodePathTT(n) {
    var parts = [];
    var cur = n, guard = 0;
    while (cur && cur !== ROOT && guard++ < 30) {
      parts.unshift(/^\d+$/.test(cur.label) && cur.parentLabel === "SEWING" ? lineLabel(cur.label) : TT(cur.label));
      cur = parentOf(cur);
    }
    return parts.join(" - ");
  }

  function transfersOf(id) {
    if (!DATA || !DATA.transfers) return [];
    var out = [];
    for (var i = 0; i < DATA.transfers.length; i++) {
      var t = DATA.transfers[i];
      /* match by code OR name (new rows before they get a code) */
      if (String(t[2]) === String(id) || (t[3] && String(t[3]) === id)) out.push(t);
    }
    return out;
  }

  function renderTree(animKey) {
    var box = $("mpTree");
    if (!box) return;
    var ld = $("mpLoading"), em = $("mpEmpty");
    if (loading && !DATA) {
      box.innerHTML = "";
      if (ld) ld.hidden = false;
      if (em) em.hidden = true;
      return;
    }
    if (ld) ld.hidden = true;
    if (!DATA || !ROOT) { box.innerHTML = ""; return; }

    resetIndex();
    var needle = q.toLowerCase();
    var html = [];
    var shown = 0;
    var animIdx = 0;

    html.push(rootNodeRow());
    shown++;

    /* R39: سهم Marib 3 بقى بيفتح ويقفل بجد — قبل كده الصفوف كانت بتترسم
       دايمًا مهما حصل. البحث بيفضل الشجرة مفتوحة عشان النتايج تبان. */
    var rootOpen = needle ? true : !!expanded["root"];

    function walk(n, anim) {
      var kids = n.kids;
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (needle && !nodeMatches(c, needle)) continue;
        var ra = anim || animKey === "__all__" || (animKey != null && n.key === animKey);
        var delay = ra ? Math.min(animIdx++ * 12, 260) : undefined;
        html.push(deptRow(c, needle, ra, delay));
        shown++;
        var open = needle ? true : !!expanded[c.key];
        if (open) {
          walk(c, ra);
          /* employees under THIS dept node — الاسم والكود مع بعض */
          var emps = c.emps.slice().sort(function (a, b) {
            return String(a[2]).localeCompare(String(b[2]), "ar");
          });
          for (var j = 0; j < emps.length; j++) {
            var ed = ra ? Math.min(animIdx++ * 12, 260) : undefined;
            html.push(empRow(emps[j], needle, ra, ed));
            shown++;
            if (empOpen[emps[j][0]]) html.push(empDetail(emps[j]));
          }
          /* then the vacancies (ناقص ومحتاجينه) */
          for (var v = 0; v < c.vacs.length; v++) {
            var vd = ra ? Math.min(animIdx++ * 12, 260) : undefined;
            html.push(vacRow(c.vacs[v], needle, ra, vd));
            shown++;
          }
        }
      }
      /* employees hanging directly on n (n = ROOT or a mid-level node) */
      if (n === ROOT) return;
    }

    if (rootOpen) walk(ROOT, false);
    box.innerHTML = html.join("");
    if (em) em.hidden = shown > 1;
    var th = $("mpThead");
    if (th) th.hidden = shown === 0;
  }

  /* ---------------- render: archive ---------------- */
  function renderArch() {
    var box = $("mpArch"), em = $("mpArchEmpty");
    if (!box) return;
    if (!DATA) { box.innerHTML = ""; return; }
    var needle = archQ.toLowerCase();
    var html = [];
    var trs = DATA.transfers;
    for (var i = 0; i < trs.length; i++) {
      var t = trs[i];
      var hayS = (t[1] + " " + t[2] + " " + t[3] + " " + (t[4] || "") + " " + (t[5] || "") + " " + (t[6] || "") + " " + (t[7] || "") + " " + (t[8] || "") + " " + (t[9] || "")).toLowerCase();
      if (needle && hayS.indexOf(needle) < 0) continue;
      var kind = t[8] === "dept" || t[8] === "dept-move" ? "mp_kind_deptmove"
        : t[8] === "dept-rename" ? "mp_kind_rename"
        : t[8] === "fill" ? "mp_kind_fill"
        : t[8] === "out" ? "mp_kind_out"          /* R39: حذف/خروج */
        : t[8] === "dept" ? "mp_kind_dept"
        : t[8] === "job" ? "mp_kind_job"
        : "mp_kind_move";
      var isDeptOp = t[8] === "dept-move" || t[8] === "dept-rename";
      html.push('<div class="mpr ar in" style="--d:0">' +
        '<span class="arw num"><bdi>' + esc(fmtWhen(t[0])) + "</bdi></span>" +
        '<span class="ara">' + esc(t[1]) + "</span>" +
        '<span class="are">' + (isDeptOp ? esc(t[3]) : esc(t[3]) + ' <i class="num">' + esc(t[2]) + "</i>") + "</span>" +
        '<span class="arp">' + esc((t[4] || "—") + " / " + (t[5] || "—")) + ' <b>←</b> ' + esc((t[6] || "—") + " / " + (t[7] || "—")) + "</span>" +
        '<b class="ark">' + esc(T(kind)) + "</b>" +
        (t[9] ? '<i class="arn">' + esc(t[9]) + "</i>" : "") +
        "</div>");
    }
    box.innerHTML = html.join("");
    if (em) em.hidden = html.length > 0;
  }

  /* ---------------- render: all ---------------- */
  function renderAll(animAll) {
    renderHero();
    renderTree(animAll ? "__all__" : null);
    renderArch();
    fillLists();
    syncLangBtns();
  }

  function fillLists() {
    var dj = $("mpJobsList");
    if (dj) dj.innerHTML = jobsAll.map(function (j) { return '<option value="' + esc(j) + '">'; }).join("");
  }

  function syncLangBtns() {
    var cur = I18N.lang();
    var btns = document.querySelectorAll("#mpLang .sw-btn");
    btns.forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lang") === cur);
    });
  }

  /* ---------------- cascading قسم picker ----------------
     A row of selects: each level lists the children of the previous
     pick; the empty option = "finish here" (the trail so far IS the
     target node). Works for ANY depth. */
  function cascadeBuild(container, trail) {
    if (!container) return;
    /* trail = chosen ids top→down. select[0] lists the TOP depts with
       trail[0] selected; select[i] lists the children of trail[i-1] with
       trail[i] selected; the last select offers going DEEPER ("انتهي
       هنا" = the trail so far is the target). */
    var html = [];
    var parent = ROOT;
    for (var i = 0; i <= trail.length; i++) {
      var selected = i < trail.length ? trail[i] : "";
      html.push(cascadeSelectHTML(parent, selected));
      if (i < trail.length) parent = findByKey("d:" + trail[i]) || ROOT;
    }
    container.innerHTML = html.join("");
    container.querySelectorAll("select").forEach(function (sel, idx) {
      sel.addEventListener("change", function () {
        var v = sel.value;
        trail = trail.slice(0, idx);
        if (v) trail.push(v);
        cascadeBuild(container, trail);
      });
    });
    container._trail = trail;
  }
  function cascadeSelectHTML(parentNode, selected) {
    var kids = (parentNode === ROOT ? ROOT.kids : parentNode.kids).slice();
    /* keep the sheet order for the picker (ord asc), no variance sort */
    kids.sort(function (a, b) { return a.ord - b.ord; });
    var o = '<select class="mpc-sel"><option value="">' + esc(T("mp_stop_here")) + "</option>";
    for (var k = 0; k < kids.length; k++) {
      var lab = /^\d+$/.test(kids[k].label) && kids[k].parentLabel === "SEWING" ? lineLabel(kids[k].label) : TT(kids[k].label);
      o += '<option value="' + esc(kids[k].id) + '"' + (kids[k].id === selected ? " selected" : "") + ">" + esc(lab) + "</option>";
    }
    return o + "</select>";
  }
  function trailToId(trail) {
    return trail.length ? trail[trail.length - 1] : "";
  }

  /* ---------------- generic modal shell ---------------- */
  function modalOpen(cls, inner) {
    var m = document.createElement("div");
    m.className = "mp-modal";
    m.innerHTML = '<div class="mpm-card ' + (cls || "") + '" role="dialog" aria-modal="true">' + inner + "</div>";
    document.body.appendChild(m);
    m.addEventListener("mousedown", function (e) { if (e.target === m) m.remove(); });
    m.addEventListener("keydown", function (e) { if (e.key === "Escape") m.remove(); });
    requestAnimationFrame(function () { m.classList.add("on"); });
    return m;
  }

  /* ---------------- DEPT modal (rename + move) ---------------- */
  function openDeptModal(node) {
    if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
    /* R39: خانة الاسم بتوري الكلمة بنفس لغة الموقع (الخياطة / Sewing /
       Dikim) — مش الكلمة الإنجليزية اللي جوه الإكسل. إعادة التسمية بتتسجل
       بس لو الكلمة اتغيرت فعلاً عن اللي مكتوب قدامك. */
    var shown0 = deptLabel(node);
    var m = modalOpen("mpm-dept",
      '<h3>' + esc(T("mp_dept_edit")) + ': ' + esc(shown0) + "</h3>" +
      '<label><span>' + esc(T("mp_dept_name")) + '</span><input id="mdName" type="text" maxlength="90" value="' + esc(shown0) + '"></label>' +
      '<div class="md-sec"><b>' + esc(T("mp_dept_move")) + '</b><div class="mpc" id="mdMove"></div></div>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x" data-i18n="mp_cancel">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok" data-i18n="mp_save">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    var trail = [];
    var cur = parentOf(node), guard = 0;
    while (cur && cur !== ROOT && guard++ < 30) { trail.unshift(cur.id); cur = parentOf(cur); }
    cascadeBuild($("mdMove"), trail.slice());
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      var newName = $("mdName").value.trim();
      var newParent = trailToId($("mdMove")._trail || []);
      if (!newName) { toast(T("mp_fill"), "err"); return; }
      var renamed = newName !== shown0;   /* R39: compare against the shown word */
      var movedParent = newParent !== node.parent;
      if (!renamed && !movedParent) { m.remove(); return; }
      /* guard: can't move a node inside itself */
      var t = $("mdMove")._trail || [];
      if (t.indexOf(node.id) >= 0) { toast(T("mp_cycle"), "err"); return; }
      var chain = Promise.resolve();
      if (renamed) {
        chain = chain.then(function () {
          return MaribCloud.manpowerPost("deptRename", { id: node.id, name: newName });
        });
      }
      if (movedParent) {
        chain = chain.then(function () {
          return MaribCloud.manpowerPost("deptMove", { id: node.id, parentId: newParent });
        });
      }
      chain.then(function () {
        toast(T(renamed && movedParent ? "mp_renamed" : renamed ? "mp_renamed" : "mp_moved_dept"), "ok");
        m.remove();
        return reload();
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { $("mdName").focus(); $("mdName").select(); } catch (e) { } }, 60);
  }

  /* ---------------- ADD-DEPT modal ---------------- */
  function openDeptAdd() {
    if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
    var m = modalOpen("mpm-dept",
      '<h3>' + esc(T("mp_dept_add")) + "</h3>" +
      '<label><span>' + esc(T("mp_dept_name")) + '</span><input id="mdName" type="text" maxlength="90" autocomplete="off"></label>' +
      '<div class="md-sec"><b>' + esc(T("mp_dept_parent")) + '</b><div class="mpc" id="mdMove"></div></div>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x" data-i18n="mp_cancel">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok" data-i18n="mp_save">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    cascadeBuild($("mdMove"), []);
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      var name = $("mdName").value.trim();
      if (!name) { toast(T("mp_fill"), "err"); return; }
      var parentId = trailToId($("mdMove")._trail || []);
      MaribCloud.manpowerPost("deptAdd", { name: name, parentId: parentId }).then(function () {
        toast(T("mp_dept_added") + " — " + name, "ok");
        m.remove();
        return reload();
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { $("mdName").focus(); } catch (e) { } }, 60);
  }

  /* ---------------- EMPLOYEE modal (add / edit) ---------------- */
  function openEmpModal(emp, preset) {
    /* emp = existing tuple [id,code,name,job,deptId,hire,vac,note] | null */
    if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
    var editing = !!emp;
    var isNew = editing && (!emp[1] || emp[1] === "جديد");
    var m = modalOpen("",
      '<h3 id="mpmTitle">' + esc(T(editing ? "mp_edit" : preset && preset.fill ? "mp_vac_fill" : "mp_add_emp")) + "</h3>" +
      '<label><span data-i18n="mp_name">' + esc(T("mp_name")) + '</span><input id="mpmName" type="text" maxlength="90" autocomplete="off"></label>' +
      '<label><span data-i18n="mp_code">' + esc(T("mp_code")) + '</span><input id="mpmCode" type="text" maxlength="20" class="num" autocomplete="off" placeholder="' + esc(T("mp_code_ph")) + '"></label>' +
      '<label><span data-i18n="mp_job">' + esc(T("mp_job")) + '</span><input id="mpmJob" type="text" maxlength="90" list="mpJobsList" autocomplete="off"></label>' +
      (preset && preset.fill ? '' : '<div class="md-sec"><b data-i18n="mp_dept">' + esc(T("mp_dept")) + '</b><div class="mpc" id="mpmDept"></div></div>') +
      '<label><span data-i18n="mp_hire">' + esc(T("mp_hire")) + '</span><input id="mpmHire" type="date" class="num"></label>' +
      '<datalist id="mpJobsList"></datalist>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x" data-i18n="mp_cancel">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok" data-i18n="mp_save">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    fillLists();
    $("mpmName").value = editing ? emp[2] : "";
    $("mpmCode").value = editing ? (emp[1] || "") : "";
    $("mpmCode").readOnly = editing && !isNew;
    $("mpmJob").value = editing ? (emp[3] || "") : (preset && preset.job ? preset.job : "");
    $("mpmHire").value = editing ? (emp[5] || "") : "";
    var trail = [];
    if (editing) {
      var cur = findByKey("d:" + emp[4]), guard = 0;
      while (cur && cur !== ROOT && guard++ < 30) { trail.unshift(cur.id); cur = parentOf(cur); }
    }
    if (!(preset && preset.fill)) cascadeBuild($("mpmDept"), trail.slice());   /* fill: the vacancy fixes the dept */
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      var name = $("mpmName").value.trim();
      var code = $("mpmCode").value.trim();
      var job = $("mpmJob").value.trim();
      var hire = $("mpmHire").value;
      var deptEl = $("mpmDept");
      var deptId = deptEl ? trailToId(deptEl._trail || []) : "";
      if (!name || (!deptId && !(preset && preset.fill))) { toast(T("mp_fill"), "err"); return; }
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) { toast(T("mp_fill"), "err"); return; }
      if (editing) {
        var oldNode = findByKey("d:" + emp[4]);
        var newNode = findByKey("d:" + deptId);
        var moved = (oldNode && newNode && oldNode.key !== newNode.key) || job !== (emp[3] || "");
        if (moved && !window.confirm(T("mp_confirm_edit"))) return;
        save({ action: "edit", id: emp[0], code: code, name: name, job: job, deptId: deptId, hire: hire },
          moved ? T("mp_moved") : T("mp_saved"), true);
        m.remove();
      } else if (preset && preset.fill) {
        save({ action: "fill", id: preset.vacId, code: code, name: name, hire: hire }, T("mp_filled"), true);
        m.remove();
      } else {
        save({ action: "add", code: code, name: name, job: job, deptId: deptId, hire: hire }, T("mp_added"), true)
          .then(function () { m.remove(); })
          .catch(function (e) {
            if (e && e.status === 409) toast(T("mp_dup"), "err");
          });
      }
    });
    setTimeout(function () { try { $("mpmName").focus(); } catch (e) { } }, 60);
  }

  /* ---------------- required-count popover (manual override) ---------------- */
  var pop = null;
  function closeReqPop() {
    if (pop) { pop.remove(); pop = null; }
  }
  function openReqPop(chip) {
    closeReqPop();
    var key = chip.getAttribute("data-rk");
    var own = chip.getAttribute("data-own");
    pop = document.createElement("div");
    pop.className = "mp-reqpop";
    pop.innerHTML =
      '<label class="rp-t">' + esc(T("mp_req_edit")) + " " + esc(T("mp_req_hint2")) + '</label>' +
      '<input type="number" min="0" max="99999" step="1" class="rp-in num" value="' + (own === null || own === undefined ? "" : own) + '">' +
      '<span class="rp-btns">' +
      '<button type="button" class="rp-x">' + esc(T("mp_clear")) + "</button>" +
      '<button type="button" class="rp-ok">' + esc(T("mp_set")) + "</button>" +
      "</span>";
    document.body.appendChild(pop);
    var r = chip.getBoundingClientRect();
    var isRTL = (document.documentElement.dir || "rtl") === "rtl";
    pop.style.top = Math.max(8, Math.min(window.innerHeight - 140, r.bottom + 6)) + "px";
    var pw = pop.offsetWidth || 240;
    var left = isRTL ? Math.max(8, Math.min(window.innerWidth - pw - 8, r.left - pw + r.width)) : Math.max(8, Math.min(window.innerWidth - pw - 8, r.left));
    pop.style.left = left + "px";
    var inp = pop.querySelector(".rp-in");
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 30);
    pop.querySelector(".rp-ok").addEventListener("click", function () {
      var v = inp.value.trim();
      if (v === "") return;
      var n = parseInt(v, 10);
      if (isNaN(n) || n < 0) { toast(T("mp_fill"), "err"); return; }
      save({ action: "req", key: key, required: n }, T("mp_req_saved"), true);
      closeReqPop();
    });
    pop.querySelector(".rp-x").addEventListener("click", function () {
      save({ action: "req", key: key, required: null }, T("mp_req_saved"), true);
      closeReqPop();
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") pop.querySelector(".rp-ok").click();
      if (e.key === "Escape") closeReqPop();
    });
    setTimeout(function () {
      document.addEventListener("mousedown", outCloser, true);
    }, 50);
  }
  function outCloser(e) {
    if (pop && !pop.contains(e.target) && !(e.target.classList && e.target.classList.contains("r"))) {
      closeReqPop();
      document.removeEventListener("mousedown", outCloser, true);
    }
  }

  /* ---------------- save helper ---------------- */
  function save(payload, okMsg, keepOpen) {
    return MaribCloud.manpowerPost(payload.action, payload).then(function (r) {
      if (okMsg) toast(okMsg, "ok");
      return reload().then(function () { return r; });
    }).catch(function (e) {
      if (e && e.status === 403) toast(T("mp_need_admin"), "err");
      else if (e && e.status === 409) toast(T("mp_dup"), "err");
      else toast(T("toast_sync_err"), "err");
      throw e;
    });
  }

  /* ---------------- Excel import (رفع شيت Manpower) ----------------
     Finds the right sheet anywhere in the workbook:
       · NEW Database format — headers: الكود + الأسم + الادارة + القسم
         (+ القسم الداخلي + الوظيفة …) → rows carry the 3-level chain
         and vacancy rows (empty name = required-but-unfilled)
       · OLD Employees-DB format — الكود + الموظف + الإدارة (" - " path) */
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "/app/xlsx.full.min.js";
      s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error("XLSX missing")); };
      s.onerror = function () { rej(new Error("XLSX load failed")); };
      document.head.appendChild(s);
    });
  }
  function xlsxDate(v) {
    if (v == null) return "";
    if (v instanceof Date) {
      function p2(n) { return (n < 10 ? "0" : "") + n; }
      return v.getFullYear() + "-" + p2(v.getMonth() + 1) + "-" + p2(v.getDate());
    }
    if (typeof v === "number" && isFinite(v)) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + (d.getUTCDate())).slice(-2);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : "";
  }
  function importExcel(file) {
    ensureXLSX().then(function (XLSX) {
      var fr = new FileReader();
      fr.onload = function (ev) {
        try {
          var wb = XLSX.read(ev.target.result, { type: "array", cellDates: true });
          var best = null;   /* {sheet, map, hRow, isNew} */
          for (var si = 0; si < wb.SheetNames.length; si++) {
            var ws = wb.Sheets[wb.SheetNames[si]];
            var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
            for (var r = 0; r < Math.min(grid.length, 25); r++) {
              var row = grid[r] || [];
              var map = {};
              for (var c = 0; c < row.length; c++) {
                var h = String(row[c] || "").trim();
                if (!h) continue;
                if (h.indexOf("الكود") >= 0) map.code = c;
                else if (h.indexOf("الأسم") >= 0 || h.indexOf("الاسم") >= 0 || h.indexOf("الموظف") >= 0) map.name = c;
                else if (h.indexOf("الادارة") >= 0 || h.indexOf("الإدارة") >= 0 || h.indexOf("الاداره") >= 0) map.dept = c;
                else if (h.indexOf("القسم الداخلي") >= 0) map.sub = c;
                else if (h.indexOf("القسم") >= 0) map.sec = c;
                else if (h.indexOf("الوظيفة") >= 0) map.job = c;
                else if (h.indexOf("ملاحظات") >= 0) map.note = c;
                else if (h.indexOf("التعيين") >= 0) map.hire = c;
              }
              if (map.code !== undefined && map.name !== undefined && map.dept !== undefined) {
                var isNewFmt = map.sec !== undefined;
                var score = (isNewFmt ? 10 : 5) + (wb.SheetNames[si] === "Database" ? 1 : 0);
                if (!best || score > best.score) {
                  best = { sheet: wb.SheetNames[si], grid: grid, hRow: r, map: map, isNew: isNewFmt, score: score };
                }
              }
            }
          }
          if (!best) { toast(T("mp_import_hint"), "err"); return; }
          var rows = [];
          var filled = 0, vacs = 0;
          /* merged-cell continuation rows: blank dept/sec cells belong to
             the block above — forward-fill exactly like the seed did */
          var lastDept = "", lastSec = "";
          for (var r2 = best.hRow + 1; r2 < best.grid.length; r2++) {
            var g = best.grid[r2] || [];
            var get = function (k) { return best.map[k] !== undefined ? g[best.map[k]] : ""; };
            var name = String(get("name") == null ? "" : get("name")).trim();
            var job = String(get("job") == null ? "" : get("job")).trim();
            if (best.isNew) {
              var dept = String(get("dept") == null ? "" : get("dept")).trim();
              var sec = String(get("sec") == null ? "" : get("sec")).trim();
              var sub = best.map.sub !== undefined ? String(get("sub") == null ? "" : get("sub")).trim() : "";
              if (!dept && (name || job) && lastDept) { dept = lastDept; if (!sec && sub) sec = lastSec; }
              if (dept) { lastDept = dept; lastSec = sec; }
              if (!dept && !sec && !sub) continue;
              if (!name && !job) continue; /* garbage row */
              var vac = !name ? 1 : 0;
              if (vac) vacs++; else filled++;
              rows.push([
                String(get("code") == null ? "" : get("code")).trim().slice(0, 20),
                name.slice(0, 90), dept.slice(0, 90), sec.slice(0, 90), sub.slice(0, 90),
                job.slice(0, 90),
                String(get("note") == null ? "" : get("note")).trim().slice(0, 60),
                xlsxDate(get("hire")),
                vac
              ]);
            } else {
              var code = String(get("code") == null ? "" : get("code")).trim();
              if (!code || !name || code === "جديد") continue;
              filled++;
              rows.push([code.slice(0, 20), name.slice(0, 90),
                String(get("job") == null ? "" : get("job")).trim().slice(0, 90),
                String(get("dept") == null ? "" : get("dept")).trim().slice(0, 190),
                xlsxDate(get("hire"))]);
            }
          }
          if (!rows.length) { toast(T("mp_search_none"), "err"); return; }
          var msg = T("mp_confirm_import").replace("{r}", rows.length).replace("{f}", filled).replace("{v}", vacs);
          if (!window.confirm(msg)) return;
          save({ action: "import", rows: rows }, "", false).then(function (r) {
            var bits = [T("mp_import_done") + " — " + (r ? r.total : rows.length)];
            if (r && r.codeFilled) bits.push(T("mp_code_filled") + " " + r.codeFilled);
            if (r && r.moved) bits.push(T("mp_moved_n") + " " + r.moved);
            if (r && r.keptOut) bits.push(T("mp_kept_out") + " " + r.keptOut);
            toast(bits.join(" · "), "ok");
          }).catch(function () { });
        } catch (e) {
          toast(T("toast_sync_err"), "err");
        }
      };
      fr.onerror = function () { toast(T("toast_sync_err"), "err"); };
      fr.readAsArrayBuffer(file);
    }).catch(function () { toast(T("toast_sync_err"), "err"); });
  }

  /* ---------------- reload ---------------- */
  function reload() {
    loading = true;
    renderTree();
    return MaribCloud.manpowerGet().then(function (r) {
      DATA = { depts: r.depts || [], emps: r.emps || [], req: r.req || {}, transfers: r.transfers || [] };
      loaded = true;
      loading = false;
      buildTree();
      renderAll(true);
    }).catch(function () {
      loading = false;
      renderTree();
      toast(T("toast_sync_err"), "err");
    });
  }

  /* ---------------- show / hide ---------------- */
  function show() {
    on = true;
    ADMIN = !!(window.MaribAuth && MaribAuth.isAdmin && MaribAuth.isAdmin());
    document.body.classList.add("mp-on");
    var w = $("mpWrap");
    if (w) w.hidden = false;
    var add = $("mpAddBtn"), imp = $("mpImportBtn"), dad = $("mpDeptBtn"), exp = $("mpExportBtn");
    if (add) add.style.display = ADMIN ? "" : "none";
    if (imp) imp.style.display = ADMIN ? "" : "none";
    if (dad) dad.style.display = ADMIN ? "" : "none";
    if (exp) exp.style.display = "";   /* R39: التصدير متاح لكل المسجلين — قراءة بس */
    if (!loaded && !loading) reload();
    else renderAll();
  }
  function hide() {
    on = false;
    document.body.classList.remove("mp-on");
    var w = $("mpWrap");
    if (w) w.hidden = true;
    closeReqPop();
  }

  /* ---------------- bindings ---------------- */
  function findEmp(id) {
    if (!DATA) return null;
    for (var i = 0; i < DATA.emps.length; i++) {
      if (String(DATA.emps[i][0]) === String(id)) return DATA.emps[i];
    }
    return null;
  }

  function bind() {
    var s = $("mpSearch");
    if (s) {
      var deb = null;
      s.addEventListener("input", function () {
        clearTimeout(deb);
        deb = setTimeout(function () { q = s.value.trim(); renderTree("__all__"); }, 130);
      });
    }
    var as = $("mpArchSearch");
    if (as) {
      var deb2 = null;
      as.addEventListener("input", function () {
        clearTimeout(deb2);
        deb2 = setTimeout(function () { archQ = as.value.trim(); renderArch(); }, 130);
      });
    }
    var tabT = $("mpTabTree"), tabA = $("mpTabArch");
    if (tabT) tabT.addEventListener("click", function () { setView("tree"); });
    if (tabA) tabA.addEventListener("click", function () { setView("arch"); });
    var back = $("mpBack");
    if (back) back.addEventListener("click", function () {
      if (window.MaribAuth && MaribAuth.showGate) MaribAuth.showGate();
    });
    var ex = $("mpExpandAll"), cx = $("mpCollapseAll");
    if (ex) ex.addEventListener("click", function () {
      expanded = { root: true };
      (function mark(n) {
        for (var k = 0; k < n.kids.length; k++) { expanded[n.kids[k].key] = true; mark(n.kids[k]); }
      })(ROOT || { kids: [] });
      renderTree("__all__");
    });
    if (cx) cx.addEventListener("click", function () {
      expanded = {};   /* R39: تقفيل الكل = تقفيل Marib 3 نفسه كمان */
      empOpen = {};
      renderTree();
    });
    var add = $("mpAddBtn");
    if (add) add.addEventListener("click", function () { openEmpModal(null, null); });
    var dad = $("mpDeptBtn");
    if (dad) dad.addEventListener("click", openDeptAdd);
    var imp = $("mpImportBtn");
    if (imp) imp.addEventListener("click", function () {
      var pick = $("mpXlsxPick");
      if (pick) pick.click();
    });
    var pick = $("mpXlsxPick");
    if (pick) pick.addEventListener("change", function () {
      var f = pick.files && pick.files[0];
      pick.value = "";
      if (f) importExcel(f);
    });

    /* R39: تصدير الهيكل كله كإكسل (باترن + هيكل + موظفين + أرشيف) —
       السيرفر هو اللي بيبني الملف فالموقع بيفضل خفيف */
    var exp = $("mpExportBtn");
    if (exp) exp.addEventListener("click", function () {
      exp.disabled = true;
      toast(T("mp_export_going"), "");
      var d = new Date();
      function p2(n) { return (n < 10 ? "0" : "") + n; }
      var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
      fetch("/api/manpower/export", { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error("export " + r.status);
          return r.blob();
        })
        .then(function (b) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = "Manpower-Marib3-" + stamp + ".xlsx";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
          toast(T("mp_export_done"), "ok");
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); })
        .then(function () { exp.disabled = false; });
    });

    /* tree interaction — one delegated listener */
    var tree = $("mpTree");
    if (tree) tree.addEventListener("click", function (e) {
      var el = e.target;
      var reqChipEl = el.closest ? el.closest(".mn.r") : null;
      if (reqChipEl && reqChipEl.classList.contains("ed")) {
        e.stopPropagation();
        openReqPop(reqChipEl);
        return;
      }
      /* vacancy actions */
      var vf = el.closest ? el.closest(".mo.vf") : null;
      if (vf) {
        e.stopPropagation();
        var emp = findEmp(vf.getAttribute("data-vf"));
        if (emp) openEmpModal(null, { fill: true, vacId: emp[0], job: emp[3] });
        return;
      }
      var vx = el.closest ? el.closest(".mo.vx") : null;
      if (vx) {
        e.stopPropagation();
        if (!window.confirm(T("mp_confirm_vacdel"))) return;
        save({ action: "vacDel", id: vx.getAttribute("data-vx") }, T("mp_vac_deleted"), true);
        return;
      }
      /* R39: حذف موظف (زرار جوه كارت التفاصيل) */
      var del = el.closest ? el.closest(".mp-del") : null;
      if (del) {
        e.stopPropagation();
        var e3 = findEmp(del.getAttribute("data-del"));
        if (e3 && window.confirm(T("mp_confirm_del").replace("{n}", e3[2]))) {
          save({ action: "del", id: e3[0] }, T("mp_deleted"), true);
        }
        return;
      }
      /* dept edit (rename + move in ONE modal) */
      var rn = el.closest ? el.closest(".mo.rn") : null;
      if (rn) {
        e.stopPropagation();
        var nn = findByKey("d:" + rn.getAttribute("data-rn"));
        if (nn) openDeptModal(nn);
        return;
      }
      /* employee edit */
      var pen = el.closest ? el.closest(".mo") : null;
      if (pen) {
        e.stopPropagation();
        var ei = pen.getAttribute("data-ei");
        if (ei) {
          var e2 = findEmp(ei);
          if (e2) openEmpModal(e2, null);
        }
        return;
      }
      var row = el.closest ? el.closest(".mpr") : null;
      if (!row) return;
      var t = row.getAttribute("data-t");
      if (t === "emp") {
        var c = row.getAttribute("data-i");
        empOpen[c] = !empOpen[c];
        renderTree();
      } else if (t === "vac") {
        return;   /* vacancy rows act through their icons */
      } else {
        var k = row.getAttribute("data-k");
        var opening = !expanded[k];
        expanded[k] = opening;
        renderTree(opening ? k : null);
      }
    });

    /* language switch (the shell's one is hidden in mp mode) */
    document.querySelectorAll("#mpLang .sw-btn").forEach(function (b) {
      b.addEventListener("click", function () { I18N.setLang(b.getAttribute("data-lang")); });
    });

    /* re-render everything when the language flips (glossary included) */
    I18N.onChange(function () {
      if (!on) return;
      if (DATA) { buildTree(); renderAll(); }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && on) {
        closeReqPop();
        var modals = document.querySelectorAll(".mp-modal");
        modals.forEach(function (m) { m.remove(); });
      }
    });
  }

  function setView(v) {
    view = v;
    var t = $("mpTabTree"), a = $("mpTabArch");
    if (t) t.classList.toggle("on", v === "tree");
    if (a) a.classList.toggle("on", v === "arch");
    var vt = $("mpViewTree"), va = $("mpViewArch");
    if (vt) vt.classList.toggle("on", v === "tree");
    if (va) va.classList.toggle("on", v === "arch");
  }

  document.addEventListener("DOMContentLoaded", function () {
    expanded = { root: true };   /* Marib 3 starts open — departments visible immediately */
    bind();
  });

  return {
    show: show,
    hide: hide,
    reload: reload
  };
})();
