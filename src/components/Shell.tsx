import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { imageAssets } from "../data";
import { navigate, route } from "../router";
import { blockingSurfaceOpen, toast } from "../store";
import type { RoutePath } from "../types";

const navItems: Array<{ icon: "layers" | "image"; label: string; path: RoutePath }> = [
  { icon: "layers", label: "캐릭터", path: "/character" },
  { icon: "image", label: "이모티콘", path: "/input" },
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
  const dockBlocked = blockingSurfaceOpen.value;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("emove-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    setDockVisible(dockBlocked ? false : !dockAutoHide);
    return () => {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    };
  }, [dockAutoHide, current, dockBlocked]);

  useEffect(() => {
    if (!dockAutoHide || dockBlocked) return;
    const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)");
    if (coarsePointer.matches) {
      setDockVisible(true);
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      const revealWidth = Math.min(window.innerWidth * .38, 560);
      const inRevealZone = event.clientX >= window.innerWidth - revealWidth && event.clientY >= window.innerHeight - 210;
      if (inRevealZone) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = undefined;
        setDockVisible(true);
      } else if (dockVisible && closeTimer.current === undefined) {
        closeTimer.current = window.setTimeout(() => {
          setDockVisible(false);
          closeTimer.current = undefined;
        }, 1000);
      }
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [dockAutoHide, current, dockVisible, dockBlocked]);

  const revealDock = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    setDockVisible(true);
  };

  const scheduleDockHide = () => {
    if (!dockAutoHide) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setDockVisible(false);
      closeTimer.current = undefined;
    }, 1000);
  };

  return (
    <div
      className={`app-shell route-${current.split("/")[1] || "home"} ${immersive ? "is-immersive" : ""} ${dockAutoHide ? "has-auto-hide-dock" : ""}`}
      data-current-route={current}
    >
      <main>{children}</main>
      {dockAutoHide && !dockBlocked ? <div className="nav-hover-zone" aria-hidden="true" onPointerEnter={revealDock} /> : null}
      <header
        className={`bottom-dock-text-nav ${dockAutoHide ? "is-work-mode" : ""} ${dockVisible ? "is-visible" : "is-hidden"}`}
        aria-label="주요 메뉴"
        aria-hidden={dockBlocked || (dockAutoHide && !dockVisible) ? true : undefined}
        inert={dockBlocked || (dockAutoHide && !dockVisible) ? true : undefined}
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
              <Icon name={item.icon} className="home-nav-glyph" size={22} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="text-nav-actions">
          <button
            className="theme-icon-toggle"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
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
