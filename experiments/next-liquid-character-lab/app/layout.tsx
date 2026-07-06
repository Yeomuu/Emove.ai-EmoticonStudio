import type { Metadata } from "next";
import { LabChrome } from "../components/LabChrome";
import { TransitionProvider } from "../components/TransitionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMOVE Interaction Lab",
  description: "A Next.js feasibility lab for liquid glass and character physics interactions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <TransitionProvider>
          <LabChrome>{children}</LabChrome>
        </TransitionProvider>
      </body>
    </html>
  );
}
