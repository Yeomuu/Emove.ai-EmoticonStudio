import type { CharacterToken, GeneratedCharacterResult, MotionBrief, OpenAIProvider, TranscriptionResult } from "../types";
import { buildCharacterPrompt, buildCoreEffectPrompt, buildFramePrompts, compactEmoticonText } from "./prompt-builder";
import { removeChromaKeyBackground } from "./image-processing";

/** API 키는 브라우저로 보내지 않고 서버 환경변수 OPENAI_API_KEY에서만 읽습니다. */
export class ServerOpenAIProvider implements OpenAIProvider {
  readonly mode = "openai" as const;

  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append("file", audio, "emotion.webm");
    const response = await fetch("/api/openai/transcribe", { method: "POST", body: form });
    if (!response.ok) throw new Error("음성 전사 요청에 실패했습니다.");
    const payload = (await response.json()) as { text: string; shortText?: string };
    return { sourceText: payload.text, shortText: payload.shortText ?? compactEmoticonText(payload.text, "") };
  }

  async generateCharacter(token: CharacterToken): Promise<GeneratedCharacterResult> {
    const result = await requestJson<GeneratedCharacterResult>("/api/openai/character", { token, prompt: buildCharacterPrompt(token), referenceImages: token.referenceImages, variationCount: 4 });
    const rawImages = result.imageUrls?.length ? result.imageUrls : [result.imageUrl];
    const imageUrls = await Promise.all(rawImages.map((image) => removeChromaKeyBackground(image)));
    const imageUrl = imageUrls[0];
    return { ...result, imageUrl, imageUrls, token: { ...result.token, sourceAsset: imageUrl, referenceImages: [imageUrl] } };
  }

  async generateCharacterFrames(brief: MotionBrief, token: CharacterToken): Promise<string[]> {
    const payload = await requestJson<{ frameImages: string[] }>("/api/openai/frames", {
      brief,
      token,
      prompts: buildFramePrompts(brief, token),
      referenceImages: token.referenceImages,
      chromaKeyBackground: "#00FF00",
    });
    return Promise.all(payload.frameImages.slice(0, 5).map((image) => removeChromaKeyBackground(image)));
  }

  async generateCoreEffect(brief: MotionBrief): Promise<string | null> {
    const payload = await requestJson<{ imageUrl: string | null }>("/api/openai/effect", { brief, prompt: buildCoreEffectPrompt(brief) });
    return payload.imageUrl ? removeChromaKeyBackground(payload.imageUrl) : null;
  }
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | T | undefined;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : `AI 생성 요청에 실패했습니다. (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export function getAIProvider(): OpenAIProvider {
  return new ServerOpenAIProvider();
}
