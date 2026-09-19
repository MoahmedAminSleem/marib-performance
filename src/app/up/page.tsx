"use client";

/* R71: صفحة رفع مرفقات المالك — اللينك ثابت للأبد.
   المشكلة: قناة الشات بتسلّم اسم الملف بس من غير البايتس (موثق في
   docs/سير-العمل-R70.md) — فالرفع في الشات عمره ما وصل المحتوى،
   والحل الوحيد اللي كان متاح (share-link) بيتجدد مع كل محادثة.
   الحل هنا: الصفحة دي + /api/owner-uploads — المالك يفتح اللينك مرة
   واحدة (المفتاح بيتحفظ في localStorage) ويسحب/يلصق أي صورة أو ملف،
   فبتوصل بايتسها على ديسك السيرفر والوكيل يشوفها فورًا.
   الصفحة مستقلة عن واجهة اللوحة (مش بتحمّل سكريبتات /app) — بس
   بترث الخطوط والإحساس الدنيم من app.css بتاع الـ layout. */

import { useCallback, useEffect, useRef, useState } from "react";

type UpFile = { name: string; size: number; mtime: number };
type UpResult = { name: string; ok: boolean; msg: string };

const KEY_STORE = "marib-up-key";

function fmtSize(bytes: number): string {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
  return bytes + " B";
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    p(d.getHours()) + ":" + p(d.getMinutes()) +
    " · " + p(d.getDate()) + "/" + p(d.getMonth() + 1)
  );
}

const STYLE = `
.upx-root{min-height:100vh;box-sizing:border-box;padding:30px 16px 64px;
  background-color:#0C1420;
  background-image:radial-gradient(1100px 520px at 75% -8%,rgba(42,64,102,.5),transparent 62%);
  color:#F2EBDD;display:flex;flex-direction:column;align-items:center;gap:16px}
.upx-card{width:100%;max-width:660px;background:rgba(13,20,32,.74);
  border:1px solid rgba(242,235,221,.14);border-radius:14px;
  padding:20px 18px 22px;backdrop-filter:blur(8px)}
.upx-h1{margin:0;font-size:21px;font-weight:800;letter-spacing:.2px}
.upx-sub{margin:6px 0 0;font-size:13px;color:rgba(242,235,221,.72);line-height:1.8}
.upx-keyrow{display:flex;gap:8px;margin-top:14px}
.upx-keyrow input{flex:1;min-width:0;background:rgba(242,235,221,.06);
  border:1px solid rgba(242,235,221,.22);border-radius:9px;padding:9px 12px;
  color:#F2EBDD;font-size:14px;outline:none}
.upx-keyrow input:focus{border-color:rgba(214,168,86,.85)}
.upx-btn{background:#2A4066;color:#fff;border:none;border-radius:9px;
  padding:9px 16px;font-size:13.5px;font-weight:700}
.upx-btn:hover{background:#1D2E4C}
.upx-drop{margin-top:16px;border:2px dashed rgba(242,235,221,.35);
  border-radius:14px;min-height:150px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:8px;padding:22px;
  text-align:center;transition:border-color .15s,background .15s}
.upx-drop.on{border-color:#D6A856;background:rgba(214,168,86,.08)}
.upx-big{font-size:16.5px;font-weight:700}
.upx-small{font-size:12.5px;color:rgba(242,235,221,.62);line-height:1.9}
.upx-res{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.upx-res .ok{color:#8FD6A0;font-size:13px}
.upx-res .bad{color:#E39A9A;font-size:13px}
.upx-after{margin-top:10px;font-size:12.5px;color:#D6A856}
.upx-files{margin-top:12px;border-top:1px solid rgba(242,235,221,.12);
  padding-top:12px;display:flex;flex-direction:column;gap:7px;
  max-height:260px;overflow:auto}
.upx-file{display:flex;justify-content:space-between;gap:10px;
  font-size:12.5px;color:rgba(242,235,221,.85);direction:ltr;text-align:left}
.upx-file .sz{color:rgba(242,235,221,.5);white-space:nowrap;direction:ltr}
.upx-foot{width:100%;max-width:660px;font-size:11.5px;
  color:rgba(242,235,221,.45);text-align:center;line-height:1.9}
`;

