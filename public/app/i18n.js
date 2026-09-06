/* Marib Performance i18n — dictionary (ar / en / tr)
   Turkish copy is written the way a Turkish garment-factory report would
   actually read (sektor terminology: adet, hat, bölüm, vardiya şefi,
   fazla mesai, verim, gerçekleşme, açık) — not a literal translation. */
window.MARIB_I18N_DICT = {

  /* ---------- brand / topbar ---------- */
  brand_name:   { ar: "مأرب العالمية للملابس الجاهزة", en: "marib international garments", tr: "Marib Uluslararası Giyim" },
  brand_sub:    { ar: "MARIB GARMENTS", en: "MARIB GARMENTS", tr: "MARIB GİYİM" },
  mid_title:    { ar: "لوحة أداء المصنع", en: "Factory Performance", tr: "Fabrika Performansı" },
  mid_sub:      { ar: "MARIB PERFORMANCE", en: "MARIB PERFORMANCE", tr: "MARIB PERFORMANCE" },
  live:         { ar: "مباشر", en: "LIVE", tr: "CANLI" },
  doc_title:    { ar: "marib international garment", en: "marib international garment", tr: "marib international garment" },

  /* ---------- navigation ---------- */
  nav_overview: { ar: "الرئيسية", en: "Overview", tr: "Genel Bakış" },
  nav_lines:    { ar: "الخطوط", en: "Lines", tr: "Hatlar" },
  nav_sections: { ar: "الأقسام", en: "Sections", tr: "Bölümler" },
  nav_sups:     { ar: "المشرفين", en: "Supervisors", tr: "Şefler" },
  nav_pm:       { ar: "الجيوب", en: "Pockets", tr: "Cepler" },
  nav_ot:       { ar: "الأوفر تايم", en: "Overtime", tr: "Fazla Mesai" },
  nav_att:      { ar: "الحضور", en: "Attendance", tr: "Devamlılık" },
  nav_data:     { ar: "البيانات", en: "Data", tr: "Veri" },
  nav_tt_overview: { ar: "الرئيسية", en: "Overview", tr: "Genel Bakış" },
  nav_tt_lines:    { ar: "الخطوط", en: "Production Lines", tr: "Üretim Hatları" },
  nav_tt_sections: { ar: "تحليل الأقسام", en: "Section Analysis", tr: "Bölüm Analizi" },
  nav_tt_sups:     { ar: "المشرفين", en: "Supervisors", tr: "Vardiya Şefleri" },
  nav_tt_pm:       { ar: "تحليل ماكينات الجيوب", en: "Pocket Machine Analysis", tr: "Cep Makineleri Analizi" },
  nav_tt_ot:       { ar: "الأوفر تايم", en: "Overtime Analysis", tr: "Fazla Mesai Analizi" },
  nav_tt_att:      { ar: "الحضور", en: "Attendance & Discipline", tr: "Devamlılık ve Disiplin" },
  nav_tt_data:     { ar: "البيانات", en: "Data", tr: "Veri" },

  /* ---------- page titles [main, sub] ---------- */
  pg_overview: { ar: ["الأداء العام", "FACTORY OVERVIEW"], en: ["Overall Performance", "الأداء العام"], tr: ["Genel Performans", "FACTORY OVERVIEW"] },
  pg_lines:    { ar: ["الخطوط", "PRODUCTION LINES"], en: ["Production Lines", "الخطوط"], tr: ["Üretim Hatları", "PRODUCTION LINES"] },
  pg_sections: { ar: ["تحليل الأقسام", "SECTION ANALYSIS"], en: ["Section Analysis", "تحليل الأقسام"], tr: ["Bölüm Analizi", "SECTION ANALYSIS"] },
  pg_sups:     { ar: ["المشرفين", "SUPERVISORS"], en: ["Supervisors", "المشرفين"], tr: ["Vardiya Şefleri", "SUPERVISORS"] },
  pg_pm:       { ar: ["تحليل ماكينات الجيوب", "POCKET MACHINES"], en: ["Pocket Machine Analysis", "تحليل ماكينات الجيوب"], tr: ["Cep Makineleri Analizi", "POCKET MACHINES"] },
  pg_ot:       { ar: ["الأوفر تايم", "OVERTIME ANALYSIS"], en: ["Overtime Analysis", "الأوفر تايم"], tr: ["Fazla Mesai Analizi", "OVERTIME ANALYSIS"] },
  pg_att:      { ar: ["الحضور", "ATTENDANCE & DISCIPLINE"], en: ["Attendance & Discipline", "الحضور"], tr: ["Devamlılık ve Disiplin", "ATTENDANCE & DISCIPLINE"] },

  /* ---------- filters ---------- */
  f_last1:      { ar: "آخر يوم", en: "Last Day", tr: "Son Gün" },
  f_last7:      { ar: "آخر أسبوع", en: "Last Week", tr: "Son Hafta" },
  f_last30:     { ar: "آخر شهر", en: "Last Month", tr: "Son Ay" },
  f_all:        { ar: "الكل", en: "All", tr: "Tümü" },
  f_from:       { ar: "من", en: "From", tr: "Başlangıç" },
  f_to:         { ar: "إلى", en: "To", tr: "Bitiş" },
  f_line:       { ar: "الخط", en: "Line", tr: "Hat" },
  f_month:      { ar: "الشهر", en: "Month", tr: "Ay" },
  nav_tt_offline: { ar: "تحميل نسخة الأوفلاين (شغالة من غير نت)", en: "Download the offline copy (works with no internet)", tr: "Çevrimdışı kopyayı indir (internetsiz çalışır)" },
  nav_offline:   { ar: "أوفلاين", en: "Offline", tr: "Çevrimdışı" },
  toast_uploaded: { ar: "الشهر اتخزن أونلاين — كل الشركة هيشوفه فورًا", en: "Month stored online — the whole company sees it instantly", tr: "Ay çevrimiçi kaydedildi — tüm şirket anında görür" },
  cloud_err_up:      { ar: "الرفع فشل — تأكد من النت وجرّب تاني", en: "Upload failed — check the connection and try again", tr: "Yükleme başarısız — bağlantıyı kontrol edip tekrar deneyin" },
  cloud_err_no_perm: { ar: "مفيش عندك صلاحية رفع الشهور — كلم الأدمن", en: "You don't have upload permission — contact an admin", tr: "Yükleme yetkiniz yok — bir yöneticiyle görüşün" },
  cloud_err_auth:    { ar: "الجلسة انتهت — سجّل دخول تاني", en: "Session expired — sign in again", tr: "Oturum sona erdi — tekrar giriş yapın" },
  cloud_err_server:  { ar: "مشكلة في السيرفر — جرّب تاني", en: "Server problem — try again", tr: "Sunucu sorunu — tekrar deneyin" },
  f_section:    { ar: "القسم", en: "Section", tr: "Bölüm" },
  f_sup:        { ar: "المشرف", en: "Supervisor", tr: "Vardiya Şefi" },
  f_all_lines:  { ar: "كل الخطوط", en: "All Lines", tr: "Tüm Hatlar" },
  f_all_sections: { ar: "كل الأقسام", en: "All Sections", tr: "Tüm Bölümler" },
  f_all_sups:   { ar: "كل المشرفين", en: "All Supervisors", tr: "Tüm Şefler" },
  f_targets:    { ar: "الأهداف والحدود", en: "Targets & Thresholds", tr: "Hedefler ve Eşikler" },
  ref_target:   { ar: "الهدف", en: "Target", tr: "Hedef" },
  ref_safe:     { ar: "الحد الآمن", en: "Safe Limit", tr: "Güvenli Sınır" },
  t_goal_line:  { ar: "خط الهدف", en: "Target line", tr: "Hedef çizgisi" },
  t_goal_safe:  { ar: "خط الحد الآمن", en: "Safe limit line", tr: "Güvenli sınır çizgisi" },
  t_cur:        { ar: "الحالي", en: "Current", tr: "Mevcut" },
  t_ratio:      { ar: "النسبة", en: "Ratio", tr: "Oran" },
  f_csv:        { ar: "تصدير CSV", en: "Export CSV", tr: "CSV Dışa Aktar" },

  /* ---------- round 23: time-mode (base / ot / both) ---------- */
  tm_base:      { ar: "أساسي", en: "Base", tr: "Normal" },
  tm_ot:        { ar: "أوفر", en: "OT", tr: "FM" },
  tm_both:      { ar: "الكل", en: "All", tr: "Tümü" },
  tm_base_tt:   { ar: "الوقت الأساسي فقط — المسجل في Daily Data وماكينات الجيوب", en: "Regular time only — Daily Data + pocket machine records", tr: "Sadece normal süre — Daily Data + cep makinesi kayıtları" },
  tm_ot_tt:     { ar: "الأوفر تايم فقط — شيتات OT وأوفر تايم الجيوب", en: "Overtime only — OT sheets + pocket OT", tr: "Sadece fazla mesai — OT çizelgeleri + cep FM" },
  tm_both_tt:   { ar: "الوقت الأساسي والأوفر تايم معًا", en: "Regular time and overtime together", tr: "Normal süre ve fazla mesai birlikte" },

  /* ---------- round 23: month chip (auto month by date) ---------- */
  toast_no_month: { ar: "مفيش بيانات مسجلة للشهر ده", en: "No data recorded for that month", tr: "O ay için kayıtlı veri yok" },

  /* ---------- round 23: supervisors sub-tabs ---------- */
  sv_tab_sup:     { ar: "مشرفي الأقسام", en: "Supervisors", tr: "Bölüm Şefleri" },
  sv_tab_leader:  { ar: "رؤساء الخطوط", en: "Leaders", tr: "Hat Liderleri" },
  sv_tab_manager: { ar: "مديري الصالة", en: "Managers", tr: "Salon Müdürleri" },
  t_sup:      { ar: "المشرف", en: "Supervisor", tr: "Vardiya Şefi" },
  t_leader:   { ar: "رئيس الخط", en: "Leader", tr: "Hat Lideri" },
  t_manager:  { ar: "مدير الصالة", en: "Manager", tr: "Salon Müdürü" },
  sv_noun_sup:     { ar: "المشرفين", en: "Supervisors", tr: "Bölüm Şefleri" },
  sv_noun_leader:  { ar: "رؤساء الخطوط", en: "Line Leaders", tr: "Hat Liderleri" },
  sv_noun_manager: { ar: "مديري الصالة", en: "Hall Managers", tr: "Salon Müdürleri" },
  sv_perf:    { ar: "أداء", en: "", tr: "" },
  sv_top:     { ar: "الأعلى إنجازًا", en: "Top Performers", tr: "En Başarılılar" },
  sv_bottom:  { ar: "يحتاجون متابعة", en: "Needs Attention", tr: "İzlenmesi Gerekenler" },
  sv_details: { ar: "التفاصيل", en: "DETAILS", tr: "DETAYLAR" },

  /* ---------- round 23: settings modal (sidebar) ---------- */
  nav_settings:     { ar: "الإعدادات", en: "Settings", tr: "Ayarlar" },
  nav_tt_settings:  { ar: "الإعدادات — الأهداف وتصنيف المشرفين", en: "Settings — targets & people classification", tr: "Ayarlar — hedefler ve personel sınıflandırması" },
  set_title:   { ar: "الإعدادات", en: "Settings", tr: "Ayarlar" },
  set_sub:    { ar: "SETTINGS", en: "الإعدادات", tr: "AYARLAR" },
  set_tab_targets: { ar: "الأهداف والحدود", en: "Targets & Limits", tr: "Hedefler ve Sınırlar" },
  set_tab_roles:   { ar: "تصنيف المشرفين", en: "People Classification", tr: "Personel Sınıflandırması" },
  rl_hint:    { ar: "حدد كل اسم يظهر في أنهي تابة: مشرف قسم أو رئيس خط أو مدير صالة — الاختيار بيتحفظ على السيرفر وكل الشركة يشوفه", en: "Choose where each name appears: department supervisor, line leader or hall manager — saved on the server for everyone", tr: "Her ismin nerede görüneceğini seçin: bölüm şefi, hat lideri veya salon müdürü — sunucuya kaydedilir, herkes görür" },
  rl_save:    { ar: "حفظ التصنيف", en: "Save Classification", tr: "Sınıflandırmayı Kaydet" },
  rl_saved:   { ar: "تم حفظ التصنيف — التابات اتحدّثت", en: "Classification saved — tabs updated", tr: "Sınıflandırma kaydedildi — sekmeler güncellendi" },
  rl_err:     { ar: "متعذر حفظ التصنيف — جرّب تاني", en: "Couldn't save — try again", tr: "Kaydedilemedi — tekrar deneyin" },
  rl_admin:   { ar: "التعديل متاح للأدمن فقط — للعرض بس", en: "View only — editing is admin-only", tr: "Sadece görüntüleme — düzenleme yöneticiye özel" },
  rl_cnt:     { ar: "شخص", en: "people", tr: "kişi" },

  /* ---------- data menu / dropzone ---------- */
  dp_title: { ar: "تحديث البيانات", en: "Update Data", tr: "Veri Güncelle" },
  dp_sub:   { ar: "مصدر البيانات", en: "DATA SOURCE", tr: "VERİ KAYNAĞI" },
  dp_close: { ar: "إغلاق", en: "Close", tr: "Kapat" },
  dp_pick:  { ar: "اختيار مجلد البيانات", en: "Choose Data Folder", tr: "Veri Klasörü Seç" },
  dp_pick_hint: { ar: "ارفع ملف/مجلد إكسل الشهر — بيتخزن أونلاين وكل الشركة تشوفه فورًا", en: "Upload this month's Excel — it is stored online and the whole company sees it instantly", tr: "Ayın Excel dosyasını yükleyin — çevrimiçi kaydedilir, tüm şirket anında görür" },
  dp_folder:       { ar: "رفع مجلد الشهور", en: "Upload Months Folder", tr: "Aylar Klasörünü Yükle" },
  dp_folder_hint:  { ar: "اختار مجلد فيه ملفات إكسل الشهور — كل شهر بيتخزن لوحده وبيحدّث نسخته القديمة", en: "Pick a folder with the monthly Excel files — each month is stored on its own and replaces its old copy", tr: "Aylık Excel dosyalarının olduğu klasörü seçin — her ay ayrı kaydedilir ve eski kopyasını günceller" },
  dp_file:         { ar: "رفع شيت إكسل", en: "Upload Excel Sheet", tr: "Excel Sayfası Yükle" },
  dp_file_hint:    { ar: "ارفع ملف الشهر — لو مرفوع قبل كده بيتحدّث: اللي ضفته يتضاف واللي حذفته يتشال واللي غيرته يتغير", en: "Upload the month's file — if it already exists it updates: added rows are added, removed rows removed, changed values changed", tr: "Ayın dosyasını yükleyin — mevcutsa günceller: eklenen eklenir, silinen silinir, değişen değişir" },
  toast_months_saved: { ar: "اتخزن واتحدث أونلاين: ", en: "Stored & updated online: ", tr: "Çevrimiçi kaydedildi/güncellendi: " },
  dp_reset: { ar: "استعادة البيانات الأصلية", en: "Restore Original Data", tr: "Özgün Verilere Dön" },
  dp_reset_hint: { ar: "يرجّع بيانات أغسطس المدمجة ويمسح أي تحديث قمت به", en: "Brings back the built-in August data and clears any updates you made", tr: "Yerleşik Ağustos verilerini geri getirir ve yaptığın güncellemeleri temizler" },

  /* ---------- targets settings (round 7) ---------- */
  tg_title: { ar: "الأهداف والحدود", en: "Targets & Thresholds", tr: "Hedefler ve Eşikler" },
  tg_sub:   { ar: "TARGETS & THRESHOLDS", en: "الأهداف والحدود", tr: "TARGETS & THRESHOLDS" },
  tg_achv:  { ar: "نسبة التحقيق", en: "Achievement", tr: "Gerçekleşme" },
  tg_eff:   { ar: "الكفاءة", en: "Efficiency", tr: "Verim" },
  tg_ot:    { ar: "الأوفر تايم", en: "Overtime", tr: "Fazla Mesai" },
  tg_att:   { ar: "الحضور", en: "Attendance", tr: "Devamlılık" },
  tg_goal:  { ar: "الهدف", en: "Target", tr: "Hedef" },
  tg_warn:  { ar: "تحذير", en: "Warn", tr: "Uyarı" },
  tg_safe:  { ar: "حد آمن", en: "Safe Limit", tr: "Güvenli Sınır" },
  tg_danger:{ ar: "خطر", en: "Danger", tr: "Tehlike" },
  tg_save:  { ar: "حفظ الأهداف", en: "Save Targets", tr: "Hedefleri Kaydet" },
  tg_reset: { ar: "القيم الافتراضية", en: "Default Values", tr: "Varsayılanlar" },
  tg_saved: { ar: "تم حفظ الأهداف — الرسومات اتحدّثت", en: "Targets saved — charts updated", tr: "Hedefler kaydedildi — grafikler güncellendi" },
  tg_bad:   { ar: "في قيمة مش صحيحة — اكتب رقم من 1 لـ 100", en: "Invalid value — enter a number from 1 to 100", tr: "Geçersiz değer — 1 ile 100 arasında bir sayı girin" },
  tg_reset_ok: { ar: "رجعنا القيم الافتراضية", en: "Defaults restored", tr: "Varsayılanlar geri yüklendi" },
  tg_note:  { ar: "الأهداف تتحكم في خطوط الهدف على الرسومات وألوان الحالة في الجداول والمقاييس — وتُحفظ على جهازك.", en: "Targets drive the goal lines on charts and the status colors in tables and gauges — saved on your device.", tr: "Hedefler grafiklerdeki hedef çizgilerini, tablolardaki ve göstergelerdeki durum renklerini belirler — cihazınıza kaydedilir." },
  dz_main:  { ar: "أفلت ملفات أو مجلد Excel هنا", en: "Drop Excel Files or a Folder Here", tr: "Excel Dosyalarını veya Klasörü Buraya Bırak" },
  dz_sub:   { ar: "الشهر بيتخزن على سيرفر الشركة — كل الزملاء يشوفوه فورًا", en: "The month is stored on the company server — everyone sees it instantly", tr: "Ay, şirket sunucusunda saklanır — herkes anında görür" },

  /* ---------- card headers [title, sub] ---------- */
  c_ovTrend: { ar: ["الإنتاج اليومي مقابل الهدف", "DAILY OUTPUT VS TARGET"], en: ["Daily Output vs Target", "الإنتاج اليومي مقابل الهدف"], tr: ["Günlük Üretim vs Hedef", "DAILY OUTPUT VS TARGET"] },
  c_ovTop:   { ar: ["أفضل الخطوط تحقيقًا", "TOP LINES"], en: ["Top Performing Lines", "أفضل الخطوط تحقيقًا"], tr: ["En Başarılı Hatlar", "TOP LINES"] },
  c_ovDonut: { ar: ["توزيع الإنتاج على الأقسام", "OUTPUT BY SECTION"], en: ["Output by Section", "توزيع الإنتاج على الأقسام"], tr: ["Bölümlere Göre Üretim", "OUTPUT BY SECTION"] },
  c_ovDual:  { ar: ["الكفاءة والحضور اليومي", "EFFICIENCY & ATTENDANCE"], en: ["Daily Efficiency & Attendance", "الكفاءة والحضور اليومي"], tr: ["Günlük Verim ve Devamlılık", "EFFICIENCY & ATTENDANCE"] },
  c_lnAchv:  { ar: ["نسبة تحقيق الخطوط", "LINE ACHIEVEMENT"], en: ["Line Achievement", "نسبة تحقيق الخطوط"], tr: ["Hat Gerçekleşme Oranları", "LINE ACHIEVEMENT"] },
  c_lnActual:{ ar: ["الإنتاج الفعلي لكل خط", "ACTUAL BY LINE"], en: ["Actual Output by Line", "الإنتاج الفعلي لكل خط"], tr: ["Hatlara Göre Gerçek Üretim", "ACTUAL BY LINE"] },
  c_lnTable: { ar: ["تفاصيل الخطوط", "LINE DETAILS"], en: ["Line Details", "تفاصيل الخطوط"], tr: ["Hat Detayları", "LINE DETAILS"] },
  c_svTop:   { ar: ["الأعلى إنجازًا", "TOP PERFORMERS"], en: ["Top Performers", "الأعلى إنجازًا"], tr: ["En Başarılı Şefler", "TOP PERFORMERS"] },
  c_svBottom:{ ar: ["يحتاجون متابعة", "NEEDS ATTENTION"], en: ["Needs Attention", "يحتاجون متابعة"], tr: ["İzlenmesi Gerekenler", "NEEDS ATTENTION"] },
  c_svTable: { ar: ["أداء المشرفين", "SUPERVISOR DETAILS"], en: ["Supervisor Performance", "أداء المشرفين"], tr: ["Şef Performans Detayları", "SUPERVISOR DETAILS"] },
  c_scAchv:  { ar: ["نسبة تحقيق الأقسام", "SECTION ACHIEVEMENT"], en: ["Section Achievement", "نسبة تحقيق الأقسام"], tr: ["Bölüm Gerçekleşme Oranları", "SECTION ACHIEVEMENT"] },
  c_scActual:{ ar: ["الإنتاج الفعلي لكل قسم", "ACTUAL BY SECTION"], en: ["Actual Output by Section", "الإنتاج الفعلي لكل قسم"], tr: ["Bölümlere Göre Gerçek Üretim", "ACTUAL BY SECTION"] },
  c_scTrend: { ar: ["الاتجاه اليومي للأقسام", "SECTION DAILY TREND"], en: ["Section Daily Trend", "الاتجاه اليومي للأقسام"], tr: ["Bölümlerin Günlük Eğilimi", "SECTION DAILY TREND"] },
  c_scTable: { ar: ["تفاصيل الأقسام", "SECTION DETAILS"], en: ["Section Details", "تفاصيل الأقسام"], tr: ["Bölüm Detayları", "SECTION DETAILS"] },
  c_pmTrend: { ar: ["الاتجاه اليومي للماكينات", "PM DAILY TREND"], en: ["Machines Daily Trend", "الاتجاه اليومي للماكينات"], tr: ["Makine Günlük Eğilimi", "PM DAILY TREND"] },
  c_pmMach:  { ar: ["إنجاز الماكينات", "PM MACHINE ACHIEVEMENT"], en: ["Machine Achievement", "إنجاز الماكينات"], tr: ["Makine Gerçekleşme Oranları", "PM MACHINE ACHIEVEMENT"] },
  c_pmLine:  { ar: ["إنتاج الماكينات حسب الخط", "PM BY LINE"], en: ["Machines by Line", "إنتاج الماكينات حسب الخط"], tr: ["Hatlara Göre Makine Üretimi", "PM BY LINE"] },
  c_pmTVsA:  { ar: ["الهدف مقابل الفعلي حسب الخط", "TARGET VS ACTUAL"], en: ["Target vs Actual by Line", "الهدف مقابل الفعلي حسب الخط"], tr: ["Hat Bazında Hedef–Gerçek", "TARGET VS ACTUAL"] },
  c_pmTable: { ar: ["تفاصيل ماكينات الجيوب", "POCKET MACHINE DETAILS"], en: ["Pocket Machine Details", "تفاصيل ماكينات الجيوب"], tr: ["Cep Makinesi Detayları", "POCKET MACHINE DETAILS"] },
  c_otDaily: { ar: ["نسبة الأوفر تايم اليومية", "DAILY OVERTIME %"], en: ["Daily Overtime %", "نسبة الأوفر تايم اليومية"], tr: ["Günlük Fazla Mesai Oranı", "DAILY OVERTIME %"] },
  c_otGauge: { ar: ["مؤشر الأوفر تايم", "OVERTIME GAUGE"], en: ["Overtime Gauge", "مؤشر الأوفر تايم"], tr: ["Fazla Mesai Göstergesi", "OVERTIME GAUGE"] },
  c_otSec:   { ar: ["أوفر تايم الأقسام", "OT BY SECTION"], en: ["OT by Section", "أوفر تايم الأقسام"], tr: ["Bölüm Bazında Fazla Mesai", "OT BY SECTION"] },
  c_otSrc:   { ar: ["مصادر الدقائق المتاحة", "AVAILABLE MINUTES SOURCES"], en: ["Available Minutes Sources", "مصادر الدقائق المتاحة"], tr: ["Kullanılabilir Süre Kaynakları", "AVAILABLE MINUTES SOURCES"] },
  c_otSup:   { ar: ["أوفر تايم المشرفين", "OT BY SUPERVISOR"], en: ["OT by Supervisor", "أوفر تايم المشرفين"], tr: ["Şef Bazında Fazla Mesai", "OT BY SUPERVISOR"] },
  c_otTable: { ar: ["تفاصيل الأوفر تايم اليومية", "OT DAILY DETAILS"], en: ["OT Daily Details", "تفاصيل الأوفر تايم اليومية"], tr: ["Günlük Fazla Mesai Detayları", "OT DAILY DETAILS"] },
  c_atHeat:  { ar: ["خريطة الانضباط الأسبوعية", "WEEKLY DISCIPLINE HEATMAP"], en: ["Weekly Discipline Heatmap", "خريطة الانضباط الأسبوعية"], tr: ["Haftalık Disiplin Isı Haritası", "WEEKLY DISCIPLINE HEATMAP"] },
  c_atDow:   { ar: ["متوسط الحضور حسب اليوم", "ATTENDANCE BY WEEKDAY"], en: ["Attendance by Weekday", "متوسط الحضور حسب اليوم"], tr: ["Güne Göre Devamlılık", "ATTENDANCE BY WEEKDAY"] },
  c_atDaily: { ar: ["الحضور اليومي", "DAILY ATTENDANCE"], en: ["Daily Attendance", "الحضور اليومي"], tr: ["Günlük Devamlılık", "DAILY ATTENDANCE"] },
  c_atAbsent:{ ar: ["إجمالي الغياب حسب اليوم", "ABSENCES BY WEEKDAY"], en: ["Absences by Weekday", "إجمالي الغياب حسب اليوم"], tr: ["Güne Göre Devamsızlık", "ABSENCES BY WEEKDAY"] },
  c_atTable: { ar: ["تفاصيل الحضور اليومية", "ATTENDANCE DAILY DETAILS"], en: ["Attendance Daily Details", "تفاصيل الحضور اليومية"], tr: ["Günlük Devamlılık Detayları", "ATTENDANCE DAILY DETAILS"] },
  c_drillTrend: { ar: ["الاتجاه اليومي", "DAILY TREND"], en: ["Daily Trend", "الاتجاه اليومي"], tr: ["Günlük Eğilim", "DAILY TREND"] },
  c_drillTable: { ar: ["السجلات التفصيلية", "DETAIL RECORDS"], en: ["Detail Records", "السجلات التفصيلية"], tr: ["Detay Kayıtları", "DETAIL RECORDS"] },

  /* ---------- drill modal ---------- */
  d_close:      { ar: "رجوع", en: "Back", tr: "Geri" },
  dr_ct_sups:   { ar: "أداء المشرفين في هذا اليوم", en: "Supervisor Performance on This Day", tr: "Bu Günkü Şef Performansı" },
  dr_sub_sup:    { ar: "SUPERVISOR DETAILS", en: "تفاصيل المشرف", tr: "ŞEF DETAYLARI" },
  dr_sub_sec:    { ar: "SECTION DETAILS", en: "تفاصيل القسم", tr: "BÖLÜM DETAYLARI" },
  dr_sub_line:   { ar: "LINE DETAILS", en: "تفاصيل الخط", tr: "HAT DETAYLARI" },
  dr_sub_date:   { ar: "DAY DETAILS", en: "تفاصيل اليوم", tr: "GÜN DETAYLARI" },
  dr_sub_pmach:  { ar: "POCKET MACHINE", en: "ماكينة جيوب", tr: "CEP MAKİNESİ" },
  dr_sub_pmline: { ar: "PM BY LINE", en: "ماكينات الخط", tr: "HAT MAKİNELERİ" },
  dr_sub_ot:     { ar: "تفاصيل الأوفر تايم", en: "OT DETAILS", tr: "FAZLA MESAI DETAYLARI" },
  dr_sub_att:    { ar: "تفاصيل الحضور والغياب", en: "ATTENDANCE DETAILS", tr: "DEVAMLILIK DETAYLARI" },
  dr_sub_eff:    { ar: "تفاصيل الكفاءة والدقائق", en: "EFFICIENCY DETAILS", tr: "VERİM DETAYLARI" },
  dr_t_period:   { ar: "كل تفاصيل الفترة الحالية", en: "Full Period Details", tr: "Tüm Dönem Detayları" },
  dr_ct_ot:      { ar: "نسبة الأوفر تايم اليومية", en: "DAILY OVERTIME %", tr: "GÜNLÜK FM ORANI" },
  dr_ct_att:     { ar: "الحضور اليومي", en: "DAILY ATTENDANCE", tr: "GÜNLÜK DEVAMLILIK" },
  dr_ct_eff:     { ar: "الكفاءة اليومية", en: "DAILY EFFICIENCY", tr: "GÜNLÜK VERİM" },
  th_dr_otd:   { ar: ["اليوم", "المشرف", "الخط", "دقائق الأوفر"], en: ["Day", "Supervisor", "Line", "OT Minutes"], tr: ["Gün", "Vardiya Şefi", "Hat", "FM (dk)"] },
  th_dr_otp:   { ar: ["اليوم", "الدقائق المتاحة", "دقائق الأوفر", "نسبة OT", "الكفاءة"], en: ["Day", "Available Minutes", "OT Minutes", "OT %", "Efficiency"], tr: ["Gün", "Kullanılabilir (dk)", "FM (dk)", "FM Oranı", "Verim"] },
  th_dr_attd:  { ar: ["المشرف", "الحالة"], en: ["Supervisor", "Status"], tr: ["Vardiya Şefi", "Durum"] },
  st_present:  { ar: "حاضر", en: "Present", tr: "Geldi" },
  st_absent:   { ar: "غائب", en: "Absent", tr: "Gelmedi" },
  th_dr_effp:  { ar: ["اليوم", "الدقائق المتاحة", "الدقائق المنتجة", "الكفاءة"], en: ["Day", "Available Minutes", "Produced Minutes", "Efficiency"], tr: ["Gün", "Kullanılabilir (dk)", "Üretilen (dk)", "Verim"] },

  /* ---------- gauge note / heatmap scale ---------- */
  gn_1:   { ar: "حتى 10%", en: "up to 10%", tr: "%10'a kadar" },
  gn_2:   { ar: "10–20%", en: "10–20%", tr: "%10–20" },
  gn_3:   { ar: "فوق 20%", en: "over 20%", tr: "%20 üzeri" },
  hs_low: { ar: "ضعيف 50%", en: "Weak 50%", tr: "Zayıf %50" },
  hs_high:{ ar: "ممتاز 95%", en: "Excellent 95%", tr: "Mükemmel %95" },

  /* ---------- KPI tiles [title, sub-caption, badge] ---------- */
  k_ov_actual: { ar: ["الإنتاج الفعلي", "ACTUAL OUTPUT", "OUTPUT"], en: ["Actual Output", "الإنتاج الفعلي", "OUTPUT"], tr: ["Gerçek Üretim", "ACTUAL OUTPUT", "ÇIKTI"] },
  k_ov_achv:   { ar: ["نسبة التحقيق", "ACHIEVEMENT", "VS TARGET"], en: ["Achievement Rate", "نسبة التحقيق", "VS TARGET"], tr: ["Gerçekleşme Oranı", "ACHIEVEMENT", "HEDEFE GÖRE"] },
  k_ov_ot:     { ar: ["نسبة الأوفر تايم", "OVERTIME RATIO", "OT %"], en: ["Overtime Ratio", "نسبة الأوفر تايم", "OT %"], tr: ["Fazla Mesai Oranı", "OVERTIME RATIO", "FM %"] },
  k_ov_att:    { ar: ["الالتزام والحضور", "ATTENDANCE", "RATE"], en: ["Attendance & Discipline", "الالتزام والحضور", "RATE"], tr: ["Devamlılık ve Disiplin", "ATTENDANCE", "ORAN"] },
  k_ln_count:  { ar: ["خطوط الإنتاج", "ACTIVE LINES", "LINES"], en: ["Production Lines", "خطوط الإنتاج", "LINES"], tr: ["Üretim Hatları", "ACTIVE LINES", "HATLAR"] },
  k_ln_best:   { ar: ["أعلى خط تحقيقًا", "BEST LINE", "TOP"], en: ["Best Performing Line", "أعلى خط تحقيقًا", "TOP"], tr: ["En İyi Hat", "BEST LINE", "EN İYİ"] },
  k_ln_avg:    { ar: ["متوسط التحقيق", "AVG ACHIEVEMENT", "MEAN"], en: ["Average Achievement", "متوسط التحقيق", "MEAN"], tr: ["Ortalama Gerçekleşme", "AVG ACHIEVEMENT", "ORT"] },
  k_ln_sam:    { ar: ["متوسط SAM", "AVG SAM", "MIN/PC"], en: ["Average SAM", "متوسط SAM", "MIN/PC"], tr: ["Ortalama SAM", "AVG SAM", "DAK/AD"] },
  k_sv_count:  { ar: ["المشرفون", "SUPERVISORS", "TEAM"], en: ["Supervisors", "المشرفون", "TEAM"], tr: ["Vardiya Şefleri", "SUPERVISORS", "EKİP"] },
  k_sv_best:   { ar: ["أعلى إنجاز", "BEST PERFORMER", "TOP"], en: ["Top Performer", "أعلى إنجاز", "TOP"], tr: ["En Başarılı Şef", "BEST PERFORMER", "EN İYİ"] },
  k_sv_avg:    { ar: ["متوسط الإنجاز", "AVG ACHIEVEMENT", "MEAN"], en: ["Average Achievement", "متوسط الإنجاز", "MEAN"], tr: ["Ortalama Gerçekleşme", "AVG ACHIEVEMENT", "ORT"] },
  k_sv_min:    { ar: ["الدقائق المنتجة", "MINUTES PRODUCED", "MIN"], en: ["Minutes Produced", "الدقائق المنتجة", "MIN"], tr: ["Üretilen Süre", "MINUTES PRODUCED", "DAK"] },
  k_sc_count:  { ar: ["أقسام الإنتاج", "SECTIONS", "DEPTS"], en: ["Production Sections", "أقسام الإنتاج", "DEPTS"], tr: ["Üretim Bölümleri", "SECTIONS", "BÖLÜMLER"] },
  k_sc_best:   { ar: ["أعلى قسم إنجازًا", "BEST SECTION", "TOP"], en: ["Best Section", "أعلى قسم إنجازًا", "TOP"], tr: ["En İyi Bölüm", "BEST SECTION", "EN İYİ"] },
  k_sc_avg:    { ar: ["متوسط الإنجاز", "AVG ACHIEVEMENT", "MEAN"], en: ["Average Achievement", "متوسط الإنجاز", "MEAN"], tr: ["Ortalama Gerçekleşme", "AVG ACHIEVEMENT", "ORT"] },
  k_sc_ot:     { ar: ["دقائق أوفر الأقسام", "SECTION OT MIN", "OT"], en: ["Section OT Minutes", "دقائق أوفر الأقسام", "OT"], tr: ["Bölüm FM Dakikaları", "SECTION OT MIN", "FM"] },
  k_pm_rows:   { ar: ["سجلات الماكينات", "PM RECORDS", "ROWS"], en: ["Machine Records", "سجلات الماكينات", "ROWS"], tr: ["Makine Kayıtları", "PM RECORDS", "KAYIT"] },
  /* round 12: the first PM card is now the best machine by efficiency
     (replaces the plain records-count card) */
  k_pm_best:   { ar: ["أفضل ماكينة من حيث الكفاءة", "BEST MACHINE · EFF", "TOP"], en: ["Best Machine by Efficiency", "أفضل ماكينة من حيث الكفاءة", "TOP"], tr: ["En Verimli Makine", "BEST MACHINE · EFF", "EN İYİ"] },
  k_pm_out:    { ar: ["إنتاج الماكينات", "PM OUTPUT", "OUTPUT"], en: ["Machine Output", "إنتاج الماكينات", "OUTPUT"], tr: ["Makine Üretimi", "PM OUTPUT", "ÇIKTI"] },
  k_pm_ot:     { ar: ["دقائق أوفر الماكينات", "PM OT MINUTES", "OT"], en: ["Machine OT Minutes", "دقائق أوفر الماكينات", "OT"], tr: ["Makine FM Dakikaları", "PM OT MINUTES", "FM"] },
  k_pm_eff:    { ar: ["كفاءة الماكينات", "PM EFFICIENCY", "EFF"], en: ["Machine Efficiency", "كفاءة الماكينات", "EFF"], tr: ["Makine Verimliliği", "PM EFFICIENCY", "VERİM"] },
  k_ot_min:    { ar: ["دقائق الأوفر تايم", "OT MINUTES", "TOTAL"], en: ["Overtime Minutes", "دقائق الأوفر تايم", "TOTAL"], tr: ["Fazla Mesai Dakikaları", "OT MINUTES", "TOPLAM"] },
  k_ot_pct:    { ar: ["نسبة الأوفر تايم", "OT RATIO", "ORAN"], en: ["Overtime Ratio", "نسبة الأوفر تايم", "RATIO"], tr: ["Fazla Mesai Oranı", "OT RATIO", "ORAN"] },
  k_ot_avail:  { ar: ["الدقائق المتاحة", "AVAILABLE MIN", "CAPACITY"], en: ["Available Minutes", "الدقائق المتاحة", "CAPACITY"], tr: ["Kullanılabilir Süre", "AVAILABLE MIN", "KAPASİTE"] },
  k_ot_prod:   { ar: ["الدقائق المنتجة", "PRODUCED MIN", "TOTAL"], en: ["Produced Minutes", "الدقائق المنتجة", "TOTAL"], tr: ["Üretilen Süre", "PRODUCED MIN", "TOPLAM"] },
  k_ot_avg:    { ar: ["متوسط الأوفر اليومي", "DAILY OT AVG", "MEAN"], en: ["Daily OT Average", "متوسط الأوفر اليومي", "MEAN"], tr: ["Günlük FM Ortalaması", "DAILY OT AVG", "ORT"] },
  k_ot_peak:   { ar: ["أعلى يوم أوفر", "PEAK OT DAY", "MAX"], en: ["Peak OT Day", "أعلى يوم أوفر", "MAX"], tr: ["Zirve FM Günü", "PEAK OT DAY", "MAKS"] },
  k_ot_eff:    { ar: ["كفاءة الدقائق", "MINUTES EFFICIENCY", "EFF"], en: ["Minutes Efficiency", "كفاءة الدقائق", "EFF"], tr: ["Süre Verimi", "MINUTES EFFICIENCY", "VERİM"] },
  ot_sub_of_avail: { ar: "من إجمالي الدقائق المتاحة", en: "of total available minutes", tr: "toplam kullanılabilir süreden" },
  k_at_rate:   { ar: ["نسبة الحضور", "ATTENDANCE RATE", "MEAN"], en: ["Attendance Rate", "نسبة الحضور", "MEAN"], tr: ["Devamlılık Oranı", "ATTENDANCE RATE", "ORT"] },
  k_at_abs:    { ar: ["إجمالي الغياب", "TOTAL ABSENCES", "DAYS"], en: ["Total Absences", "إجمالي الغياب", "DAYS"], tr: ["Toplam Devamsızlık", "TOTAL ABSENCES", "GÜN"] },
  k_at_peak:   { ar: ["أعلى حضور يومي", "PEAK WORKFORCE", "MAX"], en: ["Peak Workforce", "أعلى حضور يومي", "MAX"], tr: ["Zirve İşgücü", "PEAK WORKFORCE", "MAKS"] },
  k_at_rows:   { ar: ["سجلات الانضباط", "DISCIPLINE RECORDS", "ROWS"], en: ["Discipline Records", "سجلات الانضباط", "ROWS"], tr: ["Disiplin Kayıtları", "DISCIPLINE RECORDS", "KAYIT"] },

  /* ---------- units ---------- */
  u_pcs:   { ar: "قطعة", en: "pcs", tr: "adet" },
  u_min:   { ar: "دقيقة", en: "min", tr: "dk" },
  u_line:  { ar: "خط", en: "line", tr: "hat" },
  u_sup:   { ar: "مشرف", en: "supervisor", tr: "şef" },
  u_sec:   { ar: "قسم", en: "section", tr: "bölüm" },
  u_rec:   { ar: "سجل", en: "record", tr: "kayıt" },
  u_mach:  { ar: "ماكينة", en: "machine", tr: "makine" },
  u_day:   { ar: "يوم", en: "day", tr: "gün" },
  u_worker:{ ar: "عامل", en: "worker", tr: "işçi" },

  /* ---------- status chips ---------- */
  st_good: { ar: "ممتاز", en: "Excellent", tr: "Mükemmel" },
  st_warn: { ar: "مقبول", en: "Acceptable", tr: "Orta" },
  st_bad:  { ar: "منخفض", en: "Low", tr: "Zayıf" },

  /* ---------- tooltip row labels ---------- */
  t_actual:   { ar: "الفعلي", en: "Actual", tr: "Gerçek" },
  t_target:   { ar: "الهدف", en: "Target", tr: "Hedef" },
  t_achv:     { ar: "الإنجاز", en: "Achievement", tr: "Gerçekleşme" },
  t_real:     { ar: "التحقيق", en: "Achievement", tr: "Gerçekleşme" },
  t_eff:      { ar: "الكفاءة", en: "Efficiency", tr: "Verim" },
  t_line:     { ar: "الخط", en: "Line", tr: "Hat" },
  t_sup:      { ar: "المشرف", en: "Supervisor", tr: "Vardiya Şefi" },
  t_sec:      { ar: "القسم", en: "Section", tr: "Bölüm" },
  t_mach:     { ar: "الماكينة", en: "Machine", tr: "Makine" },
  t_lines:    { ar: "الخطوط", en: "Lines", tr: "Hatlar" },
  t_recs:     { ar: "السجلات", en: "Records", tr: "Kayıtlar" },
  t_out:      { ar: "الإنتاج", en: "Output", tr: "Üretim" },
  t_ot_pct:   { ar: "نسبة OT", en: "OT %", tr: "FM Oranı" },
  t_ot_min:   { ar: "دقائق OT", en: "OT Minutes", tr: "FM (dk)" },
  t_ot_min2:  { ar: "دقائق الأوفر", en: "OT Minutes", tr: "FM (dk)" },
  t_avail:    { ar: "المتاح", en: "Available", tr: "Kullanılabilir" },
  t_availmin: { ar: "الدقائق المتاحة", en: "Available Minutes", tr: "Kullanılabilir (dk)" },
  t_prodmin:  { ar: "الدقائق المنتجة", en: "Produced Minutes", tr: "Üretilen (dk)" },
  t_att:      { ar: "الحضور", en: "Attendance", tr: "Devamlılık" },
  t_absent:   { ar: "غياب", en: "Absent", tr: "Devamsız" },
  t_present:  { ar: "حاضرين", en: "Present", tr: "Gelen" },
  t_avgatt:   { ar: "متوسط الحضور", en: "Avg Attendance", tr: "Ort. Devam" },
  t_totabs:   { ar: "إجمالي الغياب", en: "Total Absences", tr: "Toplam Devamsızlık" },
  t_days:     { ar: "أيام", en: "Days", tr: "Gün" },
  t_avg:      { ar: "المتوسط", en: "Average", tr: "Ortalama" },
  t_gap:      { ar: "العجز", en: "Gap", tr: "Açık" },
  t_src:      { ar: "المصدر", en: "Source", tr: "Kaynak" },
  t_min:      { ar: "الدقائق", en: "Minutes", tr: "Dakika" },
  t_client:   { ar: "العميل", en: "Client", tr: "Müşteri" },
  t_maxatt:   { ar: "أقصى حضور", en: "Max Attendance", tr: "Maks. Devam" },
  t_share:    { ar: "النسبة", en: "Share", tr: "Pay" },
  t_value:    { ar: "القيمة", en: "Value", tr: "Değer" },
  t_disc:     { ar: "الانضباط", en: "Discipline", tr: "Disiplin" },
  t_recs2:    { ar: "عدد السجلات", en: "Records", tr: "Kayıt Sayısı" },
  t_day:      { ar: "اليوم", en: "Day", tr: "Gün" },
  t_pmout:    { ar: "إنتاج الماكينات", en: "Machine Output", tr: "Makine Üretimi" },
  t_sam:      { ar: "SAM", en: "SAM", tr: "SAM" },
  t_secout:   { ar: "إنتاج القسم", en: "Section Output", tr: "Bölüm Üretimi" },
  t_minprod:  { ar: "الدقائق المنتجة", en: "Produced Minutes", tr: "Üretilen Süre" },

  /* ---------- legends / goal lines / ref lines ---------- */
  lg_actual_line: { ar: "الإنتاج الفعلي", en: "Actual Output", tr: "Gerçek Üretim" },
  lg_avg_target:  { ar: "متوسط الهدف اليومي", en: "Avg Daily Target", tr: "Ort. Günlük Hedef" },
  lg_eff:         { ar: "الكفاءة", en: "Efficiency", tr: "Verim" },
  lg_att:         { ar: "الحضور", en: "Attendance", tr: "Devamlılık" },
  lg_target:      { ar: "الهدف", en: "Target", tr: "Hedef" },
  lg_actual2:     { ar: "الفعلي", en: "Actual", tr: "Gerçek" },
  gl_target85:    { ar: "هدف 85%", en: "Target 85%", tr: "Hedef %85" },
  gl_target95:    { ar: "هدف 95%", en: "Target 95%", tr: "Hedef %95" },
  gl_85:          { ar: "85%", en: "85%", tr: "%85" },
  gl_safe10:      { ar: "حد آمن 10%", en: "Safe Limit 10%", tr: "Güvenli Sınır %10" },
  ref_avgtarget:  { ar: "متوسط الهدف", en: "Avg Target", tr: "Ort. Hedef" },

  /* ---------- value names (tooltip headline) ---------- */
  vn_achv:     { ar: "الإنجاز", en: "Achievement", tr: "Gerçekleşme" },
  vn_real:     { ar: "التحقيق", en: "Achievement", tr: "Gerçekleşme" },
  vn_actual:   { ar: "الإنتاج الفعلي", en: "Actual Output", tr: "Gerçek Üretim" },
  vn_ot_min:   { ar: "دقائق الأوفر تايم", en: "OT Minutes", tr: "FM (dk)" },
  vn_avg_att:  { ar: "متوسط الحضور", en: "Avg Attendance", tr: "Ort. Devam" },
  vn_tot_abs:  { ar: "إجمالي الغياب", en: "Total Absences", tr: "Toplam Devamsızlık" },
  vn_pm_out:   { ar: "إنتاج الماكينات", en: "Machine Output", tr: "Makine Üretimi" },
  vn_pcs:      { ar: "القطع", en: "Pieces", tr: "Adet" },
  vn_min:      { ar: "دقائق", en: "Minutes", tr: "Dakika" },
  vn_out:      { ar: "الإنتاج", en: "Output", tr: "Üretim" },

  /* ---------- donut center / OT sources ---------- */
  dc_total_actual: { ar: "إجمالي الفعلي", en: "Total Actual", tr: "Toplam Gerçek" },
  dc_total_min:    { ar: "إجمالي الدقائق المتاحة", en: "Total Available Minutes", tr: "Toplam Kullanılabilir Süre" },
  os_daily:        { ar: "شيتات يومية", en: "Daily Sheets", tr: "Günlük Çizelgeler" },
  os_ot:           { ar: "أوفر تايم", en: "Overtime", tr: "Fazla Mesai" },
  os_pm:           { ar: "ماكينات الجيوب", en: "Pocket Machines", tr: "Cep Makineleri" },
  os_daily_src:    { ar: "شيتات الدليلي داتا", en: "Daily Data sheets", tr: "Günlük Veri Çizelgeleri" },
  os_ot_src:       { ar: "شيتات الأوفر تايم", en: "Overtime sheets", tr: "FM Çizelgeleri" },
  os_pm_src:       { ar: "شيت ماكينات الجيوب", en: "Pocket machines sheet", tr: "Cep Makinesi Çizelgesi" },
  g_ot_label:      { ar: "نسبة الأوفر تايم من الدقائق المتاحة", en: "Overtime share of available minutes", tr: "Kullanılabilir süredeki fazla mesai payı" },

  /* ---------- deltas ---------- */
  d_label: { ar: "عن الفترة السابقة", en: "vs previous period", tr: "önceki döneme göre" },
  d_pts:   { ar: "نقطة", en: "pts", tr: "puan" },

  /* ---------- drill KPI extra labels ---------- */
  dk_min_eff: { ar: "كفاءة الدقائق", en: "Minutes Efficiency", tr: "Süre Verimi" },
  dk_ot:      { ar: "نسبة الأوفر تايم", en: "Overtime %", tr: "Fazla Mesai Oranı" },

  /* ---------- table headers (arrays) ---------- */
  th_lines:   { ar: ["#", "الخط", "الهدف", "الفعلي", "التحقيق", "نسبة OT", "التقييم", "SAM", "أقصى حضور"], en: ["#", "Line", "Target", "Actual", "Achievement", "OT %", "Status", "SAM", "Max Attendance"], tr: ["#", "Hat", "Hedef", "Gerçek", "Gerçekleşme", "FM %", "Durum", "SAM", "Maks. Devam"] },
  th_sups:    { ar: ["#", "المشرف", "الهدف", "الفعلي", "التحقيق", "نسبة OT", "التقييم"], en: ["#", "Supervisor", "Target", "Actual", "Achievement", "OT %", "Status"], tr: ["#", "Vardiya Şefi", "Hedef", "Gerçek", "Gerçekleşme", "FM %", "Durum"] },
  th_secs:    { ar: ["#", "القسم", "الهدف", "الفعلي", "التحقيق", "نسبة OT", "التقييم", "أقصى حضور", "دقائق أوفر"], en: ["#", "Section", "Target", "Actual", "Achievement", "OT %", "Status", "Max Attendance", "OT Minutes"], tr: ["#", "Bölüm", "Hedef", "Gerçek", "Gerçekleşme", "FM %", "Durum", "Maks. Devam", "FM (dk)"] },
  th_pm:      { ar: ["#", "الماكينة", "الخطوط", "السجلات", "الهدف", "الفعلي", "التحقيق", "الدقائق المتاحة", "المنتجة", "الكفاءة"], en: ["#", "Machine", "Lines", "Records", "Target", "Actual", "Achievement", "Available Min", "Produced Min", "Efficiency"], tr: ["#", "Makine", "Hatlar", "Kayıtlar", "Hedef", "Gerçek", "Gerçekleşme", "Kullanılabilir (dk)", "Üretilen (dk)", "Verim"] },
  th_ot:      { ar: ["اليوم", "الدقائق المتاحة", "دقائق الأوفر", "نسبة OT", "الدقائق المنتجة", "الكفاءة"], en: ["Day", "Available Minutes", "OT Minutes", "OT %", "Produced Minutes", "Efficiency"], tr: ["Gün", "Kullanılabilir (dk)", "FM (dk)", "FM Oranı", "Üretilen (dk)", "Verim"] },
  th_att:     { ar: ["اليوم", "الحضور", "الحاضرين", "الغياب"], en: ["Day", "Attendance", "Present", "Absent"], tr: ["Gün", "Devam", "Gelen", "Devamsız"] },
  at_tab_workers: { ar: "حضور وغياب العمال", en: "Workers Attendance", tr: "İşçi Devamlılığı" },
  at_tab_sups:    { ar: "حضور وغياب المشرفين", en: "Supervisors Attendance", tr: "Şef Devamlılığı" },
  k_as_rate:    { ar: ["انضباط المشرفين", "SUPERVISOR DISCIPLINE", "MEAN"], en: ["Supervisor Discipline", "انضباط المشرفين", "MEAN"], tr: ["Şef Devamlılığı", "SUPERVISOR DISCIPLINE", "ORT"] },
  k_as_count:   { ar: ["عدد المشرفين", "SUPERVISORS", "TOTAL"], en: ["Supervisors", "عدد المشرفين", "TOTAL"], tr: ["Şef Sayısı", "SUPERVISORS", "TOPLAM"] },
  k_as_abs:     { ar: ["أيام غياب المشرفين", "SUPERVISOR ABSENT DAYS", "SUM"], en: ["Supervisor Absent Days", "أيام غياب المشرفين", "SUM"], tr: ["Şef Devamsızlık Günü", "SUPERVISOR ABSENT DAYS", "TOPLAM"] },
  k_as_perfect: { ar: ["انضباط كامل", "PERFECT RECORD", "COUNT"], en: ["Perfect Record", "انضباط كامل", "COUNT"], tr: ["Tam Devam", "PERFECT RECORD", "ADET"] },
  th_as:        { ar: ["المشرف", "أيام الحضور", "أيام الغياب", "النسبة", "الحالة"], en: ["Supervisor", "Present Days", "Absent Days", "Rate", "Status"], tr: ["Şef", "Geldiği Gün", "Gelmediği Gün", "Oran", "Durum"] },
  c_asDaily:    { ar: ["المشرفون الحاضرون يوميًا", "SUPERVISORS PRESENT DAILY"], en: ["Supervisors Present Daily", "المشرفون الحاضرون يوميًا"], tr: ["Günlük Gelen Şefler", "SUPERVISORS PRESENT DAILY"] },
  c_asTable:    { ar: ["انضباط المشرفين", "SUPERVISOR DISCIPLINE"], en: ["Supervisor Discipline", "انضباط المشرفين"], tr: ["Şef Devamlılığı", "SUPERVISOR DISCIPLINE"] },
  t_supscount:  { ar: "عدد المشرفين", en: "Supervisors", tr: "Şef sayısı" },
  th_dr_sup:  { ar: ["اليوم", "المصدر", "الهدف", "الفعلي", "التحقيق"], en: ["Day", "Source", "Target", "Actual", "Achievement"], tr: ["Gün", "Kaynak", "Hedef", "Gerçek", "Gerçekleşme"] },
  th_dr_sec:  { ar: ["المشرف", "الخط", "الهدف", "الفعلي", "التحقيق"], en: ["Supervisor", "Line", "Target", "Actual", "Achievement"], tr: ["Vardiya Şefi", "Hat", "Hedef", "Gerçek", "Gerçekleşme"] },
  th_dr_line: { ar: ["اليوم", "القسم", "الهدف", "الفعلي", "التحقيق"], en: ["Day", "Section", "Target", "Actual", "Achievement"], tr: ["Gün", "Bölüm", "Hedef", "Gerçek", "Gerçekleşme"] },
  th_dr_date: { ar: ["المشرف", "الخط", "القسم", "الهدف", "الفعلي"], en: ["Supervisor", "Line", "Section", "Target", "Actual"], tr: ["Vardiya Şefi", "Hat", "Bölüm", "Hedef", "Gerçek"] },
  th_dr_pm:   { ar: ["اليوم", "الخط", "العميل", "PO", "الهدف", "الفعلي", "التحقيق", "الكفاءة"], en: ["Day", "Line", "Client", "PO", "Target", "Actual", "Achievement", "Efficiency"], tr: ["Gün", "Hat", "Müşteri", "PO", "Hedef", "Gerçek", "Gerçekleşme", "Verim"] },
  csv_metric: { ar: "المؤشر", en: "Metric", tr: "Gösterge" },
  csv_value:  { ar: "القيمة", en: "Value", tr: "Değer" },
  csv_weekday:{ ar: "يوم الأسبوع", en: "Weekday", tr: "Gün" },

  /* ---------- toasts ---------- */
  toast_noexcel: { ar: "لم يتم العثور على ملفات Excel", en: "No Excel files found", tr: "Excel dosyası bulunamadı" },
  toast_nodata:  { ar: "لا توجد بيانات قابلة للتحليل", en: "No analyzable data found", tr: "Analiz edilebilir veri bulunamadı" },
  toast_reset:   { ar: "تمت استعادة البيانات الأصلية", en: "Original data restored", tr: "Özgün veriler geri yüklendi" },
  /* round 14: cross-tab session restore */
  toast_restored: { ar: "تمت استعادة بيانات الجلسة السابقة تلقائيًا — من غير رفع جديد", en: "Previous session data restored automatically — no re-upload needed", tr: "Önceki oturum verileri otomatik geri yüklendi — yeniden yükleme gerekmedi" },

  /* ---------- compare feature (round 8) ---------- */
  cmp_title:  { ar: "مقارنة بفترة أخرى", en: "Compare with another period", tr: "Başka dönemle karşılaştır" },
  cmp_now:    { ar: "الفترة الحالية", en: "Current period", tr: "Mevcut dönem" },
  cmp_prev:   { ar: "الفترة السابقة", en: "Previous period", tr: "Önceki dönem" },
  cmp_pm:     { ar: "الشهر السابق", en: "Previous month", tr: "Önceki ay" },
  cmp_pm2:    { ar: "قبل شهرين", en: "Two months back", tr: "İki ay önce" },
  cmp_py:     { ar: "نفس الشهر العام الماضي", en: "Same month last year", tr: "Geçen yıl aynı ay" },
  cmp_off:    { ar: "إيقاف المقارنة", en: "Turn comparison off", tr: "Karşılaştırmayı kapat" },
  cmp_cur:    { ar: "الحالي", en: "Current", tr: "Mevcut" },
  cmp_vs:     { ar: "المقارن", en: "Compared", tr: "Karşılaştırılan" },
  cmp_delta:  { ar: "الفارق", en: "Difference", tr: "Fark" },
  cmp_empty:  { ar: "لا توجد بيانات مسجلة في الفترة المقارنة", en: "No data recorded in the compared period", tr: "Karşılaştırılan dönemde kayıt yok" },
  cmp_hint:   { ar: "اختر الفترة اللي تقارن بيها نفس مدة الفترة الحالية", en: "Pick the period to compare against the current selection", tr: "Mevcut seçimle karşılaştırılacak dönemi seçin" },
  cmp_range:  { ar: "المدة", en: "Range", tr: "Aralık" },

  /* ---------- round 10: login (denim edition) ---------- */
  lg_sub:        { ar: "لوحة أداء مصنع مأرب", en: "Marib Factory Performance", tr: "Marib Fabrika Performansı" },
  lg_welcome:    { ar: "مرحبًا بك", en: "Welcome", tr: "Hoş geldiniz" },
  lg_hint:       { ar: "يرجى تسجيل الدخول للمتابعة", en: "Please sign in to continue", tr: "Devam etmek için giriş yapın" },
  lg_user_ph:    { ar: "اسم المستخدم", en: "Username", tr: "Kullanıcı adı" },
  lg_pass_ph:    { ar: "كلمة المرور", en: "Password", tr: "Şifre" },
  lg_login:      { ar: "تسجيل الدخول", en: "Sign In", tr: "Giriş Yap" },
  lg_remember:   { ar: "تذكرني", en: "Remember me", tr: "Beni hatırla" },
  lg_forgot:     { ar: "نسيت كلمة المرور؟", en: "Forgot password?", tr: "Şifremi unuttum" },
  lg_err:        { ar: "اسم المستخدم أو كلمة المرور غير صحيحة", en: "Incorrect username or password", tr: "Kullanıcı adı veya şifre hatalı" },
  lg_err_locked:   { ar: "محاولات كتير غلط — الحساب مقفول ١٠ دقايق", en: "Too many failed attempts — account locked for 10 minutes", tr: "Çok fazla hatalı deneme — hesap 10 dakika kilitli" },
  lg_err_inactive: { ar: "الحساب متوقف — كلم الأدمن", en: "Account disabled — contact an admin", tr: "Hesap devre dışı — bir yöneticiyle görüşün" },
  lg_err_server:   { ar: "مشكلة في السيرفر — جرّب تاني", en: "Server problem — try again", tr: "Sunucu sorunu — tekrar deneyin" },
  lg_err_fill:   { ar: "اكتب اسم المستخدم وكلمة المرور الأول", en: "Enter your username and password first", tr: "Önce kullanıcı adı ve şifreyi girin" },
  lg_forgot_note:{ ar: "إعادة تعيين كلمة المرور بتتم من مطوّر اللوحة — تواصل مع Amin", en: "Password resets are done by the panel developer — contact Amin", tr: "Şifre sıfırlama panelin geliştiricisi tarafından yapılır — Amin ile iletişime geçin" },
  lg_act_show:   { ar: "إظهار كلمة المرور (فك الغرز)", en: "Show password (unpick stitches)", tr: "Şifreyi göster (dikişi sök)" },
  lg_act_hide:   { ar: "خياطة كلمة المرور وإخفاؤها", en: "Stitch the password shut", tr: "Şifreyi dik ve gizle" },
  lg_status_hide:{ ar: "جاري خياطة كلمة المرور…", en: "Stitching the password…", tr: "Şifre dikiliyor…" },
  lg_status_show:{ ar: "جاري فك الغرز…", en: "Unpicking the stitches…", tr: "Dikiş sökülüyor…" },

  /* ---------- round 10: no-data state ---------- */
  nd_title:  { ar: "اللوحة فاضية", en: "Dashboard is empty", tr: "Panelde veri yok" },
  nd_hint:   { ar: "ارفع مجلد ملفات إكسل بتاع الشهر — كل التحليلات والرسومات بتتحدث فورًا على جهازك", en: "Upload this month's Excel folder — every analysis and chart updates instantly on your device", tr: "Ayın Excel klasörünü yükleyin — tüm analizler ve grafikler cihazınızda anında güncellenir" },
  nd_btn:    { ar: "رفع مجلد البيانات", en: "Upload data folder", tr: "Veri klasörünü yükle" },
  dp_empty:  { ar: "اللوحة فاضية — ارفع مجلد الشهر عشان تشوف التحليلات", en: "Dashboard is empty — upload the month folder to see the analytics", tr: "Panel boş — analizleri görmek için ayın klasörünü yükleyin" },

  /* ---------- round 10: users & roles ---------- */
  nav_users:      { ar: "المستخدمين", en: "Users", tr: "Kullanıcılar" },
  nav_tt_users:   { ar: "المستخدمين والصلاحيات", en: "Users & roles", tr: "Kullanıcılar ve yetkiler" },
  nav_logout:     { ar: "خروج", en: "Logout", tr: "Çıkış" },
  nav_tt_logout:  { ar: "تسجيل الخروج", en: "Sign out", tr: "Oturumu kapat" },
  us_title:    { ar: "المستخدمين والصلاحيات", en: "Users & Roles", tr: "Kullanıcılar ve Yetkiler" },
  us_sub:      { ar: "USERS & ROLES", en: "USERS & ROLES", tr: "USERS & ROLES" },
  us_you:      { ar: "(أنت)", en: "(you)", tr: "(siz)" },
  us_role_dev:   { ar: "المطوّر", en: "Developer", tr: "Geliştirici" },
  us_role_admin: { ar: "أدمن", en: "Admin", tr: "Yönetici" },
  us_role_user:  { ar: "مستخدم", en: "User", tr: "Kullanıcı" },
  us_admin_lbl:  { ar: "صلاحيات أدمن", en: "Admin rights", tr: "Yönetici yetkisi" },
  us_upload_lbl: { ar: "مسموح له يرفع الشهور", en: "Can upload months", tr: "Ay yükleyebilir" },
  us_upload_tt:  { ar: "صلاحية رفع ملفات الشهور على السيرفر", en: "Permission to upload month files to the server", tr: "Ay dosyalarını sunucuya yükleme yetkisi" },
  us_admin_hint: { ar: "الأدمن يدير المستخدمين — والمفتاح التاني يسمح للي عايزه يرفع شهر الإكسل — الباقي كله مشاهدة بس", en: "Admins manage users — the second switch allows uploading Excel months — everyone else only views", tr: "Yöneticiler kullanıcıları yönetir — ikinci düğme Excel ayı yükleme izni verir — diğerleri yalnızca görüntüler" },
  us_hint_dev:  { ar: "حساب المطوّر — صلاحيات أدمن كاملة وثابتة", en: "Developer account — fixed full admin rights", tr: "Geliştirici hesabı — sabit tam yönetici yetkisi" },
  us_add_title: { ar: "مستخدم جديد", en: "New user", tr: "Yeni kullanıcı" },
  us_name_ph:   { ar: "اسم المستخدم", en: "Username", tr: "Kullanıcı adı" },
  us_pass_ph:   { ar: "كلمة المرور", en: "Password", tr: "Şifre" },
  us_add:       { ar: "إضافة المستخدم", en: "Add user", tr: "Kullanıcı ekle" },
  us_chg:       { ar: "تغيير الباسورد", en: "Change password", tr: "Şifre değiştir" },
  us_chg_ph:    { ar: "الباسورد الجديد", en: "New password", tr: "Yeni şifre" },
  us_save:      { ar: "حفظ", en: "Save", tr: "Kaydet" },
  us_cancel:    { ar: "إلغاء", en: "Cancel", tr: "İptal" },
  us_del:       { ar: "حذف", en: "Delete", tr: "Sil" },
  us_del_cf:    { ar: "متأكد؟", en: "Sure?", tr: "Emin misin?" },
  us_toast_added: { ar: "تمت إضافة المستخدم", en: "User added", tr: "Kullanıcı eklendi" },
  us_toast_dup:   { ar: "الاسم ده مستخدم بالفعل", en: "That username already exists", tr: "Bu kullanıcı adı zaten var" },
  us_toast_bad:   { ar: "الاسم لازم حرفين على الأقل والباسورد 4", en: "Username needs 2+ characters and password 4+", tr: "Ad en az 2, şifre en az 4 karakter olmalı" },
  us_toast_saved: { ar: "تم الحفظ", en: "Saved", tr: "Kaydedildi" },
  us_toast_del:   { ar: "تم حذف المستخدم", en: "User deleted", tr: "Kullanıcı silindi" },
  us_toast_nodel: { ar: "مينفعش تحذف الحساب ده", en: "This account can't be deleted", tr: "Bu hesap silinemez" },
  us_no_admin:    { ar: "القسم ده للأدمن بس", en: "This section is for admins only", tr: "Bu bölüm yalnızca yöneticilere açık" },
  us_hello:       { ar: "أهلًا بيك، ", en: "Welcome, ", tr: "Hoş geldin, " },
  toast_logout:   { ar: "تم تسجيل الخروج", en: "Signed out", tr: "Çıkış yapıldı" }
};

