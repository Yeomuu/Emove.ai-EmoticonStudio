import { downloadGcsAsset } from "../../../../../server/gcs-storage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const objectName = new URL(request.url).searchParams.get("path") || "";
  try {
    const asset = await downloadGcsAsset(objectName);
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": "inline",
        "Content-Type": asset.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "이미지를 불러오지 못했습니다." },
      { status: 404 },
    );
  }
}
