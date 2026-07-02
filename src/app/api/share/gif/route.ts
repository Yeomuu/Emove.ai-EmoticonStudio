import { put } from "@vercel/blob";
import { sharedGifMemoryStore } from "../../../../../server/share-memory";

export const runtime = "nodejs";

const MAX_GIF_BYTES = 5_750_000;

export async function OPTIONS(): Promise<Response> {
  return json(204, {});
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("image/gif")) return json(415, { error: "GIF 파일만 공유 링크로 저장할 수 있습니다." });

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json(400, { error: "저장할 GIF 데이터가 비어 있습니다." });
  if (data.byteLength > MAX_GIF_BYTES) {
    return json(413, { error: `공유 링크로 저장하기에는 GIF가 너무 큽니다. 최대 ${formatBytes(MAX_GIF_BYTES)}까지 지원합니다.` });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const fileName = safeDownloadName(headerValue(request, "x-emove-file-name", `emove-${id}.gif`));
  const key = `gifs/${id}.gif`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, Buffer.from(data), {
      access: "public",
    });
    return json(201, { id, url: blob.url, path: `vercel-blob://${key}`, size: data.byteLength, createdAt });
  }

  sharedGifMemoryStore().set(id, { data: new Uint8Array(data), fileName });
  return json(201, { id, url: new URL(`/api/share/gif/${id}`, request.url).toString(), path: `dev-memory://emove-shared-gifs/${id}.gif`, size: data.byteLength, createdAt });
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

function safeDownloadName(value: string): string {
  const cleaned = value.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return cleaned.endsWith(".gif") ? cleaned : `${cleaned || "emove"}.gif`;
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
