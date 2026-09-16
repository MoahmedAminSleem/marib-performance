/* ============================================================
   Marib Performance — R52: وحدة إدخال البيانات (app_entries)
   اتقطعت من app_main.js بدون تغيير منطقي — الإنتاج/الغياب/الأوفر
   تايم (3 تابات + نماذج + كومبوبوكس البحث + رفع تيمبلت الغياب).
   بتوصل لرموز app_main عبر جسر __maribCtx.
   ============================================================ */
var AppEntries = (function (ctx) {
  "use strict";
  var $ = ctx.$, esc = ctx.esc, toast = ctx.toast, chip = ctx.chip,
      ensureXLSX = ctx.ensureXLSX, goToPage = ctx.goToPage, render = ctx.render,
      state = ctx.state, T = ctx.T, U = ctx.U;

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

  return { open: openEntries, close: closeEntries };
})(window.__maribCtx);
