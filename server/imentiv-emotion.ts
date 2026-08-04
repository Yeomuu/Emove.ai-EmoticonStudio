import {
  dominantEmotion,
  emotionOrder,
  normalizeEmotionScores,
} from "../src/emotion-taxonomy";
import type { Emotion } from "../src/types";

export { dominantEmotion };

/**
 * Imentiv audio exposes eight broad acoustic emotions while transcript analysis
 * exposes nuanced labels. Both are folded into the same nine-category EMOVE map,
 * with vocal tone remaining the stronger signal.
 */
export function normalizeImentivEmotionScores(
  audioInput: Record<string, unknown> | null | undefined,
  textInput?: Record<string, unknown> | null,
): Record<Emotion, number> | null {
  const audioScores = normalizeEmotionScores(audioInput);
  const textScores = normalizeEmotionScores(textInput);
  if (!audioScores) return textScores;
  if (!textScores) return audioScores;

  const audioDominant = dominantEmotion(audioScores)[0];
  const audioWeight = audioDominant === "neutral" ? 0.58 : 0.7;
  const textWeight = 1 - audioWeight;
  const combined = Object.fromEntries(emotionOrder.map((emotion) => [
    emotion,
    audioScores[emotion] * audioWeight + textScores[emotion] * textWeight,
  ])) as Record<Emotion, number>;
  const total = emotionOrder.reduce((sum, emotion) => sum + combined[emotion], 0);
  if (total <= 0) return null;
  emotionOrder.forEach((emotion) => {
    combined[emotion] /= total;
  });
  return combined;
}
