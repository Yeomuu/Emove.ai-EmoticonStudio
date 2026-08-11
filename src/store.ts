import { computed, signal } from "./lib/signals";
import { createMotionBrief, defaultCharacterTokens, emotionMeta, imageAssets, initialLayers, starterStickers } from "./data";
import { emptyEmotionScores } from "./emotion-taxonomy";
import { DEFAULT_TEXT_COLOR, normalizePickerHex } from "./services/color-picker";
import type { AccentEffect, AnimationFormat, BehaviorCapture, CharacterToken, EditorLayer, Emotion, EmoticonProject, ExaggerationTier, LayerKind, LayerTransform, MotionStyle, StickerItem, TextBoxShape, TextFont, VisionMetrics } from "./types";

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
export const characterStyle = signal<"2D" | "3D">("2D");
export const characters = signal<CharacterToken[]>(defaultCharacterTokens.map((item) => ({ ...item })));
export const selectedCharacterId = signal(defaultCharacterTokens[0]?.id ?? "");
export const selectedCharacter = computed(() => characters.value.find((item) => item.id === selectedCharacterId.value) ?? emptyCharacter);

export const emotion = signal<Emotion>("neutral");
export const expressionEmotion = signal<Emotion>("neutral");
export const effectColor = signal(emotionMeta.neutral.color);
export const coreEffect = signal(emotionMeta.neutral.effect);
export const accentEffect = signal<AccentEffect>("sparkles");
export const accentColor = signal(emotionMeta.neutral.color);
export const backgroundEffectBlur = signal(0);
export const backgroundEffectOpacity = signal(100);
export const accentEffectBlur = signal(0);
export const accentEffectOpacity = signal(100);
export const sourceTranscript = signal("");
export const transcript = signal("");
export const emoticonTitle = signal("");
export const audioRms = signal(0);
export const audioPeak = signal(0);
export const motionIntensity = computed(() => Math.max(0, Math.min(1, audioRms.value * 1.7)));
export const frameDelayMs = signal(120);
export const motionStyle = signal<MotionStyle>("smooth");
export const exaggerationTierOverride = signal<ExaggerationTier | null>(null);

export const selectedFrame = signal(0);
export const activeLayer = signal<LayerKind | null>("text");
export const textBoxShape = signal<TextBoxShape>("pill");
export const textFont = signal<TextFont>("Pretendard");
export const textColor = signal(DEFAULT_TEXT_COLOR);
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
  expression: "neutral",
  emotionScores: { ...emptyEmotionScores(), neutral: 1 },
  sourceText: sourceTranscript.value, shortText: transcript.value,
  audio: { rms: audioRms.value, peak: audioPeak.value, energy: 0, capturedAt: new Date().toISOString() },
  createdAt: new Date().toISOString(),
});
export const stickers = signal<StickerItem[]>(starterStickers.map((item) => ({ ...item })));
export const editingProject = signal<EmoticonProject | null>(null);
export const lastSaved = signal<string | null>(null);
export const toast = signal<string | null>(null);
export const exportAnimationFormat = signal<AnimationFormat>("APNG");
export const pendingQrExport = signal<import("./types").QrExportPayload | null>(null);

