/* /api/audit — سجل العمليات
   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD →
   { events: [...desc], entities: [{ entity, label, creator:{actor,at}, edits:[{actor,at} ×≤3] }] }
   The grouped view keeps the CREATOR untouched and carries the last 3
   editors only — a new edit drops the oldest of the three (rolling window).
   R25: refactored onto the shared http helpers.
   R46-2: now respects the audit.view perm — admin/user with view+ access
   can read; dev gets it by default; the admin can hide it per-user. */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/marib/db";
import { serverFail, requirePerm, logger } from "@/lib/marib/http";

const lg = logger("audit");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const g = await requirePerm(req, "audit.view", "view");
    if (g.res) return g.res;

    const from = req.nextUrl.searchParams.get("from") || "";
    const to = req.nextUrl.searchParams.get("to") || "";
    let where = "";
    const params: string[] = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      params.push(from);
      where += ` AND at >= $${params.length}::date`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      params.push(to);
      where += ` AND at < ($${params.length}::date + 1)`;
    }

    // whole history — the filter is applied client-side for the events table,
    // but the per-entity creator/last-3-editors view is computed on the FULL
    // log so creation info never disappears when a narrow range is chosen.
    // (capped: the grouping needs the full log, logins included, 5000 is
    // years of activity at this factory's scale)
    const events = await q(
      `SELECT id, at, actor, action, entity, label, details FROM marib_audit ORDER BY at ASC LIMIT 5000`
    );

    /* group per entity */
    const byEntity = new Map<
      string,
      { entity: string; label: string | null; events: { at: string; actor: string; action: string }[] }
    >();
    for (const e of events) {
      const ent = e.entity as string;
      if (!byEntity.has(ent)) byEntity.set(ent, { entity: ent, label: (e.label as string) ?? null, events: [] });
      const g2 = byEntity.get(ent)!;
      if (!g2.label && e.label) g2.label = e.label as string;
      g2.events.push({ at: e.at as string, actor: e.actor as string, action: e.action as string });
    }
    const entities = Array.from(byEntity.values()).map((g2) => {
      const evs = g2.events;
      const creator = evs[0];
      // edits = everything after the creation event; keep the LATEST three
      const edits = evs.slice(1).slice(-3).reverse();
      return {
        entity: g2.entity,
        label: g2.label,
        creator: { actor: creator.actor, at: creator.at, action: creator.action },
        edits: edits.map((x) => ({ actor: x.actor, at: x.at, action: x.action })),
        totalEdits: Math.max(0, evs.length - 1),
      };
    });
    entities.sort((a, b) => (a.creator.at < b.creator.at ? 1 : -1));

    /* apply the requested range to the events list (newest first) */
    let list = events.slice().reverse();
    if (params.length) {
      const rows = await q(
        `SELECT id, at, actor, action, entity, label, details FROM marib_audit WHERE TRUE${where} ORDER BY at DESC LIMIT 1000`,
        params
      );
      list = rows;
    }
    /* R54: مراقبة — حجم السجل المحمّل + عدد الكيانات، من غير
       تسجيل أي بيانات حساسة (أسماء/تفاصيل) — أرقام فقط. */
    lg.debug("audit view", { events: list.length, entities: entities.length, ranged: params.length > 0 });
    return NextResponse.json({ events: list, entities });
  } catch (e) {
    lg.error("GET failed", { err: String(e) });
    return serverFail("audit", "GET", e);
  }
}