/* Marib Performance i18n — engine
   - t(key) / ta(key) dictionary access
   - locale number & percent formatting (tr: 210.161 / %82,83 — en/ar: 210,161 / 82.83%)
   - localized weekday names, count phrases, drill titles, KPI sub-lines
   - RTL/LTR switching + data-i18n DOM translation + persistence */
var I18N = (function () {
  "use strict";
  var LS_KEY = "marib_lang";
  var cur = "ar";
  var D = window.MARIB_I18N_DICT || {};
  var listeners = [];

  var DAYS_FULL = {
    ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    tr: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"]
  };
  var DAYS_SHORT = {
    ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    tr: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"]
  };
  /* heat map rows run Saturday-first (regional week) */
  var HEAT_DAYS = {
    ar: ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"],
    en: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
    tr: ["Cmt", "Paz", "Pzt", "Sal", "Çar", "Per", "Cum"]
  };

  /* ---------- basics ---------- */
  function t(key) {
    var e = D[key];
    if (!e) return key;
    var v = (e[cur] != null) ? e[cur] : e.ar;
    return (v == null) ? e.ar : v;
  }
  /* pair/triple access: ta('c_x')[0] title, [1] sub, [2] badge */
  function ta(key) { var v = t(key); return Array.isArray(v) ? v : [v, v, v]; }
  function tv(key) { return ta(key)[0]; }   /* main title */
  function ts(key) { return ta(key)[1]; }   /* small sub-caption */
  function tb(key) { return ta(key)[2]; }   /* badge chip */
  function is(l) { return cur === l; }
  function dir() { return cur === "ar" ? "rtl" : "ltr"; }
  function listSep() { return cur === "ar" ? "، " : ", "; }
  function num(n) { return '<span class="num">' + n + "</span>"; }

  /* ---------- locale number formatting ---------- */
  function dec(s) { return cur === "tr" ? String(s).replace(".", ",") : String(s); }
  function loc() { return cur === "tr" ? "tr-TR" : "en-US"; }
  function fmtInt(n) { return (n == null || !isFinite(n)) ? "—" : Math.round(n).toLocaleString(loc()); }
  function fmtNum(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString(loc(), { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d });
  }
  /* v is already in percent units (e.g. 82.83) */
  function pctV(v, d) {
    if (v == null || !isFinite(v)) return "—";
    var s = v.toFixed(d == null ? 1 : d);
    return cur === "tr" ? "%" + s.replace(".", ",") : s + "%";
  }
  /* x is a fraction (e.g. 0.8283) */
  function fmtPct(x, d) { return (x == null || !isFinite(x)) ? "—" : pctV(x * 100, d); }
  function pts(v, d) { /* percentage-point delta with sign */
    var s = Math.abs(v).toFixed(d == null ? 1 : d);
    if (cur === "tr") s = s.replace(".", ",");
    return (v >= 0 ? "+" : "−") + s + " " + t("d_pts");
  }
  function kFmt(v) { return dec((Math.round(v / 100) / 10).toLocaleString(loc())) + "K"; }

  /* ---------- weekdays ---------- */
  function dayFull(dw) { return DAYS_FULL[cur][dw]; }
  function dayShort(dw) { return DAYS_SHORT[cur][dw]; }
  function heatDays() { return HEAT_DAYS[cur]; }

  /* ---------- round 23: month label (month chip) ---------- */
  var MONTHS_BY_LANG = {
    ar: ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"],
    en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
    tr: ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]
  };
  function monthLabel(key) {
    /* "2026-09" → "سبتمبر 2026" / "September 2026" / "Eylül 2026" */
    if (!/^\d{4}-\d{2}$/.test(String(key || ""))) return "";
    var m = +key.slice(5, 7);
    var names = MONTHS_BY_LANG[cur] || MONTHS_BY_LANG.ar;
    return (names[m - 1] || key) + " " + key.slice(0, 4);
  }

  /* ---------- count phrases (proper plurals; TR uses no plural after numerals) ---------- */
  var COUNTS = {
    line:  { ar: "خط", en: ["line", "lines"], tr: "hat" },
    sup:   { ar: "مشرف", en: ["supervisor", "supervisors"], tr: "şef" },
    sec:   { ar: "قسم", en: ["section", "sections"], tr: "bölüm" },
    mach:  { ar: "ماكينة", en: ["machine", "machines"], tr: "makine" },
    day:   { ar: "يوم", en: ["day", "days"], tr: "gün" },
    rec:   { ar: "سجل", en: ["record", "records"], tr: "kayıt" },
    worker:{ ar: "عامل", en: ["worker", "workers"], tr: "işçi" }
  };
  function count(n, kind) {
    var e = COUNTS[kind] || kind;
    var word;
    if (cur === "en" && Array.isArray(e.en)) word = (n == 1 ? e.en[0] : e.en[1]);
    else if (cur === "en") word = e;
    else word = (cur === "tr") ? e.tr : e.ar;
    return fmtInt(n) + " " + word;
  }

  /* ---------- entity prefixes ---------- */
  function lineN(n) { return cur === "ar" ? "خط " + n : (cur === "tr" ? "Hat " + n : "Line " + n); }
  /* localized section names (round 8): Turkish garment-sector terms
     (Ön / Arka / Montaj / Hazırlık …) + Arabic shop-floor terms;
     unknown sections fall back to the raw name from the data */
  var SECTION_MAP = {
    Front:       { ar: "صدر",  tr: "Ön" },  /* round 12: garment term — bodice front */
    Back:        { ar: "ظهر",  tr: "Arka" },
    Assembly:    { ar: "تجميع", tr: "Montaj" },
    Preparation: { ar: "تحضير", tr: "Hazırlık" },
    Sleeve:      { ar: "أكمام", tr: "Kol" },
    Pocket:      { ar: "جيوب",  tr: "Cep" },
    Collar:      { ar: "ياقات", tr: "Yaka" },
    Cuff:        { ar: "أساور", tr: "Manşet" },
    Cutting:     { ar: "قص",    tr: "Kesim" },
    Ironing:     { ar: "كي",    tr: "Ütü" },
    Quality:     { ar: "جودة",  tr: "Kalite" },
    Packing:     { ar: "تغليف", tr: "Paketleme" }
  };
  function sectionName(n) {
    var s = String(n == null ? "" : n).trim();
    var e = SECTION_MAP[s];
    if (!e) return s;
    var v = cur === "tr" ? e.tr : (cur === "en" ? s : e.ar);
    return v == null ? s : v;
  }
  function sectionN(n) {
    var nm = sectionName(n);
    if (cur === "ar") return "قسم " + nm;
    if (cur === "tr") return SECTION_MAP[String(n == null ? "" : n).trim()] ? nm : (n + " Bölümü");
    return "Section " + nm;
  }
  function machN(n) { return cur === "ar" ? "ماكينة " + n : (cur === "tr" ? "Cep Makinesi " + n : "Pocket Machine " + n); }
  function dayTitle(wdName, dateShort) { return wdName + " " + dateShort; }
  function drTitleSec(v) { return cur === "ar" ? sectionN(v) : (cur === "tr" ? sectionN(v) : "Section: " + sectionName(v)); }
  function drTitleLine(v) { return lineN(v); }
  function drTitlePm(v) { return machN(v); }
  function drTitlePmLine(v) { return cur === "ar" ? "ماكينات خط " + v : (cur === "tr" ? "Hat " + v + " Makineleri" : "Machines — Line " + v); }

  /* ---------- KPI sub-lines (numbered templates) ---------- */
  function subTargetPcs(n) {
    return cur === "tr" ? "Hedef: " + num(fmtInt(n)) + " adet"
         : cur === "en" ? "Target: " + num(fmtInt(n)) + " pcs"
         : 'الهدف: ' + num(fmtInt(n)) + " قطعة";
  }
  function subActualOf(n, m) {
    return cur === "tr" ? "Gerçekleşen " + num(fmtInt(n)) + " / " + num(fmtInt(m))
         : cur === "en" ? "Actual " + num(fmtInt(n)) + " of " + num(fmtInt(m))
         : 'الفعلي ' + num(fmtInt(n)) + " من " + num(fmtInt(m));
  }
  function subOtOf(n, m) {
    return cur === "tr" ? num(fmtInt(n)) + " dk FM — " + num(fmtInt(m)) + " dk kullanılabilir"
         : cur === "en" ? num(fmtInt(n)) + " OT min of " + num(fmtInt(m)) + " available"
         : num(fmtInt(n)) + " دقيقة أوفر من " + num(fmtInt(m)) + " متاحة";
  }
  function subAbsentWorkers(n) {
    return cur === "tr" ? num(fmtInt(n)) + " işçi devamsız"
         : cur === "en" ? num(fmtInt(n)) + " workers absent"
         : 'غياب ' + num(fmtInt(n)) + " عامل";
  }
  function subBestLine(line, actual) {
    return cur === "tr" ? "Hat " + num(line) + " · gerçekleşen " + num(fmtInt(actual))
         : cur === "en" ? "Line " + num(line) + " · actual " + num(fmtInt(actual))
         : 'خط ' + num(line) + " · فعلي " + num(fmtInt(actual));
  }
  /* round 12: sub-line for the "best machine by efficiency" KPI —
     machine number + its produced/available minutes */
  function subBestMachine(mach, mp, cap) {
    return cur === "tr" ? "Makine " + num(mach) + " · " + num(fmtInt(mp)) + " / " + num(fmtInt(cap)) + " dk"
         : cur === "en" ? "Machine " + num(mach) + " · " + num(fmtInt(mp)) + " / " + num(fmtInt(cap)) + " min"
         : 'ماكينة ' + num(mach) + " · " + num(fmtInt(mp)) + " من " + num(fmtInt(cap)) + " دقيقة";
  }
  function subOfAvail(n) {
    return cur === "tr" ? num(fmtInt(n)) + " dk kapasiteden"
         : cur === "en" ? "out of " + num(fmtInt(n)) + " available"
         : 'من أصل ' + num(fmtInt(n)) + " متاحة";
  }
  function subSecOutput(n) {
    return cur === "tr" ? "Bölüm üretimi " + num(fmtInt(n)) + " adet"
         : cur === "en" ? "Sections output " + num(fmtInt(n)) + " pcs"
         : 'إنتاج الأقسام ' + num(fmtInt(n)) + " قطعة";
  }
  function subInclOtPcs(n) {
    return cur === "tr" ? num(fmtInt(n)) + " adet FM üretimi içerir"
         : cur === "en" ? "includes " + num(fmtInt(n)) + " OT pieces"
         : 'يشمل ' + num(fmtInt(n)) + " قطعة أوفر تايم";
  }
  function subProducedOf(n, m) {
    return cur === "tr" ? num(fmtInt(m)) + " dk içinden " + num(fmtInt(n)) + " dk üretildi"
         : cur === "en" ? num(fmtInt(n)) + " produced of " + num(fmtInt(m)) + " available"
         : num(fmtInt(n)) + " منتجة من " + num(fmtInt(m)) + " متاحة";
  }
  function subOtSplit(a, b) {
    return cur === "tr" ? num(fmtInt(a)) + " dk FM çizelgeleri + " + num(fmtInt(b)) + " dk cep makineleri"
         : cur === "en" ? "incl. " + num(fmtInt(a)) + " from OT sheets + " + num(fmtInt(b)) + " from pocket machines"
         : 'تشمل ' + num(fmtInt(a)) + " أوفر شيتات + " + num(fmtInt(b)) + " ماكينات جيوب";
  }
  function subMinOf(n, m) {
    return cur === "tr" ? num(fmtInt(n)) + " dk / " + num(fmtInt(m)) + " dk kapasite"
         : cur === "en" ? num(fmtInt(n)) + " minutes of " + num(fmtInt(m)) + " available"
         : num(fmtInt(n)) + " دقيقة من " + num(fmtInt(m)) + " متاحة";
  }
  /* efficiency as a sub-line under a plain-minutes KPI (percentage stays separate) */
  function subEffOf(eff) {
    if (eff == null || !isFinite(eff)) return "";
    var p = pctV(eff * 100, 1);
    return cur === "tr" ? "Verim " + num(p)
         : cur === "en" ? "Efficiency " + num(p)
         : "الكفاءة " + num(p);
  }
  function subPeakDay(wdName, dateShort) {
    return cur === "ar" ? "يوم " + wdName + " " + num(dateShort) : wdName + " " + num(dateShort);
  }
  function subOtMin(n) { return fmtInt(n) + (cur === "tr" ? " dk FM" : (cur === "en" ? " OT minutes" : " دقيقة أوفر")); }
  function subMinRec(n) { return fmtInt(n) + (cur === "tr" ? " dk" : (cur === "en" ? " min" : " دقيقة")); }
  function heroChip(total, days) {
    return cur === "tr" ? "Toplam gerçek <b>" + fmtInt(total) + "</b> · " + days + " gün"
         : cur === "en" ? "Total actual <b>" + fmtInt(total) + "</b> · " + days + " days"
         : 'إجمالي الفعلي <b>' + fmtInt(total) + "</b> · " + days + " يوم";
  }
  function dateChip(days) {
    return cur === "tr" ? " · " + days + " gün" : (cur === "en" ? " · " + days + " days" : " · " + days + " يوم");
  }

  /* ---------- toast templates ---------- */
  function toastCsv(name) { return cur === "tr" ? name + " dışa aktarıldı" : (cur === "en" ? "Exported " + name : "تم تصدير " + name); }
  function toastReadErr(n) { return cur === "tr" ? n + " dosya okunamadı" : (cur === "en" ? "Couldn't read " + n + " file(s)" : "تعذر قراءة " + n + " ملف"); }
  function toastParsed(n) {
    return cur === "tr" ? n + " dosya analiz edildi — veriler güncel"
         : cur === "en" ? "Analyzed " + n + " file(s) — data is now up to date"
         : "تم تحليل " + n + " ملف — البيانات محدثة الآن";
  }
  function toastUploaded(label) {
    return cur === "tr" ? (label || "Ay") + " çevrimiçi kaydedildi — tüm şirket anında görür"
         : cur === "en" ? (label || "Month") + " stored online — the whole company sees it instantly"
         : "شهر " + (label || "") + " اتخزن أونلاين — كل الشركة هيشوفه فورًا";
  }

  /* ---------- DOM translation (data-i18n, data-i18n-title, optional :0/:1/:2 index) ---------- */
  function resolve(key) {
    var idx = key.indexOf(":");
    if (idx < 0) return t(key);
    var base = key.slice(0, idx), i = +key.slice(idx + 1);
    return ta(base)[i] != null ? ta(base)[i] : ta(base)[0];
  }
  function fixSubCaps(el) {
    /* Latin caps captions keep letter-spacing; Arabic sub-captions (EN mode) must not */
    if (!el) return;
    var hasAr = /[\u0600-\u06FF]/.test(el.textContent || "");
    if (el.classList && (el.classList.contains("en") || el.classList.contains("sub")))
      el.classList.toggle("ar-sub", hasAr);
  }
  function applyDOM() {
    var els = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = resolve(els[i].getAttribute("data-i18n"));
      fixSubCaps(els[i]);
    }
    var tt = document.querySelectorAll("[data-i18n-title]");
    for (var j = 0; j < tt.length; j++) tt[j].setAttribute("title", resolve(tt[j].getAttribute("data-i18n-title")));
    var ph = document.querySelectorAll("[data-i18n-ph]");
    for (var m = 0; m < ph.length; m++) ph[m].setAttribute("placeholder", resolve(ph[m].getAttribute("data-i18n-ph")));
    var al = document.querySelectorAll("[data-i18n-aria]");
    for (var n = 0; n < al.length; n++) al[n].setAttribute("aria-label", resolve(al[n].getAttribute("data-i18n-aria")));
    var sw = document.querySelectorAll("#langSw button");
    for (var k = 0; k < sw.length; k++)
      sw[k].className = "sw-btn" + (sw[k].getAttribute("data-lang") === cur ? " on" : "");
    var lsw = document.querySelectorAll("#lgLang button");
    for (var q = 0; q < lsw.length; q++)
      lsw[q].className = (lsw[q].getAttribute("data-lg") === cur ? "on" : "");
  }

  /* ---------- language switching ---------- */
  function onChange(fn) { listeners.push(fn); }
  function setLang(l, silent) {
    if (l !== "ar" && l !== "en" && l !== "tr") l = "ar";
    if (l === cur) { applyDOM(); return; }
    cur = l;
    try { localStorage.setItem(LS_KEY, l); } catch (e) { }
    var de = document.documentElement;
    de.setAttribute("lang", l);
    de.setAttribute("dir", dir());
    document.title = t("doc_title");
    if (window.MaribCore && MaribCore.utils) {
      MaribCore.utils.fmtInt = function (n) { return fmtInt(n); };
      MaribCore.utils.fmtNum = function (n, d) { return fmtNum(n, d); };
      MaribCore.utils.fmtPct = function (x, d) { return fmtPct(x, d == null ? 2 : d); };
    }
    if (window.MaribCharts && MaribCharts.setDir) MaribCharts.setDir(dir());
    applyDOM();
    if (!silent) for (var i = 0; i < listeners.length; i++) { try { listeners[i](l); } catch (e) { } }
  }
  function restore() {
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) { }
    if (saved === cur) { applyDOM(); return; }
    if (saved === "en" || saved === "tr") setLang(saved, true); else applyDOM();
  }

  /* auto-restore at load (scripts sit at end of <body>, DOM already parsed) */
  restore();

  return {
    t: t, ta: ta, tv: tv, ts: ts, tb: tb, is: is, dir: dir, listSep: listSep,
    fmtInt: fmtInt, fmtNum: fmtNum, fmtPct: fmtPct, pctV: pctV, pts: pts, kFmt: kFmt, dec: dec,
    dayFull: dayFull, dayShort: dayShort, heatDays: heatDays, monthLabel: monthLabel,
    count: count, lineN: lineN, sectionN: sectionN, sectionName: sectionName, machN: machN, dayTitle: dayTitle,
    drTitleSec: drTitleSec, drTitleLine: drTitleLine, drTitlePm: drTitlePm, drTitlePmLine: drTitlePmLine,
    subTargetPcs: subTargetPcs, subActualOf: subActualOf, subOtOf: subOtOf, subAbsentWorkers: subAbsentWorkers,
    subBestLine: subBestLine, subBestMachine: subBestMachine, subOfAvail: subOfAvail, subSecOutput: subSecOutput, subInclOtPcs: subInclOtPcs,
    subProducedOf: subProducedOf, subOtSplit: subOtSplit, subMinOf: subMinOf, subEffOf: subEffOf, subPeakDay: subPeakDay,
    subOtMin: subOtMin, subMinRec: subMinRec, heroChip: heroChip, dateChip: dateChip,
    toastCsv: toastCsv, toastReadErr: toastReadErr, toastParsed: toastParsed, toastUploaded: toastUploaded,
    applyDOM: applyDOM, fixSubCaps: fixSubCaps, setLang: setLang, onChange: onChange, lang: function () { return cur; }
  };
})();
