declare const Buffer: {
  from(input: ArrayBuffer | Uint8Array | string, encoding?: string): { toString(encoding?: string): string };
};

export type ServerEnv = Record<string, string | undefined>;

type ImageOutputOptions = {
  model: string;
  size: string;
  quality: string;
  background: string;
  output_format: ImageOutputFormat;
  output_compression?: number;
};
type PromptKind = "character" | "frames" | "effect";
type ImageOutputFormat = "png" | "jpeg" | "webp";

export async function handleOpenAIRequest(request: Request, env: ServerEnv): Promise<Response | null> {
  const route = openAIRoute(request.url);
  if (!route) return null;
  if (request.method === "OPTIONS") return json(204, {});
  if (request.method !== "POST") return json(405, { error: "POST 요청만 지원합니다." });
  const key = openAIKey(env.OPENAI_API_KEY);
  if (!key) return json(503, { error: "서버 환경변수 OPENAI_API_KEY가 설정되지 않았거나 OpenAI API 키 형식이 아닙니다." });
  try {
    if (route === "transcribe") return await transcribe(request, key, env);
    if (route === "character") return await generateCharacter(request, key, env);
    if (route === "frame") return await generateFrame(request, key, env);
    if (route === "frames") return await generateFrames(request, key, env);
    if (route === "effect") return await generateEffect(request, key, env);
    return json(404, { error: "지원하지 않는 OpenAI 경로입니다." });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
}

function openAIKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  return key?.startsWith("sk-") ? key : undefined;
}

async function transcribe(request: Request, key: string, env: ServerEnv) {
  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return json(400, { error: "음성 파일이 없습니다." });
  const form = new FormData();
  form.append("file", file, file.name || "emotion.webm");
  form.append("model", env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  const openai = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const payload = await openai.json() as { text?: string; error?: { message?: string } };
  if (!openai.ok) throw new Error(payload.error?.message || "OpenAI 음성 전사에 실패했습니다.");
  const text = payload.text?.trim() ?? "";
  const shortText = text ? await summarizeTranscript(text, key, env) : "";
  return json(200, { text, shortText });
}

async function generateCharacter(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompt: string; token: unknown; variationCount?: number; variationIndex?: number };
  const count = 1;
  const offset = Math.max(0, Math.floor(Number(body.variationIndex || 0)));
  const drafts = Array.from({ length: count }, (_, index) => [
    body.prompt,
    `[Variation ${offset + index + 1}] Keep the same character identity, palette, style mode and neutral reusable full-body framing. Change only small design exploration details such as pose attitude, silhouette charm, accessory-free facial nuance, or body proportion emphasis.`,
  ].join("\n"));
  const prompts = await refineImagePrompts("character", drafts, body, key, env);
  const imageUrls = await mapWithConcurrency(prompts, Number(env.OPENAI_IMAGE_CONCURRENCY || 2), (prompt) => generateImage(prompt, key, env));
  return json(200, { imageUrl: imageUrls[0], imageUrls, token: body.token, revisedPrompt: prompts[0], revisedPrompts: prompts });
}

async function generateFrame(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompt: string; referenceImages?: string[]; frameIndex?: number };
  if (!body.prompt) return json(400, { error: "프레임 생성 프롬프트가 없습니다." });
  const [prompt] = await refineImagePrompts("frames", [body.prompt], body, key, env);
  const reference = body.referenceImages?.[0];
  const imageUrl = reference ? await editImage(prompt, reference, key, env) : await generateImage(prompt, key, env);
  return json(200, { imageUrl, frameIndex: body.frameIndex ?? 0, revisedPrompt: prompt });
}

async function generateFrames(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompts: string[]; referenceImages: string[] };
  const reference = body.referenceImages?.[0];
  const prompts = await refineImagePrompts("frames", body.prompts.slice(0, 1), body, key, env);
  const frameImages = await mapWithConcurrency(prompts, 1, (prompt) => (
    reference ? editImage(prompt, reference, key, env) : generateImage(prompt, key, env)
  ));
  return json(200, { frameImages });
}

