"use client";

import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { Shell } from "./components/Shell";
import { HomePage } from "./screens/Home";
import { route } from "./router";
import { loadRemoteCharacters } from "./services/remote-store";
import { characters } from "./store";
import { useSignalSnapshot } from "./lib/signals";
import { imageAssets } from "./data";
import type { RoutePath } from "./types";

const loadCharacterPage = () => import("./screens/Character").then((module) => ({ default: module.CharacterPage }));
const loadInputPage = () => import("./screens/Input").then((module) => ({ default: module.InputPage }));
const loadEditPage = () => import("./screens/Edit").then((module) => ({ default: module.EditPage }));
const loadLibraryPage = () => import("./screens/Library").then((module) => ({ default: module.LibraryPage }));

const CharacterPage = lazy(loadCharacterPage);
const InputPage = lazy(loadInputPage);
const EditPage = lazy(loadEditPage);
const LibraryPage = lazy(loadLibraryPage);

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
  const [activeRoute, setActiveRoute] = useState<RoutePath>(() => initialPath ?? route.value);
  const [routePhase, setRoutePhase] = useState<"idle" | "covering" | "revealing">("idle");
  const [routeProgress, setRouteProgress] = useState(0);

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
    loadRemoteCharacters().then((remote) => {
      if (!remote.enabled) return;
      const saved = remote.characters;
      const known = new Set(characters.value.map((item) => item.id));
      characters.value = [...saved.filter((item) => !known.has(item.id)), ...characters.value];
    }).catch(() => undefined);
  }, []);

  // Keep Next.js route props and the client route signal in sync. Active route
  // changes stay inside the curtain transition below so its timers cannot be
  // bypassed by browser back/forward navigation.
  useEffect(() => {
    if (initialPath && route.value !== initialPath) {
      route.value = initialPath;
    }
  }, [initialPath]);

  const timersRef = useRef<number[]>([]);
  const transitionIdRef = useRef(0);

  // Keep the curtain covered until the next route's client bundle is ready.
  useEffect(() => {
    if (route.value === activeRoute) return;

    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    const transitionId = ++transitionIdRef.current;
    const nextRoute = route.value;

    setRoutePhase("covering");
    setRouteProgress(12);

    const progressTimer = window.setTimeout(() => setRouteProgress(56), 180);
    timersRef.current = [progressTimer];

    Promise.all([
      preloadRoute(nextRoute),
      delay(420),
    ]).catch(() => undefined).then(() => {
      if (transitionIdRef.current !== transitionId) return;
      setActiveRoute(nextRoute);
      setRouteProgress(100);

      const revealTimer = window.setTimeout(() => setRoutePhase("revealing"), 90);
      const finishTimer = window.setTimeout(() => {
        setRoutePhase("idle");
        setRouteProgress(0);
      }, 470);
      timersRef.current = [revealTimer, finishTimer];
    });
  }, [route.value, activeRoute]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(window.clearTimeout);
    };
  }, []);

  const routeKey = activeRoute.startsWith("/library/") ? "/library/detail" : activeRoute;
  let page = <HomePage />;
  if (activeRoute === "/character") page = <CharacterPage />;
  else if (activeRoute === "/input") page = <InputPage />;
  else if (activeRoute === "/edit") page = <EditPage />;
  else if (activeRoute.startsWith("/library")) page = <LibraryPage />;

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
        <Shell immersive={activeRoute === "/home"} currentRoute={activeRoute}>
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

function preloadRoute(path: RoutePath): Promise<unknown> {
  if (path === "/character") return loadCharacterPage();
  if (path === "/input") return loadInputPage();
  if (path === "/edit") return loadEditPage();
  if (path.startsWith("/library")) return loadLibraryPage();
  return Promise.resolve();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
