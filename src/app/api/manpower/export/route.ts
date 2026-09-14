/* /api/manpower/export — R39: the الاتزان hierarchy as ONE ready Excel
   workbook. R39.1 hotfix: rebuilt on the in-house zero-dependency
   xlsx-writer (src/lib/marib/xlsx-writer.ts) instead of exceljs — the
   missing exceljs dependency is what broke the Vercel build, and this
   way there is nothing new to install when files are synced to the
   repo. Identical output:
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
import { XBook, XSheet, XStyle } from "@/lib/marib/xlsx-writer";
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

    const wb = new XBook();

    /* ============================================================
       SHEET 1 — Pivot الاتزان (groups + subtotals + grand total)
       ============================================================ */
    const pv = wb.sheet("Pivot الاتزان", {
      rtl: true,
      freezeRows: 4,
      widths: [24, 19, 31, 10, 11, 10, 12],
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
    const heads = ["الإدارة", "القسم", "القسم الداخلي", "الحالي", "المطلوب", "الفرق", "الحالة"];
    heads.forEach((h, i) => {
      pv.cell(4, i + 1, h, {
        font: { size: 11, bold: true, color: "FFFFFFFF" },
        fill: C.denim2,
        align: { h: i >= 3 ? "center" : "right", v: "middle" },
        border: C.line,
      });
    });
    pv.row(4, { height: 22 });

    /* recursive pivot rows — depth 1 = group, depth 2 = section group,
       depth 3+ = leaf (deeper paths land in the 3rd column) */
    let rIdx = 5;
    function pivotRow(n: Node, depth: number, label: string) {
      const v = n.count - n.eff;
      const isGroup = n.kids.length > 0;
      /* group rows carry a uniform fill across all 7 cells (same as
         the exceljs version: it painted the whole row AFTER the status
         cell, so group/section rows show colored status TEXT only,
         while leaf rows keep their colored status fill) */
      const gFill = depth === 1 ? C.group : isGroup ? C.group2 : "";
      const col = Math.min(depth, 3);
      pv.cell(rIdx, col, label, {
        font: { size: 11, bold: depth === 1, color: depth === 1 ? C.denim2 : C.txt },
        align: { h: "right", v: "middle", indent: col - 1 },
        border: C.line,
        ...(gFill ? { fill: gFill } : {}),
      });
      numCell(pv, rIdx, 4, n.count, false, gFill);
      numCell(pv, rIdx, 5, n.eff, false, gFill);
      numCell(pv, rIdx, 6, v, true, gFill);
      statusCell(pv, rIdx, 7, v, gFill);
      for (let i = 1; i < col; i++) pv.blank(rIdx, i, { border: C.line, ...(gFill ? { fill: gFill } : {}) });
      for (let i = col + 1; i <= 3; i++) pv.blank(rIdx, i, { border: C.line, ...(gFill ? { fill: gFill } : {}) });
      pv.row(rIdx, { outline: Math.min(depth - 1, 4) }); /* Excel-native collapse */
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
    const tv = root.count - root.eff;
    const totFont = { size: 12, bold: true, color: "FFFFFFFF" };
    pv.cell(rIdx, 1, "Marib 3 — الإجمالي", {
      font: totFont, fill: C.total, align: { h: "right", v: "middle" }, border: C.line,
    });
    pv.blank(rIdx, 2, { fill: C.total, border: C.line });
    pv.blank(rIdx, 3, { fill: C.total, border: C.line });
    pv.cell(rIdx, 4, root.count, { font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line });
    pv.cell(rIdx, 5, root.eff, { font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line });
    pv.cell(rIdx, 6, tv, {
      font: { size: 12, bold: true, color: tv < 0 ? "FFFFB3AD" : tv > 0 ? "FFF4D489" : "FFA9E5C2" },
      fill: C.total, align: { h: "center", v: "middle" }, border: C.line, fmt: "+0;-0;0",
    });
    pv.cell(rIdx, 7, statusOf(tv).label, {
      font: totFont, fill: C.total, align: { h: "center", v: "middle" }, border: C.line,
    });
    pv.row(rIdx, { height: 24 });

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
      ts.cell(r2, 1, "▸ ".repeat(Math.max(0, depth)) + dispName(n), {
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
      widths: [6, 11, 34, 26, 19, 15, 27, 12, 10],
      defaultRowHeight: 18,
    });
    ["م", "الكود", "الاسم", "الوظيفة", "الإدارة", "القسم", "القسم الداخلي", "التعيين", "الحالة"].forEach((h, i) => {
      es.cell(1, i + 1, h, {
        font: { size: 11, bold: true, color: "FFFFFFFF" },
        fill: C.denim2,
        align: { h: i === 2 || i === 3 ? "right" : "center", v: "middle" },
        border: C.line,
      });
    });
    es.row(1, { height: 22 });
    es.filter("A1:I1");

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
        const band = serial % 2 === 0 ? C.band : "";
        const f = (extra?: Partial<XStyle["font"]>): XStyle["font"] => ({ size: 10.5, color: C.txt, ...extra });
        es.cell(r3, 1, serial, { align: { h: "center", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 2, isNew ? "جديد" : e.code, {
          align: { h: "center", v: "middle" },
          font: isNew ? f({ bold: true, color: C.amber }) : f(),
          border: C.line, ...(band ? { fill: band } : {}),
        });
        es.cell(r3, 3, e.name, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 4, e.job, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 5, a0, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 6, b0, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 7, c0, { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 8, e.hire || "", { align: { h: "right", v: "middle" }, font: f(), border: C.line, ...(band ? { fill: band } : {}) });
        es.cell(r3, 9, isNew ? "جديد" : "موظف", {
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
        es.cell(r3, 8, "", {
          align: { h: "right", v: "middle" },
          font: { size: 10.5, color: C.red, italic: true }, fill: C.redFill, border: C.line,
        });
        es.cell(r3, 9, "شاغر", {
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

    /* ---------- write & send ---------- */
    const bytes = wb.build();
    const fileName = `Manpower-Marib3-${stamp.replace(/-/g, "")}.xlsx`;
    return new NextResponse(bytes as unknown as BodyInit, {
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
