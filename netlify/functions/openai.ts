import { handleOpenAIRequest, type ServerEnv } from "../../server/openai-api";
import { getStore } from "@netlify/blobs";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};
declare const process: { env: ServerEnv };

type JobStatus = "pending" | "running" | "complete" | "failed";

type OpenAIJobRecord = {
  id: string;
  route: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
};

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

const ASYNC_IMAGE_ROUTES = new Set(["character", "frame", "frames", "effect"]);

export default async function openAI(request: Request): Promise<Response> {
  const route = openAIRoute(request.url);
  if (request.method === "OPTIONS") return json(204, {});
  if (route === "jobs") return await readJob(request);
  if (request.method === "POST" && route && ASYNC_IMAGE_ROUTES.has(route)) return await enqueueImageJob(request, route);
  const response = await handleOpenAIRequest(request, netlifyEnv());
  return response ?? new Response(JSON.stringify({ error: "지원하지 않는 OpenAI 경로입니다." }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const config = {
  path: "/api/openai/*",
};

async function enqueueImageJob(request: Request, route: string): Promise<Response> {
  const key = readNetlifyEnv("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY;
  if (!key?.trim().startsWith("sk-")) return json(503, { error: "서버 환경변수 OPENAI_API_KEY가 설정되지 않았거나 OpenAI API 키 형식이 아닙니다." });
  const body = await request.json().catch(() => undefined);
  if (!body) return json(400, { error: "OpenAI 요청 본문이 비어 있습니다." });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await saveJob({ id, route, status: "pending", createdAt: now, updatedAt: now });

  try {
    const backgroundUrl = new URL("/.netlify/functions/openai-background", request.url);
    const background = await fetch(backgroundUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-EMOVE-Job-Token": key },
      body: JSON.stringify({ id, route, body }),
    });
    if (!background.ok && background.status !== 202) {
      await saveJob({ id, route, status: "failed", createdAt: now, updatedAt: new Date().toISOString(), error: "OpenAI 백그라운드 작업을 시작하지 못했습니다." });
      return json(502, { error: "OpenAI 백그라운드 작업을 시작하지 못했습니다." });
    }
  } catch (error) {
    await saveJob({ id, route, status: "failed", createdAt: now, updatedAt: new Date().toISOString(), error: "OpenAI 백그라운드 작업을 시작하지 못했습니다." });
    return json(502, { error: error instanceof Error ? error.message : "OpenAI 백그라운드 작업을 시작하지 못했습니다." });
  }

  return json(202, { jobId: id, status: "pending", statusUrl: `/api/openai/jobs/${id}` });
}

async function readJob(request: Request): Promise<Response> {
  if (request.method !== "GET") return json(405, { error: "작업 조회는 GET 요청만 지원합니다." });
  const id = openAIJobId(request.url);
  if (!id) return json(400, { error: "작업 ID가 없습니다." });
  const job = await getJob(id);
  if (!job) return json(404, { error: "OpenAI 작업을 찾지 못했습니다." });
  return json(200, job);
}

function openAIRoute(url: string): string | null {
  const path = new URL(url, "http://localhost").pathname;
  const marker = "/api/openai/";
  if (!path.startsWith(marker)) return null;
  return path.slice(marker.length).split("/")[0] || null;
}

function openAIJobId(url: string): string | null {
  const parts = new URL(url, "http://localhost").pathname.split("/");
  const jobsIndex = parts.indexOf("jobs");
  return jobsIndex >= 0 ? parts[jobsIndex + 1] ?? null : null;
}

function jobStore() {
  return getStore({ name: "emove-openai-jobs", consistency: "strong" });
}

function jobKey(id: string): string {
  return `jobs/${id}.json`;
}

async function saveJob(job: OpenAIJobRecord): Promise<void> {
  await jobStore().setJSON(jobKey(job.id), job);
}

async function getJob(id: string): Promise<OpenAIJobRecord | null> {
  return await jobStore().get(jobKey(id), { type: "json" }) as OpenAIJobRecord | null;
}

function netlifyEnv(): ServerEnv {
  const env: ServerEnv = {};
  ENV_KEYS.forEach((key) => {
    env[key] = readNetlifyEnv(key) ?? process.env[key];
  });
  return env;
}

function readNetlifyEnv(name: string): string | undefined {
  try {
    if (typeof Netlify === "undefined") return undefined;
    return Netlify.env.get(name);
  } catch {
    return undefined;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
