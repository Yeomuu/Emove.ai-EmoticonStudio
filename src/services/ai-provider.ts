import type { CharacterToken, GeneratedCharacterResult, MotionBrief, OpenAIProvider, TranscriptionResult } from "../types";
import { FRAME_COUNT } from "../constants";
import { buildCharacterPrompt, buildFramePrompts, compactEmoticonText } from "./prompt-builder";
import { compactReferenceImagesForOpenAI, removeChromaKeyBackground } from "./image-processing";

const CHARACTER_VARIATION_REQUESTS = 1;
const JOB_POLL_INTERVAL_MS = 2500;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_JSON_PAYLOAD_BYTES = 5_500_000;

type AsyncJobAccepted = {
  jobId: string;
  statusUrl?: string;
};

type AsyncJobResult<T> = {
  status: "pending" | "running" | "complete" | "failed";
  result?: T;
  error?: string;
};

/** API 키는 브라우저로 보내지 않고 서버 환경변수 OPENAI_API_KEY에서만 읽습니다. */
export class ServerOpenAIProvider implements OpenAIProvider {
  readonly mode = "openai" as const;

  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append("file", audio, "emotion.webm");
    const response = await fetch(openAIEndpoint("transcribe"), { method: "POST", body: form });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    const payload = (await response.json()) as { text: string; shortText?: string };
    return { sourceText: payload.text, shortText: payload.shortText ?? compactEmoticonText(payload.text, "") };
  }

  async generateCharacter(token: CharacterToken): Promise<GeneratedCharacterResult> {
    const prompt = buildCharacterPrompt(token);
    const referenceImages = await compactReferenceImagesForOpenAI(token.referenceImages.slice(0, 1));
    const results: GeneratedCharacterResult[] = [];
    for (let variationIndex = 0; variationIndex < CHARACTER_VARIATION_REQUESTS; variationIndex += 1) {
      results.push(await requestJson<GeneratedCharacterResult>(openAIEndpoint("character"), {
        token: compactCharacterTokenForRequest(token),
        prompt,
        referenceImages,
        variationCount: 1,
        variationIndex,
      }));
    }
    const rawImages = results.flatMap((result) => result.imageUrls?.length ? result.imageUrls : result.imageUrl ? [result.imageUrl] : []);
    if (!rawImages.length) throw new Error("OpenAI가 캐릭터 이미지를 반환하지 않았습니다.");
    const imageUrls: string[] = [];
    for (const image of rawImages) imageUrls.push(await removeChromaKeyBackground(image));
    const imageUrl = imageUrls[0];
    const result = results[0];
    return {
      ...result,
      imageUrl,
      imageUrls,
      token: { ...result.token, sourceAsset: imageUrl, referenceImages: [imageUrl] },
      revisedPrompts: results.flatMap((item) => item.revisedPrompts ?? (item.revisedPrompt ? [item.revisedPrompt] : [])),
    };
  }

  async generateCharacterActionFrames(brief: MotionBrief, token: CharacterToken): Promise<string[]> {
    const prompts = buildFramePrompts(brief, token).slice(0, FRAME_COUNT);
    if (prompts.length !== FRAME_COUNT) {
      throw new Error(`캐릭터 행동 프레임 프롬프트가 ${FRAME_COUNT}개 준비되지 않았습니다.`);
    }
    const referenceImages = await compactReferenceImagesForOpenAI(token.referenceImages.length ? token.referenceImages : token.sourceAsset ? [token.sourceAsset] : []);
    const frameImages: string[] = [];
    for (const [frameIndex, prompt] of prompts.entries()) {
      const payload = await requestJson<{ imageUrl: string }>(openAIEndpoint("frame"), {
        brief,
        token: compactCharacterTokenForRequest(token),
        prompt,
        frameIndex,
        referenceImages,
        chromaKeyBackground: "#00FF00",
      });
      const transparentFrame = await removeChromaKeyBackground(payload.imageUrl);
      frameImages.push(transparentFrame);
    }
    if (frameImages.length !== FRAME_COUNT) {
      throw new Error(`캐릭터 행동 프레임은 정확히 ${FRAME_COUNT}개여야 합니다.`);
    }
    return frameImages;
  }

}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const jsonBody = JSON.stringify(body);
  if (new Blob([jsonBody]).size > MAX_JSON_PAYLOAD_BYTES) {
    throw new Error("AI 생성 요청의 참조 이미지 용량이 너무 큽니다. 캐릭터 이미지를 다시 선택하거나 새로 생성해 주세요.");
  }
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: jsonBody });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | T | undefined;
  if (response.status === 202 && isAsyncJobAccepted(payload)) {
    const statusUrl = payload.statusUrl?.startsWith("http") ? payload.statusUrl : openAIEndpoint(`jobs/${payload.jobId}`);
    return await pollAsyncJob<T>(statusUrl);
  }
  if (!response.ok) {
    throw new Error(errorMessageFromPayload(response.status, payload));
  }
  return payload as T;
}

async function pollAsyncJob<T>(statusUrl: string): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    await delay(JOB_POLL_INTERVAL_MS);
    const response = await fetch(statusUrl, { method: "GET" });
    const payload = (await response.json().catch(() => undefined)) as AsyncJobResult<T> | { error?: string } | undefined;
    if (!response.ok) throw new Error(errorMessageFromPayload(response.status, payload));
    if (isAsyncJobResult<T>(payload)) {
      if (payload.status === "complete") {
        if (payload.result == null) throw new Error("OpenAI 작업 결과가 비어 있습니다.");
        return payload.result;
      }
      if (payload.status === "failed") throw new Error(payload.error || "OpenAI 작업이 실패했습니다.");
    }
  }
  throw new Error("OpenAI 작업 시간이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
}

function isAsyncJobAccepted(payload: unknown): payload is AsyncJobAccepted {
  return !!payload && typeof payload === "object" && "jobId" in payload && typeof payload.jobId === "string";
}

function isAsyncJobResult<T>(payload: unknown): payload is AsyncJobResult<T> {
  return !!payload && typeof payload === "object" && "status" in payload && typeof payload.status === "string";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function compactCharacterTokenForRequest(token: CharacterToken): CharacterToken {
  return { ...token, sourceAsset: "", referenceImages: [] };
}

async function readErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  return errorMessageFromPayload(response.status, payload);
}

function errorMessageFromPayload(status: number, payload: { error?: string } | unknown): string {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : openAIErrorMessage(status);
}

function openAIEndpoint(path: string): string {
  const base = process.env.NEXT_PUBLIC_OPENAI_API_BASE?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/${path}`;
  return `/api/openai/${path}`;
}

function openAIErrorMessage(status: number): string {
  if (status === 404 || status === 405) {
    return "OpenAI 서버 프록시가 실행되지 않는 주소입니다. 로컬에서는 pnpm dev를 사용하고, 배포에서는 Vercel Route Handler 또는 NEXT_PUBLIC_OPENAI_API_BASE 프록시를 설정해 주세요.";
  }
  return `AI 생성 요청에 실패했습니다. (${status})`;
}

export function getAIProvider(): OpenAIProvider {
  return new ServerOpenAIProvider();
}
