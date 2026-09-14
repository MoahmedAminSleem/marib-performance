/* ============================================================
   xlsx-writer.ts — zero-dependency XLSX (Excel) workbook writer.
   Built for /api/manpower/export (R39.1 hotfix) so the API needs
   no exceljs package: nothing new to install when source files
   are synced to the GitHub repo (a missing exceljs dependency is
   exactly what broke the Vercel build), a much smaller serverless
   bundle, and faster cold starts.

   Coverage — everything the export uses, nothing more:
   - multiple RTL sheets, frozen header rows, first-sheet tab select
   - fonts: family / size / bold / italic / ARGB color
   - solid ARGB fills, thin colored borders
   - alignment: left/center/right + top/middle/bottom + indent
   - custom number formats (e.g. "+0;-0;0")
   - merged cells, autofilter, column widths, row heights
   - Excel row outline levels -> collapsible groups inside Excel

   Output is a standard OOXML package zipped with node:zlib
   (deflate): [Content_Types].xml, _rels/.rels, xl/workbook.xml
   (+ its .rels), xl/styles.xml, xl/worksheets/sheetN.xml.
   ============================================================ */

import { deflateRawSync } from "node:zlib";

/* ---------------- public types ---------------- */
export type XFont = {
  name?: string;               /* default Calibri            */
  size?: number;               /* default 11                 */
  bold?: boolean;
  italic?: boolean;
  color?: string;              /* ARGB, e.g. "FF1E2A3C"      */
};
export type XAlign = {
  h?: "left" | "center" | "right";
  v?: "top" | "middle" | "bottom";
  indent?: number;             /* 0..250                     */
};
export type XStyle = {
  font?: XFont;
  fill?: string;               /* solid fill ARGB, "" = none */
  border?: string;             /* thin border color ARGB     */
  align?: XAlign;
  fmt?: string;                /* custom number format code  */
};
export type XSheetOpts = {
  rtl?: boolean;               /* default true               */
  freezeRows?: number;         /* frozen header rows         */
  widths?: number[];           /* column widths (char units) */
  defaultRowHeight?: number;   /* default 15                 */
};

/* ---------------- small helpers ---------------- */
const ENC = new TextEncoder();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
/* strip characters illegal in XML 1.0 (keeps \t \n \r) */
function xmlSafe(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function colName(c: number): string {
  let s = "";
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1 - m) / 26);
  }
  return s;
}

