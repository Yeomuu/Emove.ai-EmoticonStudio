import { EmoveRoute } from "../../emove-route";
import type { RoutePath } from "@/types";

export default async function LibraryDetailRoutePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <EmoveRoute path={`/library/${id}` as RoutePath} />;
}
