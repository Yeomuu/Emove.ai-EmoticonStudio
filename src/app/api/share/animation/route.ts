import { handleSharedAnimationOptions, handleSharedAnimationPost } from "../../../../../server/share-assets";

export const runtime = "nodejs";

export async function OPTIONS(): Promise<Response> {
  return handleSharedAnimationOptions();
}

export async function POST(request: Request): Promise<Response> {
  return handleSharedAnimationPost(request, "animation");
}
