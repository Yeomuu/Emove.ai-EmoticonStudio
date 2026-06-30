import { getStore } from "@netlify/blobs";
import { handleOpenAIRequest, type ServerEnv } from "../../server/openai-api";

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

export default async function openAIBackground(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const key = readNetlifyEnv("OPENAI_API_KEY") ?? process.env.OPENAI_API_KEY;
  if (!key?.trim().startsWith("sk-") || request.headers.get("X-EMOVE-Job-Token") !== key) {
    return new Response(null, { status: 401 });
  }
  const payload = await request.json().catch(() => undefined) as { id?: string; route?: string; body?: unknown } | undefined;
  if (!payload?.id || !payload.route || payload.body == null) return new Response(null, { status: 400 });

  const started = new Date().toISOString();
  await saveJob({ id: payload.id, route: payload.route, status: "running", createdAt: started, updatedAt: started });

  try {
    const proxyRequest = new Request(new URL(`/api/openai/${payload.route}`, request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.body),
    });
    const response = await handleOpenAIRequest(proxyRequest, netlifyEnv());
    const result = await response?.json().catch(() => undefined);
    if (!response || !response.ok) {
      await saveJob({
        id: payload.id,
        route: payload.route,
        status: "failed",
        createdAt: started,
        updatedAt: new Date().toISOString(),
        error: errorFromResult(result, response?.status),
      });
    } else {
      await saveJob({
        id: payload.id,
        route: payload.route,
        status: "complete",
        createdAt: started,
        updatedAt: new Date().toISOString(),
        result,
      });
    }
  } catch (error) {
    await saveJob({
      id: payload.id,
      route: payload.route,
      status: "failed",
      createdAt: started,
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new Response(null, { status: 204 });
}

function errorFromResult(result: unknown, status?: number): string {
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string") return result.error;
  return status ? `OpenAI 작업이 실패했습니다. (${status})` : "OpenAI 작업이 실패했습니다.";
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

function netlifyEnv(): ServerEnv {
  const env: ServerEnv = {};
  ENV_KEYS.forEach((envKey) => {
    env[envKey] = readNetlifyEnv(envKey) ?? process.env[envKey];
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
