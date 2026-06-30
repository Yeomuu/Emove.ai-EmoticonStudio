import { handleOpenAIRequest, type ServerEnv } from "../../server/openai-api";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};
declare const process: { env: ServerEnv };

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

export default async function openAI(request: Request): Promise<Response> {
  const response = await handleOpenAIRequest(request, netlifyEnv());
  return response ?? new Response(JSON.stringify({ error: "지원하지 않는 OpenAI 경로입니다." }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const config = {
  path: "/api/openai/*",
};

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
