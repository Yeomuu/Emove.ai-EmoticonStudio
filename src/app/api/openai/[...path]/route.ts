import { handleOpenAIRequest, type ServerEnv } from "../../../../../server/openai-api";

export const runtime = "nodejs";

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
  const response = await handleOpenAIRequest(request, serverEnv());
  return response ?? json(404, { error: "지원하지 않는 OpenAI 경로입니다." });
}

export async function OPTIONS(request: Request): Promise<Response> {
  const response = await handleOpenAIRequest(request, serverEnv());
  return response ?? json(204, {});
}

function serverEnv(): ServerEnv {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
