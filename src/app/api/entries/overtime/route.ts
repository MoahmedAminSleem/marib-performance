/* /api/entries/overtime — R46-8: إدخال الأوفر تايم
   GET (?month=YYYY-MM) → list overtime entries
   POST → create: شخص بالاسم و/أو أشخاص إضافيين (R68)
   DELETE → remove an entry
   R56: المنطق المشترك (مطابقة الموظف / خرائط الأقسام / تحقق الشهر
        والتاريخ) اتنقل لـ lib/marib/entries.ts — نفس السلوك بالظبط.
   R68: واجهة الأوفر تايم بقت زي الإنتاج — والطلب الجوهري: ناس
        بتعمل أوفر تايم لسه مش مسجلين كود/اسم في الاتزان. الحفظ
        الواحد ممكن يخرّج صفين: صف الشخص المختار بالاسم (لو اتختار)
        + صف الإضافيين (عدد × ساعات الشخص) — الاتنين في معاملة واحدة
        عشان ما يتحطش نص حفظ لو التاني فشل. */

import { NextRequest, NextResponse } from "next/server";
import { q, audit, withTransaction } from "@/lib/marib/db";
import { fail, serverFail, readJson, logger, requirePermBody, requireEntryRead } from "@/lib/marib/http";
import { matchEmployee, loadEmpMap, loadDeptMap, monthParam, isDayStr, deleteEntry } from "@/lib/marib/entries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lg = logger("entries:overtime");

