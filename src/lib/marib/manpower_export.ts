/* Marib manpower export builder (R56 — refactoring)
   بناء ملف إكسل الاتزان كله (4 شيتات) + تيمبلت الرفع — المنطق ده
   كان ساكن جوه ملف الـ route نفسه (685 سطر). اتنقل هنا بنفس أسلوب
   R52 مع الاستيراد (manpower_io.ts): الـ route بقى رفيع (صلاحية +
   استدعاء + إرسال) والبناء كله هنا.
   نفس المخرجات بالبايت — مثبت بسكريبت E2E r56 (مقارنة XML محتوى
   الملف قبل وبعد التعديل).
   التغيير الوحيد في البنية: byId و activeTr كانوا متغيرين على مستوى
   الموديول (حالة متشاركة بين الطلبات) — بقوا جوه سياق لكل استدعاء. */

import { XBook, XSheet, XStyle } from "./xlsx-writer";
import { q } from "./db";

/* ---------- palette (the site's denim + gold) ---------- */
const C = {
  denim: "FF16233F",      // darkest header
  denim2: "FF24365C",     // header row
  group: "FFE9EEF7",      // group subtotal rows
  group2: "FFF4F7FC",     // line subtotal rows
  band: "FFF8FAFD",       // banded leaf rows
  total: "FF16233F",      // grand total row = denim
  gold: "FFD9A86B",
  line: "FFD5DCE8",       // hairline borders
  red: "FFC0392B",
  redFill: "FFFBEAE8",
  green: "FF1E8449",
  greenFill: "FFEAF7EF",
  amber: "FFB7791F",
  amberFill: "FFFBF3E2",
  txt: "FF1E2A3C",
  faint: "FF8A97A8",
};

/* ---------- tree types (client math, replicated) ---------- */
type Node = {
  id: string; name: string; parent: string; ord: number;
  kids: Node[]; emps: Emp[]; vacs: Emp[];
  count: number; rows: number; own: number | null; eff: number;
};
type Emp = { code: string; name: string; job: string; hire: string; vac: boolean; mach: string; note: string; name_tr?: string | null; job_tr?: string | null };  /* R50: التركي */

/* ---------- per-request context (بدل متغيرات الموديول القديمة) ----------
   byId: خريطة العقد للاستعلام السريع · tr: دالة الترجمة النشطة
   (identity بالافتراضي) · lang: ar|tr. */
type Ctx = {
  byId: Map<string, Node>;
  tr: (s: string) => string;
  lang: "ar" | "tr";
};

/* SEWING's numeric lines display as "خط N" on the site — same here.
   R46-10: applies the active translation (set per-request) when a
   non-English lang was requested. */
function dispName(ctx: Ctx, n: Node): string {
  const parentName = n.parent ? (ctx.byId.get(n.parent)?.name || "") : "";
  const raw = /^\d+$/.test(n.name) && parentName === "SEWING" ? "خط " + n.name : n.name;
  return ctx.tr(raw);
}

function statusOf(variance: number): { label: string; color: string; fill: string } {
  if (variance < 0) return { label: "ناقص", color: C.red, fill: C.redFill };
  if (variance > 0) return { label: "زيادة", color: C.amber, fill: C.amberFill };
  return { label: "متوازن", color: C.green, fill: C.greenFill };
}

/* number cell writer (centered, variance-colored, +N/−N format) */
function numCell(sh: XSheet, r: number, c: number, v: number, variance = false, fill = "") {
  const st: XStyle = {
    align: { h: "center", v: "middle" },
    font: {
      size: 11,
      color: variance ? (v < 0 ? C.red : v > 0 ? C.amber : C.green) : C.txt,
    },
    border: C.line,
  };
  if (variance) st.fmt = "+0;-0;0";
  if (fill) st.fill = fill;
  sh.cell(r, c, v, st);
}
function statusCell(sh: XSheet, r: number, c: number, variance: number, fill = "") {
  const s = statusOf(variance);
  sh.cell(r, c, s.label, {
    align: { h: "center", v: "middle" },
    font: { size: 10.5, bold: true, color: s.color },
    fill: fill || s.fill,
    border: C.line,
  });
}

