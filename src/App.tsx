"use client";

import { lazy, Suspense, useEffect } from "react";
import { Shell } from "./components/Shell";
import { HomePage } from "./screens/Home";
import { route } from "./router";
import { loadCharacters } from "./services/repository";
import { characters } from "./store";
import { useSignalSnapshot } from "./lib/signals";
import type { RoutePath } from "./types";

const CharacterPage = lazy(() => import("./screens/Character").then((module) => ({ default: module.CharacterPage })));
const InputPage = lazy(() => import("./screens/Input").then((module) => ({ default: module.InputPage })));
const EditPage = lazy(() => import("./screens/Edit").then((module) => ({ default: module.EditPage })));
const LibraryPage = lazy(() => import("./screens/Library").then((module) => ({ default: module.LibraryPage })));

export function App({ initialPath }: { initialPath?: RoutePath }) {
  useSignalSnapshot();

  useEffect(() => {
    loadCharacters().then((saved) => {
      const known = new Set(characters.value.map((item) => item.id));
      characters.value = [...saved.filter((item) => !known.has(item.id)), ...characters.value];
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initialPath && route.value !== initialPath) route.value = initialPath;
  }, [initialPath]);

  const path = route.value;
  const routeKey = path.startsWith("/library/") ? "/library/detail" : path;
  const workRoutes = path === "/character" || path === "/input" || path === "/edit";
  let page = <HomePage />;
  if (path === "/character") page = <CharacterPage />;
  else if (path === "/input") page = <InputPage />;
  else if (path === "/edit") page = <EditPage />;
  else if (path.startsWith("/library")) page = <LibraryPage />;
  return (
    <Shell immersive={path === "/home"} dockAutoHide={workRoutes}>
      <Suspense fallback={<div className="route-loader" role="status"><span />화면을 불러오는 중</div>}>
        <div className="route-slide-frame" key={routeKey} data-route-frame={routeKey.replace("/", "") || "home"}>
          {page}
        </div>
      </Suspense>
    </Shell>
  );
}
