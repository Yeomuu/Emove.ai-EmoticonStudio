import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { coerceEmotion, emotionMeta, emptyEmotionScores as createEmptyEmotionScores, normalizeEmotionScores } from "../emotion-taxonomy";
import type { AnimationFormat, BehaviorCapture, CharacterToken, EmoticonProject, LayerKind, LayerTransform, StickerItem } from "../types";

export interface RemoteSyncResult {
  enabled: boolean;
  syncedAt?: string;
  downloadUrl?: string;
  storagePath?: string;
  ownerId?: string;
  storageWarning?: string;
}

type RemoteKind = "characters" | "captures" | "projects" | "stickers";
type RemoteLibraryRecord = { id: string; kind: RemoteKind; payload: unknown; createdAt?: string; updatedAt?: string };
const REMOTE_REQUEST_TIMEOUT_MS = 14_000;
const PUBLIC_LIBRARY_OWNER_ID = "public";

type RemoteStickerDoc = {
  id?: unknown;
  ownerId?: unknown;
  name?: unknown;
  projectId?: unknown;
  gifStoragePath?: unknown;
  gifUrl?: unknown;
  thumbnail?: unknown;
  metadata?: { averageDelay?: unknown; format?: unknown };
  category?: { group?: unknown; emotion?: unknown };
  isDefault?: unknown;
  isPublished?: unknown;
  favorite?: unknown;
  createdAt?: unknown;
};

type RemoteCharacterDoc = {
  id?: unknown;
  ownerId?: unknown;
  name?: unknown;
  token?: unknown;
  styleMode?: unknown;
  isDefault?: unknown;
  favorite?: unknown;
  imageUrl?: unknown;
  metadata?: { generatedAt?: unknown; prompt?: unknown };
};

export async function syncStickerToRemote(item: StickerItem): Promise<RemoteSyncResult> {
  return postRemoteRecord("stickers", createStickerDoc(item, PUBLIC_LIBRARY_OWNER_ID));
}

export async function syncCharacterToRemote(item: CharacterToken): Promise<RemoteSyncResult> {
  return postRemoteRecord("characters", createCharacterDoc(item, PUBLIC_LIBRARY_OWNER_ID));
}

export async function syncCaptureToRemote(item: BehaviorCapture): Promise<RemoteSyncResult> {
  const { videoBlob: _video, audioBlob: _audio, ...capture } = item as BehaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  return postRemoteRecord("captures", createCaptureDoc(capture, PUBLIC_LIBRARY_OWNER_ID));
}

export async function syncProjectToRemote(project: EmoticonProject): Promise<RemoteSyncResult> {
  const ownerId = PUBLIC_LIBRARY_OWNER_ID;
  const { videoBlob: _video, audioBlob: _audio, ...capture } = project.behaviorCapture as typeof project.behaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  const sticker = { ...project.sticker, ownerId };
  const characterToken = { ...project.characterToken, ownerId };
  const gifUrl = compactAssetUrl(sticker.animatedImage, "");
  const payload = {
    project: createProjectDoc({ ...project, sticker, behaviorCapture: capture, characterToken }, ownerId, gifUrl),
    sticker: createStickerDoc(sticker, ownerId),
    character: createCharacterDoc(characterToken, ownerId),
    capture: createCaptureDoc(capture, ownerId),
    snapshot: createProjectSnapshot({ ...project, ownerId, sticker, behaviorCapture: capture, characterToken }),
  };
  const syncResults = await Promise.all([
    postRemoteRecord("projects", payload, project.id),
    postRemoteRecord("stickers", payload.sticker, sticker.id),
    postRemoteRecord("characters", payload.character, characterToken.id),
    postRemoteRecord("captures", payload.capture, capture.id),
  ]);
  const [result] = syncResults;
  const enabled = syncResults.some((item) => item.enabled);
  const primary = result.enabled ? result : syncResults.find((item) => item.enabled) ?? result;
  const storageWarning = syncResults
    .map((item) => item.storageWarning)
    .find(Boolean);
  return { ...primary, enabled, ownerId, storageWarning };
}

