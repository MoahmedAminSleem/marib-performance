import type { Metadata, Viewport } from "next";
import "./marib-app.css";

export const metadata: Metadata = {
  title: "marib international garment",
  description:
    "لوحة أداء مصنع مأرب — النسخة الأونلاين: قاعدة بيانات PostgreSQL مشتركة، تسجيل دخول آمن، وأرشيف شهري كامل.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