async function generateEffect(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompt: string; brief: unknown };
  const [prompt] = await refineImagePrompts("effect", [body.prompt], body, key, env);
  const imageUrl = await generateImage(prompt, key, env);
  return json(200, { imageUrl, revisedPrompt: prompt });
}

async function generateImage(prompt: string, key: string, env: ServerEnv): Promise<string> {
  const options = imageOutputOptions(env);
  const openai = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...options, prompt }) });
  return imagePayload(openai, options.output_format);
}

async function editImage(prompt: string, referenceUrl: string, key: string, env: ServerEnv): Promise<string> {
  const source = await fetch(referenceUrl);
  if (!source.ok) throw new Error("캐릭터 참조 이미지를 불러오지 못했습니다.");
  const form = new FormData();
  const options = imageOutputOptions(env);
  Object.entries(options).forEach(([name, value]) => {
    if (value !== undefined) form.append(name, String(value));
  });
  form.append("prompt", prompt);
  const blob = await source.blob();
  const type = blob.type || "image/png";
  form.append("image", new File([blob], `character.${extensionForMimeType(type)}`, { type }));
  const openai = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  return imagePayload(openai, options.output_format);
}

async function imagePayload(response: Response, outputFormat: ImageOutputFormat): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI 이미지 생성에 실패했습니다. (${response.status})`);
  const image = payload.data?.[0];
  if (image?.b64_json) return `data:${mimeTypeForOutput(outputFormat)};base64,${image.b64_json}`;
  if (image?.url) return await fetchImageAsDataUrl(image.url);
  throw new Error("OpenAI 이미지 결과가 비어 있습니다.");
}

function mimeTypeForOutput(outputFormat: ImageOutputFormat): string {
  return outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
}

function extensionForMimeType(type: string): string {
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
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
  const output_format = imageOutputFormat(env.OPENAI_IMAGE_OUTPUT_FORMAT || env.OPENAI_IMAGE_FORMAT || "webp");
  const output_compression = output_format === "webp" || output_format === "jpeg" ? imageCompression(env.OPENAI_IMAGE_OUTPUT_COMPRESSION || env.OPENAI_IMAGE_COMPRESSION || "82") : undefined;
  return { model, size: env.OPENAI_IMAGE_SIZE || "1024x1024", quality: env.OPENAI_IMAGE_QUALITY || "medium", background, output_format, output_compression };
}

function imageOutputFormat(value: string): ImageOutputFormat {
  return value === "png" || value === "jpeg" || value === "webp" ? value : "webp";
}

function imageCompression(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 82;
  return Math.max(0, Math.min(100, Math.round(parsed)));
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

async function summarizeTranscript(text: string, key: string, env: ServerEnv): Promise<string> {
  try {
    const openai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_PROMPT_MODEL || "gpt-4.1-mini",
        messages: [
          { role: "system", content: "You summarize Korean speech for a short emoticon speech bubble. Return JSON only as {\"shortText\":\"...\"}. Preserve the user's intent; do not invent emotion or new facts. Keep it 2-10 Korean characters when possible." },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const payload = await openai.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }> };
    if (!openai.ok) return compactFallback(text);
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { shortText?: string };
    return parsed.shortText?.trim() || compactFallback(text);
  } catch {
    return compactFallback(text);
  }
}

function compactFallback(text: string): string {
  const cleaned = text.replace(/(어|음|그|저기|진짜|정말|너무|약간|뭔가)(?=\s|$)/g, " ").replace(/[^가-힣a-zA-Z0-9!?~\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const clauses = cleaned.split(/[,.;]|\s+(?:그래서|근데|그리고|하지만)\s+/).filter(Boolean);
  const core = clauses.sort((a, b) => b.length - a.length)[0] ?? cleaned;
  return core.length <= 10 ? core : `${core.slice(0, 9).trim()}!`;
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

function openAIRoute(url: string): string | null {
  const path = new URL(url, "http://localhost").pathname;
  const apiMarker = "/api/openai/";
  const functionMarker = "/.netlify/functions/openai/";
  if (path.startsWith(apiMarker)) return path.slice(apiMarker.length).split("/")[0] || null;
  if (path.startsWith(functionMarker)) return path.slice(functionMarker.length).split("/")[0] || null;
  return null;
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
