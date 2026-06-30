import { computed, signal } from "@preact/signals";
import { createMotionBrief, defaultCharacterTokens, emotionMeta, initialLayers, starterStickers } from "./data";
import type { BehaviorCapture, CharacterToken, EditorLayer, Emotion, EmoticonProject, LayerKind, LayerTransform, StickerItem, TextBoxShape, TextFont, VisionMetrics } from "./types";

export const characterName = signal("남극의 펭귄");
export const characterPrompt = signal("둥글고 말랑한 인상의 밝은 아기 펭귄. 친근하고 표정 변화가 큰 캐릭터.");
export const characterTone = signal("#BBB6FF");
export const characterStyle = signal<"2D" | "3D">("3D");
export const characters = signal<CharacterToken[]>(defaultCharacterTokens.map((item) => ({ ...item })));
export const selectedCharacterId = signal(defaultCharacterTokens[0].id);
export const selectedCharacter = computed(() => characters.value.find((item) => item.id === selectedCharacterId.value) ?? characters.value[0]);

export const emotion = signal<Emotion>("happy");
export const expressionEmotion = signal<Emotion>("happy");
export const effectColor = signal(emotionMeta.happy.color);
export const coreEffect = signal(emotionMeta.happy.effect);
export const coreEffectImage = signal<string | null>(null);
export const sourceTranscript = signal("오늘 진짜 너무 좋아서 날아갈 것 같아!");
export const transcript = signal("완전 좋아!");
export const audioRms = signal(0.52);
export const audioPeak = signal(0.74);
export const motionIntensity = computed(() => Math.max(0.2, Math.min(1, audioRms.value * 1.7)));
export const frameDelayMs = signal(120);

export const selectedFrame = signal(0);
export const activeLayer = signal<LayerKind>("accent-effects");
export const textBoxShape = signal<TextBoxShape>("pill");
export const textFont = signal<TextFont>("Pretendard");
export const layers = signal(initialLayers.map((layer) => ({ ...layer })));
export const defaultLayerTransforms: Record<LayerKind, LayerTransform> = {
  "background-effects": { x: 0, y: 0, scale: 1, rotation: 0 },
  character: { x: 0, y: -18, scale: 1, rotation: 0 },
  "accent-effects": { x: 0, y: 0, scale: 1, rotation: 0 },
  text: { x: 0, y: 0, scale: 1, rotation: 0 },
};
export const frameLayerTransforms = signal<Array<Record<LayerKind, LayerTransform>>>(createFrameTransforms());
export const layerTransforms = computed(() => frameLayerTransforms.value[selectedFrame.value] ?? defaultLayerTransforms);
export const frameImages = signal<string[]>(Array.from({ length: 5 }, () => selectedCharacter.value.sourceAsset));
export const visionMetrics = signal<VisionMetrics>({ source: "mock", pose: { shoulderTilt: 0.08, armSpread: 0.72 }, gesture: "Open_Palm" });
export const behaviorCapture = signal<BehaviorCapture>({
  id: "sample-capture", ownerId: null, poseSummary: "양팔을 펼친 상반신 자세", gesture: "Open_Palm",
  emotionScores: { angry: 0.02, disgusted: 0.01, fearful: 0.01, happy: 0.88, neutral: 0.04, other: 0.01, sad: 0.01, surprised: 0.02, unknown: 0 },
  sourceText: sourceTranscript.value, shortText: transcript.value,
  audio: { rms: audioRms.value, peak: audioPeak.value, energy: 0.63, capturedAt: new Date().toISOString() },
  createdAt: new Date().toISOString(),
});
export const stickers = signal<StickerItem[]>(starterStickers.map((item) => ({ ...item })));
export const editingProject = signal<EmoticonProject | null>(null);
export const lastSaved = signal<string | null>(null);
export const toast = signal<string | null>(null);
export const exportModalOpen = signal(false);
export const exportShareUrl = signal<string | null>(null);
export const exportGifBlob = signal<Blob | null>(null);

export const motionBrief = computed(() => createMotionBrief(emotion.value, effectColor.value, sourceTranscript.value, transcript.value, motionIntensity.value, selectedCharacterId.value, frameDelayMs.value, coreEffect.value, expressionEmotion.value));

let toastTimer: number | undefined;
export function notify(message: string): void {
  toast.value = message;
  if (typeof window === "undefined") return;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 2600);
}

export function setEmotion(next: Emotion): void {
  emotion.value = next;
  effectColor.value = emotionMeta[next].color;
  coreEffect.value = emotionMeta[next].effect;
  coreEffectImage.value = null;
}

export function applyAnalyzedEmotion(next: Emotion): void {
  expressionEmotion.value = next;
  setEmotion(next);
}

export function selectCharacter(id: string): void {
  const token = characters.value.find((item) => item.id === id);
  if (!token) return;
  selectedCharacterId.value = id;
  characterName.value = token.name;
  characterPrompt.value = token.prompt;
  characterTone.value = token.colors.body ?? token.colors.outfit ?? "#BBB6FF";
  frameImages.value = Array.from({ length: 5 }, () => token.sourceAsset);
  frameLayerTransforms.value = createFrameTransforms();
  selectedFrame.value = 0;
}

