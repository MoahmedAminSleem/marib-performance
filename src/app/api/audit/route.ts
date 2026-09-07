/* /api/audit — سجل العمليات (dev/Amin only)
   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD →
   { events: [...desc], entities: [{ entity, label, creator:{actor,at}, edits:[{actor,at} ×≤3] }] }
   The grouped view keeps the CREATOR untouched and carries the last 3
   editors only — a new edit drops the oldest of the three (rolling window). */

import { NextRequest, NextResponse } from "next/server";
import { ensureBoot, q } from "@/lib/marib/db";
import { sessionUser, isDev } from "@/lib/marib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await ensureBoot();
    const me = sessionUser(req);
    if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });
    if (!isDev(me)) return NextResponse.json({ error: "dev" }, { status: 403 });

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
      const g = byEntity.get(ent)!;
      if (!g.label && e.label) g.label = e.label as string;
      g.events.push({ at: e.at as string, actor: e.actor as string, action: e.action as string });
    }
    const entities = Array.from(byEntity.values()).map((g) => {
      const evs = g.events;
      const creator = evs[0];
      // edits = everything after the creation event; keep the LATEST three
      const edits = evs.slice(1).slice(-3).reverse();
      return {
        entity: g.entity,
        label: g.label,
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
    return NextResponse.json({ events: list, entities });
  } catch (e) {
    console.error("audit GET", e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
