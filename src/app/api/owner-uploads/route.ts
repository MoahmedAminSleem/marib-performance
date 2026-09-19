/* /api/owner-uploads — R71: قناة مرفقات المالك (الصفحة /up).
   المشكلة (موثقة في docs/سير-العمل-R70.md): قناة الشات بتسلّم اسم
   الملف بس من غير البايتس — فمحتوى الرفع عمره ما وصل السيرفر ده.
   الحل: نقطة ثابتة بتستقبل الملفات وتحفظها على ديسك السيرفر في
   /home/z/my-project/uploads/ — اللينك ثابت للأبد ومفيش أي تحديث
   بيرافق كل رفعة (شرط المالك الصريح — بديل الـ share-link اللي
   كان بيتجدد مع كل محادثة).
   الأمان: مفتاح بسيط (?k= أو هيدر x-up-key) + قائمة امتدادات
   مسموحة + سقف 30MB — معاينة خاصة فده كفاية وأي زيادة هتبطّئ
   الاستخدام اليومي اللي المالك طلبوه: افتح → اسحب → خلص. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "@/lib/marib/http";

const lg = logger("owner-uploads");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = "/home/z/my-project/uploads";
const UP_KEY = "2872002"; // مفتاح المالك — نفس كلمة السر اللي عارفها
const MAX_BYTES = 30 * 1024 * 1024; // 30MB للملف
const ALLOWED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
  ".pdf", ".txt", ".log", ".json", ".csv",
  ".mp4", ".webm", ".zip",
]);

type SavedFile = { name: string; size: number };
type ListedFile = SavedFile & { mtime: number };

function keyOk(req: Request): boolean {
  const k =
    new URL(req.url).searchParams.get("k") ?? req.headers.get("x-up-key") ?? "";
  return k === UP_KEY;
}

/* طابع زمني مضغوط قدام الاسم الأصلي: 20260919-153045_img.png —
   قابل للفرز بالاسم + الاصطدام شبه مستحيل (وثاني واحد موجود = -2) */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) +
    "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  );
}

function safeName(orig: string): string {
  const base = path.basename(orig).replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "_");
  return (stamp() + "_" + base).replace(/\s+/g, "_").slice(0, 160);
}

async function uniquePath(dir: string, name: string): Promise<string> {
  let candidate = name;
  let i = 2;
  for (;;) {
    try {
      await fs.access(path.join(dir, candidate));
      const ext = path.extname(name);
      candidate = name.slice(0, name.length - ext.length) + "-" + i + ext;
      i += 1;
    } catch {
      return path.join(dir, candidate);
    }
  }
}

/* GET ?k= — قائمة الملفات المرفوعة (الأحدث الأول) عشان الصفحة
   تعرض للمالك إيه اللي وصل فعلًا — إيصال مرئي مش كلام. */
export async function GET(req: Request): Promise<Response> {
  if (!keyOk(req)) {
    return Response.json({ ok: false, error: "bad-key" }, { status: 401 });
  }
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const names = await fs.readdir(UPLOAD_DIR);
    const files: ListedFile[] = [];
    for (const name of names) {
      const st = await fs.stat(path.join(UPLOAD_DIR, name));
      if (st.isFile()) files.push({ name, size: st.size, mtime: st.mtimeMs });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    return Response.json({ ok: true, files: files.slice(0, 200) });
  } catch (e) {
    lg.error("list failed", { err: String(e) });
    return Response.json({ ok: false, error: "server" }, { status: 500 });
  }
}

/* POST ?k= — multipart فيه file أو files (واحد أو أكتر). الرد بيقول
   لكل ملف اتحفظ بإيه واترفض بإيه — الصفحة بتعرضه للمالك فورًا. */
export async function POST(req: Request): Promise<Response> {
  if (!keyOk(req)) {
    return Response.json({ ok: false, error: "bad-key" }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { ok: false, errors: ["الطلب مش فيه ملفات صالحة"] },
      { status: 400 }
    );
  }
  const picked = [...form.getAll("file"), ...form.getAll("files")].filter(
    (v): v is File => typeof v !== "string"
  );
  if (picked.length === 0) {
    return Response.json(
      { ok: false, errors: ["مفيش ملفات في الطلب"] },
      { status: 400 }
    );
  }
  const saved: SavedFile[] = [];
  const errors: string[] = [];
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    for (const f of picked) {
      const ext = path.extname(f.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        errors.push(f.name + ": الامتداد " + (ext || "فاضي") + " مش مسموح");
        continue;
      }
      if (f.size > MAX_BYTES) {
        errors.push(f.name + ": أكبر من 30MB");
        continue;
      }
      if (f.size === 0) {
        errors.push(f.name + ": الملف فاضي");
        continue;
      }
      const dest = await uniquePath(UPLOAD_DIR, safeName(f.name));
      await fs.writeFile(dest, Buffer.from(await f.arrayBuffer()));
      saved.push({ name: path.basename(dest), size: f.size });
    }
  } catch (e) {
    /* Vercel مثلًا: مجلد السيرفر ده مش موجود وهنا بنرد بوضوح
       بدل 500 صامت — القناة معمولة لمعاينة السيرفر المحلي. */
    lg.error("save failed", { err: String(e) });
    return Response.json(
      { ok: false, saved, errors: [...errors, "التخزين مش متاح على السيرفر ده"] },
      { status: 500 }
    );
  }
  lg.info("upload", { saved: saved.length, rejected: errors.length });
  return Response.json(
    { ok: errors.length === 0, saved, errors },
    { status: saved.length > 0 ? 200 : 400 }
  );
}
