import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureReady } from "@/lib/bootstrap"
import { SESSION_COOKIE, sessionUser, unauthorized, forbidden } from "@/lib/auth"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const DEV_ID = 1 // the seeded developer account — its role cannot change

/** PATCH /api/users/[id] — role / upload permission / active (admins only). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await ensureReady()
    const me = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!me) return unauthorized()
    if (me.role !== "dev" && me.role !== "admin") return forbidden()

    const { id: idStr } = await ctx.params
    const id = Number(idStr)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ ok: false, error: "badid" }, { status: 400 })
    }
    const u = await db.user.findUnique({ where: { id } })
    if (!u) {
      return NextResponse.json({ ok: false, error: "notfound" }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    if (typeof body?.role === "string") {
      const role = body.role
      if (id === DEV_ID || id === me.id) {
        return NextResponse.json({ ok: false, error: "selfrole" }, { status: 400 })
      }
      if (role === "admin" || role === "user") data.role = role
      else return NextResponse.json({ ok: false, error: "badrole" }, { status: 400 })
    }
    if (typeof body?.canUpload === "boolean") data.canUpload = body.canUpload
    if (typeof body?.active === "boolean") {
      if (id === me.id) {
        return NextResponse.json({ ok: false, error: "selfactive" }, { status: 400 })
      }
      data.active = body.active
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing" }, { status: 400 })
    }
    await db.user.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("user patch error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}

/** DELETE /api/users/[id] (admins only; never self, never the dev account). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await ensureReady()
    const me = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)
    if (!me) return unauthorized()
    if (me.role !== "dev" && me.role !== "admin") return forbidden()

    const { id: idStr } = await ctx.params
    const id = Number(idStr)
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ ok: false, error: "badid" }, { status: 400 })
    }
    if (id === me.id) {
      return NextResponse.json({ ok: false, error: "selfdel" }, { status: 400 })
    }
    if (id === DEV_ID) {
      return NextResponse.json({ ok: false, error: "devdel" }, { status: 400 })
    }
    const u = await db.user.findUnique({ where: { id } })
    if (!u) {
      return NextResponse.json({ ok: false, error: "notfound" }, { status: 404 })
    }
    await db.session.deleteMany({ where: { userId: id } })
    await db.user.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("user delete error", e)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
