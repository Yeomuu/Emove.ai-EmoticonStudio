import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "../styles/final-reference.css";

export const metadata: Metadata = {
  title: "EMOVE Studio",
  description: "Next.js 기반 이모티콘 제작 스튜디오",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EMOVE",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070711" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const value=localStorage.getItem("emove-theme");if(value==="light"||value==="dark"){document.documentElement.dataset.theme=value;document.documentElement.style.colorScheme=value}}catch{}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
