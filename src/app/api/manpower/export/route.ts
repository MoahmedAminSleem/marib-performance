/* /api/manpower/export — R39: the الاتزان hierarchy as ONE ready Excel
   workbook (built server-side with ExcelJS so the site stays light):
     1. "Pivot الاتزان"  — pivot-style groups: الإدارة → القسم → الداخلي
                           with subtotals per group + grand total row,
                           colored variance/status (ناقص/متوازن/زيادة)
     2. "الهيكل"        — the full tree, one row per node, real Excel
                           outline levels (collapse/expand like the site)
     3. "الموظفين"      — every position: code, name, job, dept chain,
                           hire, status (موظف / جديد / شاغر) + autofilter
     4. "الأرشيف"       — the transfer archive (incl. خروج rows)
   Same math as the client: actual = filled rows, required = manual
   override if set else all rows beneath, variance = actual − required.
   Any signed-in user may export (read-only data). Denim/gold theme. */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { q } from "@/lib/marib/db";
import { serverFail, requireUser } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
};
const FONT = "Calibri";
const thin = { style: "thin" as const, color: { argb: C.line } };
const BORDERS = { top: thin, left: thin, bottom: thin, right: thin };

type Node = {
  id: string; name: string; parent: string; ord: number;
  kids: Node[]; emps: Emp[]; vacs: Emp[];
  count: number; rows: number; own: number | null; eff: number;
};
type Emp = { code: string; name: string; job: string; hire: string; vac: boolean };

/* SEWING's numeric lines display as "خط N" on the site — same here */
function dispName(n: Node): string {
  const parentName = n.parent ? (byId.get(n.parent)?.name || "") : "";
  return /^\d+$/.test(n.name) && parentName === "SEWING" ? "خط " + n.name : n.name;
}
let byId = new Map<string, Node>();

