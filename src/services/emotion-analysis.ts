import { emotionOrder } from "../data";
import type { AudioFeatures, Emotion, EmotionProvider, EmotionSource, VisionMetrics } from "../types";
import { inferEmotionFromText } from "./prompt-builder";

const POLL_INTERVAL_MS = 2500;
const ANALYSIS_TIMEOUT_MS = 120_000;

type RemoteEmotionResult = {
  status: "pending" | "complete";
  emotion?: Emotion;
  confidence?: number;
  scores?: Record<Emotion, number>;
};

export type EmotionAnalysisResult = {
  emotion: Emotion;
  confidence: number;
  scores: Record<Emotion, number>;
  source: EmotionSource;
  provider: EmotionProvider;
  warning?: string;
};

export async function analyzeEmotionPriority(
  audioBlob: Blob,
  transcript: string,
  audioFeatures: AudioFeatures,
  vision: VisionMetrics,
  onStage?: (label: string, percent: number) => void,
): Promise<EmotionAnalysisResult> {
  let voiceWarning: string | undefined;
  try {
    onStage?.("목소리 감정 분석용 오디오를 준비하는 중...", 80);
    const voice = await analyzeVoiceWithImentiv(audioBlob, onStage);
    if (voice.confidence >= .18 && voice.emotion !== "unknown") return voice;
    voiceWarning = "Imentiv 목소리 감정 신뢰도가 낮아 행동과 표정을 순서대로 확인했습니다.";
  } catch (error) {
    voiceWarning = error instanceof Error ? error.message : "Imentiv 목소리 감정 분석을 사용할 수 없습니다.";
  }

  const localVoice = localVoiceResult(transcript, audioFeatures, voiceWarning);
  if (localVoice.confidence >= .46 && localVoice.emotion !== "unknown") return localVoice;

  const action = actionResult(vision, voiceWarning);
  if (action) return action;

  const expression = expressionResult(vision, voiceWarning);
  if (expression) return expression;
  return localVoice;
}

async function analyzeVoiceWithImentiv(
  audioBlob: Blob,
  onStage?: (label: string, percent: number) => void,
): Promise<EmotionAnalysisResult> {
  const wav = await toMonoWav(audioBlob);
  const form = new FormData();
  form.append("audio", wav, "emove-voice.wav");
  const submit = await fetch("/api/emotion/audio", { method: "POST", body: form });
  const accepted = (await submit.json().catch(() => undefined)) as { id?: string; error?: string } | undefined;
  if (!submit.ok || !accepted?.id) throw new Error(accepted?.error || "Imentiv 목소리 감정 분석을 시작하지 못했습니다.");

  const startedAt = Date.now();
  while (Date.now() - startedAt < ANALYSIS_TIMEOUT_MS) {
    await delay(POLL_INTERVAL_MS);
    const elapsedRatio = Math.min(1, (Date.now() - startedAt) / ANALYSIS_TIMEOUT_MS);
    onStage?.("Imentiv가 목소리 감정을 분석하는 중...", 82 + Math.round(elapsedRatio * 8));
    const response = await fetch(`/api/emotion/audio?id=${encodeURIComponent(accepted.id)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => undefined)) as (RemoteEmotionResult & { error?: string }) | undefined;
    if (!response.ok) throw new Error(payload?.error || "Imentiv 목소리 감정 분석 결과를 읽지 못했습니다.");
    if (payload?.status === "complete" && payload.emotion && payload.scores) {
      return {
        emotion: payload.emotion,
        confidence: clamp01(payload.confidence ?? payload.scores[payload.emotion] ?? 0),
        scores: payload.scores,
        source: "voice",
        provider: "imentiv",
      };
    }
  }
  throw new Error("Imentiv 분석이 2분 안에 끝나지 않아 로컬 목소리 분석으로 이어갔습니다.");
}

function localVoiceResult(transcript: string, audio: AudioFeatures, warning?: string): EmotionAnalysisResult {
  const emotion = transcript.trim() ? inferEmotionFromText(transcript, audio) : "unknown";
  const keywordSignal = emotion === "unknown" || emotion === "neutral" ? .18 : .42;
  const energySignal = Math.max(audio.rms, audio.peak, audio.energy) * .18;
  const confidence = clamp01(keywordSignal + energySignal);
  return {
    emotion,
    confidence,
    scores: peakedScores(emotion, confidence),
    source: "voice",
    provider: "local-voice-heuristic",
    warning,
  };
}

function actionResult(vision: VisionMetrics, warning?: string): EmotionAnalysisResult | null {
  if (vision.source !== "mediapipe") return null;
  const armSpread = vision.pose?.armSpread ?? 0;
  const shoulderTilt = vision.pose?.shoulderTilt ?? 0;
  let emotion: Emotion = "unknown";
  let confidence = 0;
  if (["Raised_Hand", "Victory", "Thumb_Up"].includes(vision.gesture ?? "") || armSpread > .62) {
    emotion = "happy";
    confidence = .38 + Math.min(.12, armSpread * .12);
  } else if (shoulderTilt > .12) {
    emotion = "sad";
    confidence = .32 + Math.min(.1, shoulderTilt * .4);
  }
  if (emotion === "unknown") return null;
  return { emotion, confidence, scores: peakedScores(emotion, confidence), source: "action", provider: "mediapipe", warning };
}

function expressionResult(vision: VisionMetrics, warning?: string): EmotionAnalysisResult | null {
  const face = vision.face;
  if (!face || face.expression === "unknown") return null;
  const confidence = clamp01(face.confidence);
  return {
    emotion: face.expression,
    confidence,
    scores: peakedScores(face.expression, confidence),
    source: "expression",
    provider: "mediapipe",
    warning,
  };
}

function peakedScores(emotion: Emotion, confidence: number): Record<Emotion, number> {
  const remaining = Math.max(0, 1 - confidence);
  const fallbackKeys = emotionOrder.filter((item) => item !== emotion);
  const fallback = remaining / Math.max(1, fallbackKeys.length);
  return Object.fromEntries(emotionOrder.map((item) => [item, item === emotion ? confidence : fallback])) as Record<Emotion, number>;
}

async function toMonoWav(source: Blob): Promise<Blob> {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("이 브라우저는 Imentiv용 WAV 변환을 지원하지 않습니다.");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    const channelCount = decoded.numberOfChannels;
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) samples[index] += data[index] / channelCount;
    }
    return new Blob([encodeWav(samples, decoded.sampleRate)], { type: "audio/wav" });
  } finally {
    await context.close().catch(() => undefined);
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
