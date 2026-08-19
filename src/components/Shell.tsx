import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { imageAssets } from "../data";
import { navigate, route } from "../router";
import { blockingSurfaceOpen, toast } from "../store";
import { dockDestinationsForRoute } from "../services/dock-navigation";
import type { RoutePath } from "../types";

export function Shell({ children, immersive = false, currentRoute }: { children: ReactNode; immersive?: boolean; currentRoute?: RoutePath }) {
  const current = currentRoute ?? route.value;
  const dockBlocked = blockingSurfaceOpen.value;
  const dockDestinations = dockDestinationsForRoute(current);

  return (
    <div
      className={`app-shell route-${current.split("/")[1] || "home"} ${immersive ? "is-immersive" : ""}`}
      data-current-route={current}
    >
      <main>{children}</main>
      <nav
        className={`bottom-dock-text-nav route-quick-nav ${dockBlocked ? "is-hidden" : "is-visible"}`}
        aria-label="빠른 이동"
        aria-hidden={dockBlocked ? true : undefined}
        inert={dockBlocked ? true : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {dockDestinations.map((destination) => (
          <a
            key={destination.path}
            href={destination.path}
            data-route
            className={`dock-route-link is-${destination.icon}`}
            aria-label={destination.ariaLabel}
            onClick={(event) => {
              event.preventDefault();
              navigate(destination.path);
            }}
          >
            <span className="dock-route-icon" aria-hidden="true">
              {destination.icon === "home"
                ? <img className="dock-route-logo" src={imageAssets.logo} alt="" />
                : <Icon name="folder" className="dock-library-glyph" size={19} />}
            </span>
            <span>{destination.label}</span>
          </a>
        ))}
      </nav>
      {toast.value ? <div className="toast" role="status">{toast.value}</div> : null}
    </div>
  );
}

export function Panel({ title, meta, children, className = "" }: { title?: string; meta?: string; children: ReactNode; className?: string }) {
  return <section className={`panel glass-panel ${className}`}>{title || meta ? <header className="panel-header">{title ? <h2>{title}</h2> : <span />}{meta ? <span>{meta}</span> : null}</header> : null}{children}</section>;
}
