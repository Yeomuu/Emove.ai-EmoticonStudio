"use client";

import { usePathname } from "next/navigation";
import { PageTransitionLink } from "./PageTransitionLink";

const navItems = [
  { href: "/", index: "00", ko: "기술", label: "Lab" },
  { href: "/home", index: "01", ko: "홈", label: "Home" },
  { href: "/character", index: "02", ko: "캐릭터", label: "Character" },
  { href: "/input", index: "03", ko: "입력", label: "Input" },
  { href: "/edit", index: "04", ko: "편집", label: "Edit" },
  { href: "/library", index: "05", ko: "보관함", label: "Library" },
  { href: "/pipeline", index: "06", ko: "파이프라인", label: "Pipeline" },
  { href: "/preview", index: "07", ko: "전환", label: "Preview" },
] as const;

export function LabChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <main className="site-shell">
      <nav className="topbar glass-panel" aria-label="Primary">
        <PageTransitionLink className="brand" href="/home">
          <img src="/assets/logo-mark.png" alt="" />
          <span>
            <strong>emove studio</strong>
            <small>Next feasibility lab</small>
          </span>
        </PageTransitionLink>
        <div className="nav-pills" aria-label="Sections">
          {navItems.map(({ href, index, ko, label }) => {
            const isActive = href === "/library" ? pathname.startsWith("/library") : pathname === href;

            return (
              <PageTransitionLink aria-current={isActive ? "page" : undefined} href={href} key={href}>
                <span className="nav-index">{index}</span>
                <span className="nav-copy">
                  <span>{ko}</span>
                  <strong>{label}</strong>
                </span>
              </PageTransitionLink>
            );
          })}
        </div>
      </nav>
      <div className="page-reveal" data-pathname={pathname}>
        {children}
      </div>
    </main>
  );
}
