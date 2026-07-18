import type { Emotion } from "../src/types";

export function normalizeImentivEmotionScores(input: Record<string, unknown> | null | undefined): Record<Emotion, number> | null {
  if (!input) return null;
  const scores = emptyScores();
  let found = false;
  for (const [rawLabel, rawValue] of Object.entries(input)) {
    const value = numericValue(rawValue);
    if (value == null || value < 0) continue;
    const emotion = mapImentivEmotion(rawLabel);
    scores[emotion] += value;
    found = true;
  }
  if (!found) return null;
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  for (const key of Object.keys(scores) as Emotion[]) scores[key] /= total;
  return scores;
}

export function dominantEmotion(scores: Record<Emotion, number>): [Emotion, number] {
  return (Object.entries(scores) as Array<[Emotion, number]>).sort((left, right) => right[1] - left[1])[0] ?? ["unknown", 0];
}

function mapImentivEmotion(label: string): Emotion {
  const normalized = label.toLowerCase().replace(/[^a-z]/g, "");
  if (/(anger|angry|annoyance|disapproval)/.test(normalized)) return "angry";
  if (/(disgust)/.test(normalized)) return "disgusted";
  if (/(fear|nervousness)/.test(normalized)) return "fearful";
  if (/(joy|happy|happiness|amusement|approval|admiration|desire|excitement|gratitude|love|optimism|pride|relief)/.test(normalized)) return "happy";
  if (/(sad|sadness|disappointment|grief|remorse|embarrassment)/.test(normalized)) return "sad";
  if (/(surprise|realization|curiosity|confusion)/.test(normalized)) return "surprised";
  if (/(neutral)/.test(normalized)) return "neutral";
  return "other";
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === "object") {
    for (const key of ["score", "value", "percentage", "confidence"]) {
      const nested = (value as Record<string, unknown>)[key];
      if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    }
  }
  return null;
}

function emptyScores(): Record<Emotion, number> {
  return { angry: 0, disgusted: 0, fearful: 0, happy: 0, neutral: 0, other: 0, sad: 0, surprised: 0, unknown: 0 };
}
