import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"
import seed07 from "@/server/seed/2026-07.json"
import seed08 from "@/server/seed/2026-08.json"
import seed09 from "@/server/seed/2026-09.json"

/* ============================================================
   Bootstrap — the owner never runs a migration command:
   on the first request after a deploy this creates the tables
   (CREATE TABLE IF NOT EXISTS, dialect-aware) and seeds the
   developer account + the archived months (Jul/Aug/Sep 2026).
   Idempotent: runs at most once per server instance, and every
   statement is safe to re-run.
   ============================================================ */

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

export function monthLabel(monthKey: string): string {
  const m = Number(monthKey.slice(5, 7))
  const y = monthKey.slice(0, 4)
  return (AR_MONTHS[m - 1] || monthKey) + " " + y
}

interface SeedPack {
  monthKey: string
  fileNames: string[]
  pack: Record<string, { c: string[]; r: unknown[][] }>
}

const SEEDS = [seed07, seed08, seed09] as unknown as SeedPack[]

function isSqlite(): boolean {
  const url = process.env.DATABASE_URL || ""
  return url.startsWith("file:")
}

/* DDL mirrors exactly what Prisma generates for each provider. */
function ddl(): string[] {
  if (isSqlite()) {
    return [
      `CREATE TABLE IF NOT EXISTS "User" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "username" TEXT NOT NULL UNIQUE,
        "role" TEXT NOT NULL DEFAULT 'user',
        "canUpload" BOOLEAN NOT NULL DEFAULT 0,
        "active" BOOLEAN NOT NULL DEFAULT 1,
        "pwHash" TEXT NOT NULL,
        "failedCount" INTEGER NOT NULL DEFAULT 0,
        "lockedUntil" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "MonthData" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "monthKey" TEXT NOT NULL UNIQUE,
        "label" TEXT NOT NULL DEFAULT '',
        "packJson" TEXT NOT NULL,
        "fileNames" TEXT NOT NULL DEFAULT '[]',
        "uploadedById" INTEGER,
        "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "AppSetting" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      )`,
    ]
  }
  return [
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" SERIAL PRIMARY KEY,
      "username" TEXT NOT NULL UNIQUE,
      "role" TEXT NOT NULL DEFAULT 'user',
      "canUpload" BOOLEAN NOT NULL DEFAULT false,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "pwHash" TEXT NOT NULL,
      "failedCount" INTEGER NOT NULL DEFAULT 0,
      "lockedUntil" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" INTEGER NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "MonthData" (
      "id" SERIAL PRIMARY KEY,
      "monthKey" TEXT NOT NULL UNIQUE,
      "label" TEXT NOT NULL DEFAULT '',
      "packJson" TEXT NOT NULL,
      "fileNames" TEXT NOT NULL DEFAULT '[]',
      "uploadedById" INTEGER,
      "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    )`,
  ]
}

async function seed() {
  const nUsers = await db.user.count()
  if (nUsers === 0) {
    await db.user.create({
      data: {
        username: "Amin",
        role: "dev",
        canUpload: true,
        active: true,
        pwHash: hashPassword("2872002"),
      },
    })
  }
  const nMonths = await db.monthData.count()
  if (nMonths === 0) {
    for (const s of SEEDS) {
      await db.monthData.upsert({
        where: { monthKey: s.monthKey },
        create: {
          monthKey: s.monthKey,
          label: monthLabel(s.monthKey),
          packJson: JSON.stringify(s.pack),
          fileNames: JSON.stringify(s.fileNames || []),
        },
        update: {},
      })
    }
  }
}

let ready: Promise<void> | null = null

/** Idempotent — awaited by every API route before touching the DB. */
export function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of ddl()) {
        await db.$executeRawUnsafe(stmt)
      }
      await seed()
    })().catch((e) => {
      ready = null // allow retry on the next request
      throw e
    })
  }
  return ready
}
