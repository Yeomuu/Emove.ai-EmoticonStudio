import { dominantEmotion, normalizeImentivEmotionScores } from "../../../../../server/imentiv-emotion";
import { isSameOriginRequest } from "../../../../../server/request-security";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://api.imentiv.ai";
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/x-wav",
]);

type ImentivAudio = {
  id?: string;
  status?: string;
  average_audio_emotions?: Record<string, unknown> | null;
};

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return json(403, { error: "다른 출처에서는 감정 분석을 요청할 수 없습니다." });
  const apiKey = process.env.IMENTIV_API_KEY?.trim();
  if (!apiKey) return json(503, { configured: false, error: "IMENTIV_API_KEY가 설정되지 않았습니다." });

  const incoming = await request.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof File)) return json(400, { error: "분석할 오디오 파일이 필요합니다." });
  if (audio.size > MAX_AUDIO_BYTES) return json(413, { error: "감정 분석 오디오는 최대 3MB까지 전송할 수 있습니다." });
  if (!ACCEPTED_AUDIO_TYPES.has(audio.type.toLowerCase())) {
    return json(415, { error: "Imentiv 감정 분석에는 WAV, MP3, AAC 또는 M4A 오디오가 필요합니다." });
  }

  const form = new FormData();
  form.append("title", "EMOVE voice capture");
  form.append("audio_file", audio, safeAudioFileName(audio));
  form.append("speaker_diarization", "false");
  form.append("text_emotion_analysis", "false");
  form.append("language", "ko");

  const response = await fetch(`${baseUrl()}/v2/audios`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => undefined)) as ImentivAudio | { detail?: unknown } | undefined;
  if (!response.ok) return json(response.status, { error: externalError(payload, "Imentiv 오디오 제출에 실패했습니다.") });
  if (!payload || !("id" in payload) || typeof payload.id !== "string") {
    return json(502, { error: "Imentiv가 오디오 작업 ID를 반환하지 않았습니다." });
  }
  return json(202, { configured: true, id: payload.id, status: normalizeStatus(payload.status) });
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return json(403, { error: "다른 출처에서는 감정 분석 결과를 요청할 수 없습니다." });
  const apiKey = process.env.IMENTIV_API_KEY?.trim();
  if (!apiKey) return json(503, { configured: false, error: "IMENTIV_API_KEY가 설정되지 않았습니다." });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return json(400, { error: "올바른 Imentiv 오디오 작업 ID가 필요합니다." });

  const response = await fetch(`${baseUrl()}/v1/audios/${encodeURIComponent(id)}`, {
    headers: { "X-API-Key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => undefined)) as ImentivAudio | { detail?: unknown } | undefined;
  if (!response.ok) return json(response.status, { error: externalError(payload, "Imentiv 감정 분석 결과 조회에 실패했습니다.") });

  const status = normalizeStatus(payload && "status" in payload ? payload.status : undefined);
  if (status === "failed") return json(502, { status, error: "Imentiv 감정 분석 작업이 실패했습니다." });
  const scores = normalizeImentivEmotionScores(payload && "average_audio_emotions" in payload ? payload.average_audio_emotions : null);
  if (status !== "complete" || !scores) return json(200, { status: "pending" });
  const [emotion, confidence] = dominantEmotion(scores);
  return json(200, { status: "complete", emotion, confidence, scores });
}

function normalizeStatus(status: string | undefined): "pending" | "complete" | "failed" {
  const value = status?.toLowerCase() ?? "";
  if (/(done|complete|completed|success)/.test(value)) return "complete";
  if (/(failed|error|cancel)/.test(value)) return "failed";
  return "pending";
}

function safeAudioFileName(audio: File): string {
  if (audio.type.includes("wav")) return "emove-voice.wav";
  if (audio.type.includes("mpeg")) return "emove-voice.mp3";
  if (audio.type.includes("aac")) return "emove-voice.aac";
  return "emove-voice.m4a";
}

function baseUrl(): string {
  return (process.env.IMENTIV_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function externalError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
