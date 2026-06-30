import { emotionEffectGuides } from "../data";
import type { AudioFeatures, CharacterToken, Emotion, MotionBrief } from "../types";

const motionStyleCopy: Record<MotionBrief["motionStyle"], string> = {
  smooth: "smooth easing, gentle in-between motion, stable silhouette transitions",
  dynamic: "dynamic exaggerated motion, stronger pose changes, quick readable action",
  bouncy: "bouncy elastic timing, squash-and-stretch feeling while preserving identity",
  subtle: "subtle restrained motion, small body shifts, calm loop continuity",
};

export function compactEmoticonText(source: string, fallback = ""): string {
  const cleaned = source
    .replace(/(어|음|그|저기|진짜|정말|너무|약간|뭔가)(?=\s|$)/g, " ")
    .replace(/[^가-힣a-zA-Z0-9!?~\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  const clauses = cleaned.split(/[,.;]|\s+(?:그래서|근데|그리고|하지만)\s+/).filter(Boolean);
  const core = clauses.sort((a, b) => score(b) - score(a))[0] ?? cleaned;
  return core.length <= 10 ? core : `${core.slice(0, 9).trim()}!`;
}

function score(value: string): number {
  return /좋|싫|화|무서|놀|슬프|속상|고마|미안|축하|대박|헉|괜찮/.test(value) ? 10 + value.length : value.length;
}

export function buildCharacterPrompt(token: CharacterToken): string {
  const styleMode = token.styleMode ?? (token.stylePreset.includes("2D") ? "2D" : "3D");
  return [
    "[Instruction]",
    `Create one ${token.stylePreset} character on a flat solid chroma-key green background (#00FF00).`,
    `[Style contract] The character token is explicitly ${styleMode}. Keep the image ${styleMode}; do not blend 2D and 3D visual language.`,
    "[Context]",
    `Selected style: ${token.styleDescription}.`,
    `Character concept: ${token.prompt}.`,
    `Observable identity: ${token.observableTraits.join(", ")}.`,
    `Personality: ${token.personalityTags.join(", ")}.`,
    `Palette: ${Object.entries(token.colors).map(([key, value]) => `${key} ${value}`).join(", ")}.`,
    "[Constraints]",
    `Keep fixed: ${token.fixedTraits.join(", ")}.`,
    `Do not change: ${token.doNotChange.join(", ")}.`,
    "Centered full-body neutral pose, generous margins, no text, no props, no scenery, no floor, no cast shadow.",
    "Character only: no emotional background, no core effect, no accent particles, no motion trails, no sticker decorations, no speech bubble.",
    "Do not use chroma green inside the character or accessories because the green background will be removed as transparency.",
    "[Output] A clean reusable character token image only.",
  ].join("\n");
}

export function buildFramePrompts(brief: MotionBrief, token: CharacterToken): string[] {
  const beats = ["anticipation", "movement start", "peak action", "settle", "finish pose"];
  const effectGuide = emotionEffectGuides[brief.emotion];
  const styleMode = token.styleMode ?? (token.stylePreset.includes("2D") ? "2D" : "3D");
  return beats.map((beat, index) => [
    "[Instruction]",
    `Reference the supplied character image and preserve the exact same ${token.stylePreset} identity.`,
    `[Style contract] The character token is ${styleMode}; keep every frame ${styleMode}.`,
    `Frame ${index + 1}/5 (${beat}) of one continuous motion, designed for ${brief.frameDelayMs}ms per frame.`,
    `Motion style: ${motionStyleCopy[brief.motionStyle]}.`,
    "[Input facts]",
    `Captured expression key: ${brief.expressionEmotion}.`,
    `Captured gesture/action: ${brief.pose}; motion amplitude: ${Math.round(brief.motionIntensity * 100)}/100.`,
    `Text bubble phrase is handled separately: "${brief.shortText}".`,
    "[Effect separation]",
    `Selected effect emotion: ${brief.emotion}; background/effect layer is separate as ${effectGuide.promptHint}. Do not draw that effect in the character frame.`,
    "[Constraints]",
    `Keep fixed: ${token.fixedTraits.join(", ")}; never change: ${token.doNotChange.join(", ")}.`,
    "Character only on a flat solid chroma-key green background (#00FF00). No text, no speech bubble, no sticker, no core effect, no accent effect, no scenery, no floor shadow.",
    "Do not use chroma green inside the character; the green background will be keyed out into transparency.",
    "Keep framing, camera angle, body scale, materials, lighting and palette identical across every frame.",
    "[Output] One character-only animation frame.",
  ].join("\n"));
}

export function buildCoreEffectPrompt(brief: MotionBrief): string {
  const effectGuide = emotionEffectGuides[brief.emotion];
  return [
    "[Instruction]",
    `Create only a ${brief.coreEffect} core emotion effect asset.`,
    "[Context]",
    `Selected effect emotion: ${brief.emotion}; visual guide: ${effectGuide.promptHint}.`,
    `Primary color ${brief.effectColor}; intensity ${Math.round(brief.motionIntensity * 100)}/100; loop-friendly motion impression: ${effectGuide.motion}.`,
    "[Constraints]",
    "Flat solid chroma-key green background (#00FF00).",
    "No character, no face, no body, no text, no speech bubble, no scenery, no floor shadow.",
    "Do not use chroma green in the effect itself.",
    "[Output] One reusable transparent-ready core effect layer.",
  ].join("\n");
}

export function inferEmotionFromText(source: string, features?: Partial<AudioFeatures>): Emotion {
  const text = source.toLowerCase();
  const scores: Record<Emotion, number> = {
    angry: /(화|짜증|열받|싫|미워|분노|빡)/.test(text) ? 4 : 0,
    disgusted: /(역겨|으|더러|질색|혐오)/.test(text) ? 4 : 0,
    fearful: /(무서|불안|걱정|두려|떨려)/.test(text) ? 4 : 0,
    happy: /(좋|기쁘|행복|고마|감사|축하|최고|사랑|완전)/.test(text) ? 4 : 0,
    neutral: /(괜찮|그래|그렇|천천|알겠)/.test(text) ? 2 : 0,
    other: 0,
    sad: /(슬프|속상|울|미안|외로|힘들)/.test(text) ? 4 : 0,
    surprised: /(헉|대박|정말|진짜\?|뭐야|놀라|어머)/.test(text) ? 4 : 0,
    unknown: source.trim() ? 0 : 2,
  };
  if ((features?.peak ?? 0) > .78) scores.surprised += 1.5;
  if ((features?.rms ?? 0) > .68) scores.happy += .8;
  if ((features?.rms ?? 0) < .22 && source.trim()) scores.neutral += .7;
  const result = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] as [Emotion, number];
  return result[1] > 0 ? result[0] : "neutral";
}