export const motionBrief = computed(() => createMotionBrief(emotion.value, effectColor.value, sourceTranscript.value, transcript.value, motionIntensity.value, selectedCharacterId.value, frameDelayMs.value, coreEffect.value, expressionEmotion.value, behaviorCapture.value.poseSummary, motionStyle.value, accentEffect.value, accentColor.value, exaggerationTierOverride.value));

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
  exportAnimationFormat.value = "APNG";
  pendingQrExport.value = null;
  accentEffect.value = "sparkles";
  accentColor.value = emotionMeta[emotion.value].color;
  backgroundEffectBlur.value = 0;
  backgroundEffectOpacity.value = 100;
  accentEffectBlur.value = 0;
  accentEffectOpacity.value = 100;
  textColor.value = DEFAULT_TEXT_COLOR;
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
  effectColor.value = emotionMeta[emotion.value].color;
  coreEffect.value = emotionMeta[emotion.value].effect;
  accentEffect.value = project.motionBrief.accentEffect ?? "sparkles";
  accentColor.value = project.motionBrief.accentColor ?? emotionMeta[emotion.value].color;
  backgroundEffectBlur.value = project.effectSettings?.background.blur ?? 0;
  backgroundEffectOpacity.value = project.effectSettings?.background.opacity ?? 100;
  accentEffectBlur.value = project.effectSettings?.accent.blur ?? 0;
  accentEffectOpacity.value = project.effectSettings?.accent.opacity ?? 100;
  sourceTranscript.value = project.motionBrief.sourceText;
  transcript.value = project.motionBrief.shortText;
  emoticonTitle.value = project.sticker.title;
  frameDelayMs.value = project.motionBrief.frameDelayMs;
  motionStyle.value = project.motionBrief.motionStyle ?? "smooth";
  behaviorCapture.value = { ...behaviorCapture.value, ...project.behaviorCapture };
  layers.value = normalizeEditorLayers(project.layers);
  textBoxShape.value = project.textStyle.shape;
  textFont.value = project.textStyle.font;
  textColor.value = normalizePickerHex(project.textStyle.color ?? "") ?? DEFAULT_TEXT_COLOR;
  frameImages.value = project.frameImages.length ? [...project.frameImages] : Array.from({ length: 5 }, () => project.characterToken.sourceAsset);
  frameLayerTransforms.value = cloneFrameTransforms(project.frameLayerTransforms);
  selectedFrame.value = 0;
  activeLayer.value = "text";
  exportAnimationFormat.value = project.animationFormat ?? project.sticker.animationFormat ?? "APNG";
  pendingQrExport.value = null;
  lastSaved.value = new Date(project.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function updateLayerTransform(id: LayerKind, update: Partial<LayerTransform>): void {
  if (id === "background-effects") return;
  const frameIndex = Math.max(0, Math.min(4, selectedFrame.value));
  frameLayerTransforms.value = frameLayerTransforms.value.map((frame, index) => (
    index >= frameIndex ? { ...frame, [id]: { ...frame[id], ...update } } : frame
  ));
}

export function updateLayerTransformForAllFrames(id: LayerKind, update: Partial<LayerTransform>): void {
  if (id === "background-effects") return;
  frameLayerTransforms.value = frameLayerTransforms.value.map((frame) => ({ ...frame, [id]: { ...frame[id], ...update } }));
}

export function toggleLayer(id: LayerKind, key: "visible" | "locked"): void {
  if (id === "background-effects") return;
  layers.value = layers.value.map((layer) => (layer.id === id ? { ...layer, [key]: !layer[key] } : layer));
}

export function moveLayer(id: LayerKind, direction: -1 | 1): void {
  if (id === "background-effects") return;
  const list = [...layers.value];
  const index = list.findIndex((layer) => layer.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length || list[target]?.id === "background-effects") return;
  [list[index], list[target]] = [list[target], list[index]];
  layers.value = list;
}

export function reorderLayer(sourceId: LayerKind, targetId: LayerKind): void {
  layers.value = previewLayerOrder(layers.value, sourceId, targetId, "before");
}

export function previewLayerOrder(list: EditorLayer[], sourceId: LayerKind, targetId: LayerKind, position: "before" | "after"): EditorLayer[] {
  const normalized = normalizeEditorLayers(list);
  if (sourceId === "background-effects" || targetId === "background-effects") return normalized;
  const source = normalized.find((layer) => layer.id === sourceId);
  if (!source || sourceId === targetId) return normalized;
  const remaining = normalized.filter((layer) => layer.id !== sourceId);
  const targetIndex = remaining.findIndex((layer) => layer.id === targetId);
  if (targetIndex < 0) return normalized;
  remaining.splice(targetIndex + (position === "after" ? 1 : 0), 0, source);
  return normalizeEditorLayers(remaining);
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
      "background-effects": { ...defaultLayerTransforms["background-effects"] },
      character: { ...frame.character, ...sourceFrame.character },
      "accent-effects": { ...frame["accent-effects"], ...sourceFrame["accent-effects"] },
      text: { ...frame.text, ...sourceFrame.text },
    };
  });
}

export function normalizeEditorLayers(source: EditorLayer[]): EditorLayer[] {
  const defaults = new Map(initialLayers.map((layer) => [layer.id, layer]));
  const seen = new Set<LayerKind>();
  const editable = source.flatMap((layer) => {
    if (layer.id === "background-effects" || seen.has(layer.id) || !defaults.has(layer.id)) return [];
    seen.add(layer.id);
    return [{ ...defaults.get(layer.id)!, ...layer }];
  });
  initialLayers.forEach((layer) => {
    if (layer.id !== "background-effects" && !seen.has(layer.id)) editable.push({ ...layer });
  });
  const background = defaults.get("background-effects")!;
  return [...editable, { ...background, visible: true, locked: true }];
}

export function sanitizeAssetUrl(url: string | null | undefined): string {
  if (!url) return imageAssets.character;
  if (url.startsWith("character://") || url.startsWith("character-frame://")) {
    return imageAssets.character;
  }
  return url;
}
