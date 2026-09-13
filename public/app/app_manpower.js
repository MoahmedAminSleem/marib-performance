/* ============================================================
   MaribManpower — R37 الاتزان (manpower balance)
   Hierarchy from the Employees Database: الإدارة levels (" - "
   split) → الوظيفة → الموظف (name + code). Every node shows:
     العدد الحالي · العدد المطلوب · الفرق (red shortage / green
     surplus / neutral zero · "—" while required is unset)
   + أرشيف النقل: every dept/job change writes a dated transfer
     row with WHO did it. Admins edit inline (add / edit / required
     / Excel import); viewers get the clean read-only tree.
   All tree math is client-side — one GET per session keeps the
   server light.
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
    toast._t = setTimeout(function () { t.className = ""; }, 3600);
  }

  /* ---------------- icons ---------------- */
  var ICO_DEPT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>';
  var ICO_JOB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V4h7z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>';
  var ICO_EMP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.4-3.8 4.2-5.7 7.5-5.7s6.1 1.9 7.5 5.7"/></svg>';
  var ICO_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  var ICO_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>';

  /* ---------------- state ---------------- */
  var DATA = null;        /* {emps:[[code,name,job,dept,hire]], req:{}, transfers:[[]]} */
  var ROOT = null;
  var expanded = {};      /* nodeKey → true (dept + job nodes) */
  var empOpen = {};       /* code → true (employee detail card) */
  var q = "";             /* tree search */
  var archQ = "";         /* archive search */
  var view = "tree";      /* tree | arch */
  var loaded = false;
  var loading = false;
  var on = false;
  var ADMIN = false;
  var jobsAll = [];       /* unique job names (datalist) */
  var deptsAll = [];      /* unique full dept paths (datalist) */

  function dKey(path) { return "d:" + path; }
  function jKey(path, job) { return "j:" + path + "|" + job; }
  function splitDept(p) {
    return String(p || "").split(" - ").map(function (s) { return s.trim(); }).filter(function (s) { return !!s; });
  }
  function fmtWhen(iso) {
    var d = new Date(iso);
    if (!d || isNaN(d.getTime())) return String(iso || "");
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  /* ---------------- data ---------------- */
  function reload() {
    loading = true;
    renderTree();   /* shows the loading face while fetching */
    return MaribCloud.manpowerGet().then(function (r) {
      DATA = { emps: r.emps || [], req: r.req || {}, transfers: r.transfers || [] };
      loaded = true;
      loading = false;
      buildTree();
      renderAll(true);   /* first paint of the data cascades in */
    }).catch(function () {
      loading = false;
      renderTree();
      toast(T("toast_sync_err"), "err");
    });
  }

  /* ---------------- tree ---------------- */
  function mkNode(key, label, depth, isJob) {
    return { key: key, label: label, depth: depth, job: !!isJob, path: "",
             children: {}, jobs: {}, emps: [], count: 0, own: null, eff: null, kids: [] };
  }

  function buildTree() {
    ROOT = mkNode("", "", -1, false);
    ROOT.path = "";
    for (var i = 0; i < DATA.emps.length; i++) {
      var e = DATA.emps[i];
      var parts = splitDept(e[3]);
      var node = ROOT, path = "";
      for (var d = 0; d < parts.length; d++) {
        path = path ? path + " - " + parts[d] : parts[d];
        var k = dKey(path);
        if (!node.children[k]) {
          node.children[k] = mkNode(k, parts[d], d, false);
          node.children[k].path = path;
        }
        node = node.children[k];
      }
      var jobName = e[2] || "";
      var jk = jKey(e[3], jobName);
      if (!node.jobs[jk]) {
        node.jobs[jk] = mkNode(jk, jobName, parts.length, true);
        node.jobs[jk].path = e[3];
      }
      node.jobs[jk].emps.push(e);
    }

    /* bottom-up: counts + required roll-up (own value wins, else the
       sum of descendants; null when nothing is set below). The kids are
       sorted AFTER the roll so variance/count are already computed. */
    (function roll(n) {
      n.count = n.emps.length;
      n.own = (n.key && DATA.req[n.key] !== undefined) ? DATA.req[n.key] : null;
      var sum = null;
      var kids = [];
      for (var k in n.jobs) kids.push(n.jobs[k]);
      for (var c in n.children) kids.push(n.children[c]);
      for (var i = 0; i < kids.length; i++) {
        roll(kids[i]);
        n.count += kids[i].count;
        if (kids[i].eff !== null) sum = (sum === null ? 0 : sum) + kids[i].eff;
      }
      n.eff = n.own !== null ? n.own : sum;
      /* shortage first (variance asc), unset last, then biggest first */
      kids.sort(function (a, b) {
        var va = a.eff === null ? null : a.count - a.eff;
        var vb = b.eff === null ? null : b.count - b.eff;
        if (va === null && vb === null) return b.count - a.count;
        if (va === null) return 1;
        if (vb === null) return -1;
        if (va !== vb) return va - vb;
        return b.count - a.count;
      });
      n.kids = kids;
    })(ROOT);

    /* datalists */
    var seen = {};
    jobsAll = []; deptsAll = [];
    for (var j = 0; j < DATA.emps.length; j++) {
      var jb = DATA.emps[j][2];
      if (jb && !seen[jb]) { seen[jb] = 1; jobsAll.push(jb); }
    }
    seen = {};
    (function walkDepts(n) {
      for (var k in n.children) {
        var c = n.children[k];
        if (!seen[c.path]) { seen[c.path] = 1; deptsAll.push(c.path); }
        walkDepts(c);
      }
    })(ROOT);
    jobsAll.sort();
    deptsAll.sort();
  }

  /* ---------------- search relevance ---------------- */
  function nodeMatches(n, needle) {
    if (n.job) {
      if (n.label.toLowerCase().indexOf(needle) >= 0) return true;
    } else if (n.path.toLowerCase().indexOf(needle) >= 0) return true;
    for (var i = 0; i < n.emps.length; i++) {
      var e = n.emps[i];
      if (e[1].toLowerCase().indexOf(needle) >= 0 || String(e[0]).indexOf(needle) >= 0) return true;
    }
    for (var k in n.children) if (nodeMatches(n.children[k], needle)) return true;
    for (var kj in n.jobs) if (nodeMatches(n.jobs[kj], needle)) return true;
    return false;
  }

  /* ---------------- render: hero ---------------- */
  function renderHero() {
    var h = $("mpHero");
    if (!h) return;
    var top = ROOT ? ROOT.kids : [];
    var jobCount = jobsAll.length;
    var totReq = ROOT && ROOT.eff !== null ? ROOT.eff : null;
    var totVar = totReq === null ? null : ROOT.count - totReq;
    function card(cls, big, label) {
      return '<div class="mph-card ' + (cls || "") + '"><b class="num"><bdi>' + big + '</bdi></b><small>' + esc(label) + "</small></div>";
    }
    var varCls = totVar === null ? "" : totVar < 0 ? "neg" : totVar > 0 ? "pos" : "zero";
    var varBig = totVar === null ? "—" : (totVar > 0 ? "+" : "") + totVar;
    h.innerHTML =
      card("", String(ROOT ? ROOT.count : 0), T("mp_total_emp")) +
      card("", String(top.length), T("mp_depts")) +
      card("", String(jobCount), T("mp_jobs")) +
      card("req", totReq === null ? "—" : String(totReq), T("mp_total_req")) +
      card(varCls, varBig, T("mp_total_var"));
  }

  /* ---------------- render: tree ---------------- */
  function hl(text, needle) {
    /* highlight the matched part (needle already lowercase) */
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
    var pct = Math.max(0, Math.min(100, Math.round(n.count / n.eff * 100)));
    var cls = n.count < n.eff ? "short" : n.count > n.eff ? "over" : "";
    return '<span class="mbar"><i class="' + cls + '" style="width:' + pct + '%"></i></span>';
  }

  function nodeRow(n, needle, anim, delay) {
    var isOpen = !!expanded[n.key];
    var hasKids = n.kids.length > 0;
    var tw = hasKids
      ? '<button class="tw' + (isOpen ? " open" : "") + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-label="' + esc(n.label) + '">' + ICO_CHEV + "</button>"
      : '<span class="tw ghost"></span>';
    var ico = '<span class="mi ' + (n.job ? "job" : "dept") + '">' + (n.job ? ICO_JOB : ICO_DEPT) + "</span>";
    var label = n.job
      ? '<span class="ml">' + hl(n.label || T("mp_no_job"), needle) + '<small class="mls">' + esc(n.count) + " " + esc(T("mp_count_emp")) + "</small></span>"
      : '<span class="ml">' + hl(n.label, needle) + "</span>";
    var style = "--d:" + n.depth + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    return '<div class="mpr ' + (n.job ? "jn" : "dn") + (anim ? " in" : "") + '" style="' + style + '" data-k="' + esc(n.key) + '" data-t="' + (n.job ? "job" : "dept") + '">' +
      tw + ico + label + bar(n) +
      '<b class="mn a"><bdi>' + n.count + "</bdi></b>" + reqChip(n) + varBadge(n.count, n.eff) +
      "</div>";
  }

  function empRow(e, needle, anim, delay) {
    var code = String(e[0]);
    var isOpen = !!empOpen[code];
    var trs = transfersOf(code);
    var tw = '<button class="tw' + (isOpen ? " open" : "") + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-label="' + esc(e[1]) + '">' + ICO_CHEV + "</button>";
    var ico = '<span class="mi emp">' + ICO_EMP + "</span>";
    var label = '<span class="ml"><b class="mln">' + hl(e[1], needle) + '</b><i class="mlc num">' + hl(code, needle) + "</i>" +
      (e[2] ? '<small class="mls">' + hl(e[2], needle) + "</small>" : "") + "</span>";
    var pen = ADMIN ? '<span class="mo" role="button" tabindex="0" title="' + esc(T("mp_edit")) + '" data-code="' + esc(code) + '">' + ICO_PEN + "</span>" : "";
    var right = e[4] ? '<b class="mh num"><bdi>' + esc(e[4]) + "</bdi></b>" : '<b class="mh"></b>';
    var style = "--d:" + (e[3] ? splitDept(e[3]).length : 0) + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    return '<div class="mpr en' + (isOpen ? " ex" : "") + (anim ? " in" : "") + '" style="' + style + '" data-c="' + esc(code) + '" data-t="emp">' +
      tw + ico + label + right + pen + (trs.length ? '<span class="mtr">' + trs.length + "</span>" : "") +
      "</div>";
  }

  function transfersOf(code) {
    if (!DATA || !DATA.transfers) return [];
    var out = [];
    for (var i = 0; i < DATA.transfers.length; i++) {
      if (String(DATA.transfers[i][2]) === String(code)) out.push(DATA.transfers[i]);
    }
    return out;
  }

  function empDetail(e) {
    var code = String(e[0]);
    var trs = transfersOf(code);
    var rows = "";
    for (var i = 0; i < trs.length; i++) {
      var t = trs[i];
      var from = (t[4] || "—") + " / " + (t[5] || "—");
      var to = (t[6] || "—") + " / " + (t[7] || "—");
      rows += '<div class="dtr"><span class="num dtd">' + esc(fmtWhen(t[0])) + '</span><span class="dta">' + esc(t[1]) +
        '</span><span class="dtp">' + esc(from) + ' <b>←</b> ' + esc(to) + "</span></div>";
    }
    return '<div class="mpr-det">' +
      '<div class="drow"><span>' + esc(T("mp_job")) + "</span><b>" + esc(e[2] || T("mp_no_job")) + "</b></div>" +
      '<div class="drow"><span>' + esc(T("mp_code")) + '</span><b class="num">' + esc(code) + "</b></div>" +
      '<div class="drow"><span>' + esc(T("mp_hire")) + '</span><b class="num">' + esc(e[4] || "—") + "</b></div>" +
      '<div class="drow"><span>' + esc(T("mp_dept")) + "</span><b>" + esc(e[3] || "—") + "</b></div>" +
      (trs.length ? '<div class="dth">' + esc(T("mp_emp_transfers")) + " (" + trs.length + ')</div><div class="dtrs">' + rows + "</div>" : "") +
      "</div>";
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

    var needle = q.toLowerCase();
    var html = [];
    var shown = 0;
    var animIdx = 0;

    /* animKey = the node whose subtree just opened (its new rows
       cascade in with a small stagger) · "__all__" = animate everything
       (search change / first load) · undefined = no animation */
    function walk(n, anim) {
      var kids = n.kids;
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (needle && !nodeMatches(c, needle)) continue;
        var ra = anim || animKey === "__all__" || (animKey != null && n.key === animKey);
        var delay = ra ? Math.min(animIdx++ * 12, 260) : undefined;
        html.push(nodeRow(c, needle, ra, delay));
        shown++;
        var open = needle ? true : !!expanded[c.key];   /* search auto-expands */
        if (c.job) {
          if (open) {
            var emps = c.emps.slice().sort(function (a, b) { return a[1].localeCompare(b[1], "ar"); });
            for (var j = 0; j < emps.length; j++) {
              var ed = ra ? Math.min(animIdx++ * 12, 260) : undefined;
              html.push(empRow(emps[j], needle, ra, ed));
              shown++;
              if (empOpen[String(emps[j][0])]) html.push(empDetail(emps[j]));
            }
          }
        } else if (open) {
          walk(c, ra);
        }
      }
    }

    walk(ROOT, false);
    box.innerHTML = html.join("");
    if (em) em.hidden = shown > 0;
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
      var hay = (t[1] + " " + t[2] + " " + t[3] + " " + (t[4] || "") + " " + (t[5] || "") + " " + (t[6] || "") + " " + (t[7] || "")).toLowerCase();
      if (needle && hay.indexOf(needle) < 0) continue;
      var kind = t[8] === "dept" ? "mp_kind_dept" : t[8] === "job" ? "mp_kind_job" : "mp_kind_move";
      html.push('<div class="mpr ar in" style="--d:0">' +
        '<span class="arw num"><bdi>' + esc(fmtWhen(t[0])) + "</bdi></span>" +
        '<span class="ara">' + esc(t[1]) + "</span>" +
        '<span class="are">' + esc(t[3]) + ' <i class="num">' + esc(t[2]) + "</i></span>" +
        '<span class="arp">' + esc((t[4] || "—") + " / " + (t[5] || "—")) + ' <b>←</b> ' + esc((t[6] || "—") + " / " + (t[7] || "—")) + "</span>" +
        '<b class="ark">' + esc(T(kind)) + "</b>" +
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
    var dj = $("mpJobsList"), dd = $("mpDeptsList");
    if (dj) dj.innerHTML = jobsAll.map(function (j) { return '<option value="' + esc(j) + '">'; }).join("");
    if (dd) dd.innerHTML = deptsAll.map(function (d) { return '<option value="' + esc(d) + '">'; }).join("");
  }

  function syncLangBtns() {
    var cur = I18N.lang();
    var btns = document.querySelectorAll("#mpLang .sw-btn");
    btns.forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lang") === cur);
    });
  }

  /* ---------------- required-count popover ---------------- */
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
      '<label class="rp-t">' + esc(T("mp_req_edit")) + '</label>' +
      '<input type="number" min="0" max="99999" step="1" class="rp-in num" value="' + (own === null || own === undefined ? "" : own) + '">' +
      '<span class="rp-btns">' +
      '<button type="button" class="rp-x">' + esc(T("mp_clear")) + "</button>" +
      '<button type="button" class="rp-ok">' + esc(T("mp_set")) + "</button>" +
      "</span>";
    document.body.appendChild(pop);
    var r = chip.getBoundingClientRect();
    var isRTL = (document.documentElement.dir || "rtl") === "rtl";
    pop.style.top = Math.max(8, Math.min(window.innerHeight - 130, r.bottom + 6)) + "px";
    var pw = pop.offsetWidth || 220;
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

  /* ---------------- employee modal (add / edit) ---------------- */
  var modal = null;
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "mp-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="mpm-card" role="dialog" aria-modal="true">' +
      '<h3 id="mpmTitle"></h3>' +
      '<label><span data-i18n="mp_name">الاسم</span><input id="mpmName" type="text" maxlength="90" autocomplete="off"></label>' +
      '<label><span data-i18n="mp_code">الكود</span><input id="mpmCode" type="text" maxlength="20" class="num" autocomplete="off"></label>' +
      '<label><span data-i18n="mp_job">الوظيفة</span><input id="mpmJob" type="text" maxlength="90" list="mpJobsList" autocomplete="off"></label>' +
      '<label><span data-i18n="mp_dept">الإدارة</span><input id="mpmDept" type="text" maxlength="190" list="mpDeptsList" autocomplete="off"></label>' +
      '<label><span data-i18n="mp_hire">تاريخ التعيين</span><input id="mpmHire" type="date" class="num"></label>' +
      '<datalist id="mpJobsList"></datalist>' +
      '<datalist id="mpDeptsList"></datalist>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x" data-i18n="mp_cancel">إلغاء</button>' +
      '<button type="button" class="mpm-ok" data-i18n="mp_save">حفظ</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    modal.addEventListener("mousedown", function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector(".mpm-x").addEventListener("click", closeModal);
    modal.querySelector(".mpm-ok").addEventListener("click", saveModal);
    modal.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
  }
  var editing = null;   /* employee tuple being edited */
  function openModal(emp) {
    ensureModal();
    editing = emp || null;
    $("mpmTitle").textContent = editing ? T("mp_edit") : T("mp_add_emp");
    $("mpmName").value = editing ? editing[1] : "";
    var codeInp = $("mpmCode");
    codeInp.value = editing ? String(editing[0]) : "";
    codeInp.readOnly = !!editing;
    $("mpmJob").value = editing ? (editing[2] || "") : "";
    $("mpmDept").value = editing ? (editing[3] || "") : "";
    $("mpmHire").value = editing ? (editing[4] || "") : "";
    fillLists();
    I18N.applyDOM();
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add("on"); });
    setTimeout(function () { try { $("mpmName").focus(); } catch (e) { } }, 60);
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove("on");
    setTimeout(function () { modal.hidden = true; }, 200);
    editing = null;
  }
  function saveModal() {
    var name = $("mpmName").value.trim();
    var code = $("mpmCode").value.trim();
    var job = $("mpmJob").value.trim();
    var dept = $("mpmDept").value.trim();
    var hire = $("mpmHire").value;
    if (!name || !code) { toast(T("mp_fill"), "err"); return; }
    if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) { toast(T("mp_fill"), "err"); return; }
    if (editing) {
      var moved = (job !== (editing[2] || "")) || (dept !== (editing[3] || ""));
      if (moved && !window.confirm(T("mp_confirm_edit"))) return;
      save({ action: "edit", code: String(editing[0]), name: name, job: job, dept: dept, hire: hire },
        moved ? T("mp_moved") : T("mp_saved"), true);
      closeModal();
    } else {
      save({ action: "add", code: code, name: name, job: job, dept: dept, hire: hire }, T("mp_added"), true)
        .then(function () { closeModal(); })
        .catch(function (e) {
          if (e && e.status === 409) toast(T("mp_dup"), "err");
        });
    }
  }

  /* ---------------- save helper (POST → toast → reload) ---------------- */
  function save(payload, okMsg, keepOpen) {
    return MaribCloud.manpowerPost(payload.action, payload).then(function () {
      if (okMsg) toast(okMsg, "ok");
      return reload();
    }).catch(function (e) {
      if (e && e.status === 403) toast(T("mp_need_admin"), "err");
      else if (e && e.status === 409) toast(T("mp_dup"), "err");
      else toast(T("toast_sync_err"), "err");
      throw e;
    });
  }

  /* ---------------- Excel import ---------------- */
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
      return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
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
          var ws = wb.Sheets[wb.SheetNames[0]];
          var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
          /* find the header row: contains الكود + الموظف within the first 20 rows */
          var hRow = -1, map = {};
          for (var r = 0; r < Math.min(grid.length, 20); r++) {
            var row = grid[r] || [];
            var hasCode = false, hasName = false;
            map = {};
            for (var c = 0; c < row.length; c++) {
              var h = String(row[c] || "").trim();
              if (!h) continue;
              if (h.indexOf("الكود") >= 0) { map.code = c; hasCode = true; }
              else if (h.indexOf("الموظف") >= 0) { map.name = c; hasName = true; }
              else if (h.indexOf("الوظيفة") >= 0) map.job = c;
              else if (h.indexOf("الإدارة") >= 0 || h.indexOf("الاداره") >= 0) map.dept = c;
              else if (h.indexOf("التعيين") >= 0) map.hire = c;
            }
            if (hasCode && hasName) { hRow = r; break; }
          }
          if (hRow < 0) { toast(T("mp_import_hint"), "err"); return; }
          var rows = [];
          for (var r2 = hRow + 1; r2 < grid.length; r2++) {
            var g = grid[r2] || [];
            var code = String(g[map.code] == null ? "" : g[map.code]).trim();
            var name = String(g[map.name] == null ? "" : g[map.name]).trim();
            if (!code || !name || code === "Error: Subreport could not be shown") continue;
            rows.push([
              code.slice(0, 20), name.slice(0, 90),
              String(map.job !== undefined ? (g[map.job] == null ? "" : g[map.job]) : "").trim().slice(0, 90),
              String(map.dept !== undefined ? (g[map.dept] == null ? "" : g[map.dept]) : "").trim().slice(0, 190),
              map.hire !== undefined ? xlsxDate(g[map.hire]) : ""
            ]);
          }
          if (!rows.length) { toast(T("mp_search_none"), "err"); return; }
          save({ action: "import", rows: rows }, "", false).then(function () {
            toast(T("mp_import_done") + " — " + rows.length, "ok");
          }).catch(function () { });
        } catch (e) {
          toast(T("toast_sync_err"), "err");
        }
      };
      fr.onerror = function () { toast(T("toast_sync_err"), "err"); };
      fr.readAsArrayBuffer(file);
    }).catch(function () { toast(T("toast_sync_err"), "err"); });
  }

  /* ---------------- show / hide ---------------- */
  function show() {
    on = true;
    ADMIN = !!(window.MaribAuth && MaribAuth.isAdmin && MaribAuth.isAdmin());
    document.body.classList.add("mp-on");
    var w = $("mpWrap");
    if (w) w.hidden = false;
    var add = $("mpAddBtn"), imp = $("mpImportBtn");
    if (add) add.style.display = ADMIN ? "" : "none";
    if (imp) imp.style.display = ADMIN ? "" : "none";
    if (!loaded && !loading) reload();
    else renderAll();
  }
  function hide() {
    on = false;
    document.body.classList.remove("mp-on");
    var w = $("mpWrap");
    if (w) w.hidden = true;
    closeReqPop();
    closeModal();
  }

  /* ---------------- bindings ---------------- */
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
      (function mark(n) {
        for (var k in n.children) { expanded[n.children[k].key] = true; mark(n.children[k]); }
        for (var j in n.jobs) expanded[n.jobs[j].key] = true;
      })(ROOT || { children: {}, jobs: {} });
      renderTree("__all__");
    });
    if (cx) cx.addEventListener("click", function () {
      expanded = {};
      empOpen = {};
      renderTree();
    });
    var add = $("mpAddBtn");
    if (add) add.addEventListener("click", function () {
      if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
      openModal(null);
    });
    var imp = $("mpImportBtn");
    if (imp) imp.addEventListener("click", function () {
      if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
      var pick = $("mpXlsxPick");
      if (pick) pick.click();
    });
    var pick = $("mpXlsxPick");
    if (pick) pick.addEventListener("change", function () {
      var f = pick.files && pick.files[0];
      pick.value = "";
      if (f) importExcel(f);
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
      var pen = el.closest ? el.closest(".mo") : null;
      if (pen) {
        e.stopPropagation();
        var code = pen.getAttribute("data-code");
        var emp = findEmp(code);
        if (emp) openModal(emp);
        return;
      }
      var row = el.closest ? el.closest(".mpr") : null;
      if (!row) return;
      var t = row.getAttribute("data-t");
      if (t === "emp") {
        var c = row.getAttribute("data-c");
        empOpen[c] = !empOpen[c];
        renderTree();
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

    /* re-render everything when the language flips */
    I18N.onChange(function () {
      if (!on) return;
      if (DATA) { buildTree(); renderAll(); }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && on) {
        closeReqPop();
        if (modal && !modal.hidden) closeModal();
      }
    });
  }

  function findEmp(code) {
    if (!DATA) return null;
    for (var i = 0; i < DATA.emps.length; i++) {
      if (String(DATA.emps[i][0]) === String(code)) return DATA.emps[i];
    }
    return null;
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

  document.addEventListener("DOMContentLoaded", bind);

  return {
    show: show,
    hide: hide,
    reload: reload
  };
})();