export async function loadRemoteStickers(): Promise<{ enabled: boolean; stickers: StickerItem[]; storageWarning?: string }> {
  const stickers = await getRemoteRecords("stickers");
  if (!stickers.enabled) return { enabled: false, stickers: [], storageWarning: stickers.storageWarning };
  const items = stickers.records.flatMap((record) => {
    const item = stickerFromRemoteDoc(record.payload, record.updatedAt);
    return item ? [item] : [];
  });
  return { enabled: true, stickers: uniqueById(items) };
}

export async function loadRemoteCharacters(): Promise<{ enabled: boolean; characters: CharacterToken[]; storageWarning?: string }> {
  const characters = await getRemoteRecords("characters");
  if (!characters.enabled) return { enabled: false, characters: [], storageWarning: characters.storageWarning };
  const items = characters.records.flatMap((record) => {
    const item = characterFromRemoteDoc(record.payload, record.updatedAt);
    return item ? [item] : [];
  });
  return { enabled: true, characters: uniqueById(items) };
}

export async function loadRemoteProjects(): Promise<{ enabled: boolean; projects: EmoticonProject[]; storageWarning?: string }> {
  const projects = await getRemoteRecords("projects");
  if (!projects.enabled) return { enabled: false, projects: [], storageWarning: projects.storageWarning };
  const items = projects.records.flatMap((record) => {
    const item = projectFromRemoteDoc(record.payload, record.updatedAt);
    return item ? [item] : [];
  });
  return { enabled: true, projects: uniqueById(items) };
}

export async function deleteRemoteLibraryItem(kind: "emoticon" | "character", id: string, projectId?: string): Promise<RemoteSyncResult> {
  const targets: Array<[RemoteKind, string]> = kind === "emoticon"
    ? [["stickers", id], ...(projectId ? [["projects", projectId] as [RemoteKind, string]] : [])]
    : [["characters", id]];
  const results = await Promise.all(targets.map(([targetKind, targetId]) => deleteRemoteRecord(targetKind, targetId)));
  const failure = results.find((result) => !result.enabled);
  return failure ?? { enabled: true, syncedAt: new Date().toISOString(), ownerId: PUBLIC_LIBRARY_OWNER_ID };
}

async function postRemoteRecord(kind: RemoteKind, payload: unknown, id = recordId(payload)): Promise<RemoteSyncResult> {
  try {
    const response = await fetch(remoteEndpoint(kind), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind, payload }),
      signal: AbortSignal.timeout(REMOTE_REQUEST_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({})) as Partial<RemoteSyncResult> & { error?: string };
    if (response.status === 501) return { enabled: false, storageWarning: body.error ?? "원격 DB가 아직 설정되지 않았습니다." };
    if (!response.ok) throw new Error(body.error ?? `원격 저장에 실패했습니다. (${response.status})`);
    return { enabled: true, syncedAt: body.syncedAt ?? new Date().toISOString(), ownerId: body.ownerId, storagePath: body.storagePath, downloadUrl: body.downloadUrl };
  } catch (error) {
    return { enabled: false, storageWarning: error instanceof Error ? error.message : "원격 저장에 실패했습니다." };
  }
}

