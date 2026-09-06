// Marib postinstall — dialect-aware Prisma client generation.
// Local dev  : prisma/schema.prisma is SQLite → plain `prisma generate`
// Vercel     : VERCEL env var is set → swap in the PostgreSQL schema
//              (prisma/schema.postgres.prisma) and generate from it.
// The Postgres tables themselves are created at RUNTIME by
// src/lib/bootstrap.ts (CREATE TABLE IF NOT EXISTS + seed), so no
// migration command is ever needed on the deployment platform.
import { execSync } from "node:child_process"
import { copyFileSync } from "node:fs"

const onVercel = !!process.env.VERCEL

if (onVercel) {
  copyFileSync("prisma/schema.postgres.prisma", "prisma/schema.prisma")
  console.log("[postinstall] Vercel detected → using PostgreSQL schema")
}

execSync("npx prisma generate", { stdio: "inherit" })
console.log("[postinstall] prisma client generated")
