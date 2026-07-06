"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type TransitionContextValue = {
  startRouteTransition: (navigate: () => void) => void;
};
type RoutePhase = "idle" | "covering" | "revealing";

const TransitionContext = createContext<TransitionContextValue | null>(null);
const BOOT_ASSETS = [
  "/assets/logo-mark.png",
  "/assets/character-main.webp",
  "/assets/input-character.webp",
  "/assets/edit-character.webp",
  "/assets/home-ecosystem.webp",
] as const;

export function TransitionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [mounted, setMounted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootLabel, setBootLabel] = useState("Checking assets");
  const [booting, setBooting] = useState(true);
  const [routeProgress, setRouteProgress] = useState(0);
  const [routePhase, setRoutePhase] = useState<RoutePhase>("idle");
  const routeTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const minimumVisibleMs = 680;
    const startedAt = performance.now();
    const tasks: Array<{ label: string; run: () => Promise<void> }> = [
      ...BOOT_ASSETS.map((asset) => ({ label: asset.split("/").pop() ?? asset, run: () => preloadImage(asset) })),
      { label: "fonts", run: () => document.fonts.ready.then(() => undefined) },
    ];
    let completed = 0;
    const markDone = (label: string) => {
      completed += 1;
      if (cancelled) return;
      setBootLabel(label);
      setBootProgress(Math.round(completed / tasks.length * 100));
    };
    Promise.all(tasks.map((task) => task.run().catch(() => undefined).then(() => markDone(task.label)))).then(() => {
      const elapsed = performance.now() - startedAt;
      window.setTimeout(() => {
        if (!cancelled) setBooting(false);
      }, Math.max(0, minimumVisibleMs - elapsed));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startRouteTransition = useCallback((navigate: () => void) => {
    if (routeTimer.current) window.clearTimeout(routeTimer.current);
    setRoutePhase("covering");
    setRouteProgress(12);
    window.setTimeout(() => setRouteProgress(56), 180);
    window.setTimeout(navigate, 420);
    window.setTimeout(() => setRouteProgress(100), 690);
    window.setTimeout(() => setRoutePhase("revealing"), 780);
    routeTimer.current = window.setTimeout(() => {
      setRoutePhase("idle");
      setRouteProgress(0);
      routeTimer.current = null;
    }, 1160);
  }, []);

  const value = useMemo(() => ({ startRouteTransition }), [startRouteTransition]);
  const routeBusy = routePhase !== "idle";

  return (
    <TransitionContext.Provider value={value}>
      {children}
      {mounted ? (
        <>
          <div className={`boot-loader${booting ? " is-active" : ""}`} aria-hidden={!booting}>
            <div className="loader-mark">
              <img src="/assets/logo-mark.png" alt="" />
              <span>EMOVE LAB</span>
              <small>Measured preload: {bootLabel}</small>
            </div>
            <div className="loader-track">
              <span style={{ transform: `scaleX(${bootProgress / 100})` }} />
            </div>
            <strong>{bootProgress.toString().padStart(2, "0")}</strong>
          </div>
          <div className={`route-curtain is-${routePhase}`} aria-hidden={!routeBusy}>
            <div className="route-curtain-sheet">
              <div className="loader-mark route-loader-mark">
                <img src="/assets/logo-mark.png" alt="" />
                <span>EMOVE LAB</span>
                <small>Estimated route transition</small>
              </div>
              <div className="route-loader-line">
                <span style={{ transform: `scaleX(${routeProgress / 100})` }} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </TransitionContext.Provider>
  );
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

export function useLabTransition() {
  const value = useContext(TransitionContext);
  if (!value) throw new Error("useLabTransition must be used inside TransitionProvider.");
  return value;
}
