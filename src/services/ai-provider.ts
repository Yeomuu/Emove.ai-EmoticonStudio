import type { CharacterToken, GeneratedCharacterResult, MotionBrief, OpenAIProvider, TranscriptionResult } from "../types";
import { buildCharacterPrompt, buildCoreEffectPrompt, buildFramePrompts, compactEmoticonText } from "./prompt-builder";
import { removeChromaKeyBackground } from "./image-processing";

const CHARACTER_VARIATION_REQUESTS = 1;
const FRAME_COUNT = 5;

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
    const results: GeneratedCharacterResult[] = [];
    for (let variationIndex = 0; variationIndex < CHARACTER_VARIATION_REQUESTS; variationIndex += 1) {
      results.push(await requestJson<GeneratedCharacterResult>(openAIEndpoint("character"), {
        token,
        prompt,
        referenceImages: token.referenceImages,
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

  async generateCharacterFrames(brief: MotionBrief, token: CharacterToken): Promise<string[]> {
    const prompts = buildFramePrompts(brief, token).slice(0, FRAME_COUNT);
    const frameImages: string[] = [];
    for (const [frameIndex, prompt] of prompts.entries()) {
      const payload = await requestJson<{ imageUrl: string }>(openAIEndpoint("frame"), {
        brief,
        token,
        prompt,
        frameIndex,
        referenceImages: token.referenceImages,
        chromaKeyBackground: "#00FF00",
      });
      frameImages.push(await removeChromaKeyBackground(payload.imageUrl));
    }
    return frameImages;
  }

  async generateCoreEffect(brief: MotionBrief): Promise<string | null> {
    const payload = await requestJson<{ imageUrl: string | null }>(openAIEndpoint("effect"), { brief, prompt: buildCoreEffectPrompt(brief) });
    return payload.imageUrl ? removeChromaKeyBackground(payload.imageUrl) : null;
  }
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | T | undefined;
  if (!response.ok) {
    throw new Error(errorMessageFromPayload(response.status, payload));
  }
  return payload as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  return errorMessageFromPayload(response.status, payload);
}

function errorMessageFromPayload(status: number, payload: { error?: string } | unknown): string {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : openAIErrorMessage(status);
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
  return `AI 생성 요청에 실패했습니다. (${status})`;
}

function isGitHubPagesHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith("github.io");
}

export function getAIProvider(): OpenAIProvider {
  return new ServerOpenAIProvider();
}
