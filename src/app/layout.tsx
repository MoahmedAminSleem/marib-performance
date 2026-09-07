import type { Metadata, Viewport } from "next";
import "./globals.css";

/* Marib Performance — online edition (R23/R24)
   The dashboard is a vanilla-JS denim app served from /public/app and
   mounted by src/app/page.tsx. The layout only carries the shell meta:
   title + favicon + viewport. document.title is then driven dynamically
   by the app itself (login → company name, inside → the open tab). */
export const metadata: Metadata = {
  title: "marib international garments",
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
        <link rel="stylesheet" href="/app/app.css" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}
