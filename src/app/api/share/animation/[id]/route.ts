import { handleSharedAnimationGet } from "../../../../../../server/share-assets";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return handleSharedAnimationGet(id, new URL(request.url).searchParams.get("download") === "1");
}
