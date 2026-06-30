import type { CharacterToken, GeneratedCharacterResult, MotionBrief, OpenAIProvider, TranscriptionResult } from "../types";
import { buildCharacterPrompt, buildCoreEffectPrompt, buildFramePrompts, compactEmoticonText } from "./prompt-builder";
import { removeChromaKeyBackground } from "./image-processing";

/** API 키는 브라우저로 보내지 않고 서버 환경변수 OPENAI_API_KEY에서만 읽습니다. */
export class ServerOpenAIProvider implements OpenAIProvider {
  readonly mode = "openai" as const;

  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append("file", audio, "emotion.webm");
    let response: Response;
    try {
      response = await fetch(openAIEndpoint("transcribe"), { method: "POST", body: form });
    } catch {
      throw new Error("음성 전사 서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
      throw new Error(payload?.error || openAIErrorMessage(response.status));
    }
    const payload = (await response.json()) as { text: string; shortText?: string };
    return { sourceText: payload.text, shortText: payload.shortText ?? compactEmoticonText(payload.text, "") };
  }

  async generateCharacter(token: CharacterToken): Promise<GeneratedCharacterResult> {
    const result = await requestJson<GeneratedCharacterResult>(openAIEndpoint("character"), { token, prompt: buildCharacterPrompt(token), referenceImages: token.referenceImages, variationCount: 4 });
    const rawImages = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
    const imageUrls = await Promise.all(rawImages.map((image) => removeChromaKeyBackground(image)));
    const imageUrl = imageUrls[0];
    return { ...result, imageUrl, imageUrls, token: { ...result.token, sourceAsset: imageUrl, referenceImages: [imageUrl] } };
  }

  async generateCharacterFrames(brief: MotionBrief, token: CharacterToken): Promise<string[]> {
    const payload = await requestJson<{ frameImages: string[] }>(openAIEndpoint("frames"), {
      brief,
      token,
      prompts: buildFramePrompts(brief, token),
      referenceImages: token.referenceImages,
      chromaKeyBackground: "#00FF00",
    });
    return Promise.all(payload.frameImages.slice(0, 5).map((image) => removeChromaKeyBackground(image)));
  }

  async generateCoreEffect(brief: MotionBrief): Promise<string | null> {
    const payload = await requestJson<{ imageUrl: string | null }>(openAIEndpoint("effect"), { brief, prompt: buildCoreEffectPrompt(brief) });
    return payload.imageUrl ? removeChromaKeyBackground(payload.imageUrl) : null;
  }
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("AI 생성 서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
  }
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | T | undefined;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : openAIErrorMessage(response.status);
    throw new Error(message);
  }
  return payload as T;
}

function openAIEndpoint(path: string): string {
  const base = import.meta.env.VITE_OPENAI_API_BASE?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/${path}`;
  if (isGitHubPagesHost()) {
    throw new Error("GitHub Pages는 정적 호스팅이라 OpenAI 생성 API를 직접 실행할 수 없습니다. Netlify Functions 같은 외부 프록시를 배포한 뒤 GitHub Actions 변수 VITE_OPENAI_API_BASE에 프록시 주소를 설정해 주세요.");
  }
  return `/api/openai/${path}`;
}

function openAIErrorMessage(status: number): string {
  if (status === 404 || status === 405) {
    return "OpenAI 서버 프록시가 실행되지 않는 주소입니다. 로컬에서는 pnpm dev 또는 pnpm preview를 사용하고, 배포에서는 Netlify Functions나 VITE_OPENAI_API_BASE 프록시를 설정해 주세요.";
  }
  if (status === 408 || status === 502 || status === 503 || status === 504 || status === 524) {
    return "AI 이미지 생성이 서버 제한 시간을 초과했습니다. 잠시 후 다시 시도해 주세요. (계속 실패하면 프레임 수나 이미지 품질 설정을 낮춰 보세요.)";
  }
  if (status === 429) {
    return "AI 생성 요청이 잠시 몰려 있습니다. 잠깐 기다렸다가 다시 시도해 주세요. (429)";
  }
  return `AI 생성 요청에 실패했습니다. (${status})`;
}

function isGitHubPagesHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith("github.io");
}

export function getAIProvider(): OpenAIProvider {
  return new ServerOpenAIProvider();
}