export default function OwnerUploadPage() {
  const [key, setKey] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<UpFile[]>([]);
  const [results, setResults] = useState<UpResult[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (k: string): Promise<void> => {
    try {
      const r = await fetch("/api/owner-uploads?k=" + encodeURIComponent(k));
      if (!r.ok) return;
      const j = (await r.json()) as { files?: UpFile[] };
      setFiles(j.files ?? []);
    } catch {
      /* شبكة/سيرفر مقطوع — الصفحة بتفضل شغالة */
    }
  }, []);

  const upload = useCallback(
    async (list: FileList | readonly File[]): Promise<void> => {
      const arr = Array.from(list);
      if (arr.length === 0) return;
      if (!key.trim()) {
        setResults([
          { name: "—", ok: false, msg: "اكتب المفتاح الأول (من اللينك أو زرار الحفظ فوق)" },
        ]);
        return;
      }
      setBusy(true);
      const out: UpResult[] = [];
      for (const f of arr) {
        /* درس R71 (بايج المتصفح الـ headless): كائن File الجاي من
           الإنبوت بيتسلسل فاضي في جسم fetch في بعض المتصفحات — قراءة
           البايتس وبناء ملف جديد بتصلّحها، وفي المتصفح الحقيقي السلوك
           زي ما هو بالظبط. القراءة نفسها مضمونة (نفس مسار readGrid
           بتاع رفع التيمبلتات اللي شغال من R59). */
        let body: File = f;
        try {
          const buf = await f.arrayBuffer();
          body = new File([buf], f.name, {
            type: f.type || "application/octet-stream",
          });
        } catch {
          /* القراءة فشلت — نجرب بالملف الأصلي زي ما هو */
        }
        const fd = new FormData();
        fd.append("file", body);
        try {
          const r = await fetch(
            "/api/owner-uploads?k=" + encodeURIComponent(key.trim()),
            { method: "POST", body: fd }
          );
          const j = (await r.json().catch(() => ({}))) as {
            saved?: unknown[];
            errors?: string[];
          };
          if (r.ok && j.saved && j.saved.length > 0) {
            out.push({ name: f.name, ok: true, msg: "وصلت (" + fmtSize(f.size) + ")" });
          } else {
            out.push({
              name: f.name,
              ok: false,
              msg: j.errors?.[0] ?? "فشل — كود " + String(r.status),
            });
          }
        } catch {
          out.push({ name: f.name, ok: false, msg: "مشكلة شبكة" });
        }
      }
      setResults(out);
      setBusy(false);
      void refresh(key.trim());
    },
    [key, refresh]
  );

  /* المفتاح: من الـ URL مرة واحدة (?k=...) أو المحفوظ — وبعدها
     localStorage بيكفي للأبد، واللينك العادي يشتغل من غير ?k= */
  useEffect(() => {
    const urlK = new URLSearchParams(window.location.search).get("k") ?? "";
    const saved = localStorage.getItem(KEY_STORE) ?? "";
    const k = urlK || saved;
    if (k) localStorage.setItem(KEY_STORE, k);
    setKey(k);
    if (k) void refresh(k);
  }, [refresh]);

  /* Ctrl+V: لصق صورة من الحافظة زي ما المالك بيعمل في الشات بالظبط —
     أسرع مسار ممكن: سكرين شوت → Ctrl+V → خلاص */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const fl = e.clipboardData?.files;
      if (fl && fl.length > 0) {
        e.preventDefault();
        void upload(fl);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [upload]);

  function saveKey(): void {
    const k = key.trim();
    if (k) {
      localStorage.setItem(KEY_STORE, k);
      void refresh(k);
    }
  }

  return (
    <div dir="rtl" lang="ar" className="upx-root">
      <style>{STYLE}</style>
      <div className="upx-card">
        <h1 className="upx-h1">مرفقات المالك ← الوكيل</h1>
        <p className="upx-sub">
          اللينك ده <b>ثابت للأبد</b> — افتحه مرة واعمله حفظ (Bookmark).
          اسحب أي صورة/ملف على المنطقة دي أو اعمل <b>Ctrl+V</b> للّصق،
          وهتوصل للوكيل على طول من غير أي خطوة تانية.
        </p>
        <div className="upx-keyrow">
          <input
            type="password"
            value={key}
            placeholder="المفتاح (بيتحفظ تلقائي أول مرة)"
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveKey();
            }}
          />
          <button className="upx-btn" onClick={saveKey}>
            حفظ المفتاح
          </button>
        </div>
        <div
          id="up-dropzone"
          className={"upx-drop" + (drag ? " on" : "")}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <div className="upx-big">
            {busy ? "بيترفع..." : "اسحب الصور/الملفات هنا"}
          </div>
          <div className="upx-small">
            أو Ctrl+V للّصق · أو دوس للاختيار من الجهاز
            <br />
            صور · PDF · فيديو · نصوص · zip — لحد 30MB للملف
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void upload(e.target.files ?? []);
              e.target.value = "";
            }}
          />
        </div>
        {results.length > 0 && (
          <div className="upx-res">
            {results.map((r) => (
              <div key={r.name + r.msg} className={r.ok ? "ok" : "bad"}>
                {r.ok ? "✓" : "✗"} {r.name} — {r.msg}
              </div>
            ))}
            <div className="upx-after">
              قول للوكيل في الشات: «شوف المرفقات» — وهيلاقيها فورًا.
            </div>
          </div>
        )}
        {files.length > 0 && (
          <div className="upx-files">
            {files.map((f) => (
              <div key={f.name} className="upx-file">
                <span>{f.name}</span>
                <span className="sz">
                  {fmtSize(f.size)} · {fmtTime(f.mtime)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="upx-foot">
        القناة دي معمولة عشان قناة الشات بتوصل اسم الملف بس من غير محتواه —
        هنا البايتس بتوصل فعلًا لسيرفر الأب.
      </div>
    </div>
  );
}
