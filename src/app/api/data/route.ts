/* /api/data — production data sync (Neon)
   GET  → all months, packed (c=columns, r=rows) per sheet
   POST → full month sync: replaces the month's rows completely
          (re-uploading the same file = upsert + delete of missing rows) */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot, q, audit, withTransaction } from "@/lib/marib/db";
import { currentUser, sessionUser, isAdmin } from "@/lib/marib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHEETS = ["dd", "ot", "pm", "att", "lo"];

interface Packed {
  c: string[];
  r: (string | number | null)[][];
}

function validPack(pack: unknown): pack is Record<string, Packed> {
  if (!pack || typeof pack !== "object") return false;
  for (const k of Object.keys(pack as Record<string, unknown>)) {
    const s = (pack as Record<string, Packed>)[k];
    if (!SHEETS.includes(k)) continue; // unknown sheet keys are ignored, not fatal
    if (!Array.isArray(s?.c) || !Array.isArray(s?.r)) return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  try {
    await ensureBoot();
    const me = sessionUser(req);
    if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });

    const rows = await q(
      "SELECT month, sheet, rown, data FROM marib_data ORDER BY month ASC, sheet ASC, rown ASC"
    );
    /* last upload per month — shown on the data tab (from the audit log) */
    const lastSync: Record<string, { at: string; actor: string }> = {};
    try {
      const ups = await q(
        "SELECT entity, actor, at FROM marib_audit WHERE action = 'upload' ORDER BY at ASC"
      );
      for (const r of ups) {
        const ent = r.entity as string;
        if (ent.startsWith("data:")) {
          lastSync[ent.slice(5)] = { at: r.at as string, actor: r.actor as string };
        }
      }
    } catch {
      /* audit table may lag — the months list still loads */
    }
    const months: string[] = [];
    const pack: Record<string, Record<string, { c: string[]; r: unknown[][] }>> = {};
    for (const r of rows) {
      const month = r.month as string;
      if (!pack[month]) {
        pack[month] = {};
        months.push(month);
      }
      const sheet = r.sheet as string;
      if (!pack[month][sheet]) pack[month][sheet] = { c: [], r: [] };
      const row = (r.data ?? {}) as Record<string, unknown>;
      const cols = pack[month][sheet].c;
      if (!cols.length) Object.keys(row).forEach((k) => cols.push(k));
      pack[month][sheet].r.push(cols.map((c) => (c in row ? row[c] : null)));
    }
    return NextResponse.json({ months, pack, lastSync });
  } catch (e) {
    console.error("data GET", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureBoot();
    const me = await currentUser(req);
    if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });
    /* replacing a month on the server is destructive — admin/dev only */
    if (!isAdmin(me)) return NextResponse.json({ error: "admin" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const month = String(body.month || "");
    const files = Array.isArray(body.files) ? (body.files as string[]).map(String).slice(0, 12) : [];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "month" }, { status: 400 });
    }
    const pack = body.pack;
    if (!validPack(pack)) return NextResponse.json({ error: "pack" }, { status: 400 });

    /* payload guard rails — keep Neon storage and memory sane */
    const MAX_ROWS = 50000, MAX_COLS = 256, MAX_CELL = 2000;
    const counts: Record<string, number> = {};
    let totalRows = 0;
    for (const sheet of SHEETS) {
      const s = (pack as Record<string, Packed>)[sheet];
      counts[sheet] = s ? s.r.length : 0;
      totalRows += counts[sheet];
      if (s) {
        if (s.c.length > MAX_COLS) return NextResponse.json({ error: "cols" }, { status: 413 });
        for (const row of s.r) {
          for (const cell of row) {
            if (typeof cell === "string" && cell.length > MAX_CELL) {
              return NextResponse.json({ error: "cell" }, { status: 413 });
            }
          }
        }
      }
    }
    if (totalRows > MAX_ROWS) return NextResponse.json({ error: "rows" }, { status: 413 });

    const statements: unknown[][] = [];

    // full sync = replace the month atomically: one transaction wraps
    // DELETE + every chunked INSERT, so a mid-sync failure rolls back and
    // the previous data stays intact
    await withTransaction(async (run) => {
      await run("DELETE FROM marib_data WHERE month = $1", [month]);
      for (const sheet of SHEETS) {
        const s = (pack as Record<string, Packed>)[sheet];
        if (!s || !s.r.length) continue;
        for (let i = 0; i < s.r.length; i++) {
          const obj: Record<string, string | number | null> = {};
          s.c.forEach((c, j) => {
            const v = s.r[i][j];
            obj[c] = v === undefined ? null : v;
          });
          statements.push([month, sheet, i, JSON.stringify(obj)]);
        }
      }
      if (!statements.length) throw new Error("empty");
      const CHUNK = 400;
      for (let i = 0; i < statements.length; i += CHUNK) {
        const chunk = statements.slice(i, i + CHUNK);
        const values: string[] = [];
        const params: unknown[] = [];
        chunk.forEach((st, j) => {
          const base = j * 4;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, gen_random_uuid())`);
          params.push(st[0], st[1], st[2], st[3]);
        });
        await run(
          `INSERT INTO marib_data (month, sheet, rown, data, id) VALUES ${values.join(", ")} ON CONFLICT (month, sheet, rown) DO UPDATE SET data = EXCLUDED.data`,
          params
        );
      }
    });

    await audit(me.username, "upload", "data:" + month, files.join("، ") || month, {
      month,
      files: files.map((f) => f.slice(0, 200)),
      rows: counts,
    });
    return NextResponse.json({ ok: true, month, rows: counts });
  } catch (e) {
    console.error("data POST", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
