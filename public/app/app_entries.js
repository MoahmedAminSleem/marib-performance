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
  /* R64: صلاحيات القسم — بتتقري حية مع كل فتح/رسم (السيرفر بيصد
     على كل مسار برضه — دي احترام بصري مش خط دفاع). المفاتيح:
     entry.edit = الحفظ والحذف والتيمبلتات · entry.po = إدارة العقود */
  function entCanEdit() {
    return !!(window.MaribAuth && MaribAuth.can && MaribAuth.can("entry.edit", "edit"));
  }
  function entCanPo() {
    return !!(window.MaribAuth && MaribAuth.can && MaribAuth.can("entry.po", "edit"));
  }
  /* شارة «عرض فقط» — للي فاتح الصفحة بـ entry.view من غير تعديل */
  function entRoChip() {
    return entCanEdit() ? "" : '<span class="ent-ro">👁 ' + esc(T("ent_viewonly")) + "</span>";
  }
  function openEntries() {
    /* R64: فتح شاشة الإدخال بمفتاح القسم — canEntry() (entry.view أو
       entry.edit أو entry.po) — مرآة requireEntryRead السيرفري.
       قبل كده كانت محتاجة data.upload edit (مفتاح رفع اللوحة). */
    if (window.MaribAuth && MaribAuth.canEntry && !MaribAuth.canEntry()) {
      if (ctx.toast) ctx.toast(T("perm_denied"), "err");
      return;
    }
    /* R63: علامة السطح — عشان مراجعة الصلاحيات الحية تعرف إحنا فين */
    document.body.setAttribute("data-surface", "entry");
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
    /* R64: الأزرار بتسمع الصلاحيات — من غير entry.edit قراءة بس،
       ومن غير entry.po زراير العقود مش بتظهر أصلاً */
    var canEdit = entCanEdit(), canPo = entCanPo();
    var html = '<div class="ent-actions">' +
      (canEdit ? '<button type="button" class="ent-add" id="entProdAdd">' + esc(T("ent_add")) + '</button>' : "") +
      (canPo
        ? '<button type="button" class="ent-add ghost" id="entPoTpl" title="' + esc(T("ent_po_tpl_hint")) + '">📥 ' + esc(T("ent_po_tpl")) + '</button>' +
          '<button type="button" class="ent-add ghost" id="entPoUpload" title="' + esc(T("ent_po_upload_hint")) + '">📤 ' + esc(T("ent_po_upload")) + '</button>' +
          '<button type="button" class="ent-add ghost" id="entPoManage">📋 ' + esc(T("ent_po_manage")) + '</button>'
        : "") +
      entRoChip() +
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
        (canEdit ? '<th>' + esc(T("ent_actions")) + '</th>' : "") +
        '</tr></thead><tbody>';
      entries.forEach(function (e) {
        html += '<tr>' +
          '<td>' + esc(e.date) + '</td>' +
          '<td>' + esc(e.dept_name || "—") + '</td>' +
          '<td>' + esc(e.line_id || "—") + '</td>' +
          '<td>' + esc(e.po_number || "—") + '</td>' +
          '<td class="num">' + esc(e.qty) + '</td>' +
          '<td>' + esc(e.note || "") + '</td>' +
          (canEdit ? '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="production">' + esc(T("ent_deleted")) + '</button></td>' : "") +
        '</tr>';
      });
      html += '</tbody></table>';
    }
    body.innerHTML = html;
    var add = body.querySelector("#entProdAdd");
    if (add) add.addEventListener("click", function () { entOpenProdForm(); });
    /* R58: أزرار عقود الـ PO — موجودة بس لصاحب entry.po (R64) */
    var poTpl = body.querySelector("#entPoTpl");
    if (poTpl) poTpl.addEventListener("click", function () { entDownloadPoTemplate(); });
    var poUpl = body.querySelector("#entPoUpload");
    if (poUpl) poUpl.addEventListener("click", function () { entUploadPoTemplate(); });
    var poMng = body.querySelector("#entPoManage");
    if (poMng) poMng.addEventListener("click", function () { entOpenPoManage(); });
    body.querySelectorAll(".ent-del").forEach(function (b) {
      b.addEventListener("click", function () { entDelete("production", b.getAttribute("data-id")); });
    });
  }
  /* R50: أقسام الإنتاج الخمسة الثابتة + الخمسة خطوط — دي أقسام
     الأرضية الفعلية، مش شجرة الاتزان كلها (طلب المالك)
     R68: entSecOptions/entLineOptions (الدروب ليست) اتمسحوا — الأوفر
     تايم كان آخر مستخدم ليهم وبقى شريط نقر زي الإنتاج (grep-verified). */
  var ENT_SECTIONS = ["الصدر", "الضهر", "التجميع", "التجهيزات", "البوكت"];
  var ENT_LINES = ["1", "2", "3", "4", "5"];
  /* ============================================================
     R58 — نموذج الإنتاج الجديد (طلب المالك):
     1) التاريخ الافتراضي = امبارح (الإنتاج بيتسجل غالبًا لليوم اللي فات)
     2) شريط للخط فوق + شريط للقسم تحت — نقر مباشر بدل الدروب ليست
     3) خانة الـ PO حية: بتستعلم فورًا وتعرض كمية العقد + اتعمل قد
        إيه + المتبقي (مع شريط تقدم)، والتولتيب بيفصّل إنتاج القسم
        والخط المحددين بالتاريخ والإجمالي.
     4) لو الـ PO أول مرة (غير مسجل) → خانتين: كمية العقد + المتبقي
        (بيتملّي تلقائي = العقد − المصنوع) — بيتسجلوا مع الحفظ.
     ============================================================ */
  function entYesterday() {
    var d = new Date(Date.now() - 86400000);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function entLineItems() {
    return ENT_LINES.map(function (n) {
      return { v: n, t: I18N.lang() === "tr" ? "Hat " + n : "خط " + n };
    });
  }
  function entSecItems() {
    return ENT_SECTIONS.map(function (s) { return { v: s, t: s }; });
  }
  /* شريط أزرار قابل للنقر — البديل عن الـ select (نفس القيم) */
  function entStripRow(id, labelKey, items) {
    var h = '<div class="ent-form-row"><label>' + esc(T(labelKey)) + '</label>' +
      '<div class="ent-strip" id="' + id + '">';
    items.forEach(function (it) {
      h += '<button type="button" class="ent-strip-btn" data-v="' + esc(it.v) + '">' + esc(it.t) + '</button>';
    });
    return h + '</div></div>';
  }
  function entStripSelected(fm, id) {
    var b = fm.querySelector("#" + id + " .ent-strip-btn.on");
    return b ? b.getAttribute("data-v") : "";
  }
  /* حالة الـ PO الحالية (آخر استعلام) — للتولتيب والحفظ */
  var poState = null;
  var poTimer = null;
  function poRefresh(fm) {
    var po = (fm.querySelector("#efPo") || {}).value || "";
    po = po.trim();
    var row = fm.querySelector("#poInfoRow");
    if (!row) return;
    if (!po) { poState = null; row.hidden = true; row.innerHTML = ""; return; }
    var line = entStripSelected(fm, "efLineStrip");
    var dept = entStripSelected(fm, "efSecStrip");
    var url = "/api/po?po=" + encodeURIComponent(po) +
      "&dept=" + encodeURIComponent(dept) + "&line=" + encodeURIComponent(line);
    fetch(url, { credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error("p" + r.status); return r.json(); })
      .then(function (d) {
        /* المستخدم ممكن يكون غيّر الـ PO أثناء الاستعلام — تجاهل القديم */
        var now = ((fm.querySelector("#efPo") || {}).value || "").trim();
        if (now !== po || !fm.isConnected) return;
        poState = d;
        poRenderInfo(row, d, dept, line);
      })
      .catch(function () { /* فشل مؤقت — نفضل فاضيين بدل رسالة مزعجة */ });
  }
  function poRenderInfo(row, d, dept, line) {
    row.hidden = false;
    if (d.known) {
      /* المعروف: سطر العقد/المصنوع/المتبقي + شريط تقدم + تولتيب تفصيلي */
      var pct = d.contract_qty > 0 ? Math.min(100, Math.round(d.made_total * 100 / d.contract_qty)) : 0;
      row.innerHTML =
        '<div class="ent-po-info" id="poInfoBox">' +
          '<span class="pi-chip">📦 ' + esc(T("ent_contract")) + ': <b>' + esc(d.contract_qty.toLocaleString()) + '</b></span>' +
          '<span class="pi-chip">🏭 ' + esc(T("ent_done")) + ': <b>' + esc(d.made_total.toLocaleString()) + '</b></span>' +
          '<span class="pi-chip">➖ ' + esc(T("ent_left")) + ': <b>' + esc((d.left || 0).toLocaleString()) + '</b></span>' +
          '<span class="pi-pct' + (pct >= 100 ? " full" : "") + '">' + pct + '%</span>' +
          '<div class="pi-bar"><i style="width:' + pct + '%"></i></div>' +
        '</div>' +
        poTipHTML(d, dept, line);
      poBindTip(row);
    } else {
      /* أول مرة: خانتين — كمية العقد (يكتبها) + المتبقي (تلقائي = العقد − المصنوع) */
      row.innerHTML =
        '<div class="ent-po-new">' +
          '<div class="ent-form-row"><label>' + esc(T("ent_contract_new")) + ' *<input type="number" id="efPoContract" min="1" placeholder="0"></label></div>' +
          '<div class="ent-form-row"><label>' + esc(T("ent_left")) + '<input type="number" id="efPoLeft" value="0" readonly></label></div>' +
          '<p class="ent-form-hint">' + (d.made_total > 0
            ? esc(T("ent_po_orphan")).replace("{n}", "<b>" + d.made_total.toLocaleString() + "</b>")
            : esc(T("ent_po_first_hint"))) + '</p>' +
        '</div>' +
        poTipHTML(d, dept, line);
      var c = row.querySelector("#efPoContract");
      if (c) c.addEventListener("input", function () {
        var v = parseInt(c.value, 10) || 0;
        var left = Math.max(0, v - (d.made_total || 0));
        var l = row.querySelector("#efPoLeft");
        if (l) l.value = left;
      });
      poBindTip(row);
    }
  }
  /* تولتيب الـ PO: إنتاج القسم والخط المحددين بالتاريخ + الإجمالي */
  function poTipHTML(d, dept, line) {
    var scopeTxt = dept || line
      ? (dept ? dept : "") + (dept && line ? " · " : "") + (line ? (I18N.lang() === "tr" ? "Hat " : "خط ") + line : "")
      : T("ent_po_all");
    var days = (d.days || []).slice(0, 10);
    var h = '<div class="ent-po-tip" id="poTip" hidden>' +
      '<div class="tip-head">' + esc(d.po) + ' · ' + esc(scopeTxt) + '</div>';
    h += '<div class="tip-kpis">' +
      '<span>' + esc(T("ent_scope_made")) + ': <b>' + esc((d.made_scope || 0).toLocaleString()) + '</b></span>' +
      '<span>' + esc(T("mp_rows")) + ': <b>' + esc(d.scope_days || 0) + '</b></span>' +
      '<span>' + esc(T("ent_total")) + ': <b>' + esc((d.made_total || 0).toLocaleString()) + '</b></span>' +
      '</div>';
    if (days.length) {
      h += '<table class="tip-days"><tbody>';
      days.forEach(function (x) {
        h += '<tr><td>' + esc(x.date) + '</td><td class="num">' + esc(x.made.toLocaleString()) + '</td></tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<p class="tip-empty">' + esc(T("ent_po_no_days")) + '</p>';
    }
    return h + '</div>';
  }
  function poBindTip(row) {
    var box = row.querySelector("#poInfoBox");
    var input = row.closest(".ent-form-card") ? row.closest(".ent-form-card").querySelector("#efPo") : null;
    var tip = row.querySelector("#poTip");
    if (!tip) return;
    function show() { tip.hidden = false; }
    function hide() { tip.hidden = true; }
    if (box) {
      box.addEventListener("mouseenter", show);
      box.addEventListener("mouseleave", hide);
    }
    if (input) {
      input.addEventListener("mouseenter", show);
      input.addEventListener("mouseleave", hide);
    }
  }
  function entOpenProdForm() {
    var html =
      '<div class="ent-form-row"><label>' + esc(T("ent_date")) + '<input type="date" id="efDate" value="' + entYesterday() + '"></label></div>' +
      /* R58: شريط الخط فوق + شريط القسم تحت — نقر مباشر (طلب المالك) */
      entStripRow("efLineStrip", "ent_line", entLineItems()) +
      entStripRow("efSecStrip", "ent_dept", entSecItems()) +
      '<div class="ent-form-row two">' +
        '<label>' + esc(T("ent_po")) + '<input type="text" id="efPo" placeholder="PO-123" autocomplete="off"></label>' +
        '<label>' + esc(T("ent_qty")) + '<input type="number" id="efQty" min="1" value="1"></label>' +
      '</div>' +
      '<div class="ent-form-row po-row" id="poInfoRow" hidden></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_note")) + '<input type="text" id="efNote" placeholder=""></label></div>';
    var fm = entOpenForm(T("ent_add") + " — " + T("ent_prod_tab"), html, function (fm) {
      var data = {
        date: fm.querySelector("#efDate").value,
        dept: entStripSelected(fm, "efSecStrip"),
        line: entStripSelected(fm, "efLineStrip"),
        po_number: fm.querySelector("#efPo").value.trim(),
        qty: parseInt(fm.querySelector("#efQty").value, 10) || 0,
        note: fm.querySelector("#efNote").value,
        /* R58: كمية العقد لو ظهرت (PO أول مرة) — بتتسجل مع السجل */
        po_contract_qty: parseInt(((fm.querySelector("#efPoContract") || {}).value || "0"), 10) || 0,
      };
      if (!data.date || data.qty <= 0 || !data.dept || !data.line) { toast(T("toast_fill"), "err"); return false; }
      entSubmitForm("/api/entries/production", data);
      return true;
    });
    if (!fm) return;
    /* ربط الأشرطة: نقر واحد بيحدد + أي تغيير بيعيد استعلام الـ PO
       (التولتيب بيتبع القسم/الخط المحددين) */
    ["efLineStrip", "efSecStrip"].forEach(function (id) {
      var strip = fm.querySelector("#" + id);
      if (!strip) return;
      strip.addEventListener("click", function (e) {
        var b = e.target.closest(".ent-strip-btn");
        if (!b) return;
        strip.querySelectorAll(".ent-strip-btn").forEach(function (x) { x.classList.toggle("on", x === b); });
        poRefresh(fm);
      });
    });
    /* الـ PO حي: كتابة → استعلام بعد وقفة قصيرة */
    var poInput = fm.querySelector("#efPo");
    if (poInput) {
      poInput.addEventListener("input", function () {
        if (poTimer) clearTimeout(poTimer);
        poTimer = setTimeout(function () { poRefresh(fm); }, 350);
      });
      poInput.addEventListener("change", function () {
        if (poTimer) clearTimeout(poTimer);
        poRefresh(fm);
      });
    }
  }
  /* ---- absence ---- */
  function entLoadAbsence(body) {
    fetch("/api/entries/absence?month=" + encodeURIComponent(entMonth), { credentials: "include" })
      .then(function (r) { if (!r.ok) throw { s: r.status }; return r.json(); })
      .then(function (d) { entRenderAbsence(body, d.entries || []); })
      .catch(function () { body.innerHTML = '<p class="ent-err">' + esc(T("toast_sync_err")) + '</p>'; });
  }
  function entRenderAbsence(body, entries) {
    /* R64: الإضافة/التيمبلتات/الحذف لصاحب entry.edit بس */
    var canEdit = entCanEdit();
    var html = '<div class="ent-actions">' +
      (canEdit ? '<button type="button" class="ent-add" id="entAbsAdd">' + esc(T("ent_add")) + '</button>' : "") +
      (canEdit ? '<button type="button" class="ent-add ghost" id="entAbsTpl">' + esc(T("ent_download_tpl")) + '</button>' +
        '<button type="button" class="ent-add ghost" id="entAbsUpload">' + esc(T("ent_upload_tpl")) + '</button>' : "") +
      entRoChip() +
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
        (canEdit ? '<th>' + esc(T("ent_actions")) + '</th>' : "") +
        '</tr></thead><tbody>';
      entries.forEach(function (e) {
        html += '<tr class="' + (e.matched ? "" : "unmatched") + '">' +
          '<td>' + esc(e.date) + '</td>' +
          '<td>' + esc(e.emp_code || "—") + '</td>' +
          '<td>' + esc(e.emp_name || "—") + '</td>' +
          '<td>' + esc(e.dept_name || "—") + '</td>' +
          '<td>' + esc(e.reason || "") + '</td>' +
          '<td>' + (e.matched ? esc(T("ent_matched")) : '<b class="bad">' + esc(T("ent_unmatched")) + '</b>') + '</td>' +
          (canEdit ? '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="absence">' + esc(T("ent_deleted")) + '</button></td>' : "") +
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
  /* R59: التنزيل والقراءة بقوا على MaribKit (المصدر المشترك)
     — نفس السلوك بالظبط بس مرة واحدة في kit.js. */
  function entDownloadAbsTemplate() {
    MaribKit.dlBlob("/api/entries/absence?template=1", "Absence-Template-" + MaribKit.dstamp() + ".xlsx")
      .then(function () { toast(T("mp_tmpl_done"), "ok"); })
      .catch(function () { toast(T("toast_sync_err"), "err"); });
  }
  function entUploadAbsTemplate() {
    var pick = document.createElement("input");
    pick.type = "file";
    pick.accept = ".xlsx,.xls";
    pick.className = "ent-file-pick"; /* R59: إرفاق بالـ DOM (بعض المتصفحات
       بترفض click على input مش مرفق) + كلاس ثابت للاختبارات */
    pick.style.display = "none";
    pick.addEventListener("change", function () {
      var f = pick.files && pick.files[0];
      pick.remove();
      if (!f) return;
      /* R59 (إصلاح باج قديم): الكود القديم كان بيفحص MaribCloud.ensureXLSX
         — وMaribCloud عمره ما صدّرها، فرفع تيمبلت الغياب كان سايح
         دايمًا (توست خطأ) من يوم ما اتكتب. MaribKit.readGrid هو المسار
         الحقيقي دلوقتي. */
      MaribKit.readGrid(f, "الكود")
        .then(function (out) {
          var rows = [];
          for (var j = out.hRow + 1; j < out.grid.length; j++) {
            var g = out.grid[j] || [];
            if (!String(g[1] || "").trim() && !String(g[2] || "").trim()) continue;
            rows.push(["p", String(g[1] || "").trim(), String(g[2] || "").trim(), String(g[3] || "").trim()]);
          }
          entSubmitAbsImport(rows);
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); });
    });
    document.body.appendChild(pick);
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
    /* R64: الإضافة/الحذف لصاحب entry.edit بس */
    var canEdit = entCanEdit();
    /* R68: الحساب الصح — الأشخاص = المسمّى (كل صف = 1) + الإضافيين
       (صف الإضافيين = N) · الساعات = ساعات المسمّى + (N × ساعات
       الشخص الإضافي). الأرقام دي هي اللي بيطمن المالك إن الإضافيين
       «بيتضافوا على اللي مختارين بالاسم» فعلًا. */
    var namedN = 0, extraN = 0, namedH = 0, extraH = 0;
    entries.forEach(function (e) {
      var n = parseInt(e.extra_count, 10) || 0;
      var h = parseFloat(e.hours) || 0;
      if (n > 0) { extraN += n; extraH += n * h; }
      else { namedN += 1; namedH += h; }
    });
    var totP = namedN + extraN, totH = Math.round((namedH + extraH) * 100) / 100;
    var html = '<div class="ent-actions">' +
      (canEdit ? '<button type="button" class="ent-add" id="entOtAdd">' + esc(T("ent_add")) + '</button>' : "") +
      entRoChip() +
      '<span class="ent-count"><b>' + entries.length + '</b> ' + esc(T("mp_rows")) + '</span>' +
    '</div>';
    if (entries.length) {
      /* R68: شريط إجمالي الشهر — بالاسم + إضافيين = الإجمالي */
      html += '<div class="ent-ot-sum" id="entOtSum">' +
        '<span class="ot-sum-chip">👤 ' + esc(T("ent_ot_bd_named")) + ': <b>' + namedN + '</b></span>' +
        '<span class="ot-sum-chip">➕ ' + esc(T("ent_ot_bd_extra")) + ': <b>' + extraN + '</b></span>' +
        '<span class="ot-sum-chip tot">👥 ' + esc(T("ent_ot_bd_people")) + ': <b>' + totP + '</b></span>' +
        '<span class="ot-sum-chip tot">⏱ ' + esc(T("ent_ot_bd_hours")) + ': <b>' + totH + '</b></span>' +
      '</div>';
      /* R68: ملخص القسم والخط — «لكل قسم وخط عشان يحسب صح» */
      html += entOtBreakdown(entries);
      html += '<table class="ent-tbl"><thead><tr>' +
        '<th>' + esc(T("ent_date")) + '</th>' +
        '<th>' + esc(T("ent_code")) + '</th>' +
        '<th>' + esc(T("ent_name")) + '</th>' +
        '<th>' + esc(T("mp_dept")) + '</th>' +
        '<th>' + esc(T("ent_hours")) + '</th>' +
        '<th>' + esc(T("ent_note")) + '</th>' +
        '<th>' + esc(T("ent_matched")) + '</th>' +
        (canEdit ? '<th>' + esc(T("ent_actions")) + '</th>' : "") +
        '</tr></thead><tbody>';
      entries.forEach(function (e) {
        var n = parseInt(e.extra_count, 10) || 0;
        var h = parseFloat(e.hours) || 0;
        if (n > 0) {
          /* R68: صف أشخاص إضافيين — الحساب مرئي: ساعات × عدد = إجمالي */
          html += '<tr class="ot-extra-row">' +
            '<td>' + esc(e.date) + '</td>' +
            '<td>➕</td>' +
            '<td><b>' + esc(T("ent_ot_extra_badge")) + ' × ' + n + '</b></td>' +
            '<td>' + esc(e.dept_name || "—") + (e.line_id ? ' · <span class="faint">' + esc(e.line_id) + '</span>' : "") + '</td>' +
            '<td class="num"><b>' + h + '</b> × ' + n + ' = <b>' + (Math.round(n * h * 100) / 100) + '</b></td>' +
            '<td>' + esc(e.note || "") + '</td>' +
            '<td><span class="ot-x-chip">' + esc(T("ent_ot_extra_badge")) + '</span></td>' +
            (canEdit ? '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="overtime">' + esc(T("ent_deleted")) + '</button></td>' : "") +
          '</tr>';
        } else {
          html += '<tr class="' + (e.matched ? "" : "unmatched") + '">' +
            '<td>' + esc(e.date) + '</td>' +
            '<td>' + esc(e.emp_code || "—") + '</td>' +
            '<td>' + esc(e.emp_name || "—") + '</td>' +
            '<td>' + esc(e.dept_name || "—") + (e.line_id ? ' · <span class="faint">' + esc(e.line_id) + '</span>' : "") + '</td>' +
            '<td class="num">' + esc(e.hours) + '</td>' +
            '<td>' + esc(e.note || "") + '</td>' +
            '<td>' + (e.matched ? esc(T("ent_matched")) : '<b class="bad">' + esc(T("ent_unmatched")) + '</b>') + '</td>' +
            (canEdit ? '<td><button type="button" class="ent-del" data-id="' + esc(e.id) + '" data-tab="overtime">' + esc(T("ent_deleted")) + '</button></td>' : "") +
          '</tr>';
        }
      });
      html += '</tbody></table>';
    } else {
      html += '<p class="ent-empty">' + esc(T("ent_no_data")) + '</p>';
    }
    body.innerHTML = html;
    var add = body.querySelector("#entOtAdd");
    if (add) add.addEventListener("click", function () { entOpenOtForm(); });
    body.querySelectorAll(".ent-del").forEach(function (b) {
      b.addEventListener("click", function () { entDelete("overtime", b.getAttribute("data-id")); });
    });
  }
  /* R68: ملخص الأوفر تايم حسب القسم والخط — نفس أرقام شريط الإجمالي
     بس مفصولة، عشان «عدد الأشخاص لكل قسم وخط» يبان لوحده */
  function entOtBreakdown(entries) {
    var map = {};
    entries.forEach(function (e) {
      var key = (e.dept_name || "—") + "\u0001" + (e.line_id || "—");
      var rec = map[key];
      if (!rec) rec = map[key] = { dept: e.dept_name || "—", line: e.line_id || "—", named: 0, extra: 0, hours: 0 };
      var n = parseInt(e.extra_count, 10) || 0;
      var h = parseFloat(e.hours) || 0;
      if (n > 0) { rec.extra += n; rec.hours += n * h; }
      else { rec.named += 1; rec.hours += h; }
    });
    var keys = Object.keys(map).sort();
    var h = '<details class="ent-ot-bd" open id="entOtBd"><summary>🧮 ' + esc(T("ent_ot_breakdown")) + '</summary>' +
      '<table class="ent-tbl ot-bd-tbl"><thead><tr>' +
      '<th>' + esc(T("mp_dept")) + '</th>' +
      '<th>' + esc(T("ent_line")) + '</th>' +
      '<th>' + esc(T("ent_ot_bd_named")) + '</th>' +
      '<th>' + esc(T("ent_ot_bd_extra")) + '</th>' +
      '<th>' + esc(T("ent_ot_bd_people")) + '</th>' +
      '<th>' + esc(T("ent_ot_bd_hours")) + '</th>' +
      '</tr></thead><tbody>';
    keys.forEach(function (k) {
      var r = map[k];
      h += '<tr><td>' + esc(r.dept) + '</td><td>' + esc(r.line) + '</td>' +
        '<td class="num">' + r.named + '</td>' +
        '<td class="num">➕ ' + r.extra + '</td>' +
        '<td class="num"><b>' + (r.named + r.extra) + '</b></td>' +
        '<td class="num">' + (Math.round(r.hours * 100) / 100) + '</td></tr>';
    });
    return h + '</tbody></table></details>';
  }
  /* R50: كومبوبوكس الموظفين — بحث بالاسم أو الكود،
     مع إكمال تلقائي لباقي الكلمة، وزرار «إضافة كرقم» للي مش موجود.
     R63: المصدر بقى /api/entries/employees (حارس الإدخال) بدل
     /api/manpower (محتاج manpower.view) — فمسؤول الإدخال اللي
     الاتزان مخفي عنه بقى يشوف الكومبوبوكس شغال. */
  var entEmpCache = null;   /* [{code, name, nameTr, job, path}] */
  function entEmpList(cb) {
    if (entEmpCache) { cb(entEmpCache); return; }
    fetch("/api/entries/employees", { credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error("m"); return r.json(); })
      .then(function (d) {
        entEmpCache = (d && d.emps) || [];
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
    /* R68 — نموذج الأوفر تايم الجديد (طلب المالك: «زي واجهة تسجيل
       الإنتاج»): 1) التاريخ الافتراضي = امبارس — نفس منطق الإنتاج
       2) شريط للخط فوق + شريط للقسم تحت بنفس شكل الإنتاج
       3) خانة الأشخاص الإضافيين: ناس بتعمل أوفر تايم لسه مش
       مسجلين كود/اسم في الاتزان — بتتكتب كعدد + ساعات الشخص،
       وبتتضاف على المختارين بالاسم في نفس القسم والخط. */
    var html =
      '<div class="ent-form-row"><label>' + esc(T("ent_date")) + '<input type="date" id="efDate" value="' + entYesterday() + '"></label></div>' +
      /* R68: شريطا الخط والقسم — نفس مكونات نموذج الإنتاج (R58) */
      entStripRow("efLineStrip", "ent_line", entLineItems()) +
      entStripRow("efSecStrip", "ent_dept", entSecItems()) +
      '<div class="ent-form-row ent-cb-row"><label class="ent-cb-lbl">' + esc(T("ent_person")) + '</label>' +
        '<div class="ent-cb"><input type="text" id="efPerson" placeholder="' + esc(T("ent_person")) + '" autocomplete="off">' +
        '<div class="ent-cb-list" id="efPersonList" hidden></div></div>' +
        '<button type="button" class="ent-add-code" id="efAddCode" hidden title="' + esc(T("ent_add_code_hint")) + '">➕ ' + esc(T("ent_add_code")) + ': <b></b></button>' +
      '</div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_hours")) + '<input type="number" id="efHours" min="0.5" max="24" step="0.5" value="2"></label></div>' +
      /* R68: الأشخاص الإضافيين — مش مسجلين في الاتزان */
      '<div class="ent-form-row two ot-extra-form">' +
        '<label>' + esc(T("ent_ot_extra")) + '<input type="number" id="efExtraCount" min="0" max="500" step="1" value="0" placeholder="0"></label>' +
        '<label>' + esc(T("ent_ot_extra_hours")) + '<input type="number" id="efExtraHours" min="0.5" max="24" step="0.5" value="2"></label>' +
      '</div>' +
      '<p class="ent-form-hint">' + esc(T("ent_ot_extra_hint")) + '</p>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_note")) + '<input type="text" id="efNote" placeholder=""></label></div>';
    var fm = entOpenForm(T("ent_add") + " — " + T("ent_ot_tab"), html, function (fm) {
      var data = {
        date: fm.querySelector("#efDate").value,
        dept: entStripSelected(fm, "efSecStrip"),
        line: entStripSelected(fm, "efLineStrip"),
        hours: parseFloat(fm.querySelector("#efHours").value) || 0,
        extra_count: parseInt(fm.querySelector("#efExtraCount").value, 10) || 0,
        extra_hours: parseFloat(fm.querySelector("#efExtraHours").value) || 0,
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
      var hasNamed = !!(data.emp_code || data.emp_name);
      var hasExtra = data.extra_count > 0;
      /* R68: الفورم بيعلّم — لا زم تختار قسم وخط (زي الإنتاج) ويبقى
         عندنا على الأقل شخص بالاسم أو عدد إضافيين */
      if (!data.date || !data.dept || !data.line || (!hasNamed && !hasExtra)) {
        toast(T("toast_fill"), "err");
        return false;
      }
      if (hasNamed && data.hours <= 0) { toast(T("toast_fill"), "err"); return false; }
      if (hasExtra && data.extra_hours <= 0) { toast(T("toast_fill"), "err"); return false; }
      entSubmitForm("/api/entries/overtime", data, function (r) {
        /* R68: توست بيحكي اللي اتعمل فعلًا — «1 بالاسم · 4 إضافيين»
           (والغير المتطابق بيفضل تحذير زي ما كان) */
        var parts = [];
        if (hasNamed) parts.push("1 " + T("ent_ot_bd_named"));
        if (hasExtra && r && r.extra_count) parts.push(r.extra_count + " " + T("ent_ot_bd_extra"));
        var warn = hasNamed && r && r.matched === false;
        toast(T("ent_saved") + (parts.length ? " — " + parts.join(" · ") : ""), warn ? "warn" : "ok");
      });
      return true;
    });
    if (!fm) return;
    /* R68: ربط الأشرطة — نقر واحد بيحدد (الأوفر تايم ملوش PO فمفيش
       استعلام حي — بس تبديل on/off) */
    ["efLineStrip", "efSecStrip"].forEach(function (id) {
      var strip = fm.querySelector("#" + id);
      if (!strip) return;
      strip.addEventListener("click", function (e) {
        var b = e.target.closest(".ent-strip-btn");
        if (!b) return;
        strip.querySelectorAll(".ent-strip-btn").forEach(function (x) { x.classList.toggle("on", x === b); });
      });
    });
    /* اربط الكومبوبوكس بعد فتح المودال — الكاش من الاتزان */
    setTimeout(function () {
      var fm2 = document.querySelector(".ent-form-modal");
      if (!fm2) return;
      entEmpList(function () {
        var pinp = fm2.querySelector("#efPerson");
        if (pinp) pinp._picked = null;
        entBindCombo(fm2, function (st) {
          if (pinp) pinp._picked = st.picked;
        });
      });
    }, 40);
  }
  /* ============================================================
     R58 — عقود الـ PO: تيمبلت (تنزيل/رفع) + إدارة الريفرانس
     ============================================================ */
  function entDownloadPoTemplate() {
    MaribKit.dlBlob("/api/po?template=1", "PO-Template-" + MaribKit.dstamp() + ".xlsx")
      .then(function () { toast(T("mp_tmpl_done"), "ok"); })
      .catch(function () { toast(T("toast_sync_err"), "err"); });
  }
  function entUploadPoTemplate() {
    var pick = document.createElement("input");
    pick.type = "file";
    pick.accept = ".xlsx,.xls";
    pick.className = "ent-file-pick"; /* R59: إرفاق + كلاس ثابت — نفس الغياب */
    pick.style.display = "none";
    pick.addEventListener("change", function () {
      var f = pick.files && pick.files[0];
      pick.remove();
      if (!f) return;
      /* R59: قراءة الشيت على MaribKit — نفس منطق الغياب بالظبط */
      MaribKit.readGrid(f, "PO")
        .then(function (out) {
          var rows = [];
          for (var j = out.hRow + 1; j < out.grid.length; j++) {
            var g = out.grid[j] || [];
            if (!String(g[1] || "").trim()) continue;
            rows.push(["p", String(g[1] || "").trim(), String(g[2] ?? "").trim(), String(g[3] || "").trim()]);
          }
          if (!rows.length) { toast(T("ent_po_no_rows"), "err"); return; }
          fetch("/api/po?action=import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ rows: rows }),
          })
            .then(function (r) { if (!r.ok) throw new Error("i" + r.status); return r.json(); })
            .then(function (d) {
              toast(T("ent_po_imported").replace("{i}", d.inserted).replace("{u}", d.updated), "ok");
              entRender();
            })
            .catch(function () { toast(T("toast_sync_err"), "err"); });
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); });
    });
    pick.click();
  }
  /* إدارة عقود الـ PO — القايمة الكاملة: عرض/تعديل/إضافة/حذف
     (المرونة اللي طلبها المالك: رفع ريفرانس أو كتابة مباشرة).
     R64: الكتابة داخلها لصاحب entry.po — المشاهد بيشوف أرقام بس. */
  var poManageModal = null;
  function entOpenPoManage() {
    if (!entCanPo()) {
      toast(T("perm_denied"), "err");
      return;
    }
    if (poManageModal) { poManageModal.remove(); poManageModal = null; }
    var m = document.createElement("div");
    m.className = "ent-form-modal po-manage";
    m.innerHTML =
      '<div class="ent-form-card po-card">' +
        '<div class="ent-form-head"><h4>📋 ' + esc(T("ent_po_manage")) + '</h4>' +
          '<button type="button" class="ent-form-x" aria-label="' + esc(T("dp_close")) + '">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="po-manage-body" id="poManageBody"><div class="ent-loading">…</div></div>' +
        '<div class="ent-form-btns po-manage-btns">' +
          '<button type="button" class="ent-form-cancel">' + esc(T("dp_close")) + '</button>' +
          '<button type="button" class="ent-form-save" id="poAddBtn">➕ ' + esc(T("ent_po_add")) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    poManageModal = m;
    m.addEventListener("click", function (e) { if (e.target === m) entClosePoManage(); });
    m.querySelector(".ent-form-x").addEventListener("click", entClosePoManage);
    m.querySelector(".ent-form-cancel").addEventListener("click", entClosePoManage);
    m.querySelector("#poAddBtn").addEventListener("click", entOpenPoAdd);
    poManageRender();
  }
  function entClosePoManage() {
    if (poManageModal) { poManageModal.remove(); poManageModal = null; }
  }
  function poManageRender() {
    var body = poManageModal ? poManageModal.querySelector("#poManageBody") : null;
    if (!body) return;
    fetch("/api/po", { credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error("l" + r.status); return r.json(); })
      .then(function (d) { poManageDraw(body, d.pos || []); })
      .catch(function () { body.innerHTML = '<p class="ent-err">' + esc(T("toast_sync_err")) + '</p>'; });
  }
  function poManageDraw(body, pos) {
    /* R64: العمود المحرر (الكمية/الحذف/الإضافة) لصاحب entry.po —
       المشاهد بياخد نفس الجدول عرضًا بدون خانات كتابة */
    var canPo = entCanPo();
    if (!pos.length) {
      body.innerHTML = '<p class="ent-empty">' + esc(T("ent_po_none")) + '</p>';
      return;
    }
    var html = '<table class="ent-tbl po-tbl"><thead><tr>' +
      '<th>PO</th>' +
      '<th>' + esc(T("ent_contract")) + '</th>' +
      '<th>' + esc(T("ent_done")) + '</th>' +
      '<th>' + esc(T("ent_left")) + '</th>' +
      '<th>%</th>' +
      (canPo ? '<th>' + esc(T("ent_actions")) + '</th>' : "") +
      '</tr></thead><tbody>';
    pos.forEach(function (p) {
      var pct = p.contract_qty > 0 ? Math.min(100, Math.round(p.made * 100 / p.contract_qty)) : 0;
      html += '<tr data-po="' + esc(p.po) + '">' +
        '<td class="po-name">' + esc(p.po) + '</td>' +
        (canPo
          ? '<td class="num po-c"><input type="number" min="1" value="' + esc(p.contract_qty) + '" data-old="' + esc(p.contract_qty) + '"></td>'
          : '<td class="num">' + esc(p.contract_qty.toLocaleString()) + '</td>') +
        '<td class="num">' + esc(p.made.toLocaleString()) + '</td>' +
        '<td class="num">' + esc(p.left.toLocaleString()) + '</td>' +
        '<td class="num"><span class="pi-pct' + (pct >= 100 ? " full" : "") + '">' + pct + '%</span></td>' +
        (canPo ? '<td><button type="button" class="ent-del" data-po="' + esc(p.po) + '" title="' + esc(T("ent_deleted")) + '">✕</button></td>' : "") +
      '</tr>';
    });
    body.innerHTML = html + '</tbody></table>';
    /* تعديل الكمية: blur بقيمة جديدة → POST upsert */
    body.querySelectorAll(".po-c input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var tr = inp.closest("tr");
        var po = tr.getAttribute("data-po");
        var v = parseInt(inp.value, 10) || 0;
        if (v <= 0 || v === parseInt(inp.getAttribute("data-old"), 10)) return;
        fetch("/api/po", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ po: po, contract_qty: v }),
        })
          .then(function (r) { if (!r.ok) throw new Error("u" + r.status); return r.json(); })
          .then(function () { toast(T("ent_saved"), "ok"); poManageRender(); })
          .catch(function () { toast(T("toast_sync_err"), "err"); });
      });
    });
    body.querySelectorAll(".ent-del").forEach(function (b) {
      b.addEventListener("click", function () {
        var po = b.getAttribute("data-po");
        if (!confirm(T("ent_po_del_confirm").replace("{po}", po))) return;
        fetch("/api/po?po=" + encodeURIComponent(po), {
          method: "DELETE",
          credentials: "include",
        })
          .then(function (r) { if (!r.ok) throw new Error("d" + r.status); return r.json(); })
          .then(function () { toast(T("ent_deleted"), "ok"); poManageRender(); })
          .catch(function () { toast(T("toast_sync_err"), "err"); });
      });
    });
  }
  function entOpenPoAdd() {
    var html =
      '<div class="ent-form-row"><label>PO<input type="text" id="paPo" placeholder="PO-123"></label></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_contract")) + '<input type="number" id="paQty" min="1" value="1"></label></div>' +
      '<div class="ent-form-row"><label>' + esc(T("ent_note")) + '<input type="text" id="paNote" placeholder=""></label></div>';
    entOpenForm(T("ent_po_add"), html, function (fm) {
      var po = fm.querySelector("#paPo").value.trim();
      var qty = parseInt(fm.querySelector("#paQty").value, 10) || 0;
      if (!po || qty <= 0) { toast(T("toast_fill"), "err"); return false; }
      fetch("/api/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ po: po, contract_qty: qty, note: fm.querySelector("#paNote").value }),
      })
        .then(function (r) { if (!r.ok) throw new Error("a" + r.status); return r.json(); })
        .then(function () { toast(T("ent_saved"), "ok"); poManageRender(); })
        .catch(function () { toast(T("toast_sync_err"), "err"); });
      return true;
    });
  }

  /* ---- helpers ---- */
  /* R47-fix: onSave كان بيقرأ الحقول من entModal (البوب أب الكبير) وهي
     في الحقيقة في المودال الصغير المنفصل اللي بيتزق على body — فالقراءة
     كانت بترمي exception صامت والسجل مش بيتسجل أبداً. بقى onSave(fm)
     بياخد عنصر الفورم نفسه.
     R58: بترجع عنصر المودال عشان النداء الجديد (نموذج الإنتاج) يربط
     أحداث الأشرطة والـ PO الحي على الفورم نفسه. */
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
    return m; /* R58: النداء بيربط أحداثه على العنصر الراجع */
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