export async function GET(req: NextRequest) {
  try {
    /* R63: حارس قراءة الإدخال — data.view أو data.upload */
    const g = await requireEntryRead(req);
    if (g.res) return g.res;

    const month = monthParam(req.nextUrl.searchParams);
    if (!month) return fail("month", 400);

    const rows = await q(
      `SELECT id, month_key, to_char(date, 'YYYY-MM-DD') AS date_str, emp_id, emp_code, emp_name, dept_id, dept_name, line_id, hours, extra_count, note, actor, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created
       FROM marib_overtime WHERE month_key = $1 ORDER BY date ASC, created_at ASC`,
      [month]
    );

    const empMap = await loadEmpMap(Array.from(new Set(rows.map((r) => r.emp_id).filter(Boolean))) as string[]);
    const deptMap = await loadDeptMap(Array.from(new Set(rows.map((r) => r.dept_id).filter(Boolean))) as string[]);

    return NextResponse.json({
      month,
      entries: rows.map((r) => {
        const emp = r.emp_id ? empMap[r.emp_id as string] : undefined;
        /* R68: صف الإضافيين = emp فاضي و extra_count>0 — الواجهة
           بتعرضه "N × إضافي" بدل متطابق/غير متطابق */
        const extra = Number(r.extra_count || 0) > 0;
        return {
          id: r.id,
          month: r.month_key,
          date: r.date_str,
          emp_id: r.emp_id || "",
          emp_code: r.emp_code || (emp?.code || ""),
          emp_name: r.emp_name || (emp?.name || ""),
          job: emp?.job || "",
          dept_id: r.dept_id || (emp?.dept_id || ""),
          dept_name: (r.dept_name as string) || ((r.dept_id as string) ? (deptMap[r.dept_id as string] || "") : ""),
          line_id: r.line_id || "",
          hours: r.hours,
          extra_count: Number(r.extra_count || 0),
          is_extra: extra,
          note: r.note || "",
          actor: r.actor,
          created: r.created,
          matched: extra ? true : !!emp,
        };
      }),
    });
  } catch (e) {
    return serverFail("entries:overtime", "GET", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    /* R64: كتابة الإدخال بمفتاحه الخاص — entry.edit */
    const g = await requirePermBody(req, "entry.edit", "edit");
    if (g.res) return g.res;
    const me = g.user!;

    const body = await readJson(req);
    if (!body) return fail("body", 413);
    const date = String(body.date || "");
    const empCode = String(body.emp_code || "").trim();
    const empName = String(body.emp_name || "").trim();
    /* R50: القسم والخط بقوا نص — أقسام الأرضية الخمسة وخطوط 1..5 */
    const deptId = String(body.dept_id || "");
    const deptName = String(body.dept || "").trim().slice(0, 60);
    const lineId = String(body.line || body.line_id || "").trim().slice(0, 20);
    const hours = parseFloat(String(body.hours || "0"));
    const note = String(body.note || "").trim().slice(0, 200);
    /* R68: الأشخاص الإضافيين — ناس مش مسجلين في الاتزان. العدد
       N والساعات ساعات الشخص الواحد (إجمالي الصف = N × ساعات).
       الحفظ الواحد بيخرّج صف الإضافيين ده جنب صف الشخص المسمّى. */
    const extraCount = Math.floor(parseFloat(String(body.extra_count || "0")));
    const extraHours = parseFloat(String(body.extra_hours || "0"));
    const hasNamed = !!empCode || !!empName;
    const hasExtra = extraCount > 0;

    if (!isDayStr(date)) return fail("date", 400);
    /* الطلب القديم كان بيرفض من غير موظف — دلوقتي الإضافيين لوحدهم
       كفاية (الواجهة بتأكد القسم والخط قبل ما تبعت أصلًا) */
    if (!hasNamed && !hasExtra) return fail("emp", 400);
    if (extraCount < 0 || extraCount > 500) return fail("extra_count", 400);
    if (hasNamed && (hours <= 0 || hours > 24)) return fail("hours", 400);
    if (hasExtra && (extraHours <= 0 || extraHours > 24)) return fail("extra_hours", 400);

    /* match employee by code or name — shared helper (R56). القسم
       النصي من الطلب هو fallback: بيفضل لو الموظف ملقوش أو من غير قسم.
       صف الإضافيين ملوش موظف أصلًا — بياخد القسم النصي زي ما هو. */
    const { empId, deptId: resolvedDeptId } = hasNamed
      ? await matchEmployee(empCode, empName, deptId || null)
      : { empId: null as string | null, deptId: null as string | null };

    const monthKey = date.slice(0, 7);
    const ids: string[] = [];
    /* معاملة واحدة للصفين (لو عندنا صفين): مفيش نص حفظ لو التاني فشل */
    await withTransaction(async (run) => {
      if (hasNamed) {
        const id = crypto.randomUUID();
        await run(
          `INSERT INTO marib_overtime (id, month_key, date, emp_id, emp_code, emp_name, dept_id, dept_name, line_id, hours, extra_count, note, actor)
           VALUES ($1, $2, $3::date, NULLIF($4, ''), $5, $6, NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), $10, 0, $11, $12)`,
          [id, monthKey, date, empId || null, empCode, empName, resolvedDeptId || null, deptName || null, lineId || null, hours, note, me.username]
        );
        ids.push(id);
      }
      if (hasExtra) {
        const id = crypto.randomUUID();
        await run(
          `INSERT INTO marib_overtime (id, month_key, date, emp_id, emp_code, emp_name, dept_id, dept_name, line_id, hours, extra_count, note, actor)
           VALUES ($1, $2, $3::date, NULL, '', '', NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10)`,
          [id, monthKey, date, deptId || null, deptName || null, lineId || null, extraHours, extraCount, note, me.username]
        );
        ids.push(id);
      }
    });

    /* audit لكل صف اتعمل (نفس عادة الجولات: create + سياق) — R60:
       الحارس على العنصر مش .length (noUncheckedIndexedAccess) */
    const namedId = ids[0] || null;
    const extraId = ids.length > 1 ? ids[ids.length - 1] || null : null;
    if (hasNamed && namedId) {
      await audit(me.username, "create", "entries:overtime", namedId, { date, emp: empCode || empName, hours, matched: !!empId, dept: deptName });
    }
    if (hasExtra && extraId) {
      await audit(me.username, "create", "entries:overtime", extraId, { date, extra: extraCount, hours: extraHours, dept: deptName, line: lineId });
    }
    lg.info("overtime entry created", {
      by: me.username, date, dept: deptName, line: lineId,
      emp: hasNamed ? (empCode || empName) : null,
      matched: hasNamed ? !!empId : null,
      hours: hasNamed ? hours : null,
      extra_count: hasExtra ? extraCount : 0,
      extra_hours: hasExtra ? extraHours : 0,
    });

    /* الرد متوافق للخلف: id/matched بيتكلموا عن الصف الأول (المسمّى لو
       موجود) — وids للواجهة الجديدة اللي عايزة تعرف كل اللي اتعمل */
    return NextResponse.json({
      ok: true,
      id: namedId || extraId,
      ids,
      matched: hasNamed ? !!empId : true,
      extra_count: hasExtra ? extraCount : 0,
    });
  } catch (e) {
    return serverFail("entries:overtime", "POST", e);
  }
}

/* R59: جسم الـ DELETE المشترك اتنقل لـ deleteEntry (lib) — نفس السلوك */
export async function DELETE(req: NextRequest) {
  return deleteEntry(req, "overtime");
}
