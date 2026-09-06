import { db } from "@/lib/db"
import { ensureReady } from "@/lib/bootstrap"

export const dynamic = "force-dynamic"

export async function GET() {
  await ensureReady()
  const nMonths = await db.monthData.count()
  const nUsers = await db.user.count()
  return Response.json({ ok: true, months: nMonths, users: nUsers })
}
