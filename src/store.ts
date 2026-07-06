import { computed, signal } from "./lib/signals";
import { createMotionBrief, defaultCharacterTokens, emotionMeta, initialLayers, starterStickers } from "./data";
import type { AnimationFormat, BehaviorCapture, CharacterToken, EditorLayer, Emotion, EmoticonProject, LayerKind, LayerTransform, MotionStyle, StickerItem, TextBoxShape, TextFont, VisionMetrics } from "./types";

const emptyCharacter: CharacterToken = {
  id: "character-empty",
  version: 1,
  name: "캐릭터 없음",
  ownerId: null,
  isDefault: false,
  sourceAsset: "",
  referenceImages: [],
  styleMode: "3D",
  stylePreset: "Soft 3D",
  styleDescription: "사용자가 새로 생성해야 하는 빈 캐릭터 슬롯",
  prompt: "",
  observableTraits: [],
  personalityTags: [],
  colors: {},
  fixedTraits: [],
  doNotChange: [],
  createdAt: "",
  updatedAt: "",
};

export const characterName = signal("");
export const characterPrompt = signal("");
export const characterTone = signal("#BBB6FF");
export const characterStyle = signal<"2D" | "3D">("3D");
export const characters = signal<CharacterToken[]>(defaultCharacterTokens.map((item) => ({ ...item })));
export const selectedCharacterId = signal(defaultCharacterTokens[0]?.id ?? "");
export const selectedCharacter = computed(() => characters.value.find((item) => item.id === selectedCharacterId.value) ?? emptyCharacter);

export const emotion = signal<Emotion>("unknown");
export const expressionEmotion = signal<Emotion>("unknown");
export const effectColor = signal(emotionMeta.unknown.color);
export const coreEffect = signal(emotionMeta.unknown.effect);
export const coreEffectImage = signal<string | null>(null);
export const sourceTranscript = signal("");
export const transcript = signal("");
export const emoticonTitle = signal("");
export const audioRms = signal(0);
export const audioPeak = signal(0);
export const motionIntensity = computed(() => Math.max(0, Math.min(1, audioRms.value * 1.7)));
export const frameDelayMs = signal(120);
export const motionStyle = signal<MotionStyle>("smooth");

export const selectedFrame = signal(0);
export const activeLayer = signal<LayerKind | null>("accent-effects");
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
export const frameImages = signal<string[]>([]);
export const visionMetrics = signal<VisionMetrics>({ source: "unavailable", gesture: "Not_Captured" });
export const behaviorCapture = signal<BehaviorCapture>({
  id: "capture-empty", ownerId: null, poseSummary: "입력된 행동 없음", gesture: "Not_Captured",
  expression: "unknown",
  emotionScores: { angry: 0, disgusted: 0, fearful: 0, happy: 0, neutral: 0, other: 0, sad: 0, surprised: 0, unknown: 1 },
  sourceText: sourceTranscript.value, shortText: transcript.value,
  audio: { rms: audioRms.value, peak: audioPeak.value, energy: 0, capturedAt: new Date().toISOString() },
  createdAt: new Date().toISOString(),
});
export const stickers = signal<StickerItem[]>(starterStickers.map((item) => ({ ...item })));
export const editingProject = signal<EmoticonProject | null>(null);
export const lastSaved = signal<string | null>(null);
export const toast = signal<string | null>(null);
export const exportModalOpen = signal(false);
export const exportShareUrl = signal<string | null>(null);
export const exportGifBlob = signal<Blob | null>(null);
export const exportAnimationFormat = signal<AnimationFormat>("APNG");

export const motionBrief = computed(() => createMotionBrief(emotion.value, effectColor.value, sourceTranscript.value, transcript.value, motionIntensity.value, selectedCharacterId.value, frameDelayMs.value, coreEffect.value, expressionEmotion.value, behaviorCapture.value.poseSummary, motionStyle.value));

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
  emoticonTitle.value = transcript.value.trim().slice(0, 12) || "새 이모티콘";
  exportGifBlob.value = null;
  exportAnimationFormat.value = "APNG";
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
  emoticonTitle.value = project.sticker.title;
  frameDelayMs.value = project.motionBrief.frameDelayMs;
  motionStyle.value = project.motionBrief.motionStyle ?? "smooth";
  behaviorCapture.value = { ...behaviorCapture.value, ...project.behaviorCapture };
  layers.value = project.layers.map((layer) => ({ ...layer }));
  textBoxShape.value = project.textStyle.shape;
  textFont.value = project.textStyle.font;
  frameImages.value = project.frameImages.length ? [...project.frameImages] : Array.from({ length: 5 }, () => project.characterToken.sourceAsset);
  frameLayerTransforms.value = cloneFrameTransforms(project.frameLayerTransforms);
  selectedFrame.value = 0;
  activeLayer.value = "text";
  exportGifBlob.value = null;
  exportAnimationFormat.value = project.animationFormat ?? project.sticker.animationFormat ?? "APNG";
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
