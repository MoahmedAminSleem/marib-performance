/* /api/manpower/export — R39: the الاتزان hierarchy as ONE ready Excel
   workbook, built on the in-house zero-dependency xlsx-writer:
     1. "Manpower"  — flat pivot table + dept summary on the side
     2. "الهيكل"    — the full tree with real Excel outline levels
     3. "الموظفين"  — every position + autofilter
     4. "الأرشيف"   — the transfer archive (incl. خروج rows)
   R55: بقى محتاج صلاحية manpower.export (view) — الأدمن يقدر يمنع
   التصدير عن أي يوزر من لوحة الصلاحيات.
   R56: بناء الـ workbook كله اتنقل لـ lib/marib/manpower_export.ts
   (نفس أسلوب R52 مع الاستيراد) — هنا بصلاحية + اللغة + إرسال
   البايتات بس. المخرجات متطابقة بالبايت (مثبت بـ E2E baseline). */

import { NextRequest, NextResponse } from "next/server";
import { serverFail, requirePerm, logger } from "@/lib/marib/http";
import { buildTemplate, buildExport, type BuiltXlsx } from "@/lib/marib/manpower_export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("manpower-export");

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* (R48) Uint8Array مقبول runtime كـ body، بس TS محتاج توضيح. */
function xlsxRes(b: BuiltXlsx): NextResponse {
  return new NextResponse(b.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${b.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    /* R55: التصدير صلاحية manpower.export — مش أي يوزر داخل */
    const g = await requirePerm(req, "manpower.export", "view");
    if (g.res) return g.res;

    const sp = new URL(req.url).searchParams;

    /* R42: ?template=1 — تيمبلت الرفع بالداتا الحالية */
    if (sp.get("template") === "1") {
      return xlsxRes(await buildTemplate());
    }

    /* R50: ?lang=ar|tr — الترجمة من أعمدة الشيت (الافتراضي عربي) */
    const lang = (sp.get("lang") || "ar").toLowerCase() === "tr" ? "tr" : "ar";
    const built = await buildExport(lang);
    lg.info("manpower export built", { lang, bytes: built.bytes.length });
    return xlsxRes(built);
  } catch (e) {
    return serverFail("manpower-export", "GET", e);
  }
}