/* ---------------- growable byte buffer ---------------- */
class Bytes {
  private buf: Uint8Array;
  private len = 0;
  constructor(cap = 1 << 16) {
    this.buf = new Uint8Array(Math.max(16, cap));
  }
  private grow(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  u16(v: number): void {
    this.grow(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
  }
  u32(v: number): void {
    this.grow(4);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 24) & 0xff;
  }
  raw(b: Uint8Array): void {
    this.grow(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }
  get length(): number {
    return this.len;
  }
  out(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

/* ---------------- CRC32 (ZIP) ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------- minimal ZIP writer (deflate, stored fallback) ---------------- */
class Zip {
  private entries: {
    name: Uint8Array;
    data: Uint8Array;   /* uncompressed            */
    comp: Uint8Array;   /* what is actually stored */
    method: number;     /* 0 stored / 8 deflate    */
    crc: number;
    off: number;
  }[] = [];
  private body = new Bytes(1 << 16);

  add(name: string, content: string | Uint8Array): void {
    const data = typeof content === "string" ? ENC.encode(content) : content;
    let comp: Uint8Array;
    let method: number;
    try {
      const z = deflateRawSync(data);
      if (z.length < data.length) {
        comp = z;
        method = 8;
      } else {
        comp = data;
        method = 0;
      }
    } catch {
      comp = data;
      method = 0;
    }
    const nameB = ENC.encode(name);
    const crc = crc32(data);
    const off = this.body.length;

    /* local file header */
    this.body.u32(0x04034b50);
    this.body.u16(20);                       /* version needed 2.0   */
    this.body.u16(0x0800);                   /* flags: UTF-8 names   */
    this.body.u16(method);
    this.body.u16(0);                        /* mod time 00:00       */
    this.body.u16(0x21);                     /* mod date 1980-01-01  */
    this.body.u32(crc);
    this.body.u32(comp.length);              /* compressed size      */
    this.body.u32(data.length);              /* uncompressed size    */
    this.body.u16(nameB.length);
    this.body.u16(0);                        /* extra field length   */
    this.body.raw(nameB);
    this.body.raw(comp);

    this.entries.push({ name: nameB, data, comp, method, crc, off });
  }

  build(): Uint8Array {
    /* central directory */
    const cd = new Bytes(1 << 12);
    for (const e of this.entries) {
      cd.u32(0x02014b50);
      cd.u16(20);                            /* version made by      */
      cd.u16(20);                            /* version needed       */
      cd.u16(0x0800);                        /* flags                */
      cd.u16(e.method);
      cd.u16(0);                             /* mod time             */
      cd.u16(0x21);                          /* mod date             */
      cd.u32(e.crc);
      cd.u32(e.comp.length);
      cd.u32(e.data.length);
      cd.u16(e.name.length);
      cd.u16(0);                             /* extra len            */
      cd.u16(0);                             /* comment len          */
      cd.u16(0);                             /* disk number start    */
      cd.u16(0);                             /* internal attributes  */
      cd.u32(0);                             /* external attributes  */
      cd.u32(e.off);                         /* local header offset  */
      cd.raw(e.name);
    }
    /* end of central directory */
    const end = new Bytes(64);
    end.u32(0x06054b50);
    end.u16(0);
    end.u16(0);
    end.u16(this.entries.length);
    end.u16(this.entries.length);
    end.u32(cd.length);
    end.u32(this.body.length);
    end.u16(0);                              /* comment length       */

    const out = new Bytes(this.body.length + cd.length + 22);
    out.raw(this.body.out());
    out.raw(cd.out());
    out.raw(end.out());
    return out.out();
  }
}

/* ---------------- style registry (dedup + styles.xml) ---------------- */
class Styles {
  private numFmts: string[] = [];
  private numFmtIds = new Map<string, number>();

  private fonts: XFont[] = [{ name: "Calibri", size: 11 }];
  private fontIds = new Map<string, number>([["Calibri|11|||", 0]]);

  private fills: string[] = [];                        /* ids 0,1 reserved */
  private fillIds = new Map<string, number>();

  private borderColors: string[] = [];                 /* id 0 = none      */
  private borderIds = new Map<string, number>();

  private xfs: { f: number; fl: number; b: number; n: number; a: XAlign }[] = [
    { f: 0, fl: 0, b: 0, n: 0, a: {} },
  ];
  private xfKeys = new Map<string, number>([["0|0|0|0|", 0]]);

  private fontId(f?: XFont): number {
    const name = f?.name || "Calibri";
    const size = f?.size ?? 11;
    const key = [name, size, f?.bold ? "b" : "", f?.italic ? "i" : "", f?.color || ""].join("|");
    const found = this.fontIds.get(key);
    if (found !== undefined) return found;
    const id = this.fonts.length;
    this.fonts.push({ name, size, bold: f?.bold, italic: f?.italic, color: f?.color });
    this.fontIds.set(key, id);
    return id;
  }
  private fillId(argb: string): number {
    const found = this.fillIds.get(argb);
    if (found !== undefined) return found;
    const id = this.fills.length + 2;                  /* 0 none, 1 gray125 */
    this.fills.push(argb);
    this.fillIds.set(argb, id);
    return id;
  }
  private borderId(color: string): number {
    const found = this.borderIds.get(color);
    if (found !== undefined) return found;
    const id = this.borderColors.length + 1;
    this.borderColors.push(color);
    this.borderIds.set(color, id);
    return id;
  }
  private numFmtId(code: string): number {
    const found = this.numFmtIds.get(code);
    if (found !== undefined) return found;
    const id = 164 + this.numFmts.length;
    this.numFmts.push(code);
    this.numFmtIds.set(code, id);
    return id;
  }

  xfId(st?: XStyle): number {
    const fId = st?.font ? this.fontId(st.font) : 0;
    const flId = st?.fill ? this.fillId(st.fill) : 0;
    const bId = st?.border ? this.borderId(st.border) : 0;
    const nId = st?.fmt ? this.numFmtId(st.fmt) : 0;
    const a = st?.align;
    const aKey = a ? [a.h || "", a.v || "", a.indent || 0].join("|") : "";
    const key = [fId, flId, bId, nId, aKey].join("|");
    const found = this.xfKeys.get(key);
    if (found !== undefined) return found;
    const id = this.xfs.length;
    this.xfs.push({ f: fId, fl: flId, b: bId, n: nId, a: a || {} });
    this.xfKeys.set(key, id);
    return id;
  }

  toXml(): string {
    const p: string[] = [];
    p.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    p.push('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');

    if (this.numFmts.length) {
      p.push(`<numFmts count="${this.numFmts.length}">`);
      this.numFmts.forEach((code, i) => {
        p.push(`<numFmt numFmtId="${164 + i}" formatCode="${esc(code)}"/>`);
      });
      p.push("</numFmts>");
    }

    p.push(`<fonts count="${this.fonts.length}">`);
    for (const f of this.fonts) {
      p.push(
        "<font>" +
          (f.bold ? "<b/>" : "") +
          (f.italic ? "<i/>" : "") +
          `<sz val="${f.size ?? 11}"/>` +
          (f.color ? `<color rgb="${f.color}"/>` : "") +
          `<name val="${esc(f.name || "Calibri")}"/>` +
          "</font>"
      );
    }
    p.push("</fonts>");

    p.push(`<fills count="${this.fills.length + 2}">`);
    p.push('<fill><patternFill patternType="none"/></fill>');
    p.push('<fill><patternFill patternType="gray125"/></fill>');
    for (const a of this.fills) {
      p.push(
        `<fill><patternFill patternType="solid"><fgColor rgb="${a}"/><bgColor indexed="64"/></patternFill></fill>`
      );
    }
    p.push("</fills>");

    p.push(`<borders count="${this.borderColors.length + 1}">`);
    p.push("<border><left/><right/><top/><bottom/><diagonal/></border>");
    for (const c of this.borderColors) {
      const side = (tag: string) => `<${tag} style="thin"><color rgb="${c}"/></${tag}>`;
      p.push(
        `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`
      );
    }
    p.push("</borders>");

    p.push('<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>');

    p.push(`<cellXfs count="${this.xfs.length}">`);
    for (const x of this.xfs) {
      const attrs = [
        `numFmtId="${x.n}"`,
        `fontId="${x.f}"`,
        `fillId="${x.fl}"`,
        `borderId="${x.b}"`,
        'xfId="0"',
      ];
      if (x.n) attrs.push('applyNumberFormat="1"');
      if (x.f) attrs.push('applyFont="1"');
      if (x.fl) attrs.push('applyFill="1"');
      if (x.b) attrs.push('applyBorder="1"');
      const a = x.a;
      const hasAlign = !!(a.h || a.v || a.indent);
      if (hasAlign) attrs.push('applyAlignment="1"');
      let align = "";
      if (hasAlign) {
        const aa: string[] = [];
        if (a.h) aa.push(`horizontal="${a.h}"`);
        if (a.v) aa.push(`vertical="${a.v === "middle" ? "center" : a.v}"`);
        if (a.indent) aa.push(`indent="${a.indent}"`);
        align = `<alignment ${aa.join(" ")}/>`;
      }
      p.push(`<xf ${attrs.join(" ")}>${align}</xf>`);
    }
    p.push("</cellXfs>");

    p.push('<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>');
    p.push("</styleSheet>");
    return p.join("");
  }
}

/* ---------------- sheet ---------------- */
type XCell = { v?: string | number; s: number };

export class XSheet {
  name: string;
  rtl: boolean;
  freezeRows: number;
  defaultRowHeight: number;
  widths: number[];
  filterRef = "";
  private merges: string[] = [];
  private data = new Map<number, Map<number, XCell>>();
  private rowMeta = new Map<number, { height?: number; outline?: number }>();
  private maxRow = 0;
  private maxCol = 0;

  constructor(name: string, opts: XSheetOpts | undefined, private styles: Styles) {
    this.name = name.replace(/[\[\]:*?\/\\]/g, "-").slice(0, 31);
    this.rtl = opts?.rtl !== false;
    this.freezeRows = opts?.freezeRows || 0;
    this.defaultRowHeight = opts?.defaultRowHeight || 15;
    this.widths = opts?.widths || [];
  }

  /** set a cell value + style (1-based row / column) */
  cell(r: number, c: number, v: string | number, st?: XStyle): void {
    this.put(r, c, v, st);
  }
  /** style an empty cell (borders / fills on blank positions) */
  blank(r: number, c: number, st?: XStyle): void {
    this.put(r, c, undefined, st);
  }
  private put(r: number, c: number, v: string | number | undefined, st?: XStyle): void {
    let row = this.data.get(r);
    if (!row) {
      row = new Map();
      this.data.set(r, row);
    }
    row.set(c, { v, s: this.styles.xfId(st) });
    if (r > this.maxRow) this.maxRow = r;
    if (c > this.maxCol) this.maxCol = c;
  }
  /** row height and/or outline level (0..7, collapsible in Excel) */
  row(r: number, o?: { height?: number; outline?: number }): void {
    const cur = this.rowMeta.get(r) || {};
    if (o?.height != null) cur.height = o.height;
    if (o?.outline != null) cur.outline = o.outline;
    this.rowMeta.set(r, cur);
  }
  /** merge a range, e.g. "A1:G1" */
  merge(ref: string): void {
    if (!this.merges.includes(ref)) this.merges.push(ref);
  }
  /** autofilter range, e.g. "A1:I1" */
  filter(ref: string): void {
    this.filterRef = ref;
  }

  toXml(idx: number): string {
    const p: string[] = [];
    p.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    p.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    p.push('<sheetPr><outlinePr summaryBelow="0"/></sheetPr>');
    p.push(
      `<dimension ref="A1:${colName(Math.max(this.maxCol, this.widths.length, 1))}${Math.max(this.maxRow, 1)}"/>`
    );

    let pane = "";
    if (this.freezeRows > 0) {
      const tl = `A${this.freezeRows + 1}`;
      pane =
        `<pane ySplit="${this.freezeRows}" topLeftCell="${tl}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="${tl}" sqref="${tl}"/>`;
    }
    p.push(
      `<sheetViews><sheetView rightToLeft="${this.rtl ? "1" : "0"}"${idx === 0 ? ' tabSelected="1"' : ""} workbookViewId="0">${pane}</sheetView></sheetViews>`
    );

    p.push(`<sheetFormatPr defaultRowHeight="${this.defaultRowHeight}"/>`);
    if (this.widths.length) {
      p.push(
        "<cols>" +
          this.widths
            .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
            .join("") +
          "</cols>"
      );
    }

    p.push("<sheetData>");
    /* a row exists if it has cells OR row metadata (height / outline) */
    const rowSet = new Set<number>(this.data.keys());
    for (const k of this.rowMeta.keys()) rowSet.add(k);
    const rowNos = [...rowSet].sort((a, b) => a - b);
    for (const rn of rowNos) {
      const meta = this.rowMeta.get(rn);
      const rAttrs = [`r="${rn}"`];
      if (meta?.height != null) {
        rAttrs.push(`ht="${meta.height}"`, 'customHeight="1"');
      }
      if (meta?.outline) rAttrs.push(`outlineLevel="${Math.min(meta.outline, 7)}"`);

      const rowCells = this.data.get(rn);
      const cells: string[] = [];
      if (rowCells) {
        const colNos = [...rowCells.keys()].sort((a, b) => a - b);
        for (const cn of colNos) {
          const cell = rowCells.get(cn)!;
          const ref = colName(cn) + rn;
          if (cell.v === undefined || cell.v === "") {
            cells.push(`<c r="${ref}" s="${cell.s}"/>`);
          } else if (typeof cell.v === "number") {
            if (Number.isFinite(cell.v)) {
              cells.push(`<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`);
            } else {
              cells.push(`<c r="${ref}" s="${cell.s}"/>`);
            }
          } else {
            cells.push(
              `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(xmlSafe(cell.v))}</t></is></c>`
            );
          }
        }
      }
      p.push(`<row ${rAttrs.join(" ")}>${cells.join("")}</row>`);
    }
    p.push("</sheetData>");

    if (this.filterRef) p.push(`<autoFilter ref="${this.filterRef}"/>`);
    if (this.merges.length) {
      p.push(
        `<mergeCells count="${this.merges.length}">` +
          this.merges.map((m) => `<mergeCell ref="${m}"/>`).join("") +
          "</mergeCells>"
      );
    }
    p.push("</worksheet>");
    return p.join("");
  }
}

/* ---------------- workbook ---------------- */
export class XBook {
  private styles = new Styles();
  private sheets: XSheet[] = [];

  sheet(name: string, opts?: XSheetOpts): XSheet {
    const s = new XSheet(name, opts, this.styles);
    this.sheets.push(s);
    return s;
  }

  build(): Uint8Array {
    const n = this.sheets.length;
    const zip = new Zip();

    /* [Content_Types].xml */
    let ct =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    for (let i = 1; i <= n; i++) {
      ct += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }
    ct += "</Types>";
    zip.add("[Content_Types].xml", ct);

    /* _rels/.rels */
    zip.add(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>"
    );

    /* workbook.xml + its rels */
    let wbXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    let rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    this.sheets.forEach((s, i) => {
      wbXml += `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
      rels += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
    });
    rels +=
      `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    wbXml += "</sheets></workbook>";

    zip.add("xl/workbook.xml", wbXml);
    zip.add("xl/_rels/workbook.xml.rels", rels);
    this.sheets.forEach((s, i) => zip.add(`xl/worksheets/sheet${i + 1}.xml`, s.toXml(i)));
    zip.add("xl/styles.xml", this.styles.toXml());

    return zip.build();
  }
}
