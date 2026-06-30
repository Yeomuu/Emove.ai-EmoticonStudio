import { handleOpenAIRequest, type ServerEnv } from "../../server/openai-api";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_PROMPT_MODEL",
  "OPENAI_TRANSCRIBE_MODEL",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_BACKGROUND",
  "OPENAI_IMAGE_SIZE",
  "OPENAI_IMAGE_QUALITY",
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
    env[key] = Netlify.env.get(key);
  });
  return env;
}
