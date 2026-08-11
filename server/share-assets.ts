import { isFirebaseStorageConfigured, uploadFirebaseAsset } from "./firebase-storage";
import { isSameOriginRequest } from "./request-security";

type ShareFormat = "APNG" | "GIF" | "WEBP";

type ShareSpec = {
  format: ShareFormat;
  extension: "apng" | "gif" | "webp";
  contentType: "image/apng" | "image/gif" | "image/webp";
};

const MAX_ANIMATION_BYTES = 5_750_000;
const SPECS: Record<ShareFormat, ShareSpec> = {
  APNG: { format: "APNG", extension: "apng", contentType: "image/apng" },
  GIF: { format: "GIF", extension: "gif", contentType: "image/gif" },
  WEBP: { format: "WEBP", extension: "webp", contentType: "image/webp" },
};

export async function handleSharedAnimationPost(request: Request, routeName = "animation"): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return json(403, { error: "다른 출처에서는 애니메이션 공유 파일을 저장할 수 없습니다." });
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const spec = specFromContentType(contentType) ?? specFromFileName(request.headers.get("x-emove-file-name")) ?? SPECS.APNG;
  if (!contentType.includes(spec.contentType)) {
    return json(415, { error: "APNG, GIF, WebP 애니메이션 파일만 공유 링크로 저장할 수 있습니다." });
  }

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json(400, { error: "저장할 애니메이션 데이터가 비어 있습니다." });
  if (data.byteLength > MAX_ANIMATION_BYTES) {
    return json(413, { error: `공유 링크로 저장하기에는 파일이 너무 큽니다. 최대 ${formatBytes(MAX_ANIMATION_BYTES)}까지 지원합니다.` });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const fileName = safeDownloadName(headerValue(request, "x-emove-file-name", `emove-${id}.${spec.extension}`), spec.extension);

  if (!isFirebaseStorageConfigured()) {
    return json(501, { error: "Firebase Storage가 설정되지 않아 애니메이션을 저장할 수 없습니다. 설정을 확인한 뒤 저장 버튼을 다시 눌러 주세요." });
  }
  const asset = await uploadFirebaseAsset(Buffer.from(data), {
    contentType: spec.contentType,
    fileName,
    kind: "animations",
    requestUrl: request.url,
  });
  return json(201, { id, url: asset.url, downloadUrl: asset.downloadUrl, path: asset.path, size: asset.size, createdAt, format: spec.format, mimeType: spec.contentType, extension: spec.extension });
}

export async function handleSharedAnimationGet(_id: string, _download = false): Promise<Response> {
  return json(410, { error: "이전 메모리 공유 링크는 더 이상 지원하지 않습니다. Firebase Storage 다운로드 링크를 사용해 주세요." });
}

export function handleSharedAnimationOptions(request: Request): Response {
  if (!isSameOriginRequest(request)) {
    return json(403, { error: "다른 출처에서는 애니메이션 공유 API를 사용할 수 없습니다." });
  }
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}

function specFromContentType(value: string): ShareSpec | null {
  if (value.includes("image/apng")) return SPECS.APNG;
  if (value.includes("image/gif")) return SPECS.GIF;
  if (value.includes("image/webp")) return SPECS.WEBP;
  return null;
}

function specFromFileName(value: string | null): ShareSpec | null {
  const lower = value?.toLowerCase() ?? "";
  if (lower.includes(".apng")) return SPECS.APNG;
  if (lower.includes(".gif")) return SPECS.GIF;
  if (lower.includes(".webp")) return SPECS.WEBP;
  return null;
}

function headerValue(request: Request, name: string, fallback: string): string {
  const raw = request.headers.get(name);
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw).slice(0, 120) || fallback;
  } catch {
    return raw.slice(0, 120) || fallback;
  }
}

function safeDownloadName(value: string, extension: string): string {
  const cleaned = value.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").replace(/\.(apng|gif|webp)$/i, "").slice(0, 80);
  return `${cleaned || "emove"}.${extension}`;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
