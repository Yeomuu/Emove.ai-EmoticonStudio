import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMOVE Studio",
  description: "Next.js 기반 이모티콘 제작 스튜디오",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
