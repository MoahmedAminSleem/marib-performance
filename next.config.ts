import type { NextConfig } from "next";

// ─────────────────────────────────────────────────────────────
// Marib Performance — الجولة 28: Security Headers
// طبقة حماية HTTP كاملة: headers بتتبعت مع كل response.
// ملف إعدادات بس — لا يلمس الداتا ولا قاعدة Neon ولا اليوزرات.
// ─────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";

// CSP: كل موارد الموقع من نفس الأصل (مفيش أي CDN خارجي في اللوحة).
// 'unsafe-inline' للسكريبت: Next.js بيحقن سكريبتات hydration inline.
// 'unsafe-eval' مطلوبة في التشغيل المحلي بس (dev server + HMR)
// وفي الإنتاج (Vercel) بنشيلها تلقائيًا — حماية أشد.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // كل نداءات الـ API نفسية الأصل (/api/*) —
  // رابط Neon بيستخدمه السيرفر بس، مش المتصفح
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },

  // HTTPS إجباري لمدة سنتين — Vercel شغال بـ HTTPS أصلًا
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },

  // منع المتصفح يخمّن نوع الملف
  { key: "X-Content-Type-Options", value: "nosniff" },

  // منع تضمين الموقع في iframe برة الموقع (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },

  // المتصفح يبعت أصل الموقع بس للمواقع الخارجية
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // قفل الكاميرا/المايك/الموقع الجغرافي/الدفع — اللوحة مش محتاجاهم
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
  },

  // إخفاء تفاصيل التقنية (اسم السيرفر/النسخة)
  { key: "X-Powered-By", value: "" },

  // عزل النوافذ عن أي موقع تاني يفتحها
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /* pg (Neon, production) + PGlite (local dev WASM Postgres) must stay
     external so the bundler never tries to inline the driver/wasm */
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  /* the sandbox preview proxy talks to the dev server cross-origin */
  allowedDevOrigins: ["*.space-z.ai"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      /* R57 (perf): أصول الواجهة الثابتة (11 سكريبت + app.css ≈660KB)
         كانت بتتنزّل/تتحقق في كل زيارة — Next بيخدم ملفات public بـ
         max-age=0 فالمتصفح بيعمل رحلة تحقق لكل ملف (12 رحلة للصفحة).
         الملفات دي بتتغير بس عبر ?v=rXX (cache-busting ثابت من R48)
         فالتخزين الدائم immutable آمن: أي تحديث = URL جديد. النتيجة:
         الزيارة المتكررة = صفر تنزيل للواجهة كلها. xlsx.full.min.js
         كمان (932KB) — بعد أول استيراد بيبقى في الكاش للأبد. */
      {
        source: "/app/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