export function startNewEmoticonProject(): void {
  editingProject.value = null;
  exportGifBlob.value = null;
  exportShareUrl.value = null;
  exportModalOpen.value = false;
}

export function loadProjectForEditing(project: EmoticonProject): void {
  if (!characters.value.some((item) => item.id === project.characterToken.id)) {
    characters.value = [project.characterToken, ...characters.value];
  }
  editingProject.value = project;
  selectedCharacterId.value = project.characterToken.id;
  characterName.value = project.characterToken.name;
  characterPrompt.value = project.characterToken.prompt;
  characterTone.value = project.characterToken.colors.body ?? project.characterToken.colors.outfit ?? "#BBB6FF";
  characterStyle.value = project.characterToken.styleMode;
  emotion.value = project.motionBrief.emotion;
  expressionEmotion.value = project.motionBrief.expressionEmotion;
  effectColor.value = project.motionBrief.effectColor;
  coreEffect.value = project.motionBrief.coreEffect;
  coreEffectImage.value = project.coreEffectImage ?? null;
  sourceTranscript.value = project.motionBrief.sourceText;
  transcript.value = project.motionBrief.shortText;
  frameDelayMs.value = project.motionBrief.frameDelayMs;
  behaviorCapture.value = { ...behaviorCapture.value, ...project.behaviorCapture };
  layers.value = project.layers.map((layer) => ({ ...layer }));
  textBoxShape.value = project.textStyle.shape;
  textFont.value = project.textStyle.font;
  frameImages.value = project.frameImages.length ? [...project.frameImages] : Array.from({ length: 5 }, () => project.characterToken.sourceAsset);
  frameLayerTransforms.value = cloneFrameTransforms(project.frameLayerTransforms);
  selectedFrame.value = 0;
  activeLayer.value = "text";
  exportGifBlob.value = null;
  exportShareUrl.value = project.sticker.animatedImage?.startsWith("http") ? project.sticker.animatedImage : null;
  exportModalOpen.value = false;
  lastSaved.value = new Date(project.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function updateLayerTransform(id: LayerKind, update: Partial<LayerTransform>): void {
  const frameIndex = Math.max(0, Math.min(4, selectedFrame.value));
  frameLayerTransforms.value = frameLayerTransforms.value.map((frame, index) => (
    index >= frameIndex ? { ...frame, [id]: { ...frame[id], ...update } } : frame
  ));
}

export function updateLayerTransformForAllFrames(id: LayerKind, update: Partial<LayerTransform>): void {
  frameLayerTransforms.value = frameLayerTransforms.value.map((frame) => ({ ...frame, [id]: { ...frame[id], ...update } }));
}

export function toggleLayer(id: LayerKind, key: "visible" | "locked"): void {
  layers.value = layers.value.map((layer) => (layer.id === id ? { ...layer, [key]: !layer[key] } : layer));
}

export function moveLayer(id: LayerKind, direction: -1 | 1): void {
  const list = [...layers.value];
  const index = list.findIndex((layer) => layer.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  layers.value = list;
}

export function reorderLayer(sourceId: LayerKind, targetId: LayerKind): void {
  layers.value = previewLayerOrder(layers.value, sourceId, targetId, "before");
}

export function previewLayerOrder(list: EditorLayer[], sourceId: LayerKind, targetId: LayerKind, position: "before" | "after"): EditorLayer[] {
  const source = list.find((layer) => layer.id === sourceId);
  if (!source || sourceId === targetId) return [...list];
  const remaining = list.filter((layer) => layer.id !== sourceId);
  const targetIndex = remaining.findIndex((layer) => layer.id === targetId);
  if (targetIndex < 0) return [...list];
  remaining.splice(targetIndex + (position === "after" ? 1 : 0), 0, source);
  return remaining;
}

export function toggleFavorite(id: string): void {
  stickers.value = stickers.value.map((item) => (item.id === id ? { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() } : item));
}

export function createFrameTransforms(): Array<Record<LayerKind, LayerTransform>> {
  return Array.from({ length: 5 }, () => ({
    "background-effects": { ...defaultLayerTransforms["background-effects"] },
    character: { ...defaultLayerTransforms.character },
    "accent-effects": { ...defaultLayerTransforms["accent-effects"] },
    text: { ...defaultLayerTransforms.text },
  }));
}

function cloneFrameTransforms(source: Array<Record<LayerKind, LayerTransform>>): Array<Record<LayerKind, LayerTransform>> {
  const fallback = createFrameTransforms();
  return fallback.map((frame, index) => {
    const sourceFrame = source[index];
    if (!sourceFrame) return frame;
    return {
      "background-effects": { ...frame["background-effects"], ...sourceFrame["background-effects"] },
      character: { ...frame.character, ...sourceFrame.character },
      "accent-effects": { ...frame["accent-effects"], ...sourceFrame["accent-effects"] },
      text: { ...frame.text, ...sourceFrame.text },
    };
  });
}
