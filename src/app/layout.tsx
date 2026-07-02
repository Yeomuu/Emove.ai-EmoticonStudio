import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMOVE Studio",
  description: "Next.js 기반 이모티콘 제작 스튜디오",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
