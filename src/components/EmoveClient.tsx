"use client";

import { useEffect, useRef } from "react";
import { App } from "../App";
import { normalizePath, route } from "../router";
import type { RoutePath } from "../types";

export function EmoveClient({ initialPath }: Readonly<{ initialPath: RoutePath }>) {
  const seeded = useRef(false);
  const normalized = normalizePath(initialPath);
  if (!seeded.current) {
    route.value = normalized;
    seeded.current = true;
  }

  useEffect(() => {
    const currentPath = normalizePath(window.location.pathname);
    if (route.value !== currentPath) route.value = currentPath;
  }, []);

  return <App initialPath={normalized} />;
}
