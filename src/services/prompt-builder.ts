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
    `- Text bubble phrase (handled separately): "${brief.shortText}"`,
    "",
    "### User-confirmed Generation Controls ###",
    `- Generation emotion: ${brief.emotion}`,
    `- Generation exaggeration: ${brief.exaggerationTier}`,
    `- Motion amplitude: ${Math.round(brief.motionIntensity * 100)}/100`,
    "These user-confirmed controls are authoritative. Do not replace them with an emotion or intensity inferred from the captured facts.",
    "",
    "### Exaggeration Directive ###",
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
  const emotionGuides: Record<Emotion, { emotional: string; full: string }> = {
    happiness: {
      emotional: "Show warm happiness: glowing cheeks, soft heart light, an affectionate smile, and a gentle buoyant posture.",
      full: "Extreme happiness: the whole body swells with warmth, springs upward, hugs the air, and radiates oversized heart-shaped energy.",
    },
    joy: {
      emotional: "Show lively joy: sparkling eyes, a broad smile, quick celebratory arm movement, and an energetic bounce.",
      full: "Extreme joy: launch the body upward, stretch the limbs in celebration, spin mid-air, and land with elastic squash-and-stretch.",
    },
    admiration: {
      emotional: "Show admiration: eyes shining like stars, an impressed open smile, and the face and hands drawn toward a brilliant focal point.",
      full: "Extreme awe: lean the whole body backward from wonder, widen the silhouette dramatically, and reach toward a towering ray of light.",
    },
    neutral: {
      emotional: "Show subtle emotional cues: a slight knowing smile, one eyebrow raised, and a gentle head tilt.",
      full: "Amplify the calm pose with a deep comic exhale, exaggerated shoulder drop, and a slow elastic return to balance.",
    },
    surprise: {
      emotional: "Show exaggerated surprise: very wide eyes, dropped jaw, raised shoulders, and a sudden upward recoil.",
      full: "Extreme shock: launch the entire body upward, stretch vertically, fling the limbs outward, and snap back into frame.",
    },
    tension: {
      emotional: "Show visible tension: stiff shoulders, tightly held hands, shallow pulsing movement, and alert darting eyes.",
      full: "Extreme tension: compress the body like a loaded spring, vibrate rapidly, bend under pressure, then release in a sharp recoil.",
    },
    sadness: {
      emotional: "Show exaggerated sadness: tears gushing like a fountain, a deeply crumpled frown, and heavy drooping posture.",
      full: "Extreme sorrow: collapse while wailing, bend like a bow, pound the floor, and shake the whole body with sobs.",
    },
    anger: {
      emotional: "Show exaggerated anger: steam rising from the head, a flushed face, clenched teeth, and tightly shaking fists.",
      full: "Extreme rage: inflate the body with fury, slam the ground, whip around in a violent arc, and rebound with explosive force.",
    },
    anxiety: {
      emotional: "Show anxiety: trembling hands, pale face, guarded posture, worried eyes, and irregular nervous movement.",
      full: "Extreme anxiety: curl into a tiny ball, let the legs wobble like jelly, attempt to flee in place, and snap around at imagined threats.",
    },
  };

  if (tier === "minimal") {
    return [
      "Level: MINIMAL (user-confirmed generation setting)",
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
      "Level: EMOTIONAL (user-confirmed generation setting)",
      "Exaggerate ONLY the emotional expression and visual effects on the character. Keep body proportions normal.",
      `- ${guide.emotional}`,
      "- Body pose changes are moderate; do not distort body proportions.",
      "- The emotion should be clearly readable at small sticker sizes.",
    ].join("\n");
  }

  // tier === "full"
  return [
    "Level: FULL EXAGGERATION (user-confirmed generation setting)",
    "Exaggerate BOTH physical motion AND emotional expression to the extreme. Ignore realistic body proportions.",
    `- ${guide.full}`,
    "- Stretch, squash, distort the body freely for maximum comedic/dramatic impact.",
    "- Physical proportions can be completely broken for expressiveness.",
    "- The animation should feel explosive, over-the-top, and impossible in real life.",
  ].join("\n");
}


export function inferEmotionFromText(source: string, features?: Partial<AudioFeatures>): Emotion {
  const text = source.toLowerCase();
  const scores: Record<Emotion, number> = {
    happiness: /(행복|사랑|따뜻|편안|안도|만족)/.test(text) ? 4 : 0,
    joy: /(기쁘|즐거|신나|좋아|축하|최고|완전)/.test(text) ? 4 : 0,
    admiration: /(멋지|대단|감탄|존경|고마|감사|최고야)/.test(text) ? 4 : 0,
    neutral: /(괜찮|그래|그렇|천천|알겠)/.test(text) ? 2 : 0,
    surprise: /(헉|대박|정말|진짜\?|뭐야|놀라|어머|깜짝)/.test(text) ? 4 : 0,
    tension: /(긴장|초조|부담|당황|혼란|떨려)/.test(text) ? 4 : 0,
    sadness: /(슬프|속상|울|미안|외로|힘들|실망)/.test(text) ? 4 : 0,
    anger: /(화|짜증|열받|싫|미워|분노|빡|역겨|혐오)/.test(text) ? 4 : 0,
    anxiety: /(무서|불안|걱정|두려|공포)/.test(text) ? 4 : 0,
  };
  if ((features?.peak ?? 0) > .78) scores.surprise += 1.5;
  if ((features?.rms ?? 0) > .68) scores.joy += .8;
  if ((features?.rms ?? 0) < .22 && source.trim()) scores.neutral += .7;
  const result = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] as [Emotion, number];
  return result[1] > 0 ? result[0] : "neutral";
}
