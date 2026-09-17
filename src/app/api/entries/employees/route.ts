/* /api/entries/employees — R63: قايمة الموظفين لكومبوبوكس الإدخال
   المشكلة القديمة: كومبوبوكس اختيار الشخص (الغياب/الأوفر تايم) كان
   بيجيب /api/manpower — ومساره محتاج manpower.view — فأي مسؤول إدخال
   مخبّي عنه الاتزان (manpower.view=hidden) كان الكومبوبوكس بيفتح فاضي
   بصمت (catch بيرجع []). المسار ده بيرجع الحد الأدنى اللي الإدخال
   محتاجه فعلاً (كود/اسم/اسم TR/وظيفة/مسار القسم) من غير الـ IDs ولا
   الماكينات ولا الملاحظات — والمسار كله شوية كيلوبايت.
   الحارس: حارس قراءة الإدخال (data.view أو data.upload). */

import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/marib/db";
import { serverFail, requireEntryRead } from "@/lib/marib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const g = await requireEntryRead(req);
    if (g.res) return g.res;

    /* الأقسام الأول — لبناء المسار (الإدارة — القسم — الداخلي) */
    const depts = await q(
      "SELECT id, name, parent_id FROM marib_dept ORDER BY ord ASC, name ASC"
    );
    const byId = new Map<string, string>();
    const kids = new Map<string, string[]>();
    for (const d of depts) {
      byId.set(d.id as string, d.name as string);
      const p = (d.parent_id as string) || "";
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(d.id as string);
    }
    const pathOf = new Map<string, string>();
    const walk = (pid: string, pref: string) => {
      for (const k of kids.get(pid) || []) {
        const path = (pref ? pref + " — " : "") + (byId.get(k) || k);
        pathOf.set(k, path);
        walk(k, path);
      }
    };
    walk("", "");

    /* الموظفين الفعليين (الشواغر مش ناس — نفس فلتر الكومبوبوكس القديم) */
    const emps = await q(
      "SELECT code, name, name_tr, job, dept_id FROM marib_emp WHERE vac = false ORDER BY ord ASC, name ASC"
    );
    return NextResponse.json({
      emps: emps.map((r) => ({
        code: String(r.code || ""),
        name: String(r.name || ""),
        nameTr: String(r.name_tr || ""),
        job: String(r.job || ""),
        path: pathOf.get(r.dept_id as string) || "",
      })),
    });
  } catch (e) {
    return serverFail("entries:employees", "GET", e);
  }
}
