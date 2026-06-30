import { signal } from "@preact/signals";
import type { RoutePath } from "./types";

const allowed = new Set(["/home", "/character", "/input", "/edit", "/library"]);
const basePath = normalizeBase(import.meta.env.BASE_URL);

function normalizeBase(value: string): string {
  if (!value || value === "./") return "/";
  const withSlashes = value.startsWith("/") ? value : `/${value}`;
  return withSlashes.endsWith("/") ? withSlashes : `${withSlashes}/`;
}

function stripBase(pathname: string): string {
  if (basePath === "/") return pathname;
  const base = basePath.slice(0, -1);
  return pathname === base || pathname.startsWith(`${base}/`) ? pathname.slice(base.length) || "/" : pathname;
}

function withBase(path: RoutePath): string {
  if (basePath === "/") return path;
  return `${basePath.slice(0, -1)}${path}`;
}

export function normalizePath(pathname: string): RoutePath {
  const clean = `/${stripBase(pathname).split(/[?#]/)[0].split("/").filter(Boolean).join("/")}`;
  if (clean === "/" || clean === "") return "/home";
  if (allowed.has(clean) || clean.startsWith("/library/")) return clean as RoutePath;
  return "/home";
}

const initialPath = typeof window === "undefined" ? "/home" : stripBase(window.location.pathname);
export const route = signal<RoutePath>(normalizePath(initialPath));

export function navigate(path: RoutePath, replace = false): void {
  const next = normalizePath(path);
  if (typeof window === "undefined") {
    route.value = next;
    return;
  }
  window.history[replace ? "replaceState" : "pushState"]({}, "", withBase(next));
  route.value = next;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    route.value = normalizePath(stripBase(window.location.pathname));
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
