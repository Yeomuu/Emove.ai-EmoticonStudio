import { signal } from "@preact/signals";
import type { RoutePath } from "./types";

const allowed = new Set(["/home", "/character", "/input", "/edit", "/library"]);

export function normalizePath(pathname: string): RoutePath {
  const clean = `/${pathname.split(/[?#]/)[0].split("/").filter(Boolean).join("/")}`;
  if (clean === "/" || clean === "") return "/home";
  if (allowed.has(clean) || clean.startsWith("/library/")) return clean as RoutePath;
  return "/home";
}

const initialPath = typeof window === "undefined" ? "/home" : window.location.pathname;
export const route = signal<RoutePath>(normalizePath(initialPath));

export function navigate(path: RoutePath, replace = false): void {
  const next = normalizePath(path);
  if (typeof window === "undefined") {
    route.value = next;
    return;
  }
  window.history[replace ? "replaceState" : "pushState"]({}, "", next);
  route.value = next;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    route.value = normalizePath(window.location.pathname);
  });
}

export function installDocumentLinkHandler(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const handler = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-route]");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    navigate(normalizePath(anchor.pathname));
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}
