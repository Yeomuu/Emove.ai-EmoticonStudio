"use client";

import { lazy, Suspense, useEffect, useState, useRef, useTransition } from "react";
import { Shell } from "./components/Shell";
import { HomePage } from "./screens/Home";
import { route } from "./router";
import { loadCharacters } from "./services/repository";
import { characters } from "./store";
import { useSignalSnapshot } from "./lib/signals";
import { imageAssets } from "./data";
import type { RoutePath } from "./types";

const CharacterPage = lazy(() => import("./screens/Character").then((module) => ({ default: module.CharacterPage })));
const InputPage = lazy(() => import("./screens/Input").then((module) => ({ default: module.InputPage })));
const EditPage = lazy(() => import("./screens/Edit").then((module) => ({ default: module.EditPage })));
const LibraryPage = lazy(() => import("./screens/Library").then((module) => ({ default: module.LibraryPage })));

const BOOT_ASSETS = [
  imageAssets.logo,
  imageAssets.character,
  imageAssets.pose,
  imageAssets.inputCharacter,
  imageAssets.editCharacterSheet,
  imageAssets.editThumb,
  imageAssets.detailProfile,
  imageAssets.detailSticker,
] as const;

export function App({ initialPath }: { initialPath?: RoutePath }) {
  useSignalSnapshot();

  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootLabel, setBootLabel] = useState("Checking assets");
  const [activeRoute, setActiveRoute] = useState<RoutePath>("/home");
  const [routePhase, setRoutePhase] = useState<"idle" | "covering" | "revealing">("idle");
  const [routeProgress, setRouteProgress] = useState(0);
  const routeTimer = useRef<number | null>(null);

  // Asset preloading on boot
  useEffect(() => {
    let cancelled = false;
    const minimumVisibleMs = 800;
    const startedAt = performance.now();
    
    const tasks = [
      ...BOOT_ASSETS.map((asset) => ({
        label: typeof asset === "string" ? asset.split("/").pop() ?? "asset" : "asset",
        run: () => preloadImage(typeof asset === "string" ? asset : "")
      })),
      { label: "fonts", run: () => document.fonts.ready.then(() => undefined) }
    ];

    let completed = 0;
    const markDone = (label: string) => {
      completed += 1;
      if (cancelled) return;
      setBootLabel(label);
      setBootProgress(Math.round((completed / tasks.length) * 100));
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

  // Load characters on mount
  useEffect(() => {
    loadCharacters().then((saved) => {
      const known = new Set(characters.value.map((item) => item.id));
      characters.value = [...saved.filter((item) => !known.has(item.id)), ...characters.value];
    }).catch(() => undefined);
  }, []);

  // Sync initial path
  useEffect(() => {
    if (initialPath && route.value !== initialPath) {
      route.value = initialPath;
      setActiveRoute(initialPath);
    }
  }, [initialPath]);

  const timersRef = useRef<number[]>([]);

  // Page/route transition animation: rising curtain with EMOVE logo
  useEffect(() => {
    if (route.value !== activeRoute) {
      // Clear any pending transition timers
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];

      setRoutePhase("covering");
      setRouteProgress(12);

      const t1 = window.setTimeout(() => setRouteProgress(56), 180);
      const t2 = window.setTimeout(() => {
        setActiveRoute(route.value);
      }, 420);
      const t3 = window.setTimeout(() => setRouteProgress(100), 690);
      const t4 = window.setTimeout(() => setRoutePhase("revealing"), 780);
      const t5 = window.setTimeout(() => {
        setRoutePhase("idle");
        setRouteProgress(0);
      }, 1160);

      timersRef.current = [t1, t2, t3, t4, t5];
    }
  }, [route.value, activeRoute]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(window.clearTimeout);
    };
  }, []);

  const routeKey = activeRoute.startsWith("/mypage/") ? "/mypage/detail" : activeRoute;
  const workRoutes = activeRoute === "/character" || activeRoute === "/emoticon" || activeRoute === "/emoticon/edit";

  let page = <HomePage />;
  if (activeRoute === "/character") page = <CharacterPage />;
  else if (activeRoute === "/emoticon") page = <InputPage />;
  else if (activeRoute === "/emoticon/edit") page = <EditPage />;
  else if (activeRoute.startsWith("/mypage")) page = <LibraryPage />;

  const routeBusy = routePhase !== "idle";

  return (
    <>
      {/* Boot loader screen */}
      <div className={`boot-loader${booting ? " is-active" : ""}`} aria-hidden={!booting}>
        <div className="loader-mark">
          <img src={imageAssets.logo} alt="EMOVE Logo" />
          <span>EMOVE STUDIO</span>
          <small>Loading assets: {bootLabel}</small>
        </div>
        <div className="loader-track">
          <span style={{ transform: `scaleX(${bootProgress / 100})`, transition: "transform 0.2s ease" }} />
        </div>
        <strong>{bootProgress}</strong>
      </div>

      {/* Page transition curtain */}
      <div className={`route-curtain is-${routePhase}`} aria-hidden={!routeBusy}>
        <div className="route-curtain-sheet">
          <div className="loader-mark route-loader-mark">
            <img src={imageAssets.logo} alt="EMOVE Logo" />
            <span>EMOVE STUDIO</span>
            <small>Preparing layout...</small>
          </div>
          <div className="route-loader-line">
            <span style={{ transform: `scaleX(${routeProgress / 100})`, transition: "transform 0.2s ease" }} />
          </div>
        </div>
      </div>

      {!booting && (
        <Shell immersive={activeRoute === "/home"} dockAutoHide={workRoutes}>
          <Suspense fallback={<div className="route-loader" role="status"><span />화면을 불러오는 중</div>}>
            <div className="route-slide-frame" key={routeKey} data-route-frame={routeKey.replace("/", "") || "home"}>
              {page}
            </div>
          </Suspense>
        </Shell>
      )}
    </>
  );
}

function preloadImage(src: string): Promise<void> {
  if (!src) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}
