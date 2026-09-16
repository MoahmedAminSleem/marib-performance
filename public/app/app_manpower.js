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
  /* R42: حماية من التحميل المزدوج — React (dev) بيرسم الـ script tags
     مرتين أحيانًا، فالموديول كان بيتعرّف مرتين وكل الـ listeners بتتربط
     مرتين (التحديد كان بيفتح ويقفل في نفس اللحظة). النسخة الثانية
     بترجّع نفس نسخة الأولى — ربط واحد، حالة واحدة. */
  if (window.__maribMP42) return window.__maribMP42;
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
  /* R40 — مؤشر الماكينة: علامة صغيرة جنب الكود تعرّف إن في تولتيب
     (الماكينة/الملاحظات) بتيجي بالماوس من غير ضغط */
  var ICO_MACH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 8h4M7 12h6"/><path d="M17.5 8.5v2M9 17l-1.5 4M15 17l1.5 4"/></svg>';
  /* R46-3: زرار صغير للتبديل بين الاسم الإنجليزي والعربي — حرف "ع" خفيف */
  var ICO_AR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="AR"><path d="M4 5h6M7 5v14M4 19h6"/><path d="M14 5h6M17 5v14m-3 0h6"/></svg>';
  /* R41 — سلة المسح: زرار أحمر صغير جنب كل قسم (للأقسام الفاضية) */
  var ICO_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"/><path d="M10 11.5v5.5M14 11.5v5.5"/></svg>';

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
    "BT":                { ar: "زرار (BT)",            en: "Button (BT)",         tr: "Düğme (BT)" },
    /* R42: مصطلحات المستخدم بعد إعادة التنظيم — ترجمة احترافية يدوية
       (الترجمة التلقائية بتشتغل لأي حاجة جديدة، بس دول المصطلحات
       بتوع المصنع نفسه فتستاهل الصياغة الصح) */
    "الإنتاج":           { ar: "الإنتاج",              en: "Production",           tr: "Üretim" },
    "الصدر":             { ar: "الصدر",                en: "Front",                tr: "Ön" },
    "الضهر":             { ar: "الضهر",                en: "Back",                 tr: "Arka" },
    "التجميع":           { ar: "التجميع",              en: "Assembly",             tr: "Monte" },
    "الأمن":             { ar: "الأمن",                en: "Security",             tr: "Güvenlik" },
    "النظافة":           { ar: "النظافة",              en: "Cleaning",             tr: "Temizlik" },
    "المديرين":          { ar: "المديرين",             en: "Managers",             tr: "Yöneticiler" },
    "التارجت وهندسة الانتاج": { ar: "التارجت وهندسة الانتاج", en: "Target & Production Engineering", tr: "Hedef ve Üretim Müh." },
    "التخطيط":           { ar: "التخطيط",              en: "Planning",             tr: "Planlama" },
    "المترجمين":         { ar: "المترجمين",            en: "Translators",          tr: "Çevirmenler" },
    "بوفيه":             { ar: "بوفيه",                en: "Buffet",               tr: "Büfe" },
    "الحسابات":          { ar: "الحسابات",             en: "Accounting",           tr: "Muhasebe" },
    "العيادة":           { ar: "العيادة",              en: "Clinic",               tr: "Klinik" },
    "التسليمات":         { ar: "التسليمات",            en: "Deliveries",           tr: "Teslimatlar" },
    "المراجعة الداخلية (الاوديت)": { ar: "المراجعة الداخلية (الاوديت)", en: "Internal Audit", tr: "İç Denetim" },
    "مخزن إكسسوارات":    { ar: "مخزن إكسسوارات",       en: "Accessories Warehouse", tr: "Aksesuar Deposu" },
    "العينات والبايلوت": { ar: "العينات والبايلوت",    en: "Samples & Pilot",      tr: "Numune ve Pilot" },
    "العينات":           { ar: "العينات",              en: "Samples",              tr: "Numune" }
  };
  /* ---------------- R45: مترجم مصطلحات الوظايف ----------------
     أسماء الوظايف في الشيت مركّبة من مصطلحات مصنعية متكررة (عملية + جزء).
     القاموس الكامل بيفكّ المركب ويترجمه بمصطلحات الجينز الصح — EN
     بصيغة «الجزء + العملية» (Watch pocket attach) و TR بنفس الترتيب
     (Saat cep montaj). اللي مش موجود في القاموس بيفضل زي ما هو. */
  var JG_SPECIAL = {
    "جيب ساعة":     { en: "Watch pocket",  tr: "Saat cep" },
    "جيب خلفى":     { en: "Back pocket",   tr: "Arka cep" },
    "جيب خلفي":     { en: "Back pocket",   tr: "Arka cep" },
    "جيب أمامى":    { en: "Front pocket",  tr: "Ön cep" },
    "جيب أمامي":    { en: "Front pocket",  tr: "Ön cep" },
    "جيب بوكت":     { en: "Patch pocket",  tr: "Yama cep" },
    "دور تاني":     { en: "2nd pass",      tr: "2. geçiş" },
    "دور تانى":     { en: "2nd pass",      tr: "2. geçiş" },
    "دور أول":      { en: "1st pass",      tr: "1. geçiş" },
    "دور اول":      { en: "1st pass",      tr: "1. geçiş" },
    "تشغيل خارجي":  { en: "Outsourcing",   tr: "Fason" },
    "مدخل بيانات":  { en: "Data entry",    tr: "Veri girişi" },
    "مشرف جودة":    { en: "QA supervisor", tr: "Kalite süpervizörü" },
    "رئيس خط":      { en: "Line head",     tr: "Hat şefi" },
    "رئيس قسم":     { en: "Section head",  tr: "Bölüm şefi" },
    "مدير صالة":    { en: "Floor manager", tr: "Salon müdürü" },
    "نسب غياب":     { en: "Absence ratio", tr: "Devamsızlık oranı" },
    "نسبة غياب":    { en: "Absence ratio", tr: "Devamsızlık oranı" },
    "تعويض نسب غياب": { en: "Absence compensation", tr: "Devamsızlık telafisi" },
    "ردسلسلة":      { en: "Chain backtack", tr: "Geri zincir dikiş" },
    "كوع رايزر":    { en: "Riser corner",  tr: "Riser köşesi" },
    "جودة أوديت":   { en: "Audit quality", tr: "Denetim kalitesi" }
  };
  /* [en, tr, tag] — op = عملية (بتترتب آخر الجملة)، part = جزء،
     glue = حروف جر/عطف (بتوقف إعادة الترتيب)، mod = صفة (بتقعد جنب أول جزء) */
  var JG = {
    "سرفلة":   ["Overlock", "Overlok", "op"],
    "تنشين":   ["Attach", "Montaj", "op"],
    "تركيب":   ["Attach", "Montaj", "op"],
    "ثنى":     ["Fold", "Kıvırma", "op"],
    "تعريش":   ["Basting", "Bastiyaj", "op"],
    "تثبيت":   ["Tack", "Sabitleme", "op"],
    "تثبيتة":  ["Tack", "Sabitleme", "op"],
    "تجميع":   ["Assembly", "Monte", "op"],
    "قفل":     ["Lockstitch", "Kilit dikiş", "op"],
    "زجزاج":   ["Zigzag", "Zikzak", "op"],
    "مكواه":   ["Iron", "Ütü", "op"],
    "مكوى":    ["Iron", "Ütü", "op"],
    "مكبس":    ["Press", "Pres", "op"],
    "كنترول":  ["Check", "Kontrol", "op"],
    "جودة":    ["Quality", "Kalite", "op"],
    "فرز":     ["Sorting", "Ayıklama", "op"],
    "تحضير":   ["Prep", "Hazırlık", "op"],
    "تحضيرات": ["Prep", "Hazırlık", "op"],
    "تشطيب":   ["Finishing", "Bitim", "op"],
    "تسليمات": ["Delivery", "Teslimat", "op"],
    "إصلاحات": ["Repairs", "Tamir", "op"],
    "سلسلة":   ["Chainstitch", "Zincir dikiş", "op"],
    "تسلسل":   ["Chaining", "Zincirleme", "op"],
    "أوفر":    ["Overlock", "Overlok", "op"],
    "أوفرات":  ["Overlock", "Overlok", "op"],
    "بنط":     ["Hem", "Baston", "op"],
    "حلية":    ["Topstitch", "Süs dikiş", "op"],
    "فحص":     ["Inspection", "Muayene", "op"],
    "لزق":     ["Glue", "Yapıştırma", "op"],
    "رد":      ["Backtack", "Geri dikiş", "op"],
    "تعويض":   ["Compensation", "Telafi", "op"],
    "توصيل":   ["Join", "Birleştirme", "op"],
    "تفتيح":   ["Open", "Açma", "op"],
    "دوران":   ["Turning", "Dönme", "op"],
    "تشغيل":   ["Operation", "Üretim", "op"],
    "مشرف":    ["Supervisor", "Süpervizör", "op"],
    "رئيس":    ["Head", "Şef", "op"],
    "مساعد":   ["Helper", "Yardımcı", "op"],
    "مدير":    ["Manager", "Müdür", "op"],
    "عامل":    ["Worker", "İşçi", "op"],
    "مدخل":    ["Entry", "Giriş", "op"],
    "بيانات":  ["Data", "Veri", "part"],
    "جيب":     ["Pocket", "Cep", "part"],
    "ساعة":    ["Watch", "Saat", "part"],
    "ظهر":     ["Back", "Arka", "part"],
    "صدر":     ["Front", "Ön", "part"],
    "صدرين":   ["Double front", "Çift ön", "part"],
    "كمر":     ["Waistband", "Kemer", "part"],
    "ركبة":    ["Knee", "Diz", "part"],
    "رجل":     ["Leg", "Paça", "part"],
    "جنب":     ["Side", "Yan", "part"],
    "لسان":    ["Fly", "Fly", "part"],
    "حجر":     ["Crotch", "Bacak arası", "part"],
    "تكت":     ["Ticket", "Ticket", "part"],
    "بوكت":    ["Patch", "Yama", "part"],
    "بوكيت":   ["Pocket", "Cep", "part"],
    "خلفى":    ["Back", "Arka", "part"],
    "خلفي":    ["Back", "Arka", "part"],
    "أمامى":   ["Front", "Ön", "part"],
    "أمامي":   ["Front", "Ön", "part"],
    "دخلي":    ["Inner", "İç", "part"],
    "داخلي":   ["Inner", "İç", "part"],
    "خارجي":   ["Outer", "Dış", "part"],
    "وسط":     ["Center", "Orta", "part"],
    "الوسط":   ["Center", "Orta", "part"],
    "لوكسات":  ["Loops", "İlmeği", "part"],
    "سوستة":   ["Zip", "Fermuar", "part"],
    "شريط":    ["Tape", "Bant", "part"],
    "دعامة":   ["Stay", "Takviye", "part"],
    "لقمة":    ["Placket", "Plaket", "part"],
    "كوع":     ["Corner", "Köşe", "part"],
    "رايزر":   ["Riser", "Riser", "part"],
    "بفتة":    ["Binding", "Biye", "part"],
    "فارمتورة": ["Folder", "Földer", "part"],
    "فارمتوره": ["Folder", "Földer", "part"],
    "فولدر":   ["Folder", "Földer", "part"],
    "عراوي":   ["Buttonholes", "Düğme ilmeği", "part"],
    "مقاس":    ["Size", "Beden", "part"],
    "قطعتين":  ["2-piece", "2 parça", "part"],
    "خيالات":  ["Guide lines", "Kılavuz", "part"],
    "كفر":     ["Coverstitch", "Coverstitch", "part"],
    "خط":      ["Line", "Hat", "part"],
    "قسم":     ["Section", "Bölüm", "part"],
    "صالة":    ["Floor", "Salon", "part"],
    "مخزن":    ["Warehouse", "Depo", "part"],
    "مخازن":   ["Warehouses", "Depolar", "part"],
    "ماكينة":  ["Machine", "Makine", "part"],
    "سيارة":   ["Trolley", "Araba", "part"],
    "جوكر":    ["Joker", "Joker", "part"],
    "سنجر":    ["Singer", "Singer", "part"],
    "إبرتين":  ["2-needle", "2 iğne", "part"],
    "تارجت":   ["Target", "Hedef", "part"],
    "تني":     ["2nd", "2.", "mod"],
    "تاني":    ["2nd", "2.", "mod"],
    "تانى":    ["2nd", "2.", "mod"],
    "أول":     ["1st", "1.", "mod"],
    "اول":     ["1st", "1.", "mod"],
    "بتالتة":  ["3rd pass", "3. geçiş", "mod"],
    "سفلي":    ["Bottom", "Alt", "mod"],
    "علوي":    ["Top", "Üst", "mod"],
    "أوتامتك": ["Automatic", "Otomatik", "mod"],
    "فازلين":  ["Wax", "Vazelin", "mod"],
    "مدفع":    ["Rivet gun", "Perçin tabancası", "part"],
    "سواق":    ["Driver", "Şoför", "op"],
    "كلارك":   ["Clark", "Clark", "part"],
    "صيانة":   ["Maintenance", "Bakım", "part"],
    "تجهيزات": ["Equipment", "Ekipman", "part"],
    "أوديت":   ["Audit", "Denetim", "part"],
    "نسب":     ["Ratio", "Oran", "part"],
    "نسبة":    ["Ratio", "Oran", "part"],
    "غياب":    ["Absence", "Devamsızlık", "part"],
    "من":      ["from", "-", "glue"],
    "الجانبين": ["both sides", "iki yandan", "part"],
    "جانبين":  ["both sides", "iki yandan", "part"],
    "و":       ["&", "&", "glue"]
  };
  /* R45: المفاتيح بتتطبّع مرة واحدة وقت التحميل — القاموس نفسه مكتوب
     بالإملاء الأصلي (ثنى/ركبة/خلفى) والبحث بيشتغل على الشكل الموحد
     (ثني/ركبه/خلفي) فلازم المفاتيح تتطبع هي كمان */
  var JGN = {}, JGSN = {};
  (function buildJGN() {
    Object.keys(JG).forEach(function (k) { JGN[jgNormalize(k)] = JG[k]; });
    Object.keys(JG_SPECIAL).forEach(function (k) { JGSN[jgNormalize(k)] = JG_SPECIAL[k]; });
  })();
  var jgNormCache = {};
  function jgNormalize(t) {
    return String(t)
      .replace(/[\u064B-\u0652]/g, "")           /* تشكيل */
      .replace(/\u0649/g, "\u064A")              /* ى → ي */
      .replace(/\u0629/g, "\u0647")              /* ة → ه */
      .trim();
  }
  function jgLookup(tok) {
    var n = jgNormalize(tok);
    if (jgNormCache[n] !== undefined) return jgNormCache[n];
    var hit = JGN[n] || null;
    if (!hit) {
      /* strip ال- definite article */
      if (n.slice(0, 2) === "ال" && n.length > 3) hit = JGN[n.slice(2)] || null;
    }
    if (!hit) {
      /* strip و- conjunction → flag it so the joiner becomes «&» */
      if (n.slice(0, 1) === "و" && n.length > 2 && (JGN[n.slice(1)] || JGSN[jgNormalize(n.slice(1))])) {
        hit = { and: true };
      }
    }
    jgNormCache[n] = hit;
    return hit;
  }
  var termCache = {};
  function termTranslate(name) {
    if (name == null) return null;
    var s = String(name);
    if (!/[\u0600-\u06FF]/.test(s)) return null;   /* not Arabic → as-is */
    var L = I18N.lang();
    if (L === "ar") return null;                    /* Arabic UI (legacy) keeps original */
    var ck = L + "|" + s;
    if (termCache[ck] !== undefined) return termCache[ck];
    termCache[ck] = null;   /* guard against re-entry */
    var out = termTranslateInner(s, L);
    termCache[ck] = out;
    return out;
  }
  function termTranslateInner(s, L) {
    /* 1) multi-word specials first (longest match) — على النص المطبّع */
    s = jgNormalize(s);
    var specials = Object.keys(JGSN).sort(function (a, b) { return b.length - a.length; });
    var pieces = [];   /* {txt, en, tr, tag, and} */
    var rest = s;
    var guard = 0;
    while (rest.length && guard++ < 60) {
      var found = null;
      for (var i = 0; i < specials.length; i++) {
        var sp = specials[i];
        if (rest.replace(/\s+/g, " ").indexOf(sp) === 0) { found = sp; break; }
      }
      if (found) {
        var g = JGSN[found];
        pieces.push({ txt: found, en: g.en, tr: g.tr, tag: "part" });
        rest = rest.slice(found.length);
      } else {
        /* take one word */
        var m = rest.match(/^\S+/);
        if (!m) break;
        var w = m[0];
        rest = rest.slice(w.length);
        var suffix = "";
        var w2 = w.replace(/([*×\d.,]+)$/, function (x) { suffix = " " + x; return ""; });
        /* R45: فاصل & أو + جوه الكلمة نفسها (تكت&زجزاج / +بتالتة) —
           بيتفصل لكلمتين وبينهم «&» */
        var sepSplit = w2.split(/&|\+/);
        if (sepSplit.length > 1) {
          for (var ss = 0; ss < sepSplit.length; ss++) {
            if (ss > 0) pieces.push({ txt: "&", en: "&", tr: "&", tag: "glue" });
            var part = sepSplit[ss].trim();
            if (!part) continue;
            var hs = jgLookup(part);
            if (hs && !hs.and) pieces.push({ txt: part, en: hs[0], tr: hs[1], tag: hs[2], suf: suffix });
            else pieces.push({ txt: part, en: null, tr: null, tag: "?", suf: suffix });
          }
          continue;
        }
        var h = jgLookup(w2);
        if (h && h.and) {
          pieces.push({ txt: w, en: "&", tr: "&", tag: "glue" });
          var inner = jgNormalize(w2).slice(1);
          var hg = JGN[inner];
          if (hg) pieces.push({ txt: w2, en: hg[0], tr: hg[1], tag: hg[2] });
        } else if (h) {
          pieces.push({ txt: w2, en: h[0], tr: h[1], tag: h[2], suf: suffix });
        } else {
          pieces.push({ txt: w, en: null, tr: null, tag: "?", suf: suffix });
        }
      }
      rest = rest.replace(/^\s+/, "");
    }
    var hits = 0;
    for (var p = 0; p < pieces.length; p++) if (pieces[p].en) hits++;
    if (!hits) return null;   /* nothing recognized → original */
    /* 2) re-order: op first + all plain parts → parts + op */
    var first = pieces[0];
    var allRestParts = pieces.length > 1;
    for (var q = 1; q < pieces.length; q++) if (pieces[q].tag !== "part") allRestParts = false;
    var ordered = pieces.slice();
    if (first && first.tag === "op" && allRestParts) {
      ordered = pieces.slice(1).concat([pieces[0]]);
    }
    /* 3) join */
    var words = [];
    for (var r = 0; r < ordered.length; r++) {
      var pc = ordered[r];
      var v = (L === "tr" ? pc.tr : pc.en) || pc.txt;
      if (!v) continue;
      if (pc.suf) v = v + pc.suf;
      if (words.length && (v === "&" || words[words.length - 1] === "&")) {
        words.push(v);
      } else {
        words.push(v);
      }
    }
    var joined = words.join(" ").replace(/\s*&\s*/g, " & ").replace(/\s+/g, " ").trim();
    if (L === "en" && joined) joined = joined.charAt(0).toUpperCase() + joined.slice(1);
    return joined || null;
  }

  function TT(term) {
    /* R50: الترجمة الفورية اتشالت — الجلوسار وبس، والتركي البيدي
       من name_tr/job_tr/label_tr (أعمدة الشيت) في أماكنها */
    var g = GLOSS[term];
    var L = I18N.lang();
    if (L === "ar") return term == null ? "" : String(term);
    if (g) return g[L] || g.ar || String(term);
    /* R45: فكّ المصطلحات — أسماء الوظايف المركّبة (تنشين جيب ساعة …) */
    var jt = termTranslate(term);
    if (jt) return jt;
    return term == null ? "" : String(term);
  }
  /* R42: اسم الجذر — «مأرب 3» عربي / Marib 3 غيره (المستخدم يعدله) */
  function rootLabel() {
    var def = { ar: "\u0645\u0623\u0631\u0628 3", en: "Marib 3", tr: "Marib 3" };
    var r = (DATA && DATA.root) || def;
    return r[I18N.lang()] || r.ar || r.en || "Marib 3";
  }
  /* sewing lines show as خط 1 / Line 1 / Hat 1 */
  function lineLabel(n) {
    var L = I18N.lang();
    var w = L === "ar" ? "خط" : L === "tr" ? "Hat" : "Line";
    return w + " " + n;
  }
  function deptLabel(node) {
    if (/^\d+$/.test(node.label) && node.parentLabel === "SEWING") return lineLabel(node.label);
    /* R50: وضع التركي بيستخدم label_tr من الشيت لو موجود */
    if (I18N.lang() === "tr" && node.labelTr) return node.labelTr;
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
  /* R42: التحديد المتعدد + ترتيب وظيفة/عامل + صفحة الكروت */
  var selSet = {};
  var ordMode = "emp";            /* emp = الاسم ثم الوظيفة · job = الوظيفة ثم الاسم */
  try { ordMode = localStorage.getItem("marib_mp_ord") === "job" ? "job" : "emp"; } catch (e) { }
  var jobOpen = {};               /* مفتوحية صفوف الوظائف (وضع الوظيفة-أولًا) */
  var cardMode = null;            /* emps|req|var|vacs|depts — صفحة تفاصيل الكارت */
  var cardQ = "";
  /* R50: الترجمة الفورية اتشالت — مفيش arShow/deptArShow.
     العربي هو الأصل، والتركي من أعمدة الشيت. */
  var archSel = {};                /* R42: تحديد سجلات الأرشيف (id → true) */
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
             labelTr: row[4] || "",   /* R50: الاسم بالتركي من الشيت */
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

  /* ---------------- R42: تطبيع عربي للبحث ----------------
     الهمزة بأشكالها = ا، والی بأشكالها = ي، والتاء المربوطة = ه،
     والتشكيل والتطويل بيتشالوا — عشان «احمد» يلاقي «أحمد» و«هدى»
     يلاقي «هدي». بتشتغل جوه البحث في الهيكل والأرشيف وصفحات الكروت. */
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[\u0623\u0625\u0622]/g, "\u0627")
      .replace(/\u0649/g, "\u064A")
      .replace(/\u0629/g, "\u0647")
      .replace(/[\u0624]/g, "\u0648")
      .replace(/[\u0626]/g, "\u064A")
      .toLowerCase();
  }

  /* ---------------- search ---------------- */
  function nodeMatches(n, needle) {
    var N = norm(needle);
    var H = norm(hay(n.label));                 /* R42: مطابقة مطبّعة */
    if (H.indexOf(N) >= 0) return true;
    var i;
    for (i = 0; i < n.emps.length; i++) {
      var e = n.emps[i];
      if (norm(hay(e[2])).indexOf(N) >= 0) return true;
      if (norm(String(e[1])).indexOf(N) >= 0) return true;
      if (norm(String(e[3])).indexOf(N) >= 0) return true;   /* الوظيفة كمان */
      if (norm(String(e[0])).indexOf(N) >= 0) return true;
    }
    for (i = 0; i < n.vacs.length; i++) {
      if (norm(hay(n.vacs[i][3])).indexOf(N) >= 0) return true;
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
      '<div class="mph-lead"><b class="mph-root">' + esc(rootLabel()) + '</b><small>' + esc(T("mg_mp_sub")) + "</small></div>" +
      /* R43: الموظفين/المطلوب/الشواغر بيدوسوا — الفرق للعرض بس
       R45: مكان كارت «الإدارات» بقى كارت «الزيادة» — بيدوس ويفتح
       الأقسام اللي فيها ناس زيادة عن المطلوب */
      card("click", String(ROOT ? ROOT.tCount : 0), T("mp_total_emp")) +
      card("req click", totReq === null ? "—" : String(totReq), T("mp_total_req")) +
      card(varCls, varBig, T("mp_total_var")) +
      card("click", String(vac), T("mp_vac")) +
      card("exc click", String(excessTotal()), T("mp_excess"));
    /* الربط: idx 0=موظفين 1=مطلوب 2=فرق 3=شواغر 4=الزيادة */
    var modes = ["emps", "req", null, "vacs", "excess"];
    var cards = h.querySelectorAll(".mph-card");
    for (var ci = 0; ci < cards.length && ci < modes.length; ci++) {
      if (!modes[ci]) continue;   /* R43: كروت الفرق مش أزرار */
      (function (el, mode) {
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("data-card", mode);
        el.title = T("mp_card_open");
        el.addEventListener("click", function () { openCards(mode); });
      })(cards[ci], modes[ci]);
    }
    /* R45: عدّاد «بدون كود» جنب زرار الأدوات */
    var ncn = $("mpNoCodeN");
    if (ncn) ncn.textContent = noCodeList().length ? String(noCodeList().length) : "";
  }
  /* R45 — الزيادة (ناس أكتر من المطلوب): العقدة اللي ليها «مطلوب» يدوي
     (override) وعددها أكبر منه بتحسب هي وحدها — أبناؤها مش بيتعدلوا تاني
     عشان مفيش عدّ مضاعف. العقد اللي من غير override مبتجيبش زيادة أبدًا
     (المطلوب فيها = الموجود + الشواغر) فبنزل للأبناء بس */
  function excessTotal() {
    /* R46-final: بسيط ومباشر — اجمع surplus من excessNodes نفسها.
       excessNodes بيرجّع القايمة اللي اليوزر بيشوفها (+1, +2) — نجمعها
       ونرجّع المجموع. ده يضمن إن الرقم في الكارت = مجموع اللي في الكروت. */
    var nodes = excessNodes();
    var t = 0;
    for (var i = 0; i < nodes.length; i++) t += nodes[i].x;
    return t;
  }
  function excessNodes() {
    /* R50: بننزل لأعمق قسم ليه «مطلوب» يدوي — لو الأب عنده مطلوب
       وولاده كمان عندهم مطلوب، بنعرض الولاد (الأقسام الفعلية)
       مش الأب — زي ما المالك شاف: الأمن +2 والصيانة +1 = الكارت 3
       مش رقم الإدارة المجمع. */
    var out = [];
    if (!ROOT) return out;
    function hasOwnKid(n) {
      for (var k = 0; k < n.kids.length; k++) {
        if (n.kids[k].own !== null) return true;
        if (hasOwnKid(n.kids[k])) return true;
      }
      return false;
    }
    (function walk(n) {
      if (n.own !== null && !hasOwnKid(n)) {
        if (n.tCount > n.own) out.push({ n: n, x: n.tCount - n.own });
        return;   /* القسم ده هو الأعمق — مفيش أعمق منه بمطلوب */
      }
      for (var k = 0; k < n.kids.length; k++) walk(n.kids[k]);
    })(ROOT);
    out.sort(function (a, b) { return b.x - a.x || natCmp(deptLabel(a.n), deptLabel(b.n)); });
    return out;
  }
  /* R45 — الموظفين اللي من غير كود (فاضي أو «جديد») — الشواغر لأ:
     دي وظايف محتاجين ناس فيها، مش ناس من غير كود */
  function noCodeList() {
    if (!DATA) return [];
    return DATA.emps.filter(function (e) { return !e[6] && (!e[1] || e[1] === "جديد"); });
  }

  /* ---------------- render: tree rows ---------------- */
  function hl(text, needle) {
    var s = String(text);
    if (!needle) return esc(s);
    /* R42: الدور على النص المطبّع — عشان «أحمد» تتعلم حتى لو كتبت «احمد» */
    var N = norm(needle);
    var low = norm(s);
    var i = low.indexOf(N);
    if (i < 0) return esc(s);
    return esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + N.length)) + "</mark>" + esc(s.slice(i + N.length));
  }

  function varBadge(count, eff, key) {
    if (eff === null) return '<b class="mv na">—</b>';
    var v = count - eff;
    var cls = v < 0 ? "neg" : v > 0 ? "pos" : "zero";
    var txt = v > 0 ? "+" + v : String(v);
    /* R42: مربع الفرق بقى بيتقفى بالماوس — بيقول الوظايف الناقصة
       جوه الفرع ده بالظبط (context-aware) */
    return '<b class="mv ' + cls + '" data-vk="' + esc(key || "") + '"><bdi>' + txt + "</bdi></b>";
  }

  /* الوظايف الناقصة جوه subtree العقدة (مجمّعة بالعدد) */
  function missingOf(n) {
    var byJob = {};
    var out = [];
    (function walk(x) {
      for (var i = 0; i < x.vacs.length; i++) {
        var j = x.vacs[i][3] || T("mp_no_job");
        byJob[j] = (byJob[j] || 0) + 1;
      }
      for (var k = 0; k < x.kids.length; k++) walk(x.kids[k]);
    })(n);
    for (var j2 in byJob) out.push({ job: j2, n: byJob[j2] });
    out.sort(function (a, b) { return b.n - a.n || String(a.job).localeCompare(String(b.job), "ar"); });
    return out;
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
    return '<b class="mn a"><bdi>' + n.tCount + "</bdi></b>" + reqChip(n) + varBadge(n.tCount, n.eff, n.key);
  }

  /* the Marib 3 root row — always the first row of the tree */
  function rootNodeRow() {
    var open = !!expanded["root"];
    var lbl = rootLabel();
    var tw = '<button class="tw' + (open ? " open" : "") + '" type="button" aria-expanded="' + (open ? "true" : "false") + '" aria-label="' + esc(lbl) + '">' + ICO_CHEV + "</button>";
    var ico = '<span class="mi root">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>' + "</span>";
    /* R42: قلم تعديل جنب Marib 3 نفسه (الاسم بالـ3 لغات) */
    var adm = ADMIN
      ? '<span class="mo rn" role="button" tabindex="0" title="' + esc(T("mp_root_edit")) + '" data-rootedit="1">' + ICO_PEN + "</span>"
      : "";
    return '<div class="mpr rootrow' + (open ? " ex" : "") + '" data-k="root" data-t="dept">' +
      tw + ico + '<span class="ml"><b class="mln rt">' + esc(lbl) + "</b></span>" + bar(ROOT) + badgeHTML(ROOT) + adm + "</div>";
  }

  function deptRow(n, needle, anim, delay) {
    var isOpen = !!expanded[n.key];
    var hasKids = n.kids.length > 0 || n.emps.length > 0 || n.vacs.length > 0;
    var tw = hasKids
      ? '<button class="tw' + (isOpen ? " open" : "") + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-label="' + esc(n.label) + '">' + ICO_CHEV + "</button>"
      : '<span class="tw ghost"></span>';
    var ico = '<span class="mi dept">' + ICO_DEPT + "</span>";
    /* R50: الترجمة الفورية اتشالت — الاسم يظهر بالعربي زي ما هو،
       وفي وضع التركي بيستخدم label_tr من الشيت (deptLabel). */
    var label = '<span class="ml"><b class="mln">' + hl(deptLabel(n), needle) + "</b>" +
      (n.own !== null ? '<i class="mls ov" title="' + esc(T("mp_req_own")) + '">✎</i>' : "") + "</span>";
    /* R39: زرار واحد بس — نفس المودال بيعمل التسمية والنقل مع بعض
       R41: + سلة حمرا لمسح القسم الفاضي (نسخ الإضافة المتكررة) */
    var adm = ADMIN
      ? '<span class="mo rn" role="button" tabindex="0" title="' + esc(T("mp_dept_edit")) + '" data-rn="' + esc(n.id) + '">' + ICO_PEN + "</span>" +
        '<span class="mo dx" role="button" tabindex="0" title="' + esc(T("mp_dept_del")) + '" data-dx="' + esc(n.id) + '">' + ICO_TRASH + "</span>"
      : "";
    var style = "--d:" + n.depth + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    return '<div class="mpr dn' + (anim ? " in" : "") + '" style="' + style + '" data-k="' + esc(n.key) + '" data-t="dept">' +
      tw + ico + label + bar(n) + badgeHTML(n) + adm + "</div>";
  }

  /* employee row — الاسم والكود مع بعض (Expand ⇒ الوظيفة) */
  function empRow(e, needle, anim, delay) {
    var id = e[0], code = String(e[1] || ""), name = String(e[2] || "");
    var nameTr = String(e[11] || ""); /* R50: التركي من الشيت */
    var jobTr = String(e[12] || "");  /* R50: التركي من الشيت */
    var isOpen = !!empOpen[id];
    var isNew = !code || code === "جديد";
    var trs = transfersOf(id);
    var tw = '<button class="tw' + (isOpen ? " open" : "") + '" type="button" aria-expanded="' + (isOpen ? "true" : "false") + '" aria-label="' + esc(name) + '">' + ICO_CHEV + "</button>";
    var ico = '<span class="mi emp">' + ICO_EMP + "</span>";
    var codeChip = isNew
      ? '<i class="mlc newc">' + esc(T("mp_code_new")) + "</i>"
      : '<i class="mlc num">' + hl(code, needle) + "</i>";
    /* R50: العربي هو الأصل — ووضع التركي بيعرض name_tr/job_tr من الشيت */
    var Lng = I18N.lang();
    var displayName = (Lng === "tr" && nameTr) ? nameTr : name;
    var displayJob = (Lng === "tr" && jobTr) ? jobTr : (e[3] || "");
    var label = '<span class="ml"><b class="mln">' + hl(displayName, needle) + "</b>" + codeChip +
      /* R40: مؤشر صغير — الوقوف على الصف بيطلع الماكينة والملاحظات
         (من غير title عشان ميتعملش تولتيبين فوق بعض) */
      ((e[8] || e[7]) ? '<i class="mtag" aria-hidden="true">' + ICO_MACH + "</i>" : "") +
      "</span>";
    var pen = ADMIN ? '<span class="mo" role="button" tabindex="0" title="' + esc(T("mp_edit")) + '" data-ei="' + esc(id) + '">' + ICO_PEN + "</span>" : "";
    /* R43: تشيك بوكس دايم جنب كل موظف (للأدمن) — من غير وضع تحديد */
    var chk = ADMIN ? '<span class="mchk' + (selSet[id] ? " on" : "") + '" data-chk="' + esc(id) + '" role="checkbox" aria-checked="' + (selSet[id] ? "true" : "false") + '" tabindex="0">' + (selSet[id] ? '\u2713' : "") + "</span>" : "";
    var style = "--d:" + (depthOf(e[4]) + 1) + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    /* R39: class "em" (NOT "en") — the dashboard's single-language rule
       ".en { display:none !important }" (R31) used to swallow these whole
       rows: names+codes went invisible, only vacancy (job) rows stayed. */
    return '<div class="mpr em' + (isOpen ? " ex" : "") + (anim ? " in" : "") + (selSet[id] ? " sel" : "") + '" style="' + style + '" data-i="' + esc(id) + '" data-t="emp">' +
      chk + tw + ico + label + '<span class="mflex"></span>' + (trs.length ? '<span class="mtr" title="' + esc(T("mp_emp_transfers")) + '">' + trs.length + "</span>" : "") + pen + "</div>";
  }

  /* ---------------- R42: صف الوظيفة (وضع «الوظيفة ثم العامل») ---------------- */
  function jobRow(node, job, list, needle, anim, delay) {
    var jk = node.key + "|" + job;
    var open = !!jobOpen[jk];
    var filled = 0, vacs = 0;
    for (var i = 0; i < list.length; i++) if (list[i][6]) vacs++; else filled++;
    var tw = '<button class="tw' + (open ? " open" : "") + '" type="button" aria-expanded="' + (open ? "true" : "false") + '" aria-label="' + esc(job) + '">' + ICO_CHEV + "</button>";
    var ico = '<span class="mi job">' + ICO_JOB + "</span>";
    var label = '<span class="ml"><b class="mln">' + hl(TT(job) || T("mp_no_job"), needle) + "</b>" +
      (vacs ? '<i class="mls vln">' + esc(T("mp_vac")) + " " + vacs + "</i>" : "") + "</span>";
    var style = "--d:" + (node.depth + 1) + (delay !== undefined ? ";animation-delay:" + delay + "ms" : "");
    return '<div class="mpr jr' + (open ? " ex" : "") + (anim ? " in" : "") + '" style="' + style + '" data-jk="' + esc(jk) + '" data-t="job">' +
      tw + ico + label + '<span class="mflex"></span>' + badgeHTML({ tCount: filled, eff: filled + vacs, key: "j:" + jk, own: null }) + "</div>";
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
    /* R40: الماكينة والملاحظات ليهم صفين هنا كمان (للموبايل مفيش hover) */
    return '<div class="mpr-det">' +
      '<div class="drow"><span>' + esc(T("mp_code")) + '</span><b class="num">' + (isNew ? esc(T("mp_code_new")) : esc(code)) + "</b></div>" +
      '<div class="drow job"><span>' + esc(T("mp_job")) + "</span><b>" + esc(job ? TT(job) : T("mp_no_job")) + "</b></div>" +
      (e[8] ? '<div class="drow mach"><span>' + esc(T("mp_mach")) + '</span><b class="num">' + esc(e[8]) + "</b></div>" : "") +
      (e[7] ? '<div class="drow note"><span>' + esc(T("mp_note")) + '</span><b>' + esc(e[7]) + "</b></div>" : "") +
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

  /* ---------------- R40: Power-BI-style hover tooltip ----------------
     زي حوار الباور بي أي بالظبط: لما الماوس يقف على صف الموظف — من غير
     أي ضغط — كارت صغير بيطلع جنب الماوس فيه الماكينة والملاحظات
     (الخلايا المكتوبة في العمودين في شيت Manpower). الموظف اللي ملوش
     حاجة مكتوبة في العمودين مش بيطلعله كارت. الكارت بيتحرك مع
     الماوس وبيختفي أول ما الماوس يخرج من الصف. */
  var tip = null, tipTimer = null, tipCurId = null, tipOn = false;

  function tipEl() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "mp-tip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    return tip;
  }
  function tipBuild(emp) {
    var mach = String(emp[8] || "").trim();
    var note = String(emp[7] || "").trim();
    var job = String(emp[3] || "").trim();
    var isNew = !emp[1] || emp[1] === "جديد";
    var h = '<div class="tt-h">' +
      '<span class="tt-ico">' + ICO_EMP + "</span><b>" + esc(emp[2]) + "</b>" +
      (isNew ? '<i class="tt-new">' + esc(T("mp_code_new")) + "</i>" : '<i class="num">' + esc(emp[1]) + "</i>") +
      "</div>";
    /* R42 (الطلب 11): الوظيفة بقت أول سطر في التولتيب — قبل الماكينة
       والملاحظات */
    if (job) h += '<div class="tt-r"><span>' + esc(T("mp_job")) + '</span><b class="tt-j">' + esc(TT(job)) + "</b></div>";
    if (mach) h += '<div class="tt-r"><span>' + esc(T("mp_mach")) + '</span><b class="tt-m num">' + esc(mach) + "</b></div>";
    if (note) h += '<div class="tt-r"><span>' + esc(T("mp_note")) + '</span><b class="tt-n">' + esc(note) + "</b></div>";
    return h;
  }
  function tipShow(emp, e) {
    var el = tipEl();
    el.innerHTML = tipBuild(emp);
    el.classList.add("on");
    tipOn = true;
    tipMove(e);
  }
  function tipMove(e) {
    if (!tip || !tipOn) return;
    var w = tip.offsetWidth || 200, h = tip.offsetHeight || 70;
    var x = e.clientX + 16, y = e.clientY + 18;
    if (x + w > window.innerWidth - 10) x = e.clientX - w - 14;   /* flip left */
    if (x < 10) x = 10;
    if (y + h > window.innerHeight - 10) y = e.clientY - h - 14;  /* flip up */
    if (y < 10) y = 10;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function tipHide() {
    clearTimeout(tipTimer);
    if (tip) tip.classList.remove("on");
    tipOn = false;
  }

  function renderTree(animKey) {
    var box = $("mpTree");
    if (!box) return;
    tipHide();   /* R40: الصفوف بتتبدل — التولتيب القديمة مالهاش لازمة */
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
    var needle = q;   /* R42: التطبيع بيحصل جوه nodeMatches/hl نفسها */
    var html = [];
    var shown = 0;
    var animIdx = 0;

    html.push(rootNodeRow());
    shown++;

    /* R39: سهم Marib 3 بقى بيفتح ويقفل بجد — قبل كده الصفوف كانت بتترسم
       دايمًا مهما حصل. البحث بيفضل الشجرة مفتوحة عشان النتايج تبان. */
    var rootOpen = needle ? true : !!expanded["root"];
    var rootBefore = html.length;   /* R44: بلوك أبناء الجذر */

    /* R44: فاصل صغير حوالين بلوك الأبناء — اللي بيتفتح تحت أي قسم
       بنبعد شوية عن أبوه عشان العين تفرقهم من أول نظرة */
    var GAP = '<i class="mp-gap" aria-hidden="true"></i>';   /* plain fallback */
    function gapEl(d) { return '<i class="mp-gap" aria-hidden="true" style="--d:' + d + '"></i>'; }
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
          var before = html.length;   /* R44: بداية بلوك أبناء القسم */
          walk(c, ra);
          if (ordMode === "job") {
            /* R42: وضع «الوظيفة ثم العامل» — الموظفين بتوع القسم
               بيتجمعوا حسب الوظيفة، وكل وظيفة بتتفتح على العمال */
            var byJob = {};
            var jobOrder = [];
            var all2 = c.emps.concat(c.vacs);
            for (var jj = 0; jj < all2.length; jj++) {
              var jb = all2[jj][3] || "";
              if (!byJob[jb]) { byJob[jb] = []; jobOrder.push(jb); }
              byJob[jb].push(all2[jj]);
            }
            jobOrder.sort(function (a, b) {
              return byJob[b].length - byJob[a].length || natCmp(TT(a), TT(b));
            });
            for (var jo = 0; jo < jobOrder.length; jo++) {
              var jname = jobOrder[jo];
              var jd = ra ? Math.min(animIdx++ * 12, 260) : undefined;
              html.push(jobRow(c, jname, byJob[jname], needle, ra, jd));
              shown++;
              var jk = c.key + "|" + jname;
              if (jobOpen[jk]) {
                var jl = byJob[jname].slice().sort(function (a, b) {
                  var av = a[6] ? 1 : 0, bv = b[6] ? 1 : 0;
                  if (av !== bv) return av - bv;               /* الشواغر آخر */
                  return String(a[2]).localeCompare(String(b[2]), "ar");
                });
                for (var je = 0; je < jl.length; je++) {
                  var jed = ra ? Math.min(animIdx++ * 12, 260) : undefined;
                  if (jl[je][6]) html.push(vacRow(jl[je], needle, ra, jed));
                  else {
                    html.push(empRow(jl[je], needle, ra, jed));
                    if (empOpen[jl[je][0]]) html.push(empDetail(jl[je]));
                  }
                  shown++;
                }
              }
            }
          } else {
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
          /* R44: قفل بلوك الأبناء — فاصل فوق (قبل أول ابن) وتحت (بعد آخر ابن) */
          if (html.length > before) {
            html.splice(before, 0, gapEl(c.depth + 1));
            html.push(gapEl(c.depth + 1));
          }
        }
      }
      /* employees hanging directly on n (n = ROOT or a mid-level node) */
      if (n === ROOT) return;
    }

    if (rootOpen) {
      walk(ROOT, false);
      if (html.length > rootBefore) { html.splice(rootBefore, 0, gapEl(0)); html.push(gapEl(0)); }
    }
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
    var needle = archQ;   /* R42: بحث مطبّع */
    var html = [];
    var trs = DATA.transfers;
    for (var i = 0; i < trs.length; i++) {
      var t = trs[i];
      var hayS = t[1] + " " + t[2] + " " + t[3] + " " + (t[4] || "") + " " + (t[5] || "") + " " + (t[6] || "") + " " + (t[7] || "") + " " + (t[8] || "") + " " + (t[9] || "");
      if (needle && norm(hayS).indexOf(norm(needle)) < 0) continue;
      var kind = t[8] === "dept" || t[8] === "dept-move" ? "mp_kind_deptmove"
        : t[8] === "dept-rename" ? "mp_kind_rename"
        : t[8] === "dept-del" ? "mp_kind_deptdel"    /* R41: مسح قسم */
        : t[8] === "fill" ? "mp_kind_fill"
        : t[8] === "out" ? "mp_kind_out"          /* R39: حذف/خروج */
        : t[8] === "dept" ? "mp_kind_dept"
        : t[8] === "job" ? "mp_kind_job"
        : "mp_kind_move";
      var isDeptOp = t[8] === "dept-move" || t[8] === "dept-rename" || t[8] === "dept-del";
      /* R42: تحديد متعدد في الأرشيف (للأدمن) — مسح السجلات المحددة */
      var tid = t[10] || "";
      var chk = ADMIN && tid ? '<span class="mchk' + (archSel[tid] ? " on" : "") + '" data-achk="' + esc(tid) + '" role="checkbox" aria-checked="' + (archSel[tid] ? "true" : "false") + '" tabindex="0">' + (archSel[tid] ? '\u2713' : "") + "</span>" : "";
      html.push('<div class="mpr ar in' + (archSel[tid] ? " sel" : "") + '" style="--d:0">' +
        chk +
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

  /* ---------------- R42: صفحات الكروت (تفاصيل كل كارت) ----------------
     الضغط على أي كارت في الملخص يفتح صفحة كاملة بكل اللي جواه + بحث.
     الموظفين / المطلوب / الفرق / الشواغر / الإدارات — كل واحدة بترتيبها. */
  function openCards(mode) {
    cardMode = mode;
    cardQ = "";
    var inp = $("mpCardsSearch");
    if (inp) inp.value = "";
    setView("cards");
    renderCards();
  }
  function closeCards() {
    cardMode = null;
    setView("tree");
  }
  function renderCards() {
    var box = $("mpCardsList");
    if (!box || !DATA || !ROOT) return;
    var ttl = $("mpCardsTitle");
    var titles = { emps: "mp_total_emp", req: "mp_total_req", var: "mp_total_var", vacs: "mp_vac", depts: "mp_depts", excess: "mp_excess_t", nocode: "mp_nocode_t" };
    if (ttl) ttl.textContent = T(titles[cardMode] || "mg_mp");
    var needle = cardQ;
    var html = [];
    var N = norm(needle);

    function sub(v, deptId) {
      return '<div class="cc-sub">' + esc(deptPathTT(findByKey("d:" + deptId)) || rootLabel()) + "</div>";
    }

    if (cardMode === "depts") {
      /* كل الإدارات بالمسار + الأعداد */
      var list2 = [];
      (function collect(n) {
        for (var i = 0; i < n.kids.length; i++) {
          var c = n.kids[i];
          list2.push(c);
          collect(c);
        }
      })(ROOT);
      for (var i2 = 0; i2 < list2.length; i2++) {
        var d = list2[i2];
        var hayD = hay(d.label) + " " + d.tCount + " " + d.eff;
        if (N && norm(hayD).indexOf(N) < 0) continue;
        var v2 = d.tCount - d.eff;
        html.push('<div class="cc-row"><span class="cc-main">' + hl(deptLabel(d), needle) + "</span>" +
          sub(0, d.parent || "") +
          badgeHTML(d) + "</div>");
      }
    } else if (cardMode === "nocode") {
      /* R45: كل اللي من غير كود — قلم تعديل يفتح المودال يكتب الكود */
      var nc = noCodeList();
      for (var inc = 0; inc < nc.length; inc++) {
        var ne = nc[inc];
        var nnode = findByKey("d:" + ne[4]);
        if (N && norm(hay(ne[2]) + " " + hay(ne[3]) + " " + (nnode ? nodePathTT(nnode) : "")).indexOf(N) < 0) continue;
        html.push('<div class="cc-row ncr"><span class="cc-main">' + hl(ne[2], needle) + ' <i class="mlc newc">' + esc(T("mp_code_new")) + "</i></span>" +
          '<div class="cc-sub">' + esc(TT(ne[3]) || T("mp_no_job")) + " · " + esc(nnode ? nodePathTT(nnode) : "—") + "</div>" +
          (ADMIN ? '<span class="cc-act"><span class="mo" role="button" tabindex="0" title="' + esc(T("mp_nocode_edit")) + '" data-ei="' + esc(ne[0]) + '">' + ICO_PEN + "</span></span>" : "") +
          "</div>");
      }
    } else if (cardMode === "excess") {
      /* R46-final: اعرض الأقسام اللي فيها surplus فقط (من excessNodes).
         كل قسم يبقى كارت مستقل باسمه + رقم الزيادة (+N) + مسار الأب.
         مفيش عرض للأقسام الداخلية أو الوظايف — سيمبل ومباشر. */
      var exn = excessNodes();
      for (var ix = 0; ix < exn.length; ix++) {
        var xn = exn[ix].n, xx = exn[ix].x;
        if (N && norm(hay(xn.label) + " " + nodePathTT(xn)).indexOf(N) < 0) continue;
        html.push('<div class="cc-row jump" data-jump="' + esc(xn.id) + '">' +
          '<span class="cc-main">' + hl(deptLabel(xn), needle) + ' <b class="mv pos"><bdi>+' + xx + '</bdi></b></span>' +
          '<div class="cc-sub faint">' + esc(nodePathTT(parentOf(xn)) || rootLabel()) + '</div>' +
          '</div>');
      }
    } else if (cardMode === "vacs") {
      /* كل الشواغر — الوظيفة والمكان، وزرار التعيين للأدمن */
      var vacs2 = [];
      (function collectV(n) {
        for (var i = 0; i < n.vacs.length; i++) vacs2.push({ e: n.vacs[i], n: n });
        for (var k = 0; k < n.kids.length; k++) collectV(n.kids[k]);
      })(ROOT);
      vacs2.sort(function (a, b) { return natCmp(nodePathTT(a.n), nodePathTT(b.n)); });
      for (var iv = 0; iv < vacs2.length; iv++) {
        var vv = vacs2[iv];
        var jname2 = vv.e[3] || "";
        if (N && norm(hay(jname2) + " " + nodePathTT(vv.n)).indexOf(N) < 0) continue;
        var adm = ADMIN
          ? '<span class="cc-act"><span class="mo vf" role="button" tabindex="0" title="' + esc(T("mp_vac_fill")) + '" data-vf="' + esc(vv.e[0]) + '">' + ICO_PLUS + "</span>" +
            '<span class="mo vx" role="button" tabindex="0" title="' + esc(T("mp_vac_del")) + '" data-vx="' + esc(vv.e[0]) + '">' + ICO_X + "</span></span>"
          : "";
        html.push('<div class="cc-row vac"><span class="cc-main vln">' + esc(T("mp_vac")) + " — " + hl(TT(jname2) || T("mp_no_job"), needle) + "</span>" +
          '<div class="cc-sub">' + esc(nodePathTT(vv.n)) + "</div>" + adm + "</div>");
      }
    } else {
      /* موظفين / مطلوب / فرق — كل الموظفين بالمسار */
      var emps3 = [];
      (function collectE(n) {
        for (var i = 0; i < n.emps.length; i++) emps3.push({ e: n.emps[i], n: n });
        for (var k = 0; k < n.kids.length; k++) collectE(n.kids[k]);
      })(ROOT);
      emps3.sort(function (a, b) { return String(a.e[2]).localeCompare(String(b.e[2]), "ar"); });
      var deptList = [];
      (function collectD(n) {
        for (var i = 0; i < n.kids.length; i++) { deptList.push(n.kids[i]); collectD(n.kids[i]); }
      })(ROOT);
      /* كارت «الفرق»: صف لكل قسم فيه فرق مش صفر */
      if (cardMode === "var") {
        for (var idp = 0; idp < deptList.length; idp++) {
          var dd = deptList[idp];
          var v3 = dd.tCount - dd.eff;
          if (v3 === 0) continue;
          if (N && norm(hay(dd.label)).indexOf(N) < 0) continue;
          html.push('<div class="cc-row"><span class="cc-main">' + hl(deptLabel(dd), needle) + "</span>" +
            '<div class="cc-sub">' + esc(nodePathTT(parentOf(dd)) || rootLabel()) + "</div>" +
            badgeHTML(dd) + "</div>");
        }
      } else {
        for (var ie = 0; ie < emps3.length; ie++) {
          var ee = emps3[ie].e;
          var nn = emps3[ie].n;
          if (N && norm(hay(ee[2]) + " " + ee[1] + " " + hay(ee[3]) + " " + nodePathTT(nn)).indexOf(N) < 0) continue;
          html.push('<div class="cc-row"><span class="cc-main">' + hl(ee[2], needle) + ' <i class="mlc num">' + hl(String(ee[1] || ""), needle) + "</i></span>" +
            '<div class="cc-sub">' + esc(TT(ee[3]) || T("mp_no_job")) + " · " + esc(nodePathTT(nn)) + "</div></div>");
        }
      }
    }
    var emptyEl = $("mpCardsEmpty");
    if (emptyEl) emptyEl.hidden = html.length > 0;
    box.innerHTML = html.join("");
    mpTitle();   /* R42: عنوان التاب — العنوان بيتحدد بعد ما اسم الكارت يتكتب */
  }

  /* ---------------- render: all ---------------- */
  function renderAll(animAll) {
    renderHero();
    renderTree(animAll ? "__all__" : null);
    renderArch();
    if (cardMode) renderCards();
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

  /* ---------------- R42: combobox الوظائف ----------------
     خانة الوظيفة بقت دروب ليست حقيقية: السهم بيفتح القايمة كلها،
     والكتابة بتفلتر — وتقدر تكتب وظيفة جديدة براحتك. */
  function attachCombo(input, getOptions) {
    if (!input || input._combo) return;
    var wrap = document.createElement("span");
    wrap.className = "mp-combo";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mc-arrow";
    btn.setAttribute("aria-label", T("mp_combo_open"));
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    wrap.appendChild(btn);
    var list = document.createElement("div");
    list.className = "mc-list";
    wrap.appendChild(list);
    input.setAttribute("autocomplete", "off");

    function renderList() {
      var qv = norm(input.value.trim());
      var opts = getOptions() || [];
      var html = [];
      var shown = 0;
      for (var i = 0; i < opts.length && shown < 300; i++) {
        var o = opts[i];
        if (qv && norm(o).indexOf(qv) < 0) continue;
        shown++;
        html.push('<button type="button" class="mc-o" data-v="' + esc(o) + '">' + hl(o, qv) + "</button>");
      }
      if (!shown) html.push('<div class="mc-none">' + esc(T("mp_combo_none")) + "</div>");
      list.innerHTML = html.join("");
    }
    function open() {
      renderList();
      list.classList.add("on");
      input.setAttribute("aria-expanded", "true");
      setTimeout(function () {
        var sel = list.querySelector(".mc-o.sel");
        if (sel) sel.classList.remove("sel");
      }, 0);
    }
    function close() {
      list.classList.remove("on");
      input.setAttribute("aria-expanded", "false");
    }
    btn.addEventListener("mousedown", function (e) {
      e.preventDefault();
      if (list.classList.contains("on")) close(); else open();
      input.focus();
    });
    input.addEventListener("focus", open);
    input.addEventListener("input", function () {
      if (!list.classList.contains("on")) open(); else renderList();
    });
    input.addEventListener("blur", function () {
      setTimeout(close, 140);
    });
    input.addEventListener("keydown", function (e) {
      var items = list.querySelectorAll(".mc-o");
      var idx = -1;
      for (var i = 0; i < items.length; i++) if (items[i].classList.contains("sel")) { idx = i; break; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!list.classList.contains("on")) { open(); return; }
        if (items.length) {
          items[idx] && items[idx].classList.remove("sel");
          var nx = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items[nx].classList.add("sel");
          items[nx].scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "Enter") {
        if (list.classList.contains("on") && idx >= 0 && items[idx]) {
          e.preventDefault();
          input.value = items[idx].getAttribute("data-v") || "";
          close();
        }
      } else if (e.key === "Escape") {
        close();
      }
    });
    list.addEventListener("mousedown", function (e) {
      var b = e.target.closest ? e.target.closest(".mc-o") : null;
      if (!b) return;
      e.preventDefault();
      input.value = b.getAttribute("data-v") || "";
      close();
      input.focus();
    });
    input._combo = true;
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

  /* ---------------- R41: modal button helpers ----------------
     زرار الحفظ بيتعطّل أول ما يتداس + الكلمة بتتحول «جاري الحفظ…» —
     ده اللي كان ناقص: الضغط السريع كان بيعمل أقسام مكررة قبل ما
     الرد يوصل من السيرفر. */
  function btnBusy(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn._t41 = btn.textContent;
    btn.textContent = T("mp_saving");
  }
  function btnIdle(btn) {
    if (!btn) return;
    btn.disabled = false;
    if (btn._t41) { btn.textContent = btn._t41; btn._t41 = null; }
  }

  /* فتح سلسلة الآباء لغاية القسم + فلاش ذهبي عليه — أوضح رسالة إنه اتضاف */
  function expandToDept(id) {
    var n = findByKey("d:" + id);
    expanded["root"] = true;
    var guard = 0;
    while (n && n !== ROOT && guard++ < 40) { expanded[n.key] = true; n = parentOf(n); }
  }
  function flashDept(id) {
    var rows = document.querySelectorAll("#mpTree .mpr");
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("data-k") === "d:" + id) {
        var r = rows[i];
        r.classList.add("newflash");
        try { r.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { }
        setTimeout(function () { r.classList.remove("newflash"); }, 2600);
        return;
      }
    }
  }
  function clearSearch() {
    q = "";
    var s = $("mpSearch");
    if (s) s.value = "";
  }

  /* ---------------- R42: confirmBox — تأكيد بثيم الموقع ----------------
     بدل حوارات المتصفح (window.confirm) اللي شكلها تبع المتصفح مش
     الموقع: نفس المودال الدنيم وزرار خطر أحمر للمسح. بترجع Promise. */
  function confirmBox(opts) {
    /* opts: { title, html, danger, okText, cancelText } */
    return new Promise(function (resolve) {
      var m = modalOpen("mpm-confirm",
        '<h3 class="' + (opts.danger ? "del-h" : "") + '">' + esc(opts.title || T("mp_confirm_t")) + "</h3>" +
        '<div class="cf-body">' + (opts.html || "") + "</div>" +
        '<div class="mpm-btns">' +
        '<button type="button" class="mpm-x">' + esc(opts.cancelText || T("mp_cancel")) + "</button>" +
        '<button type="button" class="' + (opts.danger ? "mpm-del" : "mpm-ok") + '">' + esc(opts.okText || T("mp_save")) + "</button>" +
        "</div>");
      m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); resolve(false); });
      var okBtn = m.querySelector(".mpm-del, .mpm-ok");
      okBtn.addEventListener("click", function () { m.remove(); resolve(true); });
      okBtn._t41 = null;
      setTimeout(function () { try { okBtn.focus(); } catch (e) { } }, 60);
    });
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
    var okBtn = m.querySelector(".mpm-ok"), modalBusy = false;
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      if (modalBusy) return;   /* R41: مفيش حفظ تاني والطلب الأول لسه ماشي */
      var newName = $("mdName").value.trim();
      var newParent = trailToId($("mdMove")._trail || []);
      if (!newName) { toast(T("mp_fill"), "err"); return; }
      var renamed = newName !== shown0;   /* R39: compare against the shown word */
      var movedParent = newParent !== node.parent;
      if (!renamed && !movedParent) { m.remove(); return; }
      /* guard: can't move a node inside itself */
      var t = $("mdMove")._trail || [];
      if (t.indexOf(node.id) >= 0) { toast(T("mp_cycle"), "err"); return; }
      modalBusy = true; btnBusy(okBtn);   /* R41 */
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
        modalBusy = false; btnIdle(okBtn);   /* R41: رجّع الزرار عشان يعدّل تاني */
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
    var okBtn = m.querySelector(".mpm-ok"), modalBusy = false;
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      if (modalBusy) return;   /* R41: الضغطات الزيادة بتتجاهل خالص */
      var name = $("mdName").value.trim();
      if (!name) { toast(T("mp_fill"), "err"); return; }
      var parentId = trailToId($("mdMove")._trail || []);
      modalBusy = true; btnBusy(okBtn);   /* R41: الزرار بيتعطّل فورًا + «جاري الحفظ…» */
      MaribCloud.manpowerPost("deptAdd", { name: name, parentId: parentId }).then(function (r) {
        toast(T("mp_dept_added") + " — " + name, "ok");
        m.remove();
        clearSearch();               /* R41: مفيش فلتر يخبي القسم الجديد */
        var newId = r && r.id ? String(r.id) : "";
        return reload().then(function () {
          if (!newId) return;
          expandToDept(newId);       /* افتح الأب + الشجرة توريه */
          renderTree();
          flashDept(newId);         /* فلاش ذهبي + سكرول ليه */
        });
      }).catch(function (e) {
        modalBusy = false; btnIdle(okBtn);   /* R41: فشل؟ رجّع الزرار تاني */
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { $("mdName").focus(); } catch (e) { } }, 60);
  }

  /* ---------------- DELETE-DEPT confirm (R41) ----------------
     سلة صغيرة جنب كل قسم → مودال تأكيد بيوري المسار والمحتوى:
     القسم الفاضي بيتمسح بضغطة، واللي فيه حاجة الزرار الأحمر بيفضل
     مقفول مع رسالة توضيحية — عشان رأس مال البشر ميتمسحش بالغلط. */
  function openDeptDel(node) {
    if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
    var kids = node.kids.length, emps = node.emps.length, vacs = node.vacs.length;
    var empty = !kids && !emps && !vacs;
    var cnt = "<b>" + esc(String(kids)) + "</b> " + esc(T("mp_subsections")) +
      " · <b>" + esc(String(emps)) + "</b> " + esc(T("mp_employees")) +
      " · <b>" + esc(String(vacs)) + "</b> " + esc(T("mp_vac"));
    var m = modalOpen("mpm-dept mpm-del-card",
      '<h3 class="del-h">' + esc(T("mp_dept_del")) + ": " + esc(deptLabel(node)) + "</h3>" +
      '<div class="drow delpath"><span>' + esc(T("mp_dept")) + "</span><b>" + esc(nodePathTT(node) || "Marib 3") + "</b></div>" +
      '<div class="mpm-warn">' +
      '<div class="w-l">' + esc(T("mp_dept_contains")) + ": " + cnt + "</div>" +
      (empty
        ? '<div class="w-ok">✓ ' + esc(T("mp_dept_empty_ok")) + "</div>"
        : '<div class="w-bad">✗ ' + esc(T("mp_dept_notempty")) + "</div>") +
      "</div>" +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-del"' + (empty ? "" : " disabled") + ">" + esc(T("mp_dept_del")) + "</button>" +
      "</div>");
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    var delBtn = m.querySelector(".mpm-del"), modalBusy = false;
    m.querySelector(".mpm-del").addEventListener("click", function () {
      if (modalBusy || delBtn.disabled) return;   /* R41: نفس حكاية الضغط السريع */
      modalBusy = true; btnBusy(delBtn);
      MaribCloud.manpowerPost("deptDelete", { id: node.id }).then(function () {
        toast(T("mp_dept_deleted") + " — " + deptLabel(node), "ok");
        m.remove();
        return reload();
      }).catch(function (e) {
        modalBusy = false; btnIdle(delBtn);
        if (e && e.status === 403) toast(T("mp_need_admin"), "err");
        else if (e && (e.message === "notEmpty" || e.status === 409)) toast(T("mp_dept_notempty"), "err");
        else toast(T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { if (delBtn && !delBtn.disabled) delBtn.focus(); } catch (e) { } }, 60);
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
      /* R47: الاسم بالعربي — اختياري، بيتخزن في name_ar وبيظهر بزرار
         التبديل (AR) جنب الاسم في الشجرة */
      '<label class="mpm-ar"><span data-i18n="mp_name_ar">' + esc(T("mp_name_ar")) + '</span><input id="mpmNameAr" type="text" maxlength="90" dir="auto" autocomplete="off" placeholder="' + esc(T("mp_ar_opt")) + '"></label>' +
      '<label><span data-i18n="mp_code">' + esc(T("mp_code")) + '</span><input id="mpmCode" type="text" maxlength="20" class="num" autocomplete="off" placeholder="' + esc(T("mp_code_ph")) + '"></label>' +
      '<label><span data-i18n="mp_job">' + esc(T("mp_job")) + '</span><input id="mpmJob" type="text" maxlength="90" list="mpJobsList" autocomplete="off"></label>' +
      /* R47: الوظيفة بالعربي — اختياري، بتتخزن في job_ar */
      '<label class="mpm-ar"><span data-i18n="mp_job_ar">' + esc(T("mp_job_ar")) + '</span><input id="mpmJobAr" type="text" maxlength="90" dir="auto" autocomplete="off" placeholder="' + esc(T("mp_ar_opt")) + '"></label>' +
      (preset && preset.fill ? '' : '<div class="md-sec"><b data-i18n="mp_dept">' + esc(T("mp_dept")) + '</b><div class="mpc" id="mpmDept"></div></div>') +
      '<label><span data-i18n="mp_hire">' + esc(T("mp_hire")) + '</span><input id="mpmHire" type="date" class="num"></label>' +
      '<datalist id="mpJobsList"></datalist>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x" data-i18n="mp_cancel">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok" data-i18n="mp_save">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    fillLists();
    $("mpmName").value = editing ? emp[2] : "";
    /* R47: حقول العربي — بتتملي من e[9]/e[10] لو موجودين */
    $("mpmNameAr").value = editing ? (emp[9] || "") : "";
    $("mpmJobAr").value = editing ? (emp[10] || "") : "";
    $("mpmCode").value = editing ? (emp[1] || "") : "";
    /* R45: الكود بقى قابل للتعديل في كل الحالات — السيرفر بيمنع تكرار
       الكود (409) لو حد كتب كود بتاع حد تاني */
    $("mpmJob").value = editing ? (emp[3] || "") : (preset && preset.job ? preset.job : "");
    attachCombo($("mpmJob"), function () { return jobsAll; });   /* R42: دروب ليست حقيقية */
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
      /* R47: العربي اختياري — السيرفر بيحفظ القديم تلقائيًا لو اتغير
         الاسم لإنجليزي والعربي فاضي (حماية من ضياع العربي) */
      var nameAr = $("mpmNameAr").value.trim();
      var jobAr = $("mpmJobAr").value.trim();
      var deptEl = $("mpmDept");
      var deptId = deptEl ? trailToId(deptEl._trail || []) : "";
      if (!name || (!deptId && !(preset && preset.fill))) { toast(T("mp_fill"), "err"); return; }
      if (hire && !/^\d{4}-\d{2}-\d{2}$/.test(hire)) { toast(T("mp_fill"), "err"); return; }
      if (editing) {
        var oldNode = findByKey("d:" + emp[4]);
        var newNode = findByKey("d:" + deptId);
        var moved = (oldNode && newNode && oldNode.key !== newNode.key) || job !== (emp[3] || "");
        if (moved) {
          confirmBox({ title: T("mp_confirm_edit_t"), html: '<div class="cf-warn">' + esc(T("mp_confirm_edit")) + "</div>", okText: T("mp_save") })
            .then(function (yes) {
              if (!yes) return;
              save({ action: "edit", id: emp[0], code: code, name: name, job: job, deptId: deptId, hire: hire, name_ar: nameAr, job_ar: jobAr },
                moved ? T("mp_moved") : T("mp_saved"), true);
              m.remove();
            });
          return;
        }
        save({ action: "edit", id: emp[0], code: code, name: name, job: job, deptId: deptId, hire: hire, name_ar: nameAr, job_ar: jobAr },
          moved ? T("mp_moved") : T("mp_saved"), true);
        m.remove();
      } else if (preset && preset.fill) {
        save({ action: "fill", id: preset.vacId, code: code, name: name, hire: hire, name_ar: nameAr, job_ar: jobAr }, T("mp_filled"), true);
        m.remove();
      } else {
        save({ action: "add", code: code, name: name, job: job, deptId: deptId, hire: hire, name_ar: nameAr, job_ar: jobAr }, T("mp_added"), true)
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

  /* ---------------- R42: تعديل اسم الجذر (مأرب 3 / Marib 3) ---------------- */
  function openRootEdit() {
    if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
    var r = (DATA && DATA.root) || { ar: "\u0645\u0623\u0631\u0628 3", en: "Marib 3", tr: "Marib 3" };
    var m = modalOpen("mpm-dept",
      '<h3>' + esc(T("mp_root_edit")) + "</h3>" +
      '<label><span>' + esc(T("mp_root_ar")) + '</span><input id="mrAr" type="text" maxlength="40" value="' + esc(r.ar || "") + '"></label>' +
      '<label><span>English</span><input id="mrEn" type="text" maxlength="40" dir="ltr" value="' + esc(r.en || "") + '"></label>' +
      '<label>T\u00fcrk\u00e7e<input id="mrTr" type="text" maxlength="40" dir="ltr" value="' + esc(r.tr || "") + '"></label>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    var okBtn = m.querySelector(".mpm-ok"), busy = false;
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      if (busy) return;
      var ar = $("mrAr").value.trim(), en = $("mrEn").value.trim(), tr = $("mrTr").value.trim();
      if (!ar || !en || !tr) { toast(T("mp_fill"), "err"); return; }
      busy = true; btnBusy(okBtn);
      MaribCloud.manpowerPost("rootSet", { ar: ar, en: en, tr: tr }).then(function () {
        toast(T("mp_root_saved"), "ok");
        m.remove();
        return reload();
      }).catch(function (e) {
        busy = false; btnIdle(okBtn);
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { $("mrAr").focus(); $("mrAr").select(); } catch (e) { } }, 60);
  }

  /* ---------------- R42: إضافة عجز (شاغر مهيكل) ----------------
     «العجز في وظيفة إيه في قسم إيه في إدارة ايه» — المودال بيطلب
     السلسلة والوظيفة، وبيسيب مكان فاضي في الشجرة يتعين فيه الاسم بعدين. */
  function openVacAdd() {
    if (!ADMIN) { toast(T("mp_need_admin"), "err"); return; }
    var m = modalOpen("mpm-dept",
      '<h3>' + esc(T("mp_vac_add")) + "</h3>" +
      '<div class="md-sec"><b>' + esc(T("mp_dept")) + '</b><div class="mpc" id="mvDept"></div></div>' +
      '<label><span>' + esc(T("mp_job")) + '</span><input id="mvJob" type="text" maxlength="90" autocomplete="off"></label>' +
      '<label class="mv-count"><span>' + esc(T("mp_vac_count")) + '</span><input id="mvCount" type="number" min="1" max="50" step="1" value="1" class="num"></label>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    fillLists();
    cascadeBuild($("mvDept"), []);
    attachCombo($("mvJob"), function () { return jobsAll; });
    $("mvJob").value = "";
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    var okBtn = m.querySelector(".mpm-ok"), busy = false;
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      if (busy) return;
      var deptId = trailToId($("mvDept")._trail || []);
      var job = $("mvJob").value.trim();
      var count = parseInt($("mvCount").value, 10) || 1;
      if (!deptId || !job) { toast(T("mp_fill"), "err"); return; }
      if (count < 1 || count > 50) count = 1;
      busy = true; btnBusy(okBtn);
      var chain = Promise.resolve();
      var n = count;
      while (n-- > 0) {
        (function () {
          chain = chain.then(function () { return MaribCloud.manpowerPost("vacAdd", { deptId: deptId, job: job }); });
        })();
      }
      chain.then(function () {
        toast(T("mp_vac_added") + " — " + count + " \u00d7 " + job, "ok");
        m.remove();
        clearSearch();
        return reload().then(function () {
          expandToDept(deptId);
          renderTree();
          flashDept(deptId);
        });
      }).catch(function (e) {
        busy = false; btnIdle(okBtn);
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { $("mvJob").focus(); } catch (e) { } }, 60);
  }

  /* ---------------- R42: نقل المحددين (multi-select) ---------------- */
  function openTransferMany(ids) {
    var m = modalOpen("mpm-dept",
      '<h3>' + esc(T("mp_move_many")) + " (" + ids.length + ")</h3>" +
      '<div class="md-sec"><b>' + esc(T("mp_dept")) + '</b><div class="mpc" id="mmDept"></div></div>' +
      '<label><span>' + esc(T("mp_job_opt")) + '</span><input id="mmJob" type="text" maxlength="90" autocomplete="off" placeholder="' + esc(T("mp_job_keep")) + '"></label>' +
      '<div class="mpm-btns">' +
      '<button type="button" class="mpm-x">' + esc(T("mp_cancel")) + "</button>" +
      '<button type="button" class="mpm-ok">' + esc(T("mp_save")) + "</button>" +
      "</div>");
    fillLists();
    cascadeBuild($("mmDept"), []);
    attachCombo($("mmJob"), function () { return jobsAll; });
    m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); });
    var okBtn = m.querySelector(".mpm-ok"), busy = false;
    m.querySelector(".mpm-ok").addEventListener("click", function () {
      if (busy) return;
      var deptId = trailToId($("mmDept")._trail || []);
      var job = $("mmJob").value.trim();
      if (!deptId) { toast(T("mp_fill"), "err"); return; }
      busy = true; btnBusy(okBtn);
      MaribCloud.manpowerPost("editMany", { ids: ids, deptId: deptId, job: job || null }).then(function (r) {
        toast(T("mp_moved_many").replace("{n}", String(r && r.moved != null ? r.moved : ids.length)), "ok");
        m.remove();
        selSet = {};
        updateSelBar();
        return reload().then(function () { renderTree(); });
      }).catch(function (e) {
        busy = false; btnIdle(okBtn);
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
    setTimeout(function () { try { $("mmDept").querySelector("select").focus(); } catch (e) { } }, 60);
  }

  /* ---------------- R42: شريط التحديد ---------------- */
  function selCount() {
    var n = 0;
    for (var k in selSet) if (selSet[k]) n++;
    return n;
  }
  function updateSelBar() {
    var bar = $("mpSelBar");
    if (!bar) return;
    var n = selCount();
    bar.classList.toggle("on", view !== "arch" && view !== "cards" && n > 0);
    /* R43: زر «تحديد الكل» بيبقى مفعل طول ما في تحديد */
    var sb = $("mpSelBtn");
    if (sb) {
      sb.classList.toggle("on", n > 0);
      sb.setAttribute("aria-pressed", n > 0 ? "true" : "false");
    }
    var cnt = $("mpSelCount");
    if (cnt) cnt.textContent = String(n);
    /* عدّاد الأرشيف */
    var an = 0;
    for (var k2 in archSel) if (archSel[k2]) an++;
    var acnt = $("mpArchCount");
    if (acnt) acnt.textContent = String(an);
    var abar = $("mpArchBar");
    if (abar) abar.classList.toggle("on", view === "arch" && an > 0);   /* R50: بوب-أب في وضع الأرشيف بس */
    /* R44: زرار تحديد الكل بيتبدل حالته مع التحديد */
    var asb = $("mpArchSelBtn");
    if (asb) {
      asb.classList.toggle("on", an > 0);
      asb.setAttribute("aria-pressed", an > 0 ? "true" : "false");
    }
  }
  function toggleSelMode() {
    /* R43: التحديد بقى دايم بالتشيك بوكسات — الزر «تحديد الكل / إلغاء» */
    if (selCount() > 0) {
      selSet = {};
    } else if (DATA) {
      for (var si = 0; si < DATA.emps.length; si++) {
        if (!DATA.emps[si][6]) selSet[DATA.emps[si][0]] = true;   /* الفعليين بس (مش الشواغر) */
      }
    }
    updateSelBar();
    renderTree();
  }
  function applySelDelete() {
    var ids = [];
    for (var k in selSet) if (selSet[k]) ids.push(k);
    if (!ids.length) return;
    confirmBox({
      title: T("mp_del_many_t").replace("{n}", String(ids.length)),
      html: '<div class="cf-warn">' + esc(T("mp_del_many_b")) + "</div>",
      danger: true,
      okText: T("mp_del_many_ok")
    }).then(function (yes) {
      if (!yes) return;
      MaribCloud.manpowerPost("delMany", { ids: ids }).then(function (r) {
        toast(T("mp_deleted_n").replace("{n}", String(r && r.deleted != null ? r.deleted : ids.length)), "ok");
        selSet = {};
        updateSelBar();
        return reload().then(function () { renderTree(); });
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
  }
  function applyArchDelete() {
    var ids = [];
    for (var k in archSel) if (archSel[k]) ids.push(k);
    if (!ids.length) return;
    confirmBox({
      title: T("mp_arch_del_t").replace("{n}", String(ids.length)),
      html: '<div class="cf-warn">' + esc(T("mp_arch_del_b")) + "</div>",
      danger: true,
      okText: T("mp_del_many_ok")
    }).then(function (yes) {
      if (!yes) return;
      MaribCloud.manpowerPost("archDel", { ids: ids }).then(function () {
        toast(T("mp_arch_del_done"), "ok");
        archSel = {};
        updateSelBar();
        return reload().then(function () { renderArch(); });
      }).catch(function (e) {
        toast(e && e.status === 403 ? T("mp_need_admin") : T("toast_sync_err"), "err");
      });
    });
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

  /* ============================================================
     R46-7 — Undo notification (persistent toast, 15-min window)
     Shows up after every import with a summary + Undo button + Dismiss.
     Clicking Undo calls POST /api/manpower?action=undo with the token
     returned by the import. The notification auto-expires after 15 min.
     ============================================================ */
  var UNDO_TTL_MS = 15 * 60 * 1000;
  var undoToastEl = null;
  var undoTimer = null;
  function showUndoToast(token, summary, info) {
    /* replace any existing undo toast */
    if (undoToastEl) { undoToastEl.classList.add("bye"); setTimeout(function () { undoToastEl && undoToastEl.remove(); }, 220); }
    if (undoTimer) { clearInterval(undoTimer); undoTimer = null; }
    var el = document.createElement("div");
    el.className = "mp-undo-toast";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "polite");
    var bits = [];
    if (info) {
      if (info.inserted) bits.push("+" + info.inserted + " " + T("mp_pv_new"));
      if (info.updated) bits.push("✎ " + info.updated + " " + T("mp_pv_jobs"));
      if (info.moved) bits.push(T("mp_moved_n") + " " + info.moved);
      if (info.keptOut) bits.push(T("mp_kept_out") + " " + info.keptOut);
      if (info.deleted) bits.push("−" + info.deleted + " " + T("mp_pv_dels"));
    }
    el.innerHTML =
      '<div class="ut-head">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v4h4"/><path d="M3.5 11a9 9 0 1 1 2.6 6.4"/><path d="M12 7h9v9h-9"/></svg>' +
        '<b>' + esc(T("mp_import_done")) + '</b>' +
      '</div>' +
      '<div class="ut-sum">' + esc(bits.join(" · ") || summary) + '</div>' +
      '<div class="ut-bar">' +
        '<button type="button" class="ut-undo" data-token="' + esc(token) + '">' + esc(T("mp_undo")) + '</button>' +
        '<button type="button" class="ut-x" aria-label="' + esc(T("mp_cancel")) + '">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="ut-count"><b>15</b> ' + esc(T("mp_undo_left").replace("{n}", "15").split("{n}")[1] || "min") + '</div>';
    document.body.appendChild(el);
    undoToastEl = el;
    /* countdown */
    var left = UNDO_TTL_MS;
    var countEl = el.querySelector(".ut-count");
    undoTimer = setInterval(function () {
      left -= 1000;
      if (left <= 0) {
        clearInterval(undoTimer); undoTimer = null;
        if (countEl) { countEl.classList.add("done"); countEl.innerHTML = esc(T("mp_undo_expired")); }
        /* auto-dismiss after 5 more seconds */
        setTimeout(function () { if (undoToastEl === el) dismissUndoToast(); }, 5000);
        return;
      }
      var mins = Math.floor(left / 60000);
      var secs = Math.floor((left % 60000) / 1000);
      if (countEl) countEl.innerHTML = '<b>' + mins + ':' + (secs < 10 ? "0" : "") + secs + '</b> ' + esc(T("mp_undo_left").replace("{n}", String(mins)).split("{n}")[1] || "min left");
    }, 1000);
    function dismissUndoToast() {
      if (undoTimer) { clearInterval(undoTimer); undoTimer = null; }
      if (undoToastEl === el) undoToastEl = null;
      el.classList.add("bye");
      setTimeout(function () { el.remove(); }, 220);
    }
    /* undo click */
    el.querySelector(".ut-undo").addEventListener("click", function () {
      var undoBtn = el.querySelector(".ut-undo");
      undoBtn.disabled = true;
      var orig = undoBtn.textContent;
      undoBtn.textContent = "…";
      fetch("/api/manpower", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "undo", undoToken: token })
      })
        .then(function (r) { if (!r.ok) throw { status: r.status }; return r.json(); })
        .then(function () {
          toast(T("mp_undo_done"), "ok");
          dismissUndoToast();
          reload();
        })
        .catch(function (e) {
          undoBtn.disabled = false;
          undoBtn.textContent = orig;
          toast(e && e.status === 410 ? T("mp_undo_expired") : T("toast_sync_err"), "err");
        });
    });
    /* dismiss click */
    el.querySelector(".ut-x").addEventListener("click", dismissUndoToast);
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
                /* R50: أعمدة التركي الأول — قبل العربية والعادية
                   (كل بحث indexOf — الأدق لازم يسبق) */
                if (h.indexOf("الاسم TR") >= 0 || h.indexOf("الأسم TR") >= 0 || h.indexOf("الاسم بالتركي") >= 0) map.nameTr = c;
                else if (h.indexOf("الوظيفة TR") >= 0 || h.indexOf("الوظيفة بالتركي") >= 0) map.jobTr = c;
                else if (h.indexOf("الادارة TR") >= 0 || h.indexOf("الإدارة TR") >= 0 || h.indexOf("الادارة بالتركي") >= 0) map.deptTr = c;
                else if (h.indexOf("القسم الداخلي TR") >= 0) map.subTr = c;
                else if (h.indexOf("القسم TR") >= 0 || h.indexOf("القسم بالتركي") >= 0) map.secTr = c;
                /* R47: أعمدة العربي (التيمبلتات القديمة) */
                else if (h.indexOf("الأسم بالعربي") >= 0 || h.indexOf("الاسم بالعربي") >= 0) map.nameAr = c;
                else if (h.indexOf("الوظيفة بالعربي") >= 0) map.jobAr = c;
                else if (h.indexOf("الكود") >= 0) map.code = c;
                else if (h.indexOf("الأسم") >= 0 || h.indexOf("الاسم") >= 0 || h.indexOf("الموظف") >= 0) map.name = c;
                else if (h.indexOf("الادارة") >= 0 || h.indexOf("الإدارة") >= 0 || h.indexOf("الاداره") >= 0) map.dept = c;
                else if (h.indexOf("القسم الداخلي") >= 0) map.sub = c;
                else if (h.indexOf("القسم") >= 0) map.sec = c;
                else if (h.indexOf("الوظيفة") >= 0) map.job = c;
                else if (h.indexOf("ماكينة") >= 0) map.mach = c;   /* R40: الماكينة */
                else if (h.indexOf("ملاحظات") >= 0) map.note = c;
                else if (h.indexOf("التعيين") >= 0) map.hire = c;
                else if (h.indexOf("حذف") >= 0) map.del = c;      /* R42: عمود الحذف */
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
              /* R50: الصف بقى 16 عنصر — التركي جنب العربي
                 [code, name, nameTr, dept, deptTr, sec, secTr, sub, subTr,
                  job, jobTr, note, hire, vac, mach, del, nameAr, jobAr] */
              rows.push([
                String(get("code") == null ? "" : get("code")).trim().slice(0, 20),
                name.slice(0, 90),
                String(get("nameTr") == null ? "" : get("nameTr")).trim().slice(0, 90),
                dept.slice(0, 90),
                String(get("deptTr") == null ? "" : get("deptTr")).trim().slice(0, 90),
                sec.slice(0, 90),
                String(get("secTr") == null ? "" : get("secTr")).trim().slice(0, 90),
                sub.slice(0, 90),
                String(get("subTr") == null ? "" : get("subTr")).trim().slice(0, 90),
                job.slice(0, 90),
                String(get("jobTr") == null ? "" : get("jobTr")).trim().slice(0, 90),
                String(get("note") == null ? "" : get("note")).trim().slice(0, 60),
                xlsxDate(get("hire")),
                vac,
                String(get("mach") == null ? "" : get("mach")).trim().slice(0, 30),
                String(get("del") == null ? "" : get("del")).trim().slice(0, 10),
                String(get("nameAr") == null ? "" : get("nameAr")).trim().slice(0, 90),
                String(get("jobAr") == null ? "" : get("jobAr")).trim().slice(0, 90)
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

          /* R42: معاينة قبل التنفيذ — عدّ اللي هيحصل بالظبط من واقع
             الداتا الحالية (جدد / تحديثات وظيفة / نقل / حذف) + أمثلة،
             والتأكيد بقى مودال بثيم الموقع مش حوار المتصفح */
          var colFlags = {
            hireCol: best.map.hire !== undefined,
            machCol: best.map.mach !== undefined,
            noteCol: best.map.note !== undefined,
            arCol: best.map.nameAr !== undefined || best.map.jobAr !== undefined,   /* R47: أعمدة العربي (تيمبلت قديم) */
            trCol: best.map.nameTr !== undefined || best.map.jobTr !== undefined ||
                   best.map.deptTr !== undefined || best.map.secTr !== undefined ||
                   best.map.subTr !== undefined                                    /* R50: أعمدة التركي */
          };
          var liveByCode = {};
          var liveByName = {};
          if (DATA) {
            for (var li = 0; li < DATA.emps.length; li++) {
              var le = DATA.emps[li];
              if (le[1] && le[1] !== "جديد") liveByCode[le[1]] = le;
              if (le[2]) liveByName[le[2]] = le;   /* صفوف «جديد» بيتطابقوا بالاسم سيرفر-side */
            }
          }
          var pNew = 0, pJob = 0, pDel = 0, pKeep = 0, pOut = 0;
          var jobEx = [], delEx = [], outEx = [];
          var seenCodes = {}, seenNames = {};
          for (var pi = 0; pi < rows.length; pi++) {
            var pr = rows[pi];
            var pcode = String(pr[0] || "");
            var pdelMark = norm(pr[15]);
            var isDel = ["نعم", "yes", "x", "حذف", "1", "true"].indexOf(pdelMark) >= 0;
            if (pcode && pcode !== "جديد") seenCodes[pcode] = 1;
            if (pr[1]) seenNames[pr[1]] = 1;
            if (isDel && pcode && pcode !== "جديد") { pDel++; if (delEx.length < 5) delEx.push(pr[1]); continue; }
            if (!pr[1]) continue; /* شاغر */
            var live = liveByCode[pcode] || liveByName[pr[1]];
            if (!live) { pNew++; continue; }
            if (pr[9] && pr[9] !== (live[3] || "")) {
              pJob++;
              if (jobEx.length < 5) jobEx.push(pr[1] + ": " + (live[3] || "—") + " ← " + pr[9]);
            } else pKeep++;
          }
          /* R50: الشيت هو الحقيقة — عدّ اللي على الموقع ومش في الشيت */
          if (DATA) {
            for (var oi = 0; oi < DATA.emps.length; oi++) {
              var oe = DATA.emps[oi];
              if (oe[6]) continue; /* شاغر — بيتحل لوحده */
              var ocode = String(oe[1] || "");
              if (ocode === "جديد") ocode = "";
              if ((ocode && seenCodes[ocode]) || (oe[2] && seenNames[oe[2]])) continue;
              pOut++;
              if (outEx.length < 5) outEx.push(oe[2] || ocode);
            }
          }
          var pvHtml =
            '<div class="pv-grid">' +
            '<div class="pv-i"><b>' + rows.length + "</b><span>" + esc(T("mp_pv_rows")) + "</span></div>" +
            '<div class="pv-i ok"><b>+' + pNew + "</b><span>" + esc(T("mp_pv_new")) + "</span></div>" +
            '<div class="pv-i"><b>' + pJob + "</b><span>" + esc(T("mp_pv_jobs")) + "</span></div>" +
            '<div class="pv-i"><b>' + vacs + "</b><span>" + esc(T("mp_pv_vacs")) + "</span></div>" +
            (pDel ? '<div class="pv-i bad"><b>-' + pDel + "</b><span>" + esc(T("mp_pv_dels")) + "</span></div>" : "") +
            (pOut ? '<div class="pv-i bad"><b>-' + pOut + "</b><span>" + esc(T("mp_pv_out")) + "</span></div>" : "") +
            "</div>" +
            (jobEx.length ? '<div class="pv-ex"><b>' + esc(T("mp_pv_jobex")) + ":</b> " + jobEx.map(esc).join(" · ") + "</div>" : "") +
            (delEx.length ? '<div class="pv-ex bad"><b>' + esc(T("mp_pv_delex")) + ":</b> " + delEx.map(esc).join(" · ") + "</div>" : "") +
            (outEx.length ? '<div class="pv-ex bad"><b>' + esc(T("mp_pv_out")) + ":</b> " + outEx.map(esc).join(" · ") + "</div>" : "") +
            '<div class="cf-warn">' + esc(T("mp_sheet_truth")) + "</div>";
          confirmBox({
            title: T("mp_confirm_import_t"),
            html: pvHtml,
            okText: T("mp_import_go")
          }).then(function (yes) {
            if (!yes) return;
            save({ action: "import", rows: rows, hireCol: colFlags.hireCol, machCol: colFlags.machCol, noteCol: colFlags.noteCol, arCol: colFlags.arCol, trCol: colFlags.trCol }, "", false).then(function (r) {
              var bits = [T("mp_import_done") + " — " + (r ? r.total : rows.length)];
              if (r && r.codeFilled) bits.push(T("mp_code_filled") + " " + r.codeFilled);
              if (r && r.moved) bits.push(T("mp_moved_n") + " " + r.moved);
              if (r && r.removed) bits.push(T("mp_pv_out") + " " + r.removed);
              if (r && r.deleted) bits.push(T("mp_pv_dels") + " " + r.deleted);
              toast(bits.join(" · "), "ok");
              /* R46-7: persistent undo notification — 15-min window */
              if (r && r.undoToken) {
                showUndoToast(r.undoToken, bits.join(" · "), r);
              }
              if (cardMode) closeCards();
            }).catch(function () { });
          });
        } catch (e) {
          toast(T("toast_sync_err"), "err");
        }
      };
      fr.onerror = function () { toast(T("toast_sync_err"), "err"); };
      fr.readAsArrayBuffer(file);
    }).catch(function () { toast(T("toast_sync_err"), "err"); });
  }

  /* R50: trScan اتشالت مع الترجمة الفورية — التركي من الشيت دلوقتي */

  /* ---------------- reload ---------------- */
  function reload() {
    loading = true;
    renderTree();
    return MaribCloud.manpowerGet().then(function (r) {
      DATA = { depts: r.depts || [], emps: r.emps || [], req: r.req || {}, transfers: r.transfers || [], root: r.root };
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
    /* R42: الأزرار الجديدة — عجز + تحديد + تيمبلت للأدمن، التبديل للكل */
    var vac = $("mpVacBtn"), sel = $("mpSelBtn"), tpl = $("mpTmplBtn"), ordB = $("mpOrdBtn");
    if (vac) vac.style.display = ADMIN ? "" : "none";
    if (sel) sel.style.display = ADMIN ? "" : "none";
    if (tpl) tpl.style.display = ADMIN ? "" : "none";
    if (ordB) {
      ordB.style.display = "";
      syncOrdBtn();
    }
    updateSelBar();
    mpTitle();
    if (!loaded && !loading) reload();
    else renderAll();
  }
  function hide() {
    on = false;
    document.body.classList.remove("mp-on");
    var w = $("mpWrap");
    if (w) w.hidden = true;
    closeReqPop();
    tipCurId = null;   /* R40: قفل التولتيب مع الشاشة نفسها */
    tipHide();
    selSet = {};
    archSel = {};
    updateSelBar();
  }

  /* ---------------- R42: عنوان التاب في المتصفح ----------------
     «المتصح من فوق بيقولي أنا فين» — العنوان بيتحدث مع كل انتقال:
     الاتزان — الهيكل / الاتزان — أرشيف النقل / تفاصيل الكارت. */
  function mpTitle() {
    if (!on) return;
    var brand = "Marib";
    var base = T("mg_mp");
    var cardsT = $("mpCardsTitle");
    var sub = view === "cards" ? ((cardsT && cardsT.textContent) || T("mp_card_open")) : T(view === "arch" ? "mp_archive" : "mp_tree_tab");
    document.title = base + " — " + sub + " | " + brand;
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

    /* ---------- R42: كل الأزرار الجديدة ---------- */
    var vac2 = $("mpVacBtn");
    if (vac2) vac2.addEventListener("click", openVacAdd);
    var selB = $("mpSelBtn");
    if (selB) selB.addEventListener("click", function () { toggleSelMode(); });
    var ordB = $("mpOrdBtn");
    if (ordB) ordB.addEventListener("click", function () {
      ordMode = ordMode === "emp" ? "job" : "emp";
      try { localStorage.setItem("marib_mp_ord", ordMode); } catch (e) { }
      syncOrdBtn();
      renderTree("__all__");
    });
    var tplB = $("mpTmplBtn");
    if (tplB) tplB.addEventListener("click", function () {
      tplB.disabled = true;
      toast(T("mp_tmpl_going"), "");
      fetch("/api/manpower/export?template=1", { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("t" + r.status); return r.blob(); })
        .then(function (b) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          var d = new Date();
          function p2(n) { return (n < 10 ? "0" : "") + n; }
          a.download = "Manpower-Template-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + ".xlsx";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
          toast(T("mp_tmpl_done"), "ok");
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); })
        .then(function () { tplB.disabled = false; });
    });
    /* شريط التحديد */
    var selMove = $("mpSelMove"), selDel = $("mpSelDel"), selX = $("mpSelX");
    if (selMove) selMove.addEventListener("click", function () {
      var ids = [];
      for (var k in selSet) if (selSet[k]) ids.push(k);
      if (ids.length) openTransferMany(ids);
    });
    if (selDel) selDel.addEventListener("click", applySelDelete);
    if (selX) selX.addEventListener("click", function () { selSet = {}; updateSelBar(); renderTree(); });
    /* شريط الأرشيف */
    var archDel2 = $("mpArchDel"), archX = $("mpArchX");
    if (archDel2) archDel2.addEventListener("click", applyArchDelete);
    if (archX) archX.addEventListener("click", function () { archSel = {}; updateSelBar(); renderArch(); });
    /* صفحة الكروت — R45: النقرات اتعملت delegated زي الشجرة (قبل كده
       زراير تعيين/مسح الشاغر في صفحة الكروت كانت ميتة) */
    var cardsListEl = $("mpCardsList");
    if (cardsListEl) cardsListEl.addEventListener("click", function (e) {
      var el = e.target;
      var vf = el.closest ? el.closest(".mo.vf") : null;
      if (vf) {
        var empv = findEmp(vf.getAttribute("data-vf"));
        if (empv) openEmpModal(null, { fill: true, vacId: empv[0], job: empv[3] });
        return;
      }
      var vx = el.closest ? el.closest(".mo.vx") : null;
      if (vx) {
        confirmBox({ title: T("mp_vac_del"), html: '<div class="cf-warn">' + esc(T("mp_confirm_vacdel")) + "</div>", danger: true, okText: T("mp_vac_del") })
          .then(function (yes) {
            if (yes) save({ action: "vacDel", id: vx.getAttribute("data-vx") }, T("mp_vac_deleted"), true);
          });
        return;
      }
      var pen = el.closest ? el.closest(".mo[data-ei]") : null;
      if (pen) {
        var e2 = findEmp(pen.getAttribute("data-ei"));
        if (e2) openEmpModal(e2, null);
        return;
      }
      var jmp = el.closest ? el.closest(".cc-row[data-jump]") : null;
      if (jmp) {
        var jid = jmp.getAttribute("data-jump");
        setView("tree");
        expandToDept(jid);
        renderTree();
        setTimeout(function () { flashDept(jid); }, 60);
      }
    });
    var cardsBack = $("mpCardsBack");
    if (cardsBack) cardsBack.addEventListener("click", closeCards);
    var cardsSearch = $("mpCardsSearch");
    if (cardsSearch) {
      var deb3 = null;
      cardsSearch.addEventListener("input", function () {
        clearTimeout(deb3);
        deb3 = setTimeout(function () { cardQ = cardsSearch.value.trim(); renderCards(); }, 130);
      });
    }
    /* أزرار الهيدر: الإعدادات + البيانات */
    var mpSet = $("mpSetBtn");
    if (mpSet) mpSet.addEventListener("click", function () {
      if (window.App && App.openSettings) App.openSettings();
    });
    /* R44: البيانات أوفرلاي فوق الاتزان نفسه — مش دخول لشاشة التحليل */
    var mpData = $("mpDataBtn");
    if (mpData) mpData.addEventListener("click", function () {
      if (window.__maribDataPop) window.__maribDataPop.open();
    });
    var mpUsers = $("mpUsersBtn");
    if (mpUsers) mpUsers.addEventListener("click", function () {
      if (window.MaribAuth && MaribAuth.openUsers) MaribAuth.openUsers();
    });
    /* R45: زرار «بدون كود» — كل اللي لسه من غير كود في كارت واحد */
    var ncb = $("mpNoCodeBtn");
    if (ncb) ncb.addEventListener("click", function () { openCards("nocode"); });
    /* R45: زرار «بدون كود» — كل اللي لسه من غير كود في كارت واحد */
    var ncb = $("mpNoCodeBtn");
    if (ncb) ncb.addEventListener("click", function () { openCards("nocode"); });
    /* R44: تحديد الكل في الأرشيف — كل الصفوف اللي باينة (بعد البحث) */
    var archSelBtn = $("mpArchSelBtn");
    if (archSelBtn) archSelBtn.addEventListener("click", function () {
      var any = false;
      for (var k in archSel) if (archSel[k]) { any = true; break; }
      if (any) {
        archSel = {};
      } else {
        document.querySelectorAll("#mpArch [data-achk]").forEach(function (c) {
          archSel[c.getAttribute("data-achk")] = true;
        });
      }
      updateSelBar();
      renderArch();
    });
    /* تشيك بوكس الأرشيف (delegated) */
    var archBox = $("mpArch");
    if (archBox) archBox.addEventListener("click", function (e) {
      var chk = e.target.closest ? e.target.closest("[data-achk]") : null;
      if (!chk) return;
      var id = chk.getAttribute("data-achk");
      archSel[id] = !archSel[id];
      updateSelBar();
      renderArch();
    });
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

    /* ============================================================
       R46-7 — Unified Import & Export dropdown + Undo notification
       ============================================================ */
    var ieb = $("mpImpExpBtn");
    var iem = $("mpImpExpMenu");
    if (ieb && iem) {
      var ieClose = function () { iem.hidden = true; ieb.setAttribute("aria-expanded", "false"); };
      var ieOpen = function () {
        iem.hidden = false;
        ieb.setAttribute("aria-expanded", "true");
        /* close on outside click / escape / scroll */
        setTimeout(function () {
          document.addEventListener("click", ieOutClose, true);
          document.addEventListener("keydown", ieEsc, true);
        }, 0);
      };
      var ieOutClose = function (e2) {
        if (!iem.contains(e2.target) && !ieb.contains(e2.target)) {
          ieClose();
          document.removeEventListener("click", ieOutClose, true);
          document.removeEventListener("keydown", ieEsc, true);
        }
      };
      var ieEsc = function (e3) {
        if (e3.key === "Escape") {
          ieClose();
          document.removeEventListener("click", ieOutClose, true);
          document.removeEventListener("keydown", ieEsc, true);
        }
      };
      ieb.addEventListener("click", function (e4) {
        e4.stopPropagation();
        if (iem.hidden) ieOpen(); else ieClose();
      });
      /* wire the 3 menu options to trigger the existing buttons */
      iem.addEventListener("click", function (e5) {
        var b = e5.target.closest ? e5.target.closest("[data-act]") : null;
        if (!b) return;
        var act = b.getAttribute("data-act");
        ieClose();
        /* R46-10: export + template بيسألوا عن لغة التنزيل (AR/EN/TR) */
        if (act === "export" || act === "template") {
          pickExportLang().then(function (lang) {
            if (!lang) return; /* cancelled */
            if (act === "export") doExport(lang);
            else doTemplate(lang);
          });
          return;
        }
        if (act === "import") {
          var im = $("mpImportBtn"); if (im) im.click();
        }
      });
    }

    /* R46-10: language picker modal — returns a Promise<"ar"|"en"|"tr"|null> */
    function pickExportLang() {
      return new Promise(function (resolve) {
        var m = modalOpen("mpm-lang",
          '<h3>' + esc(T("mp_pick_lang")) + '</h3>' +
          '<div class="cf-body">' +
            '<div class="mp-lang-grid">' +
              '<button type="button" class="mp-lang-opt" data-lang="ar"><b>عربي</b><small>Arabic</small></button>' +
              '<button type="button" class="mp-lang-opt" data-lang="tr"><b>Türkçe</b><small>التركية</small></button>' +
            '</div>' +
          '</div>' +
          '<div class="mpm-btns"><button type="button" class="mpm-x">' + esc(T("mp_cancel")) + '</button></div>');
        m.querySelectorAll(".mp-lang-opt").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var l = btn.getAttribute("data-lang");
            m.remove();
            resolve(l);
          });
        });
        m.querySelector(".mpm-x").addEventListener("click", function () { m.remove(); resolve(null); });
      });
    }
    /* R46-10: doExport + doTemplate — wrappers that pass ?lang= to the API */
    function doExport(lang) {
      var ex = $("mpExportBtn");
      if (ex) ex.disabled = true;
      toast(T("mp_export_going"), "");
      var d = new Date();
      function p2(n) { return (n < 10 ? "0" : "") + n; }
      var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
      fetch("/api/manpower/export?lang=" + encodeURIComponent(lang), { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("export " + r.status); return r.blob(); })
        .then(function (b) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          var langSuffix = lang === "ar" ? "-AR" : lang === "tr" ? "-TR" : "";
          a.download = "Manpower-Marib3-" + stamp + langSuffix + ".xlsx";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
          toast(T("mp_export_done"), "ok");
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); })
        .then(function () { if (ex) ex.disabled = false; });
    }
    function doTemplate(lang) {
      var tp = $("mpTmplBtn");
      if (tp) tp.disabled = true;
      toast(T("mp_tmpl_going"), "");
      fetch("/api/manpower/export?template=1&lang=" + encodeURIComponent(lang), { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("t" + r.status); return r.blob(); })
        .then(function (b) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          var d = new Date();
          function p2(n) { return (n < 10 ? "0" : "") + n; }
          var langSuffix = lang === "ar" ? "-AR" : lang === "tr" ? "-TR" : "";
          a.download = "Manpower-Template-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + langSuffix + ".xlsx";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
          toast(T("mp_tmpl_done"), "ok");
        })
        .catch(function () { toast(T("toast_sync_err"), "err"); })
        .then(function () { if (tp) tp.disabled = false; });
    }

    /* tree interaction — one delegated listener */
    var tree = $("mpTree");
    if (tree) tree.addEventListener("click", function (e) {
      var el = e.target;
      /* R50: أزرار الترجمة الفورية (data-ar/data-dar) اتشالت */
      /* R42: تعديل اسم الجذر (مأرب 3) — أول شرط: الزرار ده عليه class
         mo rn فأي فحص تاني (dept edit / pen) بياخده ويسكت */
      var rted = el.closest ? el.closest("[data-rootedit]") : null;
      if (rted) {
        e.stopPropagation();
        openRootEdit();
        return;
      }
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
        confirmBox({ title: T("mp_vac_del"), html: '<div class="cf-warn">' + esc(T("mp_confirm_vacdel")) + "</div>", danger: true, okText: T("mp_vac_del") })
          .then(function (yes) {
            if (yes) save({ action: "vacDel", id: vx.getAttribute("data-vx") }, T("mp_vac_deleted"), true);
          });
        return;
      }
      /* R39: حذف موظف (زرار جوه كارت التفاصيل) */
      var del = el.closest ? el.closest(".mp-del") : null;
      if (del) {
        e.stopPropagation();
        var e3 = findEmp(del.getAttribute("data-del"));
        if (e3) {
          confirmBox({
            title: T("mp_del_emp"),
            html: '<div class="cf-warn">' + esc(T("mp_confirm_del").replace("{n}", e3[2])) + "</div>",
            danger: true,
            okText: T("mp_del_emp")
          }).then(function (yes) {
            if (yes) save({ action: "del", id: e3[0] }, T("mp_deleted"), true);
          });
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
      /* R41: مسح القسم (سلة حمرا) — قبل الـ pen العام عشان الـ class متشالش */
      var dx = el.closest ? el.closest(".mo.dx") : null;
      if (dx) {
        e.stopPropagation();
        var nd = findByKey("d:" + dx.getAttribute("data-dx"));
        if (nd) openDeptDel(nd);
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
      var chkEl = el.closest ? el.closest(".mchk") : null;
      if (chkEl) {                           /* R43: التشيك بوكس — تحديد من غير فتح الصف */
        var cid = chkEl.getAttribute("data-chk");
        if (cid) {
          selSet[cid] = !selSet[cid];
          updateSelBar();
          renderTree();
          return;
        }
      }
      var row = el.closest ? el.closest(".mpr") : null;
      if (!row) return;
      var t = row.getAttribute("data-t");
      if (t === "emp") {
        var c = row.getAttribute("data-i");
        empOpen[c] = !empOpen[c];
        renderTree();
      } else if (t === "job") {
        /* R42: صف الوظيفة — فتح/قفل العمال تحتها */
        var jk = row.getAttribute("data-jk");
        jobOpen[jk] = !jobOpen[jk];
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

    /* R40 — تولتيب الماكينة/الملاحظات: hover على صف الموظف من غير ضغط.
       Delegated listeners واحدة على الشجرة كلها — الـ DOM بيتغلط من
       غير ما نربط حاجة لكل صف من الـ 828. */
    if (tree) {
      tree.addEventListener("mouseover", function (e) {
        /* R42 (الطلب 9): مربع الفرق — التولتيب بيوضح الوظايف الناقصة
           جوه الفرع اللي واقف عليه بالظبط (context-aware) */
        var mv = e.target.closest ? e.target.closest(".mv[data-vk]") : null;
        if (mv) {
          var vk = mv.getAttribute("data-vk");
          var vnode = null;
          if (vk === "root") vnode = ROOT;
          else if (String(vk).indexOf("j:") === 0) vnode = null;   /* صفوف الوظائف: مفيش وظايف ناقصة جواها */
          else vnode = findByKey(vk);
          if (vnode) {
            var miss = missingOf(vnode);
            var vval = vnode.tCount - vnode.eff;
            var h = '<div class="tt-h"><span class="tt-ico">' + ICO_DEPT + "</span><b>" + esc(deptLabel(vnode) === "Marib 3" ? rootLabel() : deptLabel(vnode)) + "</b></div>";
            h += '<div class="tt-r"><span>' + esc(T("mp_actual")) + '</span><b class="num">' + vnode.tCount + '</b></div>';
            h += '<div class="tt-r"><span>' + esc(T("mp_required")) + '</span><b class="num">' + vnode.eff + '</b></div>';
            h += '<div class="tt-r"><span>' + esc(T("mp_variance")) + '</span><b class="num" style="color:' + (vval < 0 ? "#F87C7C" : vval > 0 ? "#F0BE55" : "#4FD98D") + '">' + (vval > 0 ? "+" + vval : vval) + '</b></div>';
            if (miss.length) {
              h += '<div class="tt-div"></div>';
              for (var mi = 0; mi < miss.length && mi < 12; mi++) {
                h += '<div class="tt-r"><span>' + esc(TT(miss[mi].job)) + '</span><b class="tt-m num">' + (miss[mi].n > 1 ? "\u00d7" + miss[mi].n : "1") + "</b></div>";
              }
              if (miss.length > 12) h += '<div class="tt-r"><span>…</span><b class="num">+' + (miss.length - 12) + "</b></div>";
            } else if (vval < 0) {
              h += '<div class="tt-div"></div><div class="tt-r"><span>' + esc(T("mp_miss_override")) + "</span></div>";
            }
            var el2 = tipEl();
            el2.innerHTML = h;
            el2.classList.add("on");
            tipOn = true;
            tipCurId = "__mv";
            tipMove(e);
            return;
          }
        }
        var row = e.target.closest ? e.target.closest(".mpr.em") : null;
        if (!row) return;
        var id = row.getAttribute("data-i");
        if (id === tipCurId && tipOn) return;   /* نفس الصف — سيبها */
        tipCurId = id;
        clearTimeout(tipTimer);
        tipHide();
        var emp = findEmp(id);
        if (!emp) return;   /* R43: الكارت بيبان لكل موظف — الوظيفة دايمًا فيه */
        tipTimer = setTimeout(function () { tipShow(emp, e); }, 140);
      });
      tree.addEventListener("mouseout", function (e) {
        var mv = e.target.closest ? e.target.closest(".mv[data-vk]") : null;
        if (mv) {
          var to0 = e.relatedTarget;
          if (to0 && mv.contains(to0)) return;
          if (tipCurId === "__mv") { tipCurId = null; tipHide(); }
          return;
        }
        var row = e.target.closest ? e.target.closest(".mpr.em") : null;
        if (!row) return;
        var to = e.relatedTarget;
        if (to && row.contains(to)) return;      /* لسه جوه نفس الصف */
        if (row.getAttribute("data-i") !== tipCurId) return;
        tipCurId = null;
        tipHide();
      });
      tree.addEventListener("mousemove", function (e) {
        if (tipOn) tipMove(e);                   /* الكارت بيتحرك مع الماوس */
      });
      tree.addEventListener("mouseleave", function () {
        tipCurId = null;
        tipHide();
      });
    }

    /* language switch (the shell's one is hidden in mp mode) */
    document.querySelectorAll("#mpLang .sw-btn").forEach(function (b) {
      b.addEventListener("click", function () { I18N.setLang(b.getAttribute("data-lang")); });
    });

    /* re-render everything when the language flips (glossary included) */
    I18N.onChange(function () {
      if (!on) return;
      syncOrdBtn();
      mpTitle();
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
    if (t) t.classList.toggle("on", v === "tree" || v === "cards");
    if (a) a.classList.toggle("on", v === "arch");
    var vt = $("mpViewTree"), va = $("mpViewArch"), vc = $("mpViewCards");
    if (vt) vt.classList.toggle("on", v === "tree");
    if (va) va.classList.toggle("on", v === "arch");
    if (vc) vc.classList.toggle("on", v === "cards");
    mpTitle();          /* R42: عنوان التاب بيتحدث مع كل انتقال */
    updateSelBar();
  }

  /* R42: زرار التبديل عامل↔وظيفة — نصه بيتحدث مع الحالة */
  function syncOrdBtn() {
    var b = $("mpOrdBtn");
    if (!b) return;
    var jobMode = ordMode === "job";
    b.classList.toggle("on", jobMode);
    b.setAttribute("aria-pressed", jobMode ? "true" : "false");
    var lbl = b.querySelector("span");
    if (lbl) lbl.textContent = T(jobMode ? "mp_ord_job" : "mp_ord_emp");
    var thName = $("thName");
    if (thName) thName.textContent = T(jobMode ? "mp_item_job" : "mp_item");
  }

  /* R42: الربط بعد الـ load — نفس سباق الـ hydration (اللي بربطه
     app_main و app_auth): قبل كده React كان ممكن يبدل الشجرة ويمسح
     كل الـ listeners بصمت. */
  document.addEventListener("DOMContentLoaded", function () {
    function start() {
      expanded = { root: true };   /* Marib 3 starts open — departments visible immediately */
      bind();
      syncOrdBtn();                /* R42: زرار التبديل جاهز من أول لحظة */
    }
    if (document.readyState === "complete") setTimeout(start, 110);
    else window.addEventListener("load", function () { setTimeout(start, 130); });
  });

  var __api42 = {
    show: show,
    hide: hide,
    reload: reload
  };
  window.__maribMP42 = __api42;
  return __api42;
})();
