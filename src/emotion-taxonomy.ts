import type { Emotion } from "./types";

export type EmotionTone = "positive" | "neutral" | "negative";

export type EmotionMeta = {
  label: string;
  effect: string;
  color: string;
  message: string;
  tone: EmotionTone;
  autoApply: true;
};

export const emotionOrder = [
  "happiness",
  "joy",
  "admiration",
  "neutral",
  "surprise",
  "tension",
  "sadness",
  "anger",
  "anxiety",
] as const satisfies readonly Emotion[];

export const emotionMeta: Record<Emotion, EmotionMeta> = {
  happiness: { label: "행복", effect: "Heart Glow", color: "#FF6FAF", message: "마음이 따뜻해", tone: "positive", autoApply: true },
  joy: { label: "기쁨", effect: "Burst", color: "#FFA940", message: "완전 좋아!", tone: "positive", autoApply: true },
  admiration: { label: "감탄", effect: "Shine Ray", color: "#FFC857", message: "정말 멋져!", tone: "positive", autoApply: true },
  neutral: { label: "중립", effect: "Soft Glow", color: "#B8BCC7", message: "그렇구나", tone: "neutral", autoApply: true },
  surprise: { label: "놀람", effect: "Impact Line", color: "#D9FF4A", message: "헉, 정말?", tone: "neutral", autoApply: true },
  tension: { label: "긴장", effect: "Pulse Wave", color: "#4DD0E1", message: "조금 긴장돼", tone: "neutral", autoApply: true },
  sadness: { label: "슬픔", effect: "Rain Drop", color: "#5BA7FF", message: "조금 속상해", tone: "negative", autoApply: true },
  anger: { label: "분노", effect: "Flame", color: "#FF5A5A", message: "진짜 너무해!", tone: "negative", autoApply: true },
  anxiety: { label: "불안", effect: "Noise Wave", color: "#A56DFF", message: "마음이 불안해", tone: "negative", autoApply: true },
};

export const emotionEffectGuides: Record<Emotion, { background: string; accent: string; motion: string; promptHint: string }> = {
  happiness: { background: "분홍빛 하트 글로우", accent: "하트 파티클과 빛 번짐", motion: "따뜻하게 퍼지는 확산", promptHint: "pink heart glow, warm heart particles, soft luminous spread" },
  joy: { background: "주황빛 버스트", accent: "팡 터지는 별과 원형 입자", motion: "중심에서 바깥으로 활기차게 확산", promptHint: "orange burst, energetic stars and circular particles" },
  admiration: { background: "금빛 샤인 레이", accent: "빛나는 광선과 별빛", motion: "상향 확산되는 고급스러운 빛", promptHint: "golden shine rays, elegant rising starlight" },
  neutral: { background: "은은한 소프트 글로우", accent: "작은 광점과 얇은 원", motion: "느린 호흡형 루프", promptHint: "soft silver glow, calm sparse light points" },
  surprise: { background: "라임빛 임팩트 라인", accent: "번개와 방사형 선", motion: "순간적으로 팝업되는 충격", promptHint: "lime impact lines, lightning, sudden radial pop" },
  tension: { background: "청록빛 펄스 웨이브", accent: "맥동하는 파동과 진동선", motion: "짧고 반복적인 압박감", promptHint: "cyan pulse waves, nervous oscillation lines" },
  sadness: { background: "푸른 레인 드롭", accent: "작은 물방울", motion: "아래로 떨어지는 완만한 흐름", promptHint: "blue raindrops, gentle downward motion" },
  anger: { background: "붉은 플레임", accent: "불꽃과 날카로운 스피드 라인", motion: "빠른 상승과 강한 진동", promptHint: "red flame, sharp speed lines, aggressive vibration" },
  anxiety: { background: "보랏빛 노이즈 웨이브", accent: "흔들리는 파형과 불규칙 링", motion: "불안정하게 일렁이는 반복", promptHint: "purple noise waves, unstable distorted rings" },
};

