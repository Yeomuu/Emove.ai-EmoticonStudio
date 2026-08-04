import { after } from "next/server";

import { handleOpenAIRequest, type ServerEnv } from "../../../../../server/openai-api";
import { canUseOpenAIJobs, completeOpenAIJob, createOpenAIJob, failOpenAIJob, markOpenAIJobRunning, persistOpenAIJobImages, readOpenAIJob } from "../../../../../server/openai-jobs";
import { isSameOriginRequest } from "../../../../../server/request-security";

export { isSameOriginRequest } from "../../../../../server/request-security";

export const runtime = "nodejs";
export const maxDuration = 300;

const ASYNC_IMAGE_ROUTES = new Set(["character", "frame", "frames"]);

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_PROMPT_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_BACKGROUND",
  "OPENAI_IMAGE_SIZE",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_OUTPUT_FORMAT",
  "OPENAI_IMAGE_FORMAT",
  "OPENAI_IMAGE_OUTPUT_COMPRESSION",
  "OPENAI_IMAGE_COMPRESSION",
  "OPENAI_IMAGE_CONCURRENCY",
  "OPENAI_CHARACTER_VARIATIONS",
] as const;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return json(403, { error: "다른 출처에서는 OpenAI 프록시를 호출할 수 없습니다." });
  const route = openAIRoute(request.url);
  if (ASYNC_IMAGE_ROUTES.has(route) && canUseOpenAIJobs()) {
    const body = await request.arrayBuffer();
    const headers = new Headers(request.headers);
    const id = crypto.randomUUID();
    await createOpenAIJob(id, route);
    after(async () => {
      try {
        await markOpenAIJobRunning(id);
        const backgroundRequest = new Request(request.url, { method: "POST", headers, body });
        const response = await handleOpenAIRequest(backgroundRequest, serverEnv());
        if (!response) throw new Error("지원하지 않는 OpenAI 작업입니다.");
        const payload = await response.json().catch(() => ({})) as { error?: string } & Record<string, unknown>;
        if (!response.ok) throw new Error(payload.error ?? `OpenAI 작업이 실패했습니다. (${response.status})`);
        const persisted = await persistOpenAIJobImages(route, payload, request.url, id);
        await completeOpenAIJob(id, persisted);
      } catch (error) {
        await failOpenAIJob(id, error).catch(() => undefined);
      }
    });
    return json(202, { jobId: id, statusUrl: `/api/openai/jobs/${id}` });
  }
  const response = await handleOpenAIRequest(request, serverEnv());
  return response ?? json(404, { error: "지원하지 않는 OpenAI 경로입니다." });
}

export async function GET(request: Request): Promise<Response> {
  const route = openAIRoute(request.url);
  const match = /^jobs\/([^/]+)$/.exec(route);
  if (!match) return json(404, { error: "지원하지 않는 OpenAI 조회 경로입니다." });
  const job = await readOpenAIJob(match[1]).catch(() => null);
  return job ? json(200, job) : json(404, { error: "OpenAI 작업을 찾지 못했습니다." });
}

export async function OPTIONS(request: Request): Promise<Response> {
  const response = await handleOpenAIRequest(request, serverEnv());
  return response ?? json(204, {});
}

function serverEnv(): ServerEnv {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function openAIRoute(url: string): string {
  return new URL(url).pathname.replace(/^\/api\/openai\/?/, "").replace(/\/+$/, "");
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
