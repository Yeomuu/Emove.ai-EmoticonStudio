import { handleSharedAnimationOptions, handleSharedAnimationPost } from "../../../../../server/share-assets";

export const runtime = "nodejs";

export async function OPTIONS(request: Request): Promise<Response> {
  return handleSharedAnimationOptions(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleSharedAnimationPost(request, "gif");
}