const aliases: Record<Emotion, readonly string[]> = {
  happiness: [
    "happiness", "contentment", "satisfaction", "caring", "love", "affection", "desire", "optimism", "relief", "positive",
    "행복", "사랑", "만족", "안도", "긍정",
  ],
  joy: [
    "joy", "happy", "amusement", "excitement", "enthusiasm", "pleasure", "delight", "cheerful",
    "기쁨", "즐거움", "신남", "흥분",
  ],
  admiration: [
    "admiration", "awe", "approval", "gratitude", "pride", "appreciation", "wonder", "respect", "curiosity",
    "감탄", "감사", "존경", "경외",
  ],
  neutral: [
    "neutral", "calm", "boredom", "relaxation", "other", "unknown", "none",
    "중립", "차분", "지루함", "기타", "미분류",
  ],
  surprise: [
    "surprise", "surprised", "amazement", "astonishment", "realization",
    "놀람", "깜짝",
  ],
  tension: [
    "tension", "tense", "nervousness", "stress", "confusion", "embarrassment", "anticipation",
    "긴장", "초조", "당황", "혼란",
  ],
  sadness: [
    "sad", "sadness", "disappointment", "grief", "remorse", "loneliness", "sorrow",
    "슬픔", "실망", "후회", "외로움",
  ],
  anger: [
    "anger", "angry", "annoyance", "disapproval", "disgust", "disgusted", "rage", "frustration", "contempt",
    "분노", "화남", "짜증", "혐오",
  ],
  anxiety: [
    "anxiety", "anxious", "fear", "fearful", "worry", "worried", "panic", "uneasiness",
    "불안", "두려움", "공포", "걱정",
  ],
};

const aliasLookup = new Map<string, Emotion>(
  emotionOrder.flatMap((emotion) => aliases[emotion].map((label) => [normalizeLabel(label), emotion] as const)),
);

/** Maps provider labels and legacy persisted labels into EMOVE's canonical nine emotions. */
export function classifyEmotionLabel(label: string): Emotion {
  return aliasLookup.get(normalizeLabel(label)) ?? "neutral";
}

export function coerceEmotion(value: unknown): Emotion {
  return typeof value === "string" && value.trim() ? classifyEmotionLabel(value) : "neutral";
}

export function emptyEmotionScores(): Record<Emotion, number> {
  return Object.fromEntries(emotionOrder.map((emotion) => [emotion, 0])) as Record<Emotion, number>;
}

/** Aggregates any provider score map into exactly nine normalized EMOVE scores. */
export function normalizeEmotionScores(input: Record<string, unknown> | null | undefined): Record<Emotion, number> | null {
  if (!input) return null;
  const scores = emptyEmotionScores();
  let found = false;
  for (const [rawLabel, rawValue] of Object.entries(input)) {
    const value = numericEmotionScore(rawValue);
    if (value == null || value < 0) continue;
    scores[classifyEmotionLabel(rawLabel)] += value;
    found = true;
  }
  if (!found) return null;
  const total = emotionOrder.reduce((sum, emotion) => sum + scores[emotion], 0);
  if (total <= 0) return null;
  emotionOrder.forEach((emotion) => {
    scores[emotion] /= total;
  });
  return scores;
}

export function dominantEmotion(scores: Record<Emotion, number>): [Emotion, number] {
  return emotionOrder.reduce<[Emotion, number]>((best, emotion) => (
    scores[emotion] > best[1] ? [emotion, scores[emotion]] : best
  ), [emotionOrder[0], scores[emotionOrder[0]]]);
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function numericEmotionScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object") {
    for (const key of ["score", "value", "percentage", "confidence"]) {
      const nested = (value as Record<string, unknown>)[key];
      if (typeof nested === "number" && Number.isFinite(nested)) return nested;
      if (typeof nested === "string" && Number.isFinite(Number(nested))) return Number(nested);
    }
  }
  return null;
}