async function deleteRemoteRecord(kind: RemoteKind, id: string): Promise<RemoteSyncResult> {
  try {
    const response = await fetch(`${remoteEndpoint(kind)}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(REMOTE_REQUEST_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({})) as { deletedAt?: string; error?: string };
    if (response.status === 501) return { enabled: false, storageWarning: body.error ?? "원격 DB가 아직 설정되지 않았습니다." };
    if (!response.ok) throw new Error(body.error ?? `원격 삭제에 실패했습니다. (${response.status})`);
    return { enabled: true, syncedAt: body.deletedAt ?? new Date().toISOString(), ownerId: PUBLIC_LIBRARY_OWNER_ID };
  } catch (error) {
    return { enabled: false, storageWarning: error instanceof Error ? error.message : "원격 삭제에 실패했습니다." };
  }
}

async function getRemoteRecords(kind: RemoteKind): Promise<{ enabled: boolean; records: RemoteLibraryRecord[]; storageWarning?: string }> {
  try {
    const response = await fetch(remoteEndpoint(kind), {
      method: "GET",
      signal: AbortSignal.timeout(REMOTE_REQUEST_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({})) as { records?: RemoteLibraryRecord[]; error?: string };
    if (response.status === 501) return { enabled: false, records: [], storageWarning: body.error ?? "원격 DB가 아직 설정되지 않았습니다." };
    if (!response.ok) throw new Error(body.error ?? `원격 보관함 조회에 실패했습니다. (${response.status})`);
    return { enabled: true, records: Array.isArray(body.records) ? body.records : [] };
  } catch (error) {
    return { enabled: false, records: [], storageWarning: error instanceof Error ? error.message : "원격 보관함 조회에 실패했습니다." };
  }
}

function remoteEndpoint(kind: RemoteKind): string {
  const base = process.env.NEXT_PUBLIC_LIBRARY_API_BASE?.trim();
  if (!base) return `/api/library/${kind}`;
  return `${base.replace(/\/+$/, "")}/api/library/${kind}`;
}

function recordId(value: unknown): string {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return `record-${Date.now()}`;
}

function createCharacterDoc(item: CharacterToken, ownerId: string) {
  return {
    id: item.id,
    ownerId,
    name: item.name,
    token: item.id,
    styleMode: item.styleMode,
    isDefault: item.isDefault,
    favorite: Boolean(item.favorite),
    imageUrl: compactAssetUrl(item.sourceAsset, `character://${item.id}`),
    metadata: {
      generatedAt: item.createdAt || new Date().toISOString(),
      prompt: item.prompt,
    },
  };
}

function createCaptureDoc(item: Omit<BehaviorCapture, "videoBlob" | "audioBlob">, ownerId: string) {
  const emotionKey = getDominantEmotion(item);
  return {
    id: item.id,
    ownerId,
    behavior: {
      expression: item.expression ?? "neutral",
      gesture: item.gesture || item.poseSummary,
      emotionKey,
      poseData: {
        poseSummary: item.poseSummary,
        handGesture: item.handGesture,
        handConfidence: item.handConfidence,
        bodyGesture: item.bodyGesture,
        bodyConfidence: item.bodyConfidence,
      },
    },
    voice: {
      waveformData: [item.audio.rms, item.audio.peak, item.audio.energy],
      speechText: item.sourceText,
      voiceIntensity: Math.max(0, Math.min(1, item.audio.peak)),
    },
    backgroundEffect: {
      recommendedEmotion: emotionKey,
      colorGuide: emotionKey,
    },
    metadata: {
      capturedAt: item.createdAt || new Date().toISOString(),
    },
  };
}

function createProjectDoc(project: Omit<EmoticonProject, "gifBlob">, ownerId: string, gifUrl: string) {
  return {
    id: project.id,
    ownerId,
    name: project.sticker.title,
    characterId: project.characterToken.id,
    captureId: project.behaviorCapture.id,
    frames: Array.from({ length: FRAME_COUNT }, (_, frameIndex) => ({
      frameIndex,
      layers: project.layers.map((layer, layerOrder) => {
        const transform = project.frameLayerTransforms[frameIndex]?.[layer.id] ?? project.layerTransforms[layer.id];
        const base = {
          type: layerType(layer.id),
          layerOrder,
          assetUrl: layerAssetUrl(project, layer.id, frameIndex),
          transform,
        };
        return layer.id === "text" ? { ...base, content: project.motionBrief.shortText, style: project.textStyle } : base;
      }),
      delay: project.motionBrief.frameDelayMs,
    })),
    generatedPrompt: project.motionBrief.sourceText,
    gifUrl,
    isPublished: project.sticker.isPublished,
    metadata: {
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      format: project.animationFormat ?? project.sticker.animationFormat ?? "APNG",
    },
  };
}

function createProjectSnapshot(project: Omit<EmoticonProject, "gifBlob" | "animationBlob">): Omit<EmoticonProject, "gifBlob" | "animationBlob"> {
  return {
    ...project,
    ownerId: PUBLIC_LIBRARY_OWNER_ID,
    sticker: {
      ...project.sticker,
      ownerId: PUBLIC_LIBRARY_OWNER_ID,
      image: compactAssetUrl(project.sticker.image, ""),
      animatedImage: compactAssetUrl(project.sticker.animatedImage, "") || undefined,
      thumbnail: compactAssetUrl(project.sticker.thumbnail, "") || undefined,
    },
    characterToken: {
      ...project.characterToken,
      ownerId: PUBLIC_LIBRARY_OWNER_ID,
      sourceAsset: compactAssetUrl(project.characterToken.sourceAsset, ""),
      referenceImages: project.characterToken.referenceImages.map((asset) => compactAssetUrl(asset, "")).filter(Boolean),
    },
    frameImages: project.frameImages.map((asset) => compactAssetUrl(asset, "")).filter(Boolean),
    coreEffectImage: null,
  };
}

function createStickerDoc(item: StickerItem, ownerId: string) {
  const format = item.animationFormat ?? inferAnimationFormat(item.animatedImage) ?? "APNG";
  return {
    id: item.id,
    ownerId,
    name: item.title,
    projectId: item.projectId ?? item.id,
    gifStoragePath: item.animationStoragePath ?? item.gifStoragePath ?? "",
    gifUrl: compactAssetUrl(item.animatedImage, ""),
    thumbnail: compactAssetUrl(item.thumbnail ?? item.image, item.animatedImage ?? ""),
    metadata: {
      totalFrames: FRAME_COUNT,
      averageDelay: item.frameDelayMs ?? 120,
      width: EXPORT_SIZE,
      height: EXPORT_SIZE,
      format,
    },
    category: {
      group: item.group ?? "이모티콘 그룹",
      emotion: item.emotion,
    },
    isDefault: item.isDefault,
    isPublished: item.isPublished,
    favorite: item.favorite,
    createdAt: item.createdAt,
  };
}

function stickerFromRemoteDoc(value: unknown, updatedAt?: string): StickerItem | null {
  const doc = asRecord(value) as RemoteStickerDoc | null;
  if (!doc) return null;
  const id = text(doc.id);
  const title = text(doc.name) || "공유 이모티콘";
  const animatedImage = text(doc.gifUrl);
  const image = text(doc.thumbnail) || animatedImage;
  if (!id || !image) return null;
  const emotion = toEmotion(text(doc.category?.emotion));
  return {
    id,
    title,
    phrase: title,
    emotion,
    image,
    animatedImage: animatedImage || image,
    animationFormat: toAnimationFormat(text(doc.metadata?.format), animatedImage),
    animationStoragePath: text(doc.gifStoragePath) || undefined,
    thumbnail: text(doc.thumbnail) || image,
    gifStoragePath: text(doc.gifStoragePath) || undefined,
    projectId: text(doc.projectId) || id,
    group: text(doc.category?.group) || "이모티콘 그룹",
    frameDelayMs: numberValue(doc.metadata?.averageDelay) ?? 120,
    color: emotionMeta[emotion].color,
    favorite: Boolean(doc.favorite),
    ownerId: PUBLIC_LIBRARY_OWNER_ID,
    isDefault: Boolean(doc.isDefault),
    isPublished: Boolean(doc.isPublished),
    characterTokenId: "remote",
    createdAt: text(doc.createdAt) || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || text(doc.createdAt) || new Date().toISOString(),
  };
}

function projectFromRemoteDoc(value: unknown, updatedAt?: string): EmoticonProject | null {
  const envelope = asRecord(value);
  const snapshot = asRecord(envelope?.snapshot);
  if (!snapshot) return legacyProjectFromRemoteDoc(envelope, updatedAt);
  const sticker = asRecord(snapshot.sticker) as unknown as StickerItem | null;
  const characterToken = asRecord(snapshot.characterToken) as unknown as CharacterToken | null;
  const behaviorCapture = asRecord(snapshot.behaviorCapture) as unknown as EmoticonProject["behaviorCapture"] | null;
  const motionBrief = asRecord(snapshot.motionBrief) as unknown as EmoticonProject["motionBrief"] | null;
  const textStyle = asRecord(snapshot.textStyle) as unknown as EmoticonProject["textStyle"] | null;
  const id = text(snapshot.id);
  if (!id || !sticker || !characterToken || !behaviorCapture || !motionBrief || !textStyle) return null;
  const layers = normalizeRemoteLayers(Array.isArray(snapshot.layers) ? snapshot.layers as unknown as EmoticonProject["layers"] : []);
  const layerTransforms = asRecord(snapshot.layerTransforms) as unknown as EmoticonProject["layerTransforms"] | null;
  const frameLayerTransforms = Array.isArray(snapshot.frameLayerTransforms)
    ? snapshot.frameLayerTransforms as unknown as EmoticonProject["frameLayerTransforms"]
    : [];
  const frameImages = Array.isArray(snapshot.frameImages) ? snapshot.frameImages.filter((asset): asset is string => typeof asset === "string") : [];
  if (!layers.length || !layerTransforms || !frameLayerTransforms.length || !frameImages.length) return null;
  const stickerEmotion = coerceEmotion(sticker.emotion);
  const captureScores = normalizeEmotionScores(asRecord(behaviorCapture.emotionScores)) ?? { ...createEmptyEmotionScores(), neutral: 1 };
  const normalizedCapture: EmoticonProject["behaviorCapture"] = {
    ...behaviorCapture,
    expression: coerceEmotion(behaviorCapture.expression),
    emotionScores: captureScores,
  };
  const normalizedBrief: EmoticonProject["motionBrief"] = {
    ...motionBrief,
    emotion: coerceEmotion(motionBrief.emotion),
    expressionEmotion: coerceEmotion(motionBrief.expressionEmotion),
    coreEffect: emotionMeta[coerceEmotion(motionBrief.emotion)].effect,
    effectColor: emotionMeta[coerceEmotion(motionBrief.emotion)].color,
    accentEffect: motionBrief.accentEffect ?? "sparkles",
    accentColor: motionBrief.accentColor ?? emotionMeta[coerceEmotion(motionBrief.emotion)].color,
  };
  return {
    id,
    ownerId: PUBLIC_LIBRARY_OWNER_ID,
    sticker: { ...sticker, emotion: stickerEmotion, ownerId: PUBLIC_LIBRARY_OWNER_ID },
    characterToken: { ...characterToken, ownerId: PUBLIC_LIBRARY_OWNER_ID },
    behaviorCapture: normalizedCapture,
    frameImages,
    layers,
    layerTransforms,
    frameLayerTransforms,
    coreEffectImage: null,
    textStyle,
    motionBrief: normalizedBrief,
    animationFormat: toAnimationFormat(text(snapshot.animationFormat), sticker.animatedImage),
    createdAt: text(snapshot.createdAt) || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || text(snapshot.updatedAt) || new Date().toISOString(),
  };
}

function legacyProjectFromRemoteDoc(envelope: Record<string, unknown> | null, updatedAt?: string): EmoticonProject | null {
  if (!envelope) return null;
  const project = asRecord(envelope.project);
  const sticker = stickerFromRemoteDoc(envelope.sticker, updatedAt);
  const characterToken = characterFromRemoteDoc(envelope.character, updatedAt);
  const capture = captureFromRemoteDoc(envelope.capture);
  const id = text(project?.id);
  const frames = Array.isArray(project?.frames) ? project.frames.map(asRecord).filter((frame): frame is Record<string, unknown> => Boolean(frame)) : [];
  if (!project || !id || !sticker || !characterToken || !capture || !frames.length) return null;

  const firstLayers = Array.isArray(frames[0]?.layers) ? frames[0].layers.map(asRecord).filter((layer): layer is Record<string, unknown> => Boolean(layer)) : [];
  const orderedLayerKinds = firstLayers
    .sort((a, b) => (numberValue(a.layerOrder) ?? 0) - (numberValue(b.layerOrder) ?? 0))
    .map((layer) => layerKind(text(layer.type)))
    .filter((kind): kind is LayerKind => Boolean(kind));
  const requiredOrder: LayerKind[] = ["text", "accent-effects", "character", "background-effects"];
  const layers = normalizeRemoteLayers(requiredOrder.map((kind) => ({
    id: kind,
    label: layerLabel(kind),
    description: "Firebase 공용 프로젝트에서 복원된 레이어",
    visible: true,
    locked: kind === "background-effects",
  })).sort((a, b) => {
    const ai = orderedLayerKinds.indexOf(a.id);
    const bi = orderedLayerKinds.indexOf(b.id);
    return (ai < 0 ? requiredOrder.indexOf(a.id) : ai) - (bi < 0 ? requiredOrder.indexOf(b.id) : bi);
  }));
  const frameLayerTransforms = frames.map((frame) => frameTransformsFromRemote(frame));
  const frameImages = frames.map((frame) => {
    const layerRows = Array.isArray(frame.layers) ? frame.layers.map(asRecord) : [];
    return text(layerRows.find((layer) => text(layer?.type) === "character")?.assetUrl) || characterToken.sourceAsset;
  });
  const textLayer = firstLayers.find((layer) => text(layer.type) === "text");
  const frameDelayMs = numberValue(frames[0]?.delay) ?? sticker.frameDelayMs ?? 120;
  const shortText = text(textLayer?.content) || sticker.phrase || sticker.title;
  const textStyleRow = asRecord(textLayer?.style);
  const shape = text(textStyleRow?.shape);
  const font = text(textStyleRow?.font);
  const emotion = sticker.emotion;
  const createdAt = text(asRecord(project.metadata)?.createdAt) || sticker.createdAt || updatedAt || new Date().toISOString();

  return {
    id,
    ownerId: PUBLIC_LIBRARY_OWNER_ID,
    sticker: { ...sticker, ownerId: PUBLIC_LIBRARY_OWNER_ID },
    characterToken: { ...characterToken, ownerId: PUBLIC_LIBRARY_OWNER_ID },
    behaviorCapture: capture,
    frameImages,
    layers,
    layerTransforms: frameLayerTransforms[0] ?? defaultFrameTransforms(),
    frameLayerTransforms,
    coreEffectImage: null,
    textStyle: {
      shape: shape === "rounded" || shape === "caption" ? shape : "pill",
      font: font === "Paperlogy" ? "Paperlogy" : "Pretendard",
    },
    motionBrief: {
      sourceText: text(project.generatedPrompt) || shortText,
      shortText,
      expressionEmotion: capture.expression ?? emotion,
      emotion,
      confidence: capture.emotionConfidence ?? .7,
      motionIntensity: Math.max(.2, Math.min(1, capture.audio.energy || .5)),
      exaggerationTier: capture.audio.energy >= .68 ? "full" : capture.audio.energy >= .34 ? "emotional" : "minimal",
      pose: capture.poseSummary,
      coreEffect: emotionMeta[emotion].effect,
      effectColor: emotionMeta[emotion].color,
      accentEffect: "sparkles",
      accentColor: emotionMeta[emotion].color,
      duration: Math.max(.4, frameDelayMs * Math.max(1, frames.length) / 1000),
      frameDelayMs,
      motionStyle: "smooth",
      characterTokenId: characterToken.id,
    },
    animationFormat: toAnimationFormat(text(asRecord(project.metadata)?.format), sticker.animatedImage),
    createdAt,
    updatedAt: updatedAt || text(asRecord(project.metadata)?.updatedAt) || createdAt,
  };
}

function captureFromRemoteDoc(value: unknown): EmoticonProject["behaviorCapture"] | null {
  const doc = asRecord(value);
  const behavior = asRecord(doc?.behavior);
  const poseData = asRecord(behavior?.poseData);
  const voice = asRecord(doc?.voice);
  const metadata = asRecord(doc?.metadata);
  const id = text(doc?.id);
  if (!id || !behavior || !voice) return null;
  const expression = toEmotion(text(behavior.expression));
  const emotion = toEmotion(text(behavior.emotionKey));
  const rms = numberValue(Array.isArray(voice.waveformData) ? voice.waveformData[0] : undefined) ?? 0;
  const peak = numberValue(voice.voiceIntensity) ?? numberValue(Array.isArray(voice.waveformData) ? voice.waveformData[1] : undefined) ?? 0;
  const energy = numberValue(Array.isArray(voice.waveformData) ? voice.waveformData[2] : undefined) ?? Math.min(1, rms * .8 + peak * .2);
  const scores = emptyEmotionScores();
  scores[emotion] = 1;
  return {
    id,
    ownerId: PUBLIC_LIBRARY_OWNER_ID,
    poseSummary: text(poseData?.poseSummary) || text(behavior.gesture) || "복원된 사용자 동작",
    gesture: text(behavior.gesture) || "Unclassified",
    handGesture: text(poseData?.handGesture) || undefined,
    handConfidence: numberValue(poseData?.handConfidence),
    bodyGesture: text(poseData?.bodyGesture) || undefined,
    bodyConfidence: numberValue(poseData?.bodyConfidence),
    expression,
    emotionScores: scores,
    emotionSource: "voice",
    emotionProvider: "local-voice-heuristic",
    emotionConfidence: .7,
    sourceText: text(voice.speechText),
    shortText: text(voice.speechText).slice(0, 24),
    audio: { rms, peak, energy, capturedAt: text(metadata?.capturedAt) || new Date().toISOString() },
    createdAt: text(metadata?.capturedAt) || new Date().toISOString(),
  };
}

function frameTransformsFromRemote(frame: Record<string, unknown>): Record<LayerKind, LayerTransform> {
  const output = defaultFrameTransforms();
  const rows = Array.isArray(frame.layers) ? frame.layers.map(asRecord) : [];
  rows.forEach((row) => {
    const kind = layerKind(text(row?.type));
    if (kind === "background-effects") return;
    const transform = asRecord(row?.transform);
    if (!kind || !transform) return;
    output[kind] = {
      x: numberValue(transform.x) ?? output[kind].x,
      y: numberValue(transform.y) ?? output[kind].y,
      scale: numberValue(transform.scale) ?? output[kind].scale,
      rotation: numberValue(transform.rotation) ?? output[kind].rotation,
    };
  });
  return output;
}

function defaultFrameTransforms(): Record<LayerKind, LayerTransform> {
  return {
    "background-effects": { x: 0, y: 0, scale: 1, rotation: 0 },
    character: { x: 0, y: 0, scale: 1, rotation: 0 },
    "accent-effects": { x: 0, y: 0, scale: 1, rotation: 0 },
    text: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function layerKind(value: string): LayerKind | null {
  if (value === "backgroundEffect") return "background-effects";
  if (value === "accentEffect") return "accent-effects";
  if (value === "character" || value === "text") return value;
  return null;
}

function layerLabel(value: LayerKind): string {
  if (value === "background-effects") return "배경 이펙트";
  if (value === "accent-effects") return "부가 이펙트";
  if (value === "character") return "캐릭터";
  return "텍스트";
}

function emptyEmotionScores(): BehaviorCapture["emotionScores"] {
  return createEmptyEmotionScores();
}

function characterFromRemoteDoc(value: unknown, updatedAt?: string): CharacterToken | null {
  const doc = asRecord(value) as RemoteCharacterDoc | null;
  if (!doc) return null;
  const id = text(doc.id) || text(doc.token);
  const imageUrl = text(doc.imageUrl);
  if (!id || !imageUrl) return null;
  const styleMode = text(doc.styleMode) === "2D" ? "2D" : "3D";
  const createdAt = text(doc.metadata?.generatedAt) || updatedAt || new Date().toISOString();
  return {
    id,
    version: 1,
    name: text(doc.name) || "공유 캐릭터",
    ownerId: PUBLIC_LIBRARY_OWNER_ID,
    isDefault: Boolean(doc.isDefault),
    favorite: Boolean(doc.favorite),
    sourceAsset: imageUrl,
    referenceImages: [imageUrl],
    styleMode,
    stylePreset: styleMode === "2D" ? "Soft 2D" : "Soft 3D",
    styleDescription: `${styleMode} shared EMOVE character`,
    prompt: text(doc.metadata?.prompt) || "",
    observableTraits: [],
    personalityTags: [],
    colors: { body: "#BBB6FF", accent: "#BBB6FF", eyes: "#201E28" },
    fixedTraits: [],
    doNotChange: [],
    createdAt,
    updatedAt: updatedAt || createdAt,
  };
}

function layerType(id: EmoticonProject["layers"][number]["id"]): "backgroundEffect" | "character" | "accentEffect" | "text" {
  if (id === "background-effects") return "backgroundEffect";
  if (id === "accent-effects") return "accentEffect";
  return id;
}

function layerAssetUrl(project: Omit<EmoticonProject, "gifBlob">, id: EmoticonProject["layers"][number]["id"], frameIndex: number): string {
  if (id === "character") return compactAssetUrl(project.frameImages[frameIndex] ?? project.characterToken.sourceAsset, `character-frame://${project.characterToken.id}/${frameIndex}`);
  if (id === "background-effects") return `procedural-background-effect:${project.motionBrief.emotion}`;
  if (id === "accent-effects") return "procedural-accent-effect";
  return "text-layer";
}

function normalizeRemoteLayers(source: EmoticonProject["layers"]): EmoticonProject["layers"] {
  const required: LayerKind[] = ["text", "accent-effects", "character", "background-effects"];
  const rows = new Map(source.map((layer) => [layer.id, layer]));
  const seen = new Set<LayerKind>();
  const editable = source.flatMap((layer) => {
    if (layer.id === "background-effects" || seen.has(layer.id) || !required.includes(layer.id)) return [];
    seen.add(layer.id);
    return [{
      ...layer,
      label: layer.label || layerLabel(layer.id),
      description: layer.description || "공용 프로젝트 레이어",
    }];
  });
  required.forEach((id) => {
    if (id !== "background-effects" && !seen.has(id)) editable.push({ id, label: layerLabel(id), description: "공용 프로젝트 레이어", visible: true, locked: false });
  });
  const background = rows.get("background-effects");
  return [...editable, {
    id: "background-effects",
    label: background?.label || layerLabel("background-effects"),
    description: "감정별 고정 효과",
    visible: true,
    locked: true,
  }];
}

function getDominantEmotion(item: Omit<BehaviorCapture, "videoBlob" | "audioBlob">): string {
  return Object.entries(item.emotionScores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "neutral";
}

function compactAssetUrl(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^(data:|blob:)/.test(value)) return /^(data:|blob:)/.test(fallback) ? "" : fallback;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toEmotion(value: string): StickerItem["emotion"] {
  return coerceEmotion(value);
}

function inferAnimationFormat(value: string | null | undefined): AnimationFormat | null {
  const lower = value?.toLowerCase() ?? "";
  if (lower.includes(".apng") || lower.includes("image/apng")) return "APNG";
  if (lower.includes(".webp") || lower.includes("image/webp")) return "WEBP";
  if (lower.includes(".gif") || lower.includes("image/gif")) return "GIF";
  return null;
}

function toAnimationFormat(value: string, url?: string): AnimationFormat {
  const upper = value.toUpperCase();
  if (upper === "GIF" || upper === "WEBP" || upper === "APNG") return upper;
  return inferAnimationFormat(url) ?? "APNG";
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
