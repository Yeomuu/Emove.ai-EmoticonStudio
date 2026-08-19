import type { RoutePath } from "../types";

export interface DockDestination {
  path: "/home" | "/library";
  label: "홈" | "라이브러리";
  ariaLabel: string;
  icon: "home" | "library";
}

const HOME_DESTINATION: DockDestination = {
  path: "/home",
  label: "홈",
  ariaLabel: "홈으로 이동",
  icon: "home",
};

const LIBRARY_DESTINATION: DockDestination = {
  path: "/library",
  label: "라이브러리",
  ariaLabel: "이모티콘 보관함으로 이동",
  icon: "library",
};

const HOME_ONLY = [HOME_DESTINATION] as const;
const LIBRARY_ONLY = [LIBRARY_DESTINATION] as const;
const WORKSPACE_DESTINATIONS = [HOME_DESTINATION, LIBRARY_DESTINATION] as const;

export function dockDestinationsForRoute(current: RoutePath): readonly DockDestination[] {
  if (current.startsWith("/library")) return HOME_ONLY;
  if (current === "/character" || current === "/input" || current === "/edit") {
    return WORKSPACE_DESTINATIONS;
  }
  return LIBRARY_ONLY;
}
