import type { AccentEffect, CharacterToken, EditorLayer, Emotion, MotionStyle, StickerItem } from "./types";
import { emotionEffectGuides, emotionMeta, emotionOrder } from "./emotion-taxonomy";
export { emotionEffectGuides, emotionMeta, emotionOrder } from "./emotion-taxonomy";
import characterImage from "./assets/images/character-main.webp";
import detailProfileImage from "./assets/images/detail-profile.webp";
import detailStickerImage from "./assets/images/detail-sticker.webp";
import editCharacterImage from "./assets/images/edit-character.webp";
import editThumbImage from "./assets/images/edit-thumb.webp";
import inputCharacterImage from "./assets/images/input-character.webp";
import libraryImage01 from "./assets/images/library-01.webp";
import libraryImage02 from "./assets/images/library-02.webp";
import libraryImage03 from "./assets/images/library-03.webp";
import libraryImage04 from "./assets/images/library-04.webp";
import libraryImage05 from "./assets/images/library-05.webp";
import logoImage from "./assets/images/logo-mark.png";
import poseImage from "./assets/images/pose-reference.webp";

const assetSrc = (asset: { src: string }) => asset.src;

export const imageAssets = {
  logo: assetSrc(logoImage),
  character: assetSrc(characterImage),
  pose: assetSrc(poseImage),
  inputCharacter: assetSrc(inputCharacterImage),
  editCharacterSheet: assetSrc(editCharacterImage),
  editThumb: assetSrc(editThumbImage),
  detailProfile: assetSrc(detailProfileImage),
  detailSticker: assetSrc(detailStickerImage),
  library: [
    assetSrc(libraryImage01),
    assetSrc(libraryImage02),
    assetSrc(libraryImage03),
    assetSrc(libraryImage04),
    assetSrc(libraryImage05),
  ],
} as const;

export const initialLayers: EditorLayer[] = [
  { id: "text", label: "텍스트", description: "말풍선과 자막", visible: true, locked: false },
  { id: "accent-effects", label: "부가 이펙트", description: "별·스티커·강조", visible: true, locked: false },
  { id: "character", label: "캐릭터", description: "표정과 모션", visible: true, locked: false },
  { id: "background-effects", label: "배경 이펙트", description: "감정별 고정 효과", visible: true, locked: true },
];

const createdAt = "2026-06-23T12:00:00.000Z";

