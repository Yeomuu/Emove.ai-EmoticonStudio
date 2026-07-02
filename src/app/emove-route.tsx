import { EmoveClient } from "@/components/EmoveClient";
import type { RoutePath } from "@/types";

export function EmoveRoute({ path }: Readonly<{ path: RoutePath }>) {
  return <EmoveClient initialPath={path} />;
}
