import type { Metadata, Viewport } from "next";
import "./globals.css";

/* Marib Performance — online edition (R23/R24)
   The dashboard is a vanilla-JS denim app served from /public/app and
   mounted by src/app/page.tsx. The layout only carries the shell meta:
   title + favicon + viewport. document.title is then driven dynamically
   by the app itself (login → company name, inside → the open tab). */
export const metadata: Metadata = {
  /* R25: the app's own updateTitle() drives this dynamically (login →
     company name, inside → the open tab). The STATIC default is the
     Arabic company name — Arabic-first site, and if React's hydration
     restores the head after the vanilla script already set the title,
     it restores the SAME string instead of clobbering it. */
  title: "مأرب العالمية للملابس الجاهزة",
  description:
    "لوحة أداء مصنع مأرب — مأرب العالمية للملابس الجاهزة. مزامنة سحابية مباشرة مع قاعدة بيانات Neon.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.png", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0C1420",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* R48: ?v=r48 — cache-busting: يجبر أي متصفح/CDN على جلب النسخة
            الجديدة بعد أي رفع (المالك كان شايف أيقونات قديمة بسبب الكاش) */}
        <link rel="stylesheet" href="/app/app.css?v=r48" />
        <meta name="color-scheme" content="dark" />
      </head>
      {/* R25: the vanilla app scripts tag <body> with lg-locked (scroll
          lock) while the login screen is up — that happens between SSR
          and hydration, so React would warn on every load. This body is
          React-opaque; the whole dashboard DOM inside is managed by
          /public/app anyway. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
