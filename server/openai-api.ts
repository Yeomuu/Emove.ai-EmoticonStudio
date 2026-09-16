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
type PromptKind = "character" | "frames";
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
    return json(404, { error: "지원하지 않는 OpenAI 경로입니다." });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
}

function openAIKey(value: string | undefined): string | undefined {
  const key = cleanEnvValue(value);
  return key?.startsWith("sk-") ? key : undefined;
}

async function transcribe(request: Request, key: string, env: ServerEnv) {
  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return json(400, { error: "음성 파일이 없습니다." });
  if (!file.size) return json(400, { error: "녹음 파일이 비어 있습니다. 마이크를 확인하고 다시 녹음해 주세요." });
  if (file.size > 4_000_000) return json(413, { error: "녹음 파일이 너무 큽니다. 5초 분량으로 다시 녹음해 주세요." });
  const form = new FormData();
  form.append("file", file, file.name || "emotion.webm");
  form.append("model", cleanEnvValue(env.OPENAI_TRANSCRIBE_MODEL) || "gpt-transcribe");
  let openai: Response;
  try {
    openai = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(90_000) });
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return json(timedOut ? 504 : 502, { error: timedOut ? "음성 전사 응답 시간이 초과되었습니다. 다시 녹음하거나 문구를 직접 입력해 주세요." : "음성 전사 서버에 연결하지 못했습니다. 잠시 후 다시 녹음하거나 문구를 직접 입력해 주세요." });
  }
  const payload = await openai.json().catch(() => ({})) as { text?: string; error?: { message?: string; code?: string } };
  if (!openai.ok) return json(openai.status, {
    error: payload.error?.message || `OpenAI 음성 전사에 실패했습니다. (${openai.status})`,
    code: payload.error?.code,
    requestId: openai.headers.get("x-request-id") ?? undefined,
  });
  const text = payload.text?.trim() ?? "";
  if (!text) return json(422, { error: "녹음에서 말을 인식하지 못했습니다. 마이크를 확인하고 다시 녹음하거나 문구를 직접 입력해 주세요." });
  const shortText = text
    ? cleanEnvValue(env.OPENAI_SUMMARIZE_TRANSCRIPT) === "true" ? await summarizeTranscript(text, key, env) : compactFallback(text)
    : "";
  return json(200, { text, shortText });
}

async function generateCharacter(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompt: string; token: unknown; referenceImages?: string[]; variationCount?: number; variationIndex?: number; editExisting?: boolean };
  if (body.referenceImages && (!Array.isArray(body.referenceImages) || body.referenceImages.length > 3 || body.referenceImages.some((value) => typeof value !== "string"))) return json(400, { error: "원본과 추가 참조 2장까지만 사용할 수 있습니다." });
  const count = 1;
  const offset = Math.max(0, Math.floor(Number(body.variationIndex || 0)));
  const drafts = Array.from({ length: count }, (_, index) => [
    body.prompt,
    body.editExisting
      ? "[Revision] Edit the character in the FIRST image. Other images are supplemental references, not replacement characters. Apply only the latest requested appearance changes; they override earlier descriptions only where explicitly requested. Preserve everything else, especially identity and 2D/3D style. Do not introduce variation exploration."
      : `[Variation ${offset + index + 1}] Keep the same character identity, palette, style mode and neutral reusable full-body framing. Change only small design exploration details such as pose attitude, silhouette charm, accessory-free facial nuance, or body proportion emphasis.`,
  ].join("\n"));
  const references = body.referenceImages ?? [];
  const prompts = await refineImagePrompts("character", drafts, promptPlanningContext(body), key, env);
  const imageUrls = await mapWithConcurrency(prompts, Number(env.OPENAI_IMAGE_CONCURRENCY || 2), (prompt) => (
    references.length ? editImage(`${prompt}\nProduce the requested EMOVE character alone on a transparent background with real alpha.`, references, key, env) : generateImage(prompt, key, env)
  ));
  return json(200, { imageUrl: imageUrls[0], imageUrls, token: body.token, revisedPrompt: prompts[0], revisedPrompts: prompts });
}

async function generateFrame(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompt: string; referenceImages?: string[]; frameIndex?: number };
  if (!body.prompt) return json(400, { error: "프레임 생성 프롬프트가 없습니다." });
  const [prompt] = await refineImagePrompts("frames", [body.prompt], promptPlanningContext(body), key, env);
  const reference = body.referenceImages?.[0];
  const imageUrl = reference ? await editImage(prompt, reference, key, env) : await generateImage(prompt, key, env);
  return json(200, { imageUrl, frameIndex: body.frameIndex ?? 0, revisedPrompt: prompt });
}

async function generateFrames(request: Request, key: string, env: ServerEnv) {
  const body = await request.json() as { prompts: string[]; referenceImages: string[] };
  const reference = body.referenceImages?.[0];
  const prompts = await refineImagePrompts("frames", body.prompts.slice(0, 1), promptPlanningContext(body), key, env);
  const frameImages = await mapWithConcurrency(prompts, 1, (prompt) => (
    reference ? editImage(prompt, reference, key, env) : generateImage(prompt, key, env)
  ));
  return json(200, { frameImages });
}