export const defaultCharacterTokens: CharacterToken[] = [
  {
    id: "default-penguin-soft3d", version: 1, name: "인사하는 남극의 펭귄", ownerId: null, isDefault: true,
    sourceAsset: imageAssets.character, referenceImages: [imageAssets.character], styleMode: "3D", stylePreset: "Soft 3D",
    styleDescription: "soft 3D toy-like character, rounded silhouette, pastel lavender-blue material, gentle studio lighting, isolated sticker-ready character",
    prompt: "둥글고 말랑한 실루엣의 파스텔 보라색 아기 펭귄", observableTraits: ["2.5등신", "둥근 몸통", "연보라 외피", "흰 얼굴과 배", "작은 검은 눈", "노란 부리와 발"],
    personalityTags: ["밝은", "다정한", "귀여운"], colors: { body: "#BBB6FF", face: "#F7F4FF", eyes: "#201E28", accent: "#FFD08A" },
    fixedTraits: ["둥근 펭귄 실루엣", "작은 점 눈", "짧은 날개", "흰 배"], doNotChange: ["캐릭터 종", "몸 비율", "눈 간격", "주요 색상"], createdAt, updatedAt: createdAt,
  },
  {
    id: "default-flower-girl-soft3d", version: 1, name: "인사하는 미니미", ownerId: null, isDefault: true,
    sourceAsset: imageAssets.library[0], referenceImages: [imageAssets.library[0]], styleMode: "3D", stylePreset: "Soft 3D",
    styleDescription: "soft 3D chibi human, warm clay-like skin, rounded hair volumes, pastel knit outfit, subtle bloom lighting, isolated sticker-ready character",
    prompt: "긴 갈색 머리와 연보라 니트를 입고 인사하는 3D 미니 캐릭터", observableTraits: ["큰 둥근 머리", "긴 갈색 머리", "연보라 니트", "짧은 팔다리", "꽃 장식"],
    personalityTags: ["밝은", "인사하는", "행복한"], colors: { hair: "#8B5B43", skin: "#FFD9BA", outfit: "#C9BFFF", accent: "#FFADE3" },
    fixedTraits: ["긴 갈색 머리", "연보라 상의", "둥근 얼굴"], doNotChange: ["머리 길이", "의상 색", "얼굴 비율"], createdAt, updatedAt: createdAt,
  },
  {
    id: "default-astronaut-soft3d", version: 1, name: "우주 탐험가", ownerId: null, isDefault: true,
    sourceAsset: imageAssets.library[1], referenceImages: [imageAssets.library[1]], styleMode: "3D", stylePreset: "Soft 3D",
    styleDescription: "soft 3D chibi astronaut, translucent lavender helmet, pearlescent white suit, pastel accents, isolated sticker-ready character",
    prompt: "라벤더빛 우주복을 입고 양손으로 브이를 하는 3D 미니 캐릭터", observableTraits: ["둥근 투명 헬멧", "흰 우주복", "라벤더 테두리", "양손 브이"],
    personalityTags: ["활발한", "장난스러운", "자신감"], colors: { suit: "#F3F5FF", helmet: "#C9BFFF", hair: "#8B5B43", accent: "#FFADE3" },
    fixedTraits: ["우주복", "둥근 헬멧", "파스텔 버튼"], doNotChange: ["우주복 형태", "헬멧 비율", "색상 팔레트"], createdAt, updatedAt: createdAt,
  },
  {
    id: "default-gradient-mascot-soft3d", version: 1, name: "오로라 친구", ownerId: null, isDefault: true,
    sourceAsset: imageAssets.library[3], referenceImages: [imageAssets.library[3]], styleMode: "3D", stylePreset: "Soft 3D",
    styleDescription: "minimal soft 3D mascot, smooth rounded body, blue-to-lavender gradient material, tiny dot eyes and smile, isolated sticker-ready character",
    prompt: "파랑과 보라 그라데이션의 단순하고 둥근 3D 마스코트", observableTraits: ["둥근 머리와 몸", "파랑-보라 그라데이션", "점 눈", "작은 미소"],
    personalityTags: ["차분한", "친근한"], colors: { body: "#8CA5FF", highlight: "#FFADE3", eyes: "#201E28", accent: "#BBB6FF" },
    fixedTraits: ["단순한 얼굴", "그라데이션 몸", "팔과 다리"], doNotChange: ["얼굴 단순도", "몸 비율", "그라데이션 방향"], createdAt, updatedAt: createdAt,
  },
  {
    id: "default-yellow-girl-soft3d", version: 1, name: "노란 인사", ownerId: null, isDefault: true,
    sourceAsset: imageAssets.library[4], referenceImages: [imageAssets.library[4]], styleMode: "3D", stylePreset: "Soft 3D",
    styleDescription: "soft 3D chibi human, short honey-blonde bob, warm yellow dress, simple dot eyes, isolated sticker-ready character",
    prompt: "짧은 꿀빛 단발과 노란 원피스를 입고 인사하는 3D 미니 캐릭터", observableTraits: ["짧은 단발", "노란 원피스", "둥근 얼굴", "한 손 인사"],
    personalityTags: ["차분한", "따뜻한", "친근한"], colors: { hair: "#E8B86A", skin: "#FFE2C3", outfit: "#FFD36E", eyes: "#201E28" },
    fixedTraits: ["짧은 단발", "노란 원피스", "둥근 얼굴"], doNotChange: ["헤어스타일", "의상 색", "얼굴 비율"], createdAt, updatedAt: createdAt,
  },
];

export const starterStickers: StickerItem[] = [];

export function createMotionBrief(emotion: Emotion, _color: string, sourceText: string, shortText: string, intensity: number, tokenId: string, frameDelayMs = 120, _coreEffect?: string, expressionEmotion: Emotion = emotion, pose = "입력된 행동 없음", motionStyle: MotionStyle = "smooth", accentEffect: AccentEffect = "sparkles", accentColor?: string, tierOverride?: import("./types").ExaggerationTier | null): import("./types").MotionBrief {
  const meta = emotionMeta[emotion];
  const measuredIntensity = Math.max(0, Math.min(1, intensity));
  const tier: import("./types").ExaggerationTier = tierOverride ?? (measuredIntensity < 0.45 ? "minimal" : measuredIntensity < 0.72 ? "emotional" : "full");
  const clampedIntensity = tierOverride
    ? { minimal: .28, emotional: .6, full: .9 }[tierOverride]
    : measuredIntensity;
  return {
    sourceText: sourceText.trim(),
    shortText: shortText.trim(),
    expressionEmotion,
    emotion,
    confidence: 0.88,
    motionIntensity: clampedIntensity,
    exaggerationTier: tier,
    pose,
    coreEffect: meta.effect,
    effectColor: meta.color,
    accentEffect,
    accentColor: accentColor ?? meta.color,
    duration: Math.max(0.35, Math.min(1.4, frameDelayMs * 5 / 1000)),
    frameDelayMs,
    motionStyle,
    characterTokenId: tokenId,
  };
}