/* الناتج: بايتات الملف + اسم التنزيل — الـ route بيبني الـ response */
export interface BuiltXlsx {
  bytes: Uint8Array;
  fileName: string;
}

const p2 = (x: number) => (x < 10 ? "0" : "") + x;
function todayStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
}

/* ============================================================
   التيمبلت (?template=1) — R42: نفس أعمدة Database بتاعة ملف
   Manpower مليانة بالموظفين الحاليين + عمود «حذف؟» + شيت تعليمات.
   R50: 15 عمود — عمود تركي جنب كل حرفة فيها حروف.
   ============================================================ */
export async function buildTemplate(): Promise<BuiltXlsx> {
  const deptRows = await q("SELECT id, name, parent_id, ord, label_tr FROM marib_dept ORDER BY ord ASC");
  const empRows = await q(
    "SELECT code, name, job, dept_id, hire, vac, mach, note, name_tr, job_tr FROM marib_emp ORDER BY ord ASC"
  );
  const pById = new Map<string, { name: string; nameTr: string; parent: string }>();
  for (const d of deptRows) pById.set(d.id as string, { name: (d.name as string) || "", nameTr: (d.label_tr as string) || "", parent: (d.parent_id as string) || "" });
  const chainOf = (id: string | null): { ar: [string, string, string]; tr: [string, string, string] } => {
    const parts: string[] = [];
    const trParts: string[] = [];
    let cur = id ? pById.get(id) : undefined;
    let guard = 0;
    while (cur && guard++ < 10) { parts.unshift(cur.name); trParts.unshift(cur.nameTr); cur = cur.parent ? pById.get(cur.parent) : undefined; }
    return {
      ar: [parts[0] || "", parts[1] || "", parts.slice(2).join(" - ")],
      tr: [trParts[0] || "", trParts[1] || "", trParts.slice(2).join(" - ")],
    };
  };
  const twb = new XBook();
  const db = twb.sheet("Database", { rtl: true, freezeRows: 1, widths: [5, 10, 30, 24, 17, 15, 17, 15, 17, 15, 22, 20, 10, 18, 7], defaultRowHeight: 18 });
  const th = ["p", "الكود", "الاسم", "الاسم TR", "الادارة", "الادارة TR", "القسم", "القسم TR", "القسم الداخلي", "القسم الداخلي TR", "الوظيفة", "الوظيفة TR", "الماكينة", "ملاحظات", "حذف؟"];
  th.forEach((h, i) => {
    db.cell(1, i + 1, h, {
      font: { size: 11, bold: true, color: "FFFFFFFF" },
      fill: C.denim2,
      align: { h: i >= 2 && i <= 11 || i === 13 ? "right" : "center", v: "middle" },
      border: C.line,
    });
  });
  db.row(1, { height: 22 });
  db.filter("A1:O1");
  let tr = 2;
  let p = 0;
  for (const e of empRows) {
    const ch = chainOf(e.dept_id as string | null);
    const [a, b, c] = ch.ar;
    const [aTr, bTr, cTr] = ch.tr;
    const vac = !!e.vac;
    const band = p % 2 === 1 ? C.band : "";
    const st = (font?: Partial<XStyle["font"]>): XStyle => ({
      align: { h: "center", v: "middle" }, font: { size: 10.5, color: C.txt, ...font }, border: C.line,
      ...(band ? { fill: band } : {}),
    });
    const stR = (font?: Partial<XStyle["font"]>): XStyle => ({
      align: { h: "right", v: "middle" }, font: { size: 10.5, color: C.txt, ...font }, border: C.line,
      ...(band ? { fill: band } : {}),
    });
    p++;
    db.cell(tr, 1, p, st());
    db.cell(tr, 2, vac ? "" : ((e.code as string) || ""), st(vac ? { color: C.faint } : undefined));
    db.cell(tr, 3, vac ? "" : ((e.name as string) || ""), stR(vac ? { color: C.faint } : undefined));
    db.cell(tr, 4, vac ? "" : ((e.name_tr as string) || ""), stR(vac ? { color: C.faint } : undefined));
    db.cell(tr, 5, a, stR());
    db.cell(tr, 6, aTr, stR());
    db.cell(tr, 7, b, stR());
    db.cell(tr, 8, bTr, stR());
    db.cell(tr, 9, c, stR());
    db.cell(tr, 10, cTr, stR());
    db.cell(tr, 11, (e.job as string) || "", stR());
    db.cell(tr, 12, (e.job_tr as string) || "", stR());
    db.cell(tr, 13, (e.mach as string) || "", st());
    db.cell(tr, 14, (e.note as string) || "", stR());
    db.cell(tr, 15, "", st());
    if (vac) {
      db.cell(tr, 3, "", st({ italic: true, color: C.red, bold: true }));
      db.cell(tr, 11, (e.job as string) || "", stR({ italic: true, color: C.red, bold: true }));
    }
    tr++;
  }
  /* التعليمات — شيت جوه الملف نفسه */
  const ins = twb.sheet("التعليمات", { rtl: true, widths: [110], defaultRowHeight: 20 });
  const stampT = todayStamp();
  const lines: [string, boolean][] = [
    [`تيمبلت الاتزان — ${stampT} · ${empRows.length} صف`, true],
    ["الملف ده نسخة كاملة من الموقع. عدّل اللي عايزه وارفعه من زرار «رفع شيت Manpower» في صفحة الاتزان.", false],
    ["", false],
    ["إضافة موظف: صف جديد — اكتب الكود والاسم والوظيفة والإدارة/القسم. (الكود ممكن يفضل فاضي — هيطلع في الموقع «جديد»)", false],
    ["تعديل موظف: دور على كوده وغيّر أي خانة (الاسم/الوظيفة/القسم/الماكينة/ملاحظات).", false],
    ["أعمدة TR (التركي): اختياري — اكتب الاسم/الادارة/القسم/الوظيفة بالتركي جنب العربي، وهيظهر في الموقع لما تختار لغة TR. الخانة الفاضية مش بتمسح التركي المخزن.", false],
    ["نقل موظف: غيّر الادارة/القسم/القسم الداخلي في صفه — النقل هيتسجل في الأرشيف تلقائيًا.", false],
    ["شاغر (وظيفة مطلوبة من غير حد): سيب خانة «الاسم» فاضي واكتب الوظيفة — الموقع هيحطه «شاغر» مكانه.", false],
    ["حذف موظف: اكتب «نعم» في عمود «حذف؟» في صفه — الحذف هيتسجل في الأرشيف كخروج.", false],
    ["", false],
    ["ملاحظات مهمة:", true],
    ["· الشيت هو الحقيقة: أي موظف موجود على الموقع ومش موجود في الملف هيتشال من الموقع لما ترفع الشيت (فيه تراجع 15 دقيقة بعد الرفع).", false],
    ["· تواريخ التعيين محفوظة على الموقع ومش بتتأثر بالملف (العمود مش موجود هنا أصلًا).", false],
    ["· الأقسام بتتفهم بالذكاء: لو غيّرت اسم قسم في الموقع، الشيت بيلقاه بأي اسم قديم أو جديد.", false],
    ["· عمود p مجرد ترقيم — متغيّرهش.", false],
  ];
  lines.forEach(([txt, bold], i) => {
    ins.cell(i + 1, 1, txt, {
      align: { h: "right", v: "middle" },
      font: { size: bold ? 13 : 11.5, bold, color: bold ? C.gold : C.txt },
      ...(bold ? { fill: C.denim } : {}),
    });
    ins.row(i + 1, { height: bold ? 26 : 20 });
  });
  return {
    bytes: twb.build(),
    fileName: `Manpower-Template-${stampT.replace(/-/g, "")}.xlsx`,
  };
}

