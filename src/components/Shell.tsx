import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { imageAssets } from "../data";
import { navigate, route } from "../router";
import { toast } from "../store";
import type { RoutePath } from "../types";

const navItems: Array<{ label: string; path: RoutePath }> = [
  { label: "캐릭터", path: "/character" },
  { label: "이모티콘", path: "/input" },
];

type ThemeMode = "dark" | "light";

export function Shell({ children, immersive = false, dockAutoHide = false }: { children: ReactNode; immersive?: boolean; dockAutoHide?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("emove-theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  const [dockVisible, setDockVisible] = useState(!dockAutoHide);
  const closeTimer = useRef<number | undefined>(undefined);
  const current = route.value;

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
    closeTimer.current = window.setTimeout(() => setDockVisible(false), 1000);
  };

  return (
    <div
      className={`app-shell route-${current.split("/")[1] || "home"} ${immersive ? "is-immersive" : ""} ${dockAutoHide ? "has-auto-hide-dock" : ""}`}
      data-current-route={current}
    >
      <main>{children}</main>
      <div className="nav-hover-zone" aria-hidden="true" onPointerEnter={revealDock} />
      <header
        className={`bottom-dock-text-nav ${dockAutoHide ? "is-work-mode" : ""} ${dockVisible ? "is-visible" : "is-hidden"}`}
        aria-label="주요 메뉴"
        onPointerEnter={revealDock}
        onPointerLeave={scheduleDockHide}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="dock-home-logo" type="button" onClick={() => navigate("/home")} aria-label="EMOVE 홈으로 이동">
          <img src={imageAssets.logo} alt="" />
        </button>
        <nav className="text-nav-bar">
          {navItems.map((item) => (
            <a
              key={item.path}
              href={item.path}
              data-route
              className={current === item.path ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="text-nav-actions">
          <button className="showcase-icon-btn" type="button" onClick={() => navigate("/showcase")} aria-label="움직이는 이모티콘 쇼케이스">
            <Icon name="play" size={16} />
          </button>
          <button
            className="theme-icon-toggle"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
          <button
            className={`profile-icon-btn ${current.startsWith("/library") ? "active" : ""}`}
            type="button"
            onClick={() => navigate("/library")}
            aria-label="마이페이지 보관함"
          >
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
