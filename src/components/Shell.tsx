import type { ComponentChildren } from "preact";
import { imageAssets } from "../data";
import { navigate, route } from "../router";
import { dismissToast, toast } from "../store";
import type { RoutePath } from "../types";

const navItems: Array<{ label: string; path: RoutePath }> = [
  { label: "Character", path: "/character" }, { label: "Input", path: "/input" }, { label: "Edit", path: "/edit" }, { label: "Library", path: "/library" },
];

export function Shell({ children, immersive = false }: { children: ComponentChildren; immersive?: boolean }) {
  const current = route.value;
  const selectedIndex = navItems.findIndex((item) => current === item.path || (item.path === "/library" && current.startsWith("/library")));
  return (
    <div class={`app-shell ${immersive ? "is-immersive" : ""}`}>
      <header class="topbar" aria-label="주요 메뉴">
        <button class="brand" type="button" onClick={() => navigate("/home")} aria-label="EMOVE 홈"><img src={imageAssets.logo} alt="" /></button>
        <nav class="primary-nav" style={{ "--nav-index": Math.max(0, selectedIndex) }}>
          {selectedIndex >= 0 ? <span class="nav-selection" aria-hidden="true" /> : null}
          {navItems.map((item) => <a href={item.path} data-route class={current === item.path || (item.path === "/library" && current.startsWith("/library")) ? "active" : ""}>{item.label}</a>)}
        </nav>
        <button class="profile-button" type="button" onClick={() => navigate("/library")} aria-label="마이페이지"><img src={imageAssets.detailProfile} alt="" /></button>
      </header>
      <main>{children}</main>
      {toast.value ? (
        <div class={`toast ${toast.value.tone === "error" ? "is-error" : ""}`} role={toast.value.tone === "error" ? "alert" : "status"}>
          <span class="toast-message">{toast.value.message}</span>
          {toast.value.tone === "error" ? <button type="button" class="toast-close" onClick={dismissToast} aria-label="알림 닫기">×</button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Panel({ title, meta, children, class: className = "" }: { title?: string; meta?: string; children: ComponentChildren; class?: string }) {
  return <section class={`panel glass-panel ${className}`}>{title || meta ? <header class="panel-header">{title ? <h2>{title}</h2> : <span />}{meta ? <span>{meta}</span> : null}</header> : null}{children}</section>;
}