/* ============================================================
   التصدير الكامل — 4 شيتات:
     1. "Manpower"  — جدول مسطح + الملخص بالإدارات على جنب (R42)
     2. "الهيكل"    — الشجرة كاملة بـ outline levels
     3. "الموظفين"  — كل صف بشغله + autofilter
     4. "الأرشيف"   — أرشيف النقل (مع صفوف الخروج)
   نفس الرياضة زي العميل: actual = filled rows, required = manual
   override لو موجود وإلا كل الصوف تحته, variance = actual − required.
   ============================================================ */
export async function buildExport(wantLang: "ar" | "tr"): Promise<BuiltXlsx> {
  /* ---------- R50: الترجمة من أعمدة الشيت ----------
     مفيش marib_i18n ولا ترجمة فورية — التركي من label_tr للأقسام
     (الجداول المحورية والهيكل) ومن name_tr/job_tr للموظفين. */
  let deptTrMap = new Map<string, string>();
  if (wantLang === "tr") {
    const dRows = await q("SELECT name, label_tr FROM marib_dept WHERE label_tr IS NOT NULL AND label_tr <> ''");
    for (const r of dRows) deptTrMap.set(r.name as string, r.label_tr as string);
  }
  /* helper: apply translation if available, else return original */
  const trName = (s: string): string => {
    if (!s || wantLang !== "tr") return s;
    return deptTrMap.get(s) || s;
  };

  /* ---------- data → tree (client math, replicated) ---------- */
  /* R50: label_tr للأقسام (شيت المحورية/الهيكل) + name_tr/job_tr (شيت الموظفين) */
  const deptRows = await q("SELECT id, name, parent_id, ord, label_tr FROM marib_dept ORDER BY ord ASC");
  const empRows = await q("SELECT code, name, job, dept_id, hire, vac, mach, note, name_tr, job_tr FROM marib_emp ORDER BY ord ASC");
  const reqRows = await q("SELECT node_key, required FROM marib_req");

  const reqMap = new Map<string, number>();
  for (const r of reqRows) reqMap.set(r.node_key as string, r.required as number);

  const ctx: Ctx = { byId: new Map<string, Node>(), tr: trName, lang: wantLang };
  const byId = ctx.byId;
  const root: Node = {
    id: "", name: "Marib 3", parent: "", ord: 0,
    kids: [], emps: [], vacs: [], count: 0, rows: 0, own: null, eff: 0,
  };
  for (const d of deptRows) {
    byId.set(d.id as string, {
      id: d.id as string, name: d.name as string, parent: (d.parent_id as string) || "",
      ord: (d.ord as number) || 0,
      kids: [], emps: [], vacs: [], count: 0, rows: 0, own: null, eff: 0,
    });
  }
  for (const e of empRows) {
    const emp: Emp = {
      code: (e.code as string) || "", name: (e.name as string) || "",
      job: (e.job as string) || "", hire: (e.hire as string) || "", vac: !!e.vac,
      mach: (e.mach as string) || "", note: (e.note as string) || "",
      name_tr: (e.name_tr as string) || "", job_tr: (e.job_tr as string) || "",   /* R50 */
    };
    const n = e.dept_id ? byId.get(e.dept_id as string) : undefined;
    if (!n) { (emp.vac ? root.vacs : root.emps).push(emp); continue; }
    (emp.vac ? n.vacs : n.emps).push(emp);
  }
  (function attach(n: Node) {
    const kids: Node[] = [];
    for (const [, c] of byId) if (c.parent === n.id) kids.push(c);
    kids.sort((a, b) => a.ord - b.ord);
    n.kids = kids;
    for (const k of kids) attach(k);
  })(root);
  (function roll(n: Node): void {
    n.count = n.emps.length;
    n.rows = n.emps.length + n.vacs.length;
    n.own = n.id ? (reqMap.has("d:" + n.id) ? reqMap.get("d:" + n.id)! : null) : null;
    let sum = 0;
    for (const k of n.kids) { roll(k); n.count += k.count; n.rows += k.rows; sum += k.eff; }
    n.eff = n.own !== null ? n.own : n.emps.length + n.vacs.length + sum;
  })(root);

  /* date + hero numbers */
  const stamp = todayStamp();
  const vacTotal = (function sumVac(n: Node): number {
    let s = n.vacs.length; for (const k of n.kids) s += sumVac(k); return s;
  })(root);
  const jadidTotal = (function sumJ(n: Node): number {
    let s = n.emps.filter((e) => !e.code || e.code === "جديد").length;
    for (const k of n.kids) s += sumJ(k); return s;
  })(root);

  const wb = new XBook();

  /* ============================================================
     SHEET 1 — Manpower (R42: بيفوت بالظبط زي ملف المالك)
     ============================================================ */
  const pv = wb.sheet("Manpower", {
    rtl: true,
    freezeRows: 4,
    widths: [17, 26, 10, 11, 10, 12, 34, 3, 17, 10, 11, 10],
    defaultRowHeight: 19,
  });

  /* title + subtitle */
  pv.merge("A1:G1");
  pv.cell(1, 1, "Marib 3 — الاتزان", {
    font: { size: 17, bold: true, color: "FFFFFFFF" },
    fill: C.denim,
    align: { h: "center", v: "middle" },
  });
  pv.row(1, { height: 34 });

  pv.merge("A2:G2");
  pv.cell(2, 1, `تصدير ${stamp} · الحالي ${root.count} · المطلوب ${root.eff} · الفرق ${root.count - root.eff} · شاغر ${vacTotal} · جديد ${jadidTotal}`, {
    font: { size: 10.5, bold: true, color: C.gold },
    fill: C.denim,
    align: { h: "center", v: "middle" },
  });
  pv.row(2, { height: 20 });
  pv.row(3, { height: 6 });

  /* header */
  const heads = ["الإدارة", "القسم", "الحالي", "المطلوب", "الفرق", "الحالة", "النواقص (وظايف مطلوبة)"];
  heads.forEach((h, i) => {
    pv.cell(4, i + 1, h, {
      font: { size: 11, bold: true, color: "FFFFFFFF" },
      fill: C.denim2,
      align: { h: i >= 2 && i <= 5 ? "center" : "right", v: "middle" },
      border: C.line,
    });
  });
  pv.row(4, { height: 22 });

  /* الوظايف الناقصة المباشرة في العقدة (مش المجموع الفرعي — عشان
     مفيش صف بيعّد مرتين) */
  function missingJobs(n: Node): string {
    if (!n.vacs.length) return "";
    const byJob = new Map<string, number>();
    for (const v of n.vacs) {
      const j = v.job || "بدون وظيفة";
      byJob.set(j, (byJob.get(j) || 0) + 1);
    }
    return Array.from(byJob.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([j, c]) => (c > 1 ? `${j} ×${c}` : j))
      .join(" و ");
  }

  /* صفوف الجدول: كل قسم فيه صفوف مباشرة (موظفين أو شواغر) */
  let rIdx = 5;
  function topOf(n: Node): Node {
    let cur = n;
    while (cur.parent && byId.get(cur.parent)) cur = byId.get(cur.parent)!;
    return cur;
  }
  function labelBelowTop(n: Node): string {
    const parts: string[] = [];
    let cur = n;
    let guard = 0;
    while (cur && cur.parent && byId.get(cur.parent) && guard++ < 10) {
      parts.unshift(dispName(ctx, cur));
      cur = byId.get(cur.parent)!;
    }
    return parts.join(" - ") || dispName(ctx, n);
  }
  function pivotRow(n: Node) {
    const v = n.count - n.eff;
    const top = topOf(n);
    const band = rIdx % 2 === 1 ? C.band : "";
    const f = (extra?: Partial<XStyle["font"]>): XStyle["font"] => ({ size: 11, color: C.txt, ...extra });
    const cellSt = (align: "center" | "right", font: XStyle["font"]): XStyle => ({
      align: { h: align, v: "middle" }, font, border: C.line, ...(band ? { fill: band } : {}),
    });
    pv.cell(rIdx, 1, dispName(ctx, top), cellSt("right", f({ bold: true, color: C.denim2 })));
    pv.cell(rIdx, 2, labelBelowTop(n), cellSt("right", f()));
    numCell(pv, rIdx, 3, n.count, false, band);
    numCell(pv, rIdx, 4, n.eff, false, band);
    numCell(pv, rIdx, 5, v, true, band);
    statusCell(pv, rIdx, 6, v, band);
    const miss = missingJobs(n);
    pv.cell(rIdx, 7, miss, miss
      ? cellSt("right", { size: 10.5, color: C.red })
      : cellSt("right", f({ color: C.faint })));
    rIdx++;
  }
  (function walkPivot(n: Node) {
    for (const k of n.kids) {
      if (k.emps.length || k.vacs.length) pivotRow(k);
      walkPivot(k);
    }
  })(root);
  /* الموظفين المعلقين على الجذر نفسه ( لو في ) */
  if (root.emps.length || root.vacs.length) pivotRow(root);

  /* الإجمالي — آخر صف */
  const tv = root.count - root.eff;
  const totFont = { size: 12, bold: true, color: "FFFFFFFF" };
  pv.cell(rIdx, 1, "الإجمالي", {
    font: totFont, fill: C.total, align: { h: "right", v: "middle" }, border: C.line,
  });
  pv.blank(rIdx, 2, { fill: C.total, border: C.line });
  pv.cell(rIdx, 3, root.count, { font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line });
  pv.cell(rIdx, 4, root.eff, { font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line });
  pv.cell(rIdx, 5, tv, {
    font: { size: 12, bold: true, color: tv < 0 ? "FFFFB3AD" : tv > 0 ? "FFF4D489" : "FFA9E5C2" },
    fill: C.total, align: { h: "center", v: "middle" }, border: C.line, fmt: "+0;-0;0",
  });
  pv.cell(rIdx, 6, statusOf(tv).label, {
    font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line,
  });
  pv.blank(rIdx, 7, { fill: C.total, border: C.line });
  pv.row(rIdx, { height: 24 });

  /* ---- الملخص بالإدارات — على جنب (زي Summary by Line) ---- */
  const sRow0 = 4;
  pv.merge(`I${sRow0}:L${sRow0}`);
  pv.cell(sRow0, 9, "الملخص بالإدارات", {
    font: { size: 11.5, bold: true, color: "FFFFFFFF" },
    fill: C.denim2,
    align: { h: "center", v: "middle" },
    border: C.line,
  });
  ["الإدارة", "الحالي", "المطلوب", "الفرق"].forEach((h, i) => {
    pv.cell(sRow0 + 1, 9 + i, h, {
      font: { size: 10.5, bold: true, color: C.gold },
      fill: C.group,
      align: { h: i === 0 ? "right" : "center", v: "middle" },
      border: C.line,
    });
  });
  let sR = sRow0 + 2;
  for (const top of root.kids) {
    const v = top.count - top.eff;
    pv.cell(sR, 9, dispName(ctx, top), {
      font: { size: 10.5, bold: true, color: C.denim2 },
      align: { h: "right", v: "middle" }, border: C.line, fill: C.group2,
    });
    numCell(pv, sR, 10, top.count, false, C.group2);
    numCell(pv, sR, 11, top.eff, false, C.group2);
    numCell(pv, sR, 12, v, true, C.group2);
    sR++;
  }
  pv.cell(sR, 9, "الإجمالي", {
    font: totFont, fill: C.total, align: { h: "right", v: "middle" }, border: C.line,
  });
  pv.cell(sR, 10, root.count, { font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line });
  pv.cell(sR, 11, root.eff, { font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line });
  pv.cell(sR, 12, tv, {
    font: { size: 11, bold: true, color: tv < 0 ? "FFFFB3AD" : tv > 0 ? "FFF4D489" : "FFA9E5C2" },
    fill: C.total, align: { h: "center", v: "middle" }, border: C.line, fmt: "+0;-0;0",
  });

  /* ============================================================
     SHEET 2 — الهيكل (full tree, collapsible outline)
     ============================================================ */
  const ts = wb.sheet("الهيكل", {
    rtl: true,
    freezeRows: 1,
    widths: [46, 10, 11, 10, 12],
    defaultRowHeight: 18,
  });
  ["الهيكل", "الحالي", "المطلوب", "الفرق", "الحالة"].forEach((h, i) => {
    ts.cell(1, i + 1, h, {
      font: { size: 11, bold: true, color: "FFFFFFFF" },
      fill: C.denim2,
      align: { h: i === 0 ? "right" : "center", v: "middle" },
      border: C.line,
    });
  });
  ts.row(1, { height: 22 });

  let r2 = 2;
  function treeRow(n: Node, depth: number) {
    const v = n.count - n.eff;
    ts.cell(r2, 1, "▸ ".repeat(Math.max(0, depth)) + dispName(ctx, n), {
      font: { size: 10.5, bold: depth === 0, color: depth === 0 ? C.denim2 : C.txt },
      align: { h: "right", v: "middle" },
      border: C.line,
    });
    numCell(ts, r2, 2, n.count);
    numCell(ts, r2, 3, n.eff);
    numCell(ts, r2, 4, v, true);
    statusCell(ts, r2, 5, v);
    ts.row(r2, { outline: Math.min(depth, 4) });
    r2++;
    for (const k of n.kids) treeRow(k, depth + 1);
  }
  treeRow(root, 0);

  /* ============================================================
     SHEET 3 — الموظفين (flat list + autofilter)
     ============================================================ */
  const es = wb.sheet("الموظفين", {
    rtl: true,
    freezeRows: 1,
    widths: [6, 11, 34, 26, 19, 15, 27, 11, 24, 12, 10],
    defaultRowHeight: 18,
  });
  ["م", "الكود", "الاسم", "الوظيفة", "الإدارة", "القسم", "القسم الداخلي", "الماكينة", "ملاحظات", "التعيين", "الحالة"].forEach((h, i) => {
    es.cell(1, i + 1, h, {
      font: { size: 11, bold: true, color: "FFFFFFFF" },
      fill: C.denim2,
      align: { h: i === 2 || i === 3 ? "right" : "center", v: "middle" },
      border: C.line,
    });
  });
  es.row(1, { height: 22 });
  es.filter("A1:K1");

  /* dept id → [top, sec, sub] chain */
  function chainOf(id: string): [string, string, string] {
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 10) { parts.unshift(dispName(ctx, cur)); cur = cur.parent ? byId.get(cur.parent) : undefined; }
    return [parts[0] || "", parts[1] || "", parts.slice(2).join(" - ")];
  }

  let r3 = 2;
  let serial = 0;
  (function flat(n: Node) {
    const [a0, b0, c0] = chainOf(n.id);
    for (const e of n.emps) {
      serial++;
      const isNew = !e.code || e.code === "جديد";
      const band = serial % 2 === 0 ? C.band : "";
      const f = (extra?: Partial<XStyle["font"]>): XStyle["font"] => ({ size: 10.5, color: C.txt, ...extra });
      es.cell(r3, 1, serial, { align: { h: "center", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 2, isNew ? "جديد" : e.code, {
        align: { h: "center", v: "middle" },
        font: isNew ? f({ bold: true, color: C.amber }) : f(),
        border: C.line, ...(band ? { fill: band } : {}),
      });
      /* R50: عند lang=tr بيستخدم name_tr/job_tr (لو موجودين) */
      es.cell(r3, 3, (wantLang === "tr" && (e.name_tr as string)) || e.name, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 4, (wantLang === "tr" && (e.job_tr as string)) || e.job, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 5, a0, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 6, b0, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 7, c0, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 8, e.mach || "", {
        align: { h: "center", v: "middle" },
        font: e.mach ? f({ bold: true, color: C.amber }) : f(),
        border: C.line, ...(band ? { fill: band } : {}),
      });
      es.cell(r3, 9, e.note || "", { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 10, e.hire || "", { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
      es.cell(r3, 11, isNew ? "جديد" : "موظف", {
        align: { h: "center", v: "middle" },
        font: isNew ? f({ bold: true, color: C.amber }) : f({ color: C.green }),
        border: C.line, ...(band ? { fill: band } : {}),
      });
      r3++;
    }
    for (const e of n.vacs) {
      serial++;
      es.cell(r3, 1, serial, {
        align: { h: "center", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 2, "—", {
        align: { h: "center", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 3, "(شاغر)", {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 4, e.job, {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 5, a0, {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 6, b0, {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 7, c0, {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 8, e.mach || "", {
        align: { h: "center", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 9, e.note || "", {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 10, "", {
        align: { h: "right", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      es.cell(r3, 11, "شاغر", {
        align: { h: "center", v: "middle" },
        font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
      });
      r3++;
    }
    for (const k of n.kids) flat(k);
  })(root);

  /* ============================================================
     SHEET 4 — الأرشيف (transfer archive)
     ============================================================ */
  const ar = wb.sheet("الأرشيف", {
    rtl: true,
    freezeRows: 1,
    widths: [17, 12, 11, 30, 30, 30, 13, 18],
    defaultRowHeight: 18,
  });
  ["التاريخ", "بواسطة", "الكود", "الاسم", "من (قسم / وظيفة)", "إلى (قسم / وظيفة)", "النوع", "ملاحظات"].forEach((h, i) => {
    ar.cell(1, i + 1, h, {
      font: { size: 11, bold: true, color: "FFFFFFFF" },
      fill: C.denim2,
      align: { h: "center", v: "middle" },
      border: C.line,
    });
  });
  ar.row(1, { height: 22 });

  const kindLabel: Record<string, string> = {
    move: "نقل", dept: "تغيير إدارة", job: "تغيير وظيفة",
    "dept-move": "نقل قسم", "dept-rename": "إعادة تسمية",
    fill: "تعيين شاغر", out: "خروج",
  };

  const trs = await q(
    `SELECT at, actor, code, name, from_dept, from_job, to_dept, to_job, kind, note
     FROM marib_transfer ORDER BY at DESC LIMIT 2000`
  );
  trs.forEach((t, i) => {
    const r = i + 2;
    const at = String(t.at || "").replace("T", " ").slice(0, 16);
    const band = i % 2 === 1 ? C.band : "";
    const f: XStyle["font"] = { size: 10.5, color: C.txt };
    const put = (c: number, v: string, align: "center" | "right", font: XStyle["font"] = f) => {
      ar.cell(r, c, v, {
        align: { h: align, v: "middle" }, font, border: C.line, ...(band ? { fill: band } : {}),
      });
    };
    put(1, at, "center");
    put(2, String(t.actor || ""), "center");
    put(3, t.code ? String(t.code) : "—", "center");
    put(4, String(t.name || ""), "right");
    put(5, `${t.from_dept || "—"} / ${t.from_job || "—"}`, "right");
    put(6, `${t.to_dept || "—"} / ${t.to_job || "—"}`, "right");
    put(7, kindLabel[String(t.kind)] || String(t.kind || "—"), "center",
        t.kind === "out" ? { size: 10.5, bold: true, color: C.red } : f);
    put(8, String(t.note || ""), "right");
  });

  return {
    bytes: wb.build(),
    fileName: `Manpower-Marib3-${stamp.replace(/-/g, "")}.xlsx`,
  };
}