async function generateImage(prompt: string, key: string, env: ServerEnv): Promise<string> {
  const options = imageOutputOptions(env);
  const openai = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...options, prompt }) });
  return imagePayload(openai, options.output_format);
}

async function editImage(prompt: string, reference: string | string[], key: string, env: ServerEnv): Promise<string> {
  const references = typeof reference === "string" ? [reference] : reference;
  if (!references.length || references.length > 3 || references.some((referenceUrl) => referenceUrl.length > 4_000_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(referenceUrl))) {
    throw new Error("참조 이미지는 브라우저에서 준비한 PNG/WebP/JPEG 데이터여야 합니다. 이미지를 다시 선택해 주세요.");
  }
  const form = new FormData();
  const options = imageOutputOptions(env);
  Object.entries(options).forEach(([name, value]) => {
    if (value !== undefined) form.append(name, String(value));
  });
  form.append("prompt", prompt);
  for (const [index, referenceUrl] of references.entries()) {
    const source = await fetch(referenceUrl);
    if (!source.ok) throw new Error("캐릭터 참조 이미지를 불러오지 못했습니다.");
    const blob = await source.blob();
    const type = blob.type || "image/png";
    form.append(references.length === 1 ? "image" : "image[]", new File([blob], `character-${index}.${extensionForMimeType(type)}`, { type }));
  }
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
  const model = normalizeImageModel(env.OPENAI_IMAGE_MODEL);
  const background = "transparent";
  const output_format = imageOutputFormat(cleanEnvValue(env.OPENAI_IMAGE_OUTPUT_FORMAT) || cleanEnvValue(env.OPENAI_IMAGE_FORMAT) || "webp");
  if (output_format === "jpeg") throw new Error("투명 이미지에는 JPEG를 사용할 수 없습니다. OPENAI_IMAGE_OUTPUT_FORMAT을 webp 또는 png로 설정해 주세요.");
  const output_compression = output_format === "webp" ? imageCompression(cleanEnvValue(env.OPENAI_IMAGE_OUTPUT_COMPRESSION) || cleanEnvValue(env.OPENAI_IMAGE_COMPRESSION) || "70") : undefined;
  return {
    model,
    size: cleanEnvValue(env.OPENAI_IMAGE_SIZE) || "1024x1024",
    quality: normalizeImageQuality(env.OPENAI_IMAGE_QUALITY),
    background,
    output_format,
    output_compression,
  };
}

export function normalizeImageModel(value: string | undefined): string {
  const requested = cleanEnvValue(value) || "gpt-image-2";
  if (/^gpt-imeage-/i.test(requested)) {
    return requested.replace(/^gpt-imeage-/i, "gpt-image-");
  }
  return requested;
}

export function normalizeImageQuality(value: string | undefined): "low" | "medium" | "high" | "auto" {
  const requested = cleanEnvValue(value) || "low";
  if (requested === "low" || requested === "medium" || requested === "high" || requested === "auto") return requested;
  throw new Error(`OPENAI_IMAGE_QUALITY 값 "${requested}"은 지원되지 않습니다. low, medium, high, auto 중 하나를 사용해 주세요.`);
}

function cleanEnvValue(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/^\uFEFF+/, "").trim();
  return cleaned || undefined;
}

function imageOutputFormat(value: string): ImageOutputFormat {
  return value === "png" || value === "jpeg" || value === "webp" ? value : "webp";
}

function imageCompression(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 70;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

async function refineImagePrompts(kind: PromptKind, drafts: string[], context: unknown, key: string, env: ServerEnv): Promise<string[]> {
  if (cleanEnvValue(env.OPENAI_REFINE_IMAGE_PROMPTS) !== "true") return drafts;
  const model = cleanEnvValue(env.OPENAI_PROMPT_MODEL) || "gpt-4.1-mini";
  const system = [
    "You are EMOVE's image prompt planner.",
    "Follow prompt-engineering fundamentals: clear instruction, concrete context, explicit constraints, output-only response, and style consistency.",
    "Return JSON only as {\"prompts\":[\"...\"]}. Keep the same number and order of prompts.",
    "Do not invent UI copy or change captured text, pose, expression facts, character identity, color palette, style mode, or frame order.",
    "Character and frame prompts must request a transparent background with real alpha, never a colored backdrop or checkerboard.",
    "User-confirmed emotion, exaggeration and motion amplitude are authoritative; never replace them with captured analysis values.",
    "Frame prompts must describe only character pose/expression/action frames, never background effects, text, bubbles, props, or scenery.",
  ].join(" ");
  const user = JSON.stringify({ kind, drafts, context });
  try {
    const openai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
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
      signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cleanEnvValue(env.OPENAI_PROMPT_MODEL) || "gpt-4.1-mini",
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
  if (path.startsWith(apiMarker)) return path.slice(apiMarker.length).split("/")[0] || null;
  return null;
}

function promptPlanningContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(promptPlanningContext);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && (value.startsWith("data:image/") || value.length > 8_000)) return "[image reference omitted from text planning]";
    return value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    key === "referenceImages" || key === "sourceAsset" ? "[image reference supplied separately]" : promptPlanningContext(item),
  ]));
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
