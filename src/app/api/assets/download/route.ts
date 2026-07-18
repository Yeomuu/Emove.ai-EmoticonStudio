import { downloadGcsAsset } from "../../../../../server/gcs-storage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const objectName = url.searchParams.get("path") || "";
  const fileName = safeDownloadName(url.searchParams.get("name") || objectName.split("/").pop() || "emove.png");
  try {
    const asset = await downloadGcsAsset(objectName);
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="emove-download"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": asset.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "이미지를 다운로드하지 못했습니다." }, { status: 404 });
  }
}

function safeDownloadName(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 120) || "emove.png";
}
