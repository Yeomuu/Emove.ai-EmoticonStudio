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
  const tierDirective = buildExaggerationDirective(brief.exaggerationTier, brief.emotion);

  return beats.map((beat, index) => [
    "### Role ###",
    `You are a professional emoticon animator creating frame ${index + 1} of 5 for a looping ${styleMode} animated emoticon sticker.`,
    "",
    "### Task ###",
    `Generate frame ${index + 1}/5 (${beat}) of one continuous motion sequence.`,
    `Reference the supplied character image and preserve the exact same ${token.stylePreset} identity, proportions, colors, and materials.`,
    "",
    "### Style Contract ###",
    `The character token is ${styleMode}. Every frame MUST stay ${styleMode}. Do not blend 2D and 3D visual language.`,
    `Motion style: ${motionStyleCopy[brief.motionStyle]}.`,
    `Frame timing: ${brief.frameDelayMs}ms per frame.`,
    "",
    "### Input Facts ###",
    `- Captured expression: ${brief.expressionEmotion}`,
    `- Captured gesture/action: ${brief.pose}`,
    `- Motion amplitude: ${Math.round(brief.motionIntensity * 100)}/100`,
    `- Text bubble phrase (handled separately): "${brief.shortText}"`,
    "",
    "### Exaggeration Level ###",
    tierDirective,
    "",
    "### Effect Separation ###",
    `The background/core effect layer (${effectGuide.promptHint}) is rendered separately.`,
    "Do NOT draw any background effect, core emotion effect, accent particles, or sticker decorations in this character frame.",
    "",
    "### Constraints ###",
    `- Keep fixed: ${token.fixedTraits.join(", ")}`,
    `- Never change: ${token.doNotChange.join(", ")}`,
    "- Flat solid chroma-key green background (#00FF00). Do NOT use chroma green inside the character.",
    "- No text, no speech bubble, no sticker, no scenery, no floor shadow.",
    "- Maintain identical framing, camera angle, body scale, materials, lighting, and palette across every frame.",
    "",
    "### Output ###",
    "One character-only animation frame on chroma-key green.",
  ].join("\n"));
}

function buildExaggerationDirective(tier: MotionBrief["exaggerationTier"], emotion: Emotion): string {
  const emotionGuides: Record<string, { emotional: string; full: string }> = {
    angry: {
      emotional: "Show exaggerated anger visuals: steam/smoke rising from the head, face turning bright red, veins popping on the forehead, teeth clenched with visible grinding.",
      full: "Extreme rage: body inflating with fury, fists slamming the ground creating visible shockwaves, head literally exploding with flames, body spinning like a tornado of anger.",
    },
    sad: {
      emotional: "Show exaggerated sadness visuals: tears gushing like a fountain or waterfall from both eyes, rain-cloud forming above the head, nose running dramatically, face crumpling into an extreme frown.",
      full: "Extreme sorrow: body collapsing to the ground pounding fists while wailing, body melting into a puddle of tears, bending backward like a bow from the weight of grief, entire body shaking violently with sobs.",
    },
    happy: {
      emotional: "Show exaggerated joy visuals: eyes turning into sparkling stars, mouth stretching ear-to-ear with visible sparkle effects, cheeks glowing bright pink, heart shapes floating from the body.",
      full: "Extreme joy: body bouncing off the ground like rubber, limbs stretching upward impossibly, spinning in mid-air with celebration, body inflating with happiness like a balloon.",
    },
    surprised: {
      emotional: "Show exaggerated surprise visuals: eyes popping out of the head on springs, jaw dropping to the floor, hair standing straight up, visible exclamation marks around the head.",
      full: "Extreme shock: entire body launching upward, limbs flailing wildly, body stretching vertically like pulled taffy, head spinning 360 degrees from the shock.",
    },
    fearful: {
      emotional: "Show exaggerated fear visuals: body trembling with visible shake lines, face turning blue/pale, teeth chattering audibly, hugging own body tightly while shivering.",
      full: "Extreme terror: body curling into a tiny ball, hair turning white, legs turning to jelly and wobbling, attempting to run but feet spinning in place like a cartoon.",
    },
    disgusted: {
      emotional: "Show exaggerated disgust visuals: face scrunching with green tint, tongue sticking out dramatically, body leaning far away, visible stink lines or wave distortion.",
      full: "Extreme disgust: body contorting to escape, face melting from revulsion, entire body doing a dramatic dry heave, spinning away in exaggerated retreat.",
    },
    neutral: {
      emotional: "Show subtle emotional cues: a slight knowing smirk, one eyebrow raised, gentle head tilt with mild expression.",
      full: "Show a dramatically amplified 'meh' pose: shoulders dropping exaggeratedly, body slouching with comic weight, eyes half-closed with deliberate indifference.",
    },
  };

  if (tier === "minimal") {
    return [
      "Level: MINIMAL (quiet voice detected)",
      "Keep the character's pose and expression natural and restrained.",
      "- Use subtle, everyday body language with minimal movement between frames.",
      "- Facial expression should be gentle and understated.",
      "- No exaggerated motion, no visual effects on the character body.",
      "- The character should feel calm and composed.",
    ].join("\n");
  }

  const guide = emotionGuides[emotion] ?? emotionGuides.neutral!;

  if (tier === "emotional") {
    return [
      "Level: EMOTIONAL (medium voice detected)",
      "Exaggerate ONLY the emotional expression and visual effects on the character. Keep body proportions normal.",
      `- ${guide.emotional}`,
      "- Body pose changes are moderate; do not distort body proportions.",
      "- The emotion should be clearly readable at small sticker sizes.",
    ].join("\n");
  }

  // tier === "full"
  return [
    "Level: FULL EXAGGERATION (loud voice detected)",
    "Exaggerate BOTH physical motion AND emotional expression to the extreme. Ignore realistic body proportions.",
    `- ${guide.full}`,
    "- Stretch, squash, distort the body freely for maximum comedic/dramatic impact.",
    "- Physical proportions can be completely broken for expressiveness.",
    "- The animation should feel explosive, over-the-top, and impossible in real life.",
  ].join("\n");
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
