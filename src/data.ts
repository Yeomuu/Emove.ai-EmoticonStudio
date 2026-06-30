import type { CharacterToken, EditorLayer, Emotion, StickerItem } from "./types";

export const imageAssets = {
  hero: new URL("./assets/images/home-ecosystem.webp", import.meta.url).href,
  logo: new URL("./assets/images/logo-mark.png", import.meta.url).href,
  character: new URL("./assets/images/character-main.webp", import.meta.url).href,
  pose: new URL("./assets/images/pose-reference.webp", import.meta.url).href,
  inputCharacter: new URL("./assets/images/input-character.webp", import.meta.url).href,
  editCharacterSheet: new URL("./assets/images/edit-character.webp", import.meta.url).href,
  editThumb: new URL("./assets/images/edit-thumb.webp", import.meta.url).href,
  detailProfile: new URL("./assets/images/detail-profile.webp", import.meta.url).href,
  detailSticker: new URL("./assets/images/detail-sticker.webp", import.meta.url).href,
  library: [
    new URL("./assets/images/library-01.webp", import.meta.url).href,
    new URL("./assets/images/library-02.webp", import.meta.url).href,
    new URL("./assets/images/library-03.webp", import.meta.url).href,
    new URL("./assets/images/library-04.webp", import.meta.url).href,
    new URL("./assets/images/library-05.webp", import.meta.url).href,
  ],
  pattern: new URL("./assets/images/pattern.png", import.meta.url).href,
} as const;

export const emotionMeta: Record<Emotion, { label: string; effect: string; color: string; message: string; autoApply: boolean }> = {
  angry: { label: "화남", effect: "플레임 버스트", color: "#FF7A87", message: "진짜 너무해!", autoApply: true },
  disgusted: { label: "혐오", effect: "스모그 웨이브", color: "#A6D67A", message: "으, 싫어", autoApply: true },
  fearful: { label: "두려움", effect: "쉐이크 링", color: "#8CA5FF", message: "너무 무서워", autoApply: true },
  happy: { label: "기쁨", effect: "팝 스타", color: "#BBB6FF", message: "완전 좋아!", autoApply: true },
  neutral: { label: "중립", effect: "소프트 웨이브", color: "#B7BDC8", message: "그렇구나", autoApply: true },
  other: { label: "기타", effect: "사용자 선택", color: "#FFADE3", message: "이 감정은 뭐지?", autoApply: false },
  sad: { label: "슬픔", effect: "레인 드롭", color: "#78A8FF", message: "조금 속상해", autoApply: true },
  surprised: { label: "놀람", effect: "스파클 링", color: "#FFD36E", message: "헉, 정말?", autoApply: true },
  unknown: { label: "미분류", effect: "사용자 선택", color: "#78D6C6", message: "말로 표현하기 어려워", autoApply: false },
};

export const emotionEffectGuides: Record<Emotion, { background: string; accent: string; motion: string; promptHint: string }> = {
  angry: { background: "붉은 플레임 방사형 버스트", accent: "짧은 불꽃 조각", motion: "빠른 확대와 흔들림", promptHint: "flame burst, sharp red-orange radial energy" },
  disgusted: { background: "올리브빛 스모그 웨이브", accent: "흐릿한 연기 입자", motion: "느린 좌우 흐름", promptHint: "soft smog wave, muted green haze" },
  fearful: { background: "차가운 흔들림 링", accent: "가느다란 진동선", motion: "짧은 떨림과 수축", promptHint: "blue shake rings, nervous vibration" },
  happy: { background: "보라색 팝 스타 글로우", accent: "작은 별과 점 입자", motion: "통통 튀는 확산", promptHint: "lavender pop stars, buoyant sparkle" },
  neutral: { background: "은은한 소프트 웨이브", accent: "잔잔한 원형 파동", motion: "느린 호흡형 루프", promptHint: "soft neutral wave, calm circular ripple" },
  other: { background: "사용자 선택형 믹스 글로우", accent: "작은 추상 입자", motion: "중간 속도 루프", promptHint: "custom abstract glow particles" },
  sad: { background: "푸른 레인 드롭", accent: "작은 물방울", motion: "아래로 떨어지는 완만한 흐름", promptHint: "blue raindrops, gentle downward motion" },
  surprised: { background: "노란 스파클 링", accent: "확산 링과 반짝임", motion: "순간 팽창 후 정지", promptHint: "yellow sparkle rings, sudden expansion" },
  unknown: { background: "민트색 미분류 오라", accent: "불규칙한 작은 점", motion: "낮은 강도 부유", promptHint: "mint ambiguous aura, subtle floating dots" },
};

export const emotionOrder = ["angry", "disgusted", "fearful", "happy", "neutral", "other", "sad", "surprised", "unknown"] as const;

export const initialLayers: EditorLayer[] = [
  { id: "text", label: "텍스트", description: "말풍선과 자막", visible: true, locked: false },
  { id: "accent-effects", label: "부가 이펙트", description: "별·스티커·강조", visible: true, locked: false },
  { id: "character", label: "캐릭터", description: "표정과 모션", visible: true, locked: false },
  { id: "background-effects", label: "배경 이펙트", description: "핵심 감정 효과", visible: true, locked: false },
];

const createdAt = "2026-06-23T12:00:00.000Z";

export const defaultCharacterTokens: CharacterToken[] = [
  {
    id: "default-penguin-soft3d", version: 1, name: "남극의 펭귄", ownerId: null, isDefault: true,
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

export const effectPresets = ["팝 스타", "플레임 버스트", "스모그 웨이브", "쉐이크 링", "소프트 웨이브", "레인 드롭", "스파클 링"] as const;

export function createMotionBrief(emotion: Emotion, color: string, sourceText: string, shortText: string, intensity: number, tokenId: string, frameDelayMs = 120, coreEffect?: string, expressionEmotion: Emotion = emotion): import("./types").MotionBrief {
  const meta = emotionMeta[emotion];
  return {
    sourceText: sourceText.trim() || meta.message,
    shortText: shortText.trim() || meta.message,
    expressionEmotion,
    emotion,
    confidence: emotion === "other" || emotion === "unknown" ? 0.42 : 0.88,
    motionIntensity: Math.max(0.15, Math.min(1, intensity)),
    pose: emotion === "happy" ? "양팔을 활짝 펼친 자세" : "상체 중심의 자연스러운 제스처",
    coreEffect: coreEffect ?? meta.effect,
    effectColor: color,
    duration: Math.max(0.35, Math.min(1.4, frameDelayMs * 5 / 1000)),
    frameDelayMs,
    characterTokenId: tokenId,
  };
}
