import type { IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import type { Plugin } from "vite";

type ServerEnv = Record<string, string>;
type ImageOutputOptions = {
  model: string;
  size: string;
  quality: string;
  background: string;
  output_format: string;
};
type PromptKind = "character" | "frames" | "effect";

export function openAIDevPlugin(env: ServerEnv): Plugin {
  return {
    name: "emove-openai-dev-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        if (!path?.startsWith("/api/openai/")) return next();
        if (request.method !== "POST") return send(response, 405, { error: "POST 요청만 지원합니다." });
        const key = env.OPENAI_API_KEY;
        if (!key) return send(response, 503, { error: "서버 환경변수 OPENAI_API_KEY가 설정되지 않았습니다." });
        try {
          if (path === "/api/openai/transcribe") return await transcribe(request, response, key, env);
          if (path === "/api/openai/character") return await generateCharacter(request, response, key, env);
          if (path === "/api/openai/frames") return await generateFrames(request, response, key, env);
          if (path === "/api/openai/effect") return await generateEffect(request, response, key, env);
          return send(response, 404, { error: "지원하지 않는 OpenAI 경로입니다." });
        } catch (error) {
          return send(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

async function transcribe(request: IncomingMessage, response: ServerResponse, key: string, env: ServerEnv) {
  const bytes = await readBody(request); const parser = new Response(bytes, { headers: { "Content-Type": request.headers["content-type"] ?? "multipart/form-data" } });
  const incoming = await parser.formData(); const file = incoming.get("file"); if (!(file instanceof File)) return send(response, 400, { error: "음성 파일이 없습니다." });
  const form = new FormData(); form.append("file", file, file.name || "emotion.webm"); form.append("model", env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  const openai = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const payload = await openai.json() as { text?: string; error?: { message?: string } }; if (!openai.ok) throw new Error(payload.error?.message || "OpenAI 음성 전사에 실패했습니다.");
  return send(response, 200, { text: payload.text ?? "" });
}

async function generateCharacter(request: IncomingMessage, response: ServerResponse, key: string, env: ServerEnv) {
  const body = await readJson<{ prompt: string; token: unknown }>(request);
  const [prompt] = await refineImagePrompts("character", [body.prompt], body, key, env);
  const imageUrl = await generateImage(prompt, key, env);
  return send(response, 200, { imageUrl, token: body.token, revisedPrompt: prompt });
}

async function generateFrames(request: IncomingMessage, response: ServerResponse, key: string, env: ServerEnv) {
  const body = await readJson<{ prompts: string[]; referenceImages: string[] }>(request); const reference = body.referenceImages?.[0];
  const prompts = await refineImagePrompts("frames", body.prompts.slice(0, 5), body, key, env);
  const frameImages = await mapWithConcurrency(prompts, Number(env.OPENAI_IMAGE_CONCURRENCY || 2), (prompt) => (
    reference ? editImage(prompt, reference, key, env) : generateImage(prompt, key, env)
  ));
  return send(response, 200, { frameImages });
}

async function generateEffect(request: IncomingMessage, response: ServerResponse, key: string, env: ServerEnv) {
  const body = await readJson<{ prompt: string; brief: unknown }>(request);
  const [prompt] = await refineImagePrompts("effect", [body.prompt], body, key, env);
  const imageUrl = await generateImage(prompt, key, env);
  return send(response, 200, { imageUrl, revisedPrompt: prompt });
}

async function generateImage(prompt: string, key: string, env: ServerEnv): Promise<string> {
  const options = imageOutputOptions(env);
  const openai = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...options, prompt }) });
  return imagePayload(openai);
}

async function editImage(prompt: string, referenceUrl: string, key: string, env: ServerEnv): Promise<string> {
  const source = await fetch(referenceUrl); if (!source.ok) throw new Error("캐릭터 참조 이미지를 불러오지 못했습니다.");
  const form = new FormData(); const options = imageOutputOptions(env); Object.entries(options).forEach(([name, value]) => form.append(name, value)); form.append("prompt", prompt); form.append("image", new File([await source.blob()], "character.png", { type: "image/png" }));
  const openai = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }); return imagePayload(openai);
}

async function imagePayload(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } }; if (!response.ok) throw new Error(payload.error?.message || `OpenAI 이미지 생성에 실패했습니다. (${response.status})`);
  const image = payload.data?.[0]; if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`; if (image?.url) return await fetchImageAsDataUrl(image.url); throw new Error("OpenAI 이미지 결과가 비어 있습니다.");
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const asset = await fetch(url);
  if (!asset.ok) throw new Error("OpenAI 이미지 URL을 다시 불러오지 못했습니다.");
  const type = asset.headers.get("content-type")?.split(";")[0] || "image/png";
  const buffer = Buffer.from(await asset.arrayBuffer());
  return `data:${type};base64,${buffer.toString("base64")}`;
}

function imageOutputOptions(env: ServerEnv): ImageOutputOptions {
  const model = env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const requestedBackground = env.OPENAI_IMAGE_BACKGROUND || "auto";
  const background = requestedBackground === "transparent" ? "auto" : requestedBackground;
  return { model, size: env.OPENAI_IMAGE_SIZE || "1024x1024", quality: env.OPENAI_IMAGE_QUALITY || "medium", background, output_format: "png" };
}

async function refineImagePrompts(kind: PromptKind, drafts: string[], context: unknown, key: string, env: ServerEnv): Promise<string[]> {
  const model = env.OPENAI_PROMPT_MODEL || "gpt-5.5-2026-04-23";
  const system = [
    "You are EMOVE's image prompt planner.",
    "Follow prompt-engineering fundamentals: clear instruction, concrete context, explicit constraints, output-only response, and style consistency.",
    "Return JSON only as {\"prompts\":[\"...\"]}. Keep the same number and order of prompts.",
    "Do not invent UI copy or change captured text, pose, expression facts, character identity, color palette, style mode, or frame order.",
    "Character prompts must describe only the character on #00FF00 chroma-key green.",
    "Frame prompts must describe only character pose/expression/action frames, never background effects, text, bubbles, props, or scenery.",
    "Effect prompts must describe only reusable effect layers, never characters, faces, bodies, text, or scenery.",
  ].join(" ");
  const user = JSON.stringify({ kind, drafts, context });
  try {
    const openai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const payload = await openai.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!openai.ok) return drafts;
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as { prompts?: string[] };
    const prompts = parsed.prompts?.map((prompt) => prompt.trim()).filter(Boolean) ?? [];
    return prompts.length === drafts.length ? prompts : drafts;
  } catch {
    return drafts;
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const limit = Math.max(1, Math.min(5, Number.isFinite(concurrency) ? Math.floor(concurrency) : 2));
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function readBody(request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> { const chunks: Uint8Array[] = []; for await (const chunk of request) chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk); const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const body = new Uint8Array(new ArrayBuffer(length)); let offset = 0; chunks.forEach((chunk) => { body.set(chunk, offset); offset += chunk.length; }); return body; }
async function readJson<T>(request: IncomingMessage): Promise<T> { return JSON.parse(new TextDecoder().decode(await readBody(request))) as T; }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; response.setHeader("Content-Type", "application/json; charset=utf-8"); response.end(JSON.stringify(body)); }
