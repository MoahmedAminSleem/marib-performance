import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureReady } from "@/lib/bootstrap"
import { SESSION_COOKIE, sessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** GET /api/months — list of archived months (newest first). */
export async function GET(req: NextRequest) {
  try {
    await ensureReady()
    const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!user) return unauthorized()
    const rows = await db.monthData.findMany({
      orderBy: { monthKey: "desc" },
      select: {
        monthKey: true,
        label: true,
        fileNames: true,
        uploadedAt: true,
        updatedAt: true,
        packJson: true,
      },
    })
    const months = rows.map((r) => {
      let rowsCount = 0
      try {
        const pack = JSON.parse(r.packJson)
        rowsCount = (pack?.dd?.r || []).length
      } catch {}
      return {
        key: r.monthKey,
        label: r.label,
        rows: rowsCount,
        files: safeNames(r.fileNames),
        updatedAt: r.updatedAt.toISOString(),
      }
    })
    return NextResponse.json({ ok: true, months })
  } catch (e) {
    console.error("months list error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

function safeNames(s: string): string[] {
  try {
    const a = JSON.parse(s)
    return Array.isArray(a) ? a.map(String) : []
  } catch {
    return []
  }
}
