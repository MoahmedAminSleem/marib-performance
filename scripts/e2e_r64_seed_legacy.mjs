// R64 E2E — بذر قاعدة "قبل الترقية" لاختبار المايجريشن الحقيقي
// سيناريو: يوزر عنده override قديم data.upload=edit (الحالة الوحيدة اللي
// كانت بتفتح صفحة الإدخال قبل R64) على قاعدة اتبوتت بـ BOOT_VER قديم.
// لما السيرفر الجديد (BOOT_VER=59) يبوت عليها، المايجريشن المفروض
// يمنحه entry.view=view + entry.edit=edit + entry.po=edit.
//
// الاستخدام: node scripts/e2e_r64_seed_legacy.mjs <target-db-dir>
// بيشتغل بـ @electric-sql/pglite بتاعة الريبو نفسه.
import { PGlite } from '@electric-sql/pglite';
import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/e2e_r64_seed_legacy.mjs <db-dir>');
  process.exit(1);
}
if (fs.existsSync(target)) {
  console.error('refusing to overwrite existing dir:', target);
  process.exit(1);
}
fs.mkdirSync(target, { recursive: true });

const db = new PGlite(target);

// نفس DDL الجداول المعنية (النسخة المختصرة اللي البوت بيعملها)
await db.exec(`CREATE TABLE IF NOT EXISTS marib_user (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
)`);
await db.exec(`CREATE TABLE IF NOT EXISTS marib_perm (
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'inherit',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (user_id, feature)
)`);
await db.exec(`CREATE TABLE IF NOT EXISTS marib_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);

// بوابة R57 بتشوف boot_ver — قيمة قديمة عشان البوت الكامل يشتغل
await db.exec(`INSERT INTO marib_meta (key, value) VALUES ('boot_ver', '58')`);

// يوزر حقيقي (نفس هاش scrypt$ بتاع session.ts) نقدر ندخل بيه
const uid = 'e2e-legacy-user-0001';
const salt = randomBytes(16).toString('hex');
const hash = scryptSync('e2e-legacy-1234', salt, 32).toString('hex');
await db.query(
  `INSERT INTO marib_user (id, username, pass_hash, role, created_by)
   VALUES ($1, $2, $3, 'user', 'e2e-seed')`,
  [uid, 'E2Elegacy', `scrypt$${salt}$${hash}`]
);
// حساب المطور الافتراضي (Amin) — البوت بيعمله بس لو الجدول فاضي،
// والدنيا هنا مش فاضية (E2Elegacy موجود) فبنعمله بنفسنا بـ DEV_BOOT_PASSWORD
const dSalt = randomBytes(16).toString('hex');
const dHash = scryptSync(process.env.DEV_BOOT_PASSWORD || '2872002', dSalt, 32).toString('hex');
await db.query(
  `INSERT INTO marib_user (id, username, pass_hash, role, created_by)
   VALUES ($1, 'Amin', $2, 'dev', 'e2e-seed')`,
  ['e2e-admin-00000001', `scrypt$${dSalt}$${dHash}`]
);

// الحالة القديمة بالظبط: data.upload=edit هو اللي كان بيفتح الإدخال
await db.query(
  `INSERT INTO marib_perm (user_id, feature, level, updated_by)
   VALUES ($1, 'data.upload', 'edit', 'e2e-seed')`,
  [uid]
);

await db.close();
console.log('LEGACY DB SEEDED at', target, '(boot_ver=58 + E2Elegacy data.upload=edit)');
