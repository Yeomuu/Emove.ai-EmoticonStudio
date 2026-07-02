import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "./ui/button";
import { imageAssets } from "../data";
import { navigate, route } from "../router";
import { toast } from "../store";
import type { RoutePath } from "../types";

const navItems: Array<{ label: string; path: RoutePath }> = [
  { label: "Character", path: "/character" },
  { label: "Input", path: "/input" },
  { label: "Edit", path: "/edit" },
  { label: "Library", path: "/library" },
];

type ThemeMode = "dark" | "light";

export function Shell({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const current = route.value;
  const selectedIndex = navItems.findIndex((item) => current === item.path || (item.path === "/library" && current.startsWith("/library")));

  useEffect(() => {
    const saved = window.localStorage.getItem("emove-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("emove-theme", theme);
  }, [theme]);

  const navStyle = { "--nav-index": Math.max(0, selectedIndex) } as CSSProperties;

  return (
    <div className={`app-shell ${immersive ? "is-immersive" : ""}`}>
      <header className="topbar" aria-label="주요 메뉴">
        <nav className="primary-nav" style={navStyle}>
          {selectedIndex >= 0 ? <span className="nav-selection" aria-hidden="true" /> : null}
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              data-route
              className={current === item.path || (item.path === "/library" && current.startsWith("/library")) ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button className="brand" type="button" onClick={() => navigate("/home")} aria-label="EMOVE 홈">
          <img src={imageAssets.logo} alt="" />
        </button>
        <div className="topbar-actions">
          <Button
            className="theme-toggle"
            variant="glass"
            size="sm"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`}
          >
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </Button>
          <button className="profile-button" type="button" onClick={() => navigate("/library")} aria-label="마이페이지">
            <img src={imageAssets.detailProfile} alt="" />
          </button>
        </div>
      </header>
      <main>{children}</main>
      {toast.value ? <div className="toast" role="status">{toast.value}</div> : null}
    </div>
  );
}

export function Panel({ title, meta, children, className = "" }: { title?: string; meta?: string; children: ReactNode; className?: string }) {
  return <section className={`panel glass-panel ${className}`}>{title || meta ? <header className="panel-header">{title ? <h2>{title}</h2> : <span />}{meta ? <span>{meta}</span> : null}</header> : null}{children}</section>;
}
