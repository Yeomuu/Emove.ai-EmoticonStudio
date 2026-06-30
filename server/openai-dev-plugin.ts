import type { IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import type { Connect } from "vite";
import type { Plugin } from "vite";
import { handleOpenAIRequest, type ServerEnv } from "./openai-api";

export function openAIDevPlugin(env: ServerEnv): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (request, response, next) => {
      const path = request.url?.split("?")[0];
      if (!path?.startsWith("/api/openai/")) return next();
      try {
        const webRequest = await toWebRequest(request);
        const webResponse = await handleOpenAIRequest(webRequest, env);
        if (!webResponse) return next();
        return await sendWebResponse(response, webResponse);
      } catch (error) {
        return sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    });
  };
  return {
    name: "emove-openai-api",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const headers = new Headers();
  Object.entries(request.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value != null) headers.set(name, value);
  });
  const method = request.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await readBody(request);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function readBody(request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(new ArrayBuffer(length));
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.length;
  });
  return body;
}

async function sendWebResponse(response: ServerResponse, webResponse: Response): Promise<void> {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
