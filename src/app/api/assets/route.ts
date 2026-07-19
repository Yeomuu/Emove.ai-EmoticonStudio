import {
  firebaseStorageConfigurationError,
  isFirebaseStorageConfigured,
  uploadFirebaseAsset,
  type FirebaseAssetKind,
} from "../../../../server/firebase-storage";
import { isSameOriginRequest } from "../../../../server/request-security";

export const runtime = "nodejs";

const ALLOWED_KINDS = new Set<FirebaseAssetKind>(["animations", "characters", "effects", "frames", "thumbnails"]);
const ALLOWED_TYPES = new Set(["image/apng", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return json(403, { error: "다른 출처에서는 이미지 업로드를 요청할 수 없습니다." });
  if (!isFirebaseStorageConfigured()) return json(501, { error: firebaseStorageConfigurationError() ?? "Firebase Storage가 설정되지 않았습니다." });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].toLowerCase() || "";
  const kind = request.headers.get("x-emove-asset-kind") as FirebaseAssetKind | null;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_ASSET_BYTES) return json(413, { error: "이미지는 최대 12MB까지 저장할 수 있습니다." });
  if (!ALLOWED_TYPES.has(contentType)) return json(415, { error: "PNG, JPEG, WebP, APNG, GIF 이미지만 저장할 수 있습니다." });
  if (!kind || !ALLOWED_KINDS.has(kind)) return json(400, { error: "올바른 이미지 자산 종류가 필요합니다." });
  const data = Buffer.from(await request.arrayBuffer());
  try {
    const asset = await uploadFirebaseAsset(data, {
      contentType,
      fileName: decodeHeader(request.headers.get("x-emove-file-name")) || `emove.${extensionFor(contentType)}`,
      kind,
      requestUrl: request.url,
    });
    return json(201, { enabled: true, ...asset });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Firebase Storage 이미지 저장에 실패했습니다." });
  }
}

function decodeHeader(value: string | null): string {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

function extensionFor(contentType: string): string {
  if (contentType.includes("apng")) return "apng";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg")) return "jpg";
  return "png";
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}
