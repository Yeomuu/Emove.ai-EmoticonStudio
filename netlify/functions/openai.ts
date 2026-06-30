import { handleOpenAIRequest } from "../../server/openai-api";

declare const Buffer: {
  from(input: string, encoding?: string): Uint8Array;
};
declare const process: { env: Record<string, string | undefined> };

type NetlifyEvent = {
  body?: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  isBase64Encoded?: boolean;
  path: string;
  rawUrl?: string;
};

export async function handler(event: NetlifyEvent) {
  const headers = new Headers();
  Object.entries(event.headers ?? {}).forEach(([name, value]) => {
    if (value != null) headers.set(name, value);
  });
  const method = event.httpMethod || "GET";
  const url = event.rawUrl || `https://${event.headers.host ?? "localhost"}${event.path}`;
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD" && event.body != null) {
    init.body = event.isBase64Encoded ? Buffer.from(event.body, "base64") as unknown as BodyInit : event.body;
    init.duplex = "half";
  }
  const response = await handleOpenAIRequest(new Request(url, init), process.env);
  const body = await (response ?? new Response(JSON.stringify({ error: "지원하지 않는 OpenAI 경로입니다." }), { status: 404 })).text();
  return {
    statusCode: response?.status ?? 404,
    headers: Object.fromEntries((response ?? new Response()).headers),
    body,
  };
}
