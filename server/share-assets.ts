import { isGcsConfigured, uploadGcsAsset } from "./gcs-storage";
import { sharedAnimationMemoryStore } from "./share-memory";

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
  const key = `animations/${id}.${spec.extension}`;

  if (isGcsConfigured()) {
    const asset = await uploadGcsAsset(Buffer.from(data), {
      contentType: spec.contentType,
      fileName,
      kind: "animations",
      requestUrl: request.url,
    });
    return json(201, { id, url: asset.url, downloadUrl: asset.downloadUrl, path: asset.path, size: asset.size, createdAt, format: spec.format, mimeType: spec.contentType, extension: spec.extension });
  }

  sharedAnimationMemoryStore().set(id, { data: new Uint8Array(data), fileName, contentType: spec.contentType, format: spec.format });
  const url = new URL(`/api/share/${routeName}/${id}`, request.url);
  const downloadUrl = new URL(url);
  downloadUrl.searchParams.set("download", "1");
  return json(201, { id, url: url.toString(), downloadUrl: downloadUrl.toString(), path: `dev-memory://emove-shared-animations/${id}.${spec.extension}`, size: data.byteLength, createdAt, format: spec.format, mimeType: spec.contentType, extension: spec.extension });
}

export async function handleSharedAnimationGet(id: string, download = false): Promise<Response> {
  const entry = sharedAnimationMemoryStore().get(id);
  if (!entry) {
    return new Response(JSON.stringify({ error: "공유 애니메이션을 찾지 못했습니다." }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const body = new ArrayBuffer(entry.data.byteLength);
  new Uint8Array(body).set(entry.data);

  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${entry.fileName}"`,
      "Content-Type": entry.contentType || "image/apng",
    },
  });
}

export function handleSharedAnimationOptions(): Response {
  return json(204, {});
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
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "Content-Type, X-EMOVE-File-Name, X-EMOVE-Project-Id, X-EMOVE-Title",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
  };
}