function statusOf(variance: number): { label: string; color: string; fill: string } {
  if (variance < 0) return { label: "ناقص", color: C.red, fill: C.redFill };
  if (variance > 0) return { label: "زيادة", color: C.amber, fill: C.amberFill };
  return { label: "متوازن", color: C.green, fill: C.greenFill };
}

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "manpower", "EXPORT");
    if (g.res) return g.res;

    /* ---------- data → tree (client math, replicated) ---------- */
    const deptRows = await q("SELECT id, name, parent_id, ord FROM marib_dept ORDER BY ord ASC");
    const empRows = await q("SELECT code, name, job, dept_id, hire, vac FROM marib_emp ORDER BY ord ASC");
    const reqRows = await q("SELECT node_key, required FROM marib_req");

    const reqMap = new Map<string, number>();
    for (const r of reqRows) reqMap.set(r.node_key as string, r.required as number);

    byId = new Map<string, Node>();
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
    const now = new Date();
    const p2 = (x: number) => (x < 10 ? "0" : "") + x;
    const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
    const vacTotal = (function sumVac(n: Node): number {
      let s = n.vacs.length; for (const k of n.kids) s += sumVac(k); return s;
    })(root);
    const jadidTotal = (function sumJ(n: Node): number {
      let s = n.emps.filter((e) => !e.code || e.code === "جديد").length;
      for (const k of n.kids) s += sumJ(k); return s;
    })(root);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Marib 3 — الاتزان";
    wb.created = now;

    /* ============================================================
       SHEET 1 — Pivot الاتزان (groups + subtotals + grand total)
       ============================================================ */
    const pv = wb.addWorksheet("Pivot الاتزان", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }],
      properties: { defaultRowHeight: 19 },
    });
    pv.columns = [
      { width: 24 }, { width: 19 }, { width: 31 },
      { width: 10 }, { width: 11 }, { width: 10 }, { width: 12 },
    ];

    /* title + subtitle */
    pv.mergeCells("A1:G1");
    const t1 = pv.getCell("A1");
    t1.value = "Marib 3 — الاتزان";
    t1.font = { name: FONT, size: 17, bold: true, color: { argb: "FFFFFFFF" } };
    t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.denim } };
    t1.alignment = { horizontal: "center", vertical: "middle" };
    pv.getRow(1).height = 34;

    pv.mergeCells("A2:G2");
    const t2 = pv.getCell("A2");
    t2.value = `تصدير ${stamp} · الحالي ${root.count} · المطلوب ${root.eff} · الفرق ${root.count - root.eff} · شاغر ${vacTotal} · جديد ${jadidTotal}`;
    t2.font = { name: FONT, size: 10.5, bold: true, color: { argb: C.gold } };
    t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.denim } };
    t2.alignment = { horizontal: "center", vertical: "middle" };
    pv.getRow(2).height = 20;
    pv.getRow(3).height = 6;

    /* header */
    const heads = ["الإدارة", "القسم", "القسم الداخلي", "الحالي", "المطلوب", "الفرق", "الحالة"];
    const hr = pv.getRow(4);
    heads.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.denim2 } };
      c.alignment = { horizontal: i >= 3 ? "center" : "right", vertical: "middle" };
      c.border = BORDERS;
    });
    hr.height = 22;

    /* number cell writer */
    function numCell(cell: ExcelJS.Cell, v: number, variance = false) {
      cell.value = v;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = {
        name: FONT, size: 11, bold: false,
        color: { argb: variance ? (v < 0 ? C.red : v > 0 ? C.amber : C.green) : C.txt },
      };
      if (variance) cell.numFmt = "+0;-0;0";
    }
    function statusCell(cell: ExcelJS.Cell, variance: number) {
      const s = statusOf(variance);
      cell.value = s.label;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { name: FONT, size: 10.5, bold: true, color: { argb: s.color } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.fill } };
    }

    let rIdx = 5;
    /* recursive pivot rows — depth 1 = group, depth 2 = section group,
       depth 3+ = leaf (deeper paths land in the 3rd column) */
    function pivotRow(n: Node, depth: number, label: string) {
      const row = pv.getRow(rIdx);
      const v = n.count - n.eff;
      const isGroup = n.kids.length > 0;
      const col = Math.min(depth, 3);
      row.getCell(col).value = label;
      row.getCell(col).font = {
        name: FONT, size: 11,
        bold: depth === 1,
        color: { argb: depth === 1 ? C.denim2 : C.txt },
      };
      row.getCell(col).alignment = { horizontal: "right", vertical: "middle", indent: col - 1 };
      numCell(row.getCell(4), n.count);
      numCell(row.getCell(5), n.eff);
      numCell(row.getCell(6), v, true);
      statusCell(row.getCell(7), v);
      for (let i = 1; i <= 7; i++) {
        row.getCell(i).border = BORDERS;
        if (depth === 1) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.group } };
        else if (isGroup) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.group2 } };
      }
      row.outlineLevel = Math.min(depth - 1, 4); /* Excel-native collapse */
      rIdx++;
    }
    function walkPivot(n: Node, depth: number) {
      for (const k of n.kids) {
        pivotRow(k, depth, dispName(k));
        if (k.kids.length) walkPivot(k, depth + 1);
      }
    }
    for (const top of root.kids) {
      pivotRow(top, 1, top.name);
      walkPivot(top, 2);
    }

    /* grand total = Marib 3 */
    const tr = pv.getRow(rIdx);
    tr.getCell(1).value = "Marib 3 — الإجمالي";
    tr.getCell(1).font = { name: FONT, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    tr.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
    numCell(tr.getCell(4), root.count);
    numCell(tr.getCell(5), root.eff);
    const tv = root.count - root.eff;
    numCell(tr.getCell(6), tv, true);
    tr.getCell(4).font = { name: FONT, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    tr.getCell(5).font = { name: FONT, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    tr.getCell(6).font = {
      name: FONT, size: 12, bold: true,
      color: { argb: tv < 0 ? "FFFFB3AD" : tv > 0 ? "FFF4D489" : "FFA9E5C2" },
    };
    tr.getCell(7).value = statusOf(tv).label;
    tr.getCell(7).font = { name: FONT, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    tr.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
    for (let i = 1; i <= 7; i++) {
      tr.getCell(i).border = BORDERS;
      tr.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } };
    }
    tr.height = 24;

    /* ============================================================
       SHEET 2 — الهيكل (full tree, collapsible outline)
       ============================================================ */
    const ts = wb.addWorksheet("الهيكل", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    });
    ts.columns = [{ width: 46 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 12 }];
    const th = ts.getRow(1);
    ["الهيكل", "الحالي", "المطلوب", "الفرق", "الحالة"].forEach((h, i) => {
      const c = th.getCell(i + 1);
      c.value = h;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.denim2 } };
      c.alignment = { horizontal: i === 0 ? "right" : "center", vertical: "middle" };
      c.border = BORDERS;
    });
    th.height = 22;

    let r2 = 2;
    function treeRow(n: Node, depth: number) {
      const row = ts.getRow(r2);
      const v = n.count - n.eff;
      row.getCell(1).value = "▸ ".repeat(Math.max(0, depth)) + dispName(n);
      row.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(1).font = { name: FONT, size: 10.5, bold: depth === 0, color: { argb: depth === 0 ? C.denim2 : C.txt } };
      numCell(row.getCell(2), n.count);
      numCell(row.getCell(3), n.eff);
      numCell(row.getCell(4), v, true);
      statusCell(row.getCell(5), v);
      for (let i = 1; i <= 5; i++) row.getCell(i).border = BORDERS;
      row.outlineLevel = Math.min(depth, 4);
      r2++;
      for (const k of n.kids) treeRow(k, depth + 1);
    }
    treeRow(root, 0);

    /* ============================================================
       SHEET 3 — الموظفين (flat list + autofilter)
       ============================================================ */
    const es = wb.addWorksheet("الموظفين", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    });
    es.columns = [
      { width: 6 }, { width: 11 }, { width: 34 }, { width: 26 },
      { width: 19 }, { width: 15 }, { width: 27 }, { width: 12 }, { width: 10 },
    ];
    const eh = es.getRow(1);
    ["م", "الكود", "الاسم", "الوظيفة", "الإدارة", "القسم", "القسم الداخلي", "التعيين", "الحالة"].forEach((h, i) => {
      const c = eh.getCell(i + 1);
      c.value = h;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.denim2 } };
      c.alignment = { horizontal: i === 2 || i === 3 ? "right" : "center", vertical: "middle" };
      c.border = BORDERS;
    });
    eh.height = 22;
    es.autoFilter = { from: "A1", to: "I1" };

    /* dept id → [top, sec, sub] chain */
    function chainOf(id: string): [string, string, string] {
      const parts: string[] = [];
      let cur = byId.get(id);
      let guard = 0;
      while (cur && guard++ < 10) { parts.unshift(dispName(cur)); cur = cur.parent ? byId.get(cur.parent) : undefined; }
      return [parts[0] || "", parts[1] || "", parts.slice(2).join(" - ")];
    }

    let r3 = 2;
    let serial = 0;
    (function flat(n: Node) {
      const [a0, b0, c0] = chainOf(n.id);
      for (const e of n.emps) {
        serial++;
        const isNew = !e.code || e.code === "جديد";
        const row = es.getRow(r3);
        row.getCell(1).value = serial;
        row.getCell(2).value = isNew ? "جديد" : e.code;
        row.getCell(3).value = e.name;
        row.getCell(4).value = e.job;
        row.getCell(5).value = a0; row.getCell(6).value = b0; row.getCell(7).value = c0;
        row.getCell(8).value = e.hire || "";
        row.getCell(9).value = isNew ? "جديد" : "موظف";
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        for (let i = 3; i <= 8; i++) row.getCell(i).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
        row.font = { name: FONT, size: 10.5, color: { argb: C.txt } };
        if (isNew) {
          row.getCell(2).font = { name: FONT, size: 10.5, bold: true, color: { argb: C.amber } };
          row.getCell(9).font = { name: FONT, size: 10.5, bold: true, color: { argb: C.amber } };
        } else {
          row.getCell(9).font = { name: FONT, size: 10.5, color: { argb: C.green } };
        }
        if (serial % 2 === 0) {
          for (let i = 1; i <= 9; i++) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.band } };
        }
        for (let i = 1; i <= 9; i++) row.getCell(i).border = BORDERS;
        r3++;
      }
      for (const e of n.vacs) {
        serial++;
        const row = es.getRow(r3);
        row.getCell(1).value = serial;
        row.getCell(2).value = "—";
        row.getCell(3).value = "(شاغر)";
        row.getCell(4).value = e.job;
        row.getCell(5).value = a0; row.getCell(6).value = b0; row.getCell(7).value = c0;
        row.getCell(8).value = "";
        row.getCell(9).value = "شاغر";
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        for (let i = 3; i <= 8; i++) row.getCell(i).alignment = { horizontal: "right", vertical: "middle" };
        row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
        row.font = { name: FONT, size: 10.5, color: { argb: C.red }, italic: true };
        for (let i = 1; i <= 9; i++) {
          row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.redFill } };
          row.getCell(i).border = BORDERS;
        }
        r3++;
      }
      for (const k of n.kids) flat(k);
    })(root);

    /* ============================================================
       SHEET 4 — الأرشيف (transfer archive)
       ============================================================ */
    const ar = wb.addWorksheet("الأرشيف", {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    });
    ar.columns = [
      { width: 17 }, { width: 12 }, { width: 11 }, { width: 30 },
      { width: 30 }, { width: 30 }, { width: 13 }, { width: 18 },
    ];
    const ah = ar.getRow(1);
    ["التاريخ", "بواسطة", "الكود", "الاسم", "من (قسم / وظيفة)", "إلى (قسم / وظيفة)", "النوع", "ملاحظات"].forEach((h, i) => {
      const c = ah.getCell(i + 1);
      c.value = h;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.denim2 } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = BORDERS;
    });
    ah.height = 22;

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
      const row = ar.getRow(i + 2);
      const at = String(t.at || "").replace("T", " ").slice(0, 16);
      row.getCell(1).value = at;
      row.getCell(2).value = t.actor;
      row.getCell(3).value = t.code || "—";
      row.getCell(4).value = t.name;
      row.getCell(5).value = `${t.from_dept || "—"} / ${t.from_job || "—"}`;
      row.getCell(6).value = `${t.to_dept || "—"} / ${t.to_job || "—"}`;
      row.getCell(7).value = kindLabel[String(t.kind)] || String(t.kind || "—");
      row.getCell(8).value = t.note || "";
      row.font = { name: FONT, size: 10.5, color: { argb: C.txt } };
      for (let c = 1; c <= 8; c++) {
        row.getCell(c).alignment = { horizontal: c === 4 || c === 5 || c === 6 || c === 8 ? "right" : "center", vertical: "middle" };
        row.getCell(c).border = BORDERS;
        if (i % 2 === 1) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.band } };
      }
      if (t.kind === "out") row.getCell(7).font = { name: FONT, size: 10.5, bold: true, color: { argb: C.red } };
    });

    /* ---------- write & send ---------- */
    const buf = await wb.xlsx.writeBuffer();
    const fileName = `Manpower-Marib3-${stamp.replace(/-/g, "")}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return serverFail("manpower-export", "GET", e);
  }
}
