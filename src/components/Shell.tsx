import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "./ui/button";
import { imageAssets } from "../data";
import { navigate, route } from "../router";
import { toast } from "../store";
import type { RoutePath } from "../types";

const navItems: Array<{ label: string; path: RoutePath }> = [
  { label: "HOME", path: "/home" },
  { label: "CHARACTER", path: "/character" },
  { label: "EMOTICON", path: "/input" },
];

type ThemeMode = "dark" | "light";

export function Shell({ children, immersive = false, dockAutoHide = false }: { children: ReactNode; immersive?: boolean; dockAutoHide?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [dockVisible, setDockVisible] = useState(!dockAutoHide);
  const closeTimer = useRef<number | undefined>(undefined);
  const current = route.value;
  const selectedIndex = current === "/home" ? -1 : navItems.findIndex((item) => current === item.path);

  useEffect(() => {
    const saved = window.localStorage.getItem("emove-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("emove-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    setDockVisible(!dockAutoHide);
    return () => window.clearTimeout(closeTimer.current);
  }, [dockAutoHide, current]);

  const revealDock = () => {
    window.clearTimeout(closeTimer.current);
    setDockVisible(true);
  };

  const scheduleDockHide = () => {
    if (!dockAutoHide) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setDockVisible(false), 1800);
  };

  const navStyle = { "--nav-index": Math.max(0, selectedIndex) } as CSSProperties;

  return (
    <div className={`app-shell ${immersive ? "is-immersive" : ""} ${dockAutoHide ? "has-auto-hide-dock" : ""}`}>
      <main>{children}</main>
      <div className="nav-hover-zone" aria-hidden="true" onPointerEnter={revealDock} />
      <header
        className={`bottom-dock ${dockAutoHide ? "is-work-mode" : ""} ${dockVisible ? "is-visible" : "is-hidden"}`}
        aria-label="주요 메뉴"
        onPointerEnter={revealDock}
        onPointerLeave={scheduleDockHide}
      >
        <nav className="primary-nav" style={navStyle}>
          {selectedIndex >= 0 ? <span className="nav-selection" aria-hidden="true" /> : null}
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              data-route
              className={current === item.path && item.path !== "/home" ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
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
      {toast.value ? <div className="toast" role="status">{toast.value}</div> : null}
    </div>
  );
}

export function Panel({ title, meta, children, className = "" }: { title?: string; meta?: string; children: ReactNode; className?: string }) {
  return <section className={`panel glass-panel ${className}`}>{title || meta ? <header className="panel-header">{title ? <h2>{title}</h2> : <span />}{meta ? <span>{meta}</span> : null}</header> : null}{children}</section>;
}
