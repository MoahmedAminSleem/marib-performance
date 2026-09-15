/* /api/translate — R46: live translation endpoint
   GET ?term=...&to=ar|en|tr → { term, to, tr }
   Uses Google gtx + MyMemory (free, no API key). Caches in marib_i18n.
   Any signed-in user can call this — translations are read-only. */

import { NextRequest, NextResponse } from "next/server";
import { translateLive } from "@/lib/marib/translate";
import { fail, serverFail, requireUser } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const g = await requireUser(req, "translate", "GET");
    if (g.res) return g.res;

    const term = req.nextUrl.searchParams.get("term") || "";
    const to = (req.nextUrl.searchParams.get("to") || "ar").toLowerCase();
    if (!term || term.length > 200) return fail("term", 400);
    if (!["ar", "en", "tr"].includes(to)) return fail("to", 400);

    const tr = await translateLive(term, to);
    return NextResponse.json({ term, to, tr });
  } catch (e) {
    return serverFail("translate", "GET", e);
  }
}
