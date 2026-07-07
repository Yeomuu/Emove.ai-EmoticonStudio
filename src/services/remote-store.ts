import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import type { AnimationFormat, BehaviorCapture, CharacterToken, EmoticonProject, StickerItem } from "../types";

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
  createdAt?: unknown;
};

type RemoteCharacterDoc = {
  id?: unknown;
  ownerId?: unknown;
  name?: unknown;
  token?: unknown;
  styleMode?: unknown;
  isDefault?: unknown;
  imageUrl?: unknown;
  metadata?: { generatedAt?: unknown; prompt?: unknown };
};

export async function syncStickerToRemote(item: StickerItem): Promise<RemoteSyncResult> {
  return postRemoteRecord("stickers", createStickerDoc(item, item.ownerId ?? "public"));
}

export async function syncCharacterToRemote(item: CharacterToken): Promise<RemoteSyncResult> {
  return postRemoteRecord("characters", createCharacterDoc(item, item.ownerId ?? "public"));
}

export async function syncCaptureToRemote(item: BehaviorCapture): Promise<RemoteSyncResult> {
  const { videoBlob: _video, audioBlob: _audio, ...capture } = item as BehaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  return postRemoteRecord("captures", createCaptureDoc(capture, item.ownerId ?? "public"));
}

export async function syncProjectToRemote(project: EmoticonProject): Promise<RemoteSyncResult> {
  const ownerId = project.ownerId ?? project.sticker.ownerId ?? "public";
  const { videoBlob: _video, audioBlob: _audio, ...capture } = project.behaviorCapture as typeof project.behaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  const sticker = { ...project.sticker, ownerId };
  const characterToken = { ...project.characterToken, ownerId };
  const gifUrl = compactAssetUrl(sticker.animatedImage, "");
  const payload = {
    project: createProjectDoc({ ...project, sticker, behaviorCapture: capture, characterToken }, ownerId, gifUrl),
    sticker: createStickerDoc(sticker, ownerId),
    character: createCharacterDoc(characterToken, ownerId),
    capture: createCaptureDoc(capture, ownerId),
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
  const [stickers, projects] = await Promise.all([getRemoteRecords("stickers"), getRemoteRecords("projects")]);
  if (!stickers.enabled && !projects.enabled) return { enabled: false, stickers: [], storageWarning: stickers.storageWarning ?? projects.storageWarning };
  const fromStickers = stickers.records.flatMap((record) => {
    const item = stickerFromRemoteDoc(record.payload, record.updatedAt);
    return item ? [item] : [];
  });
  const fromProjects = projects.records.flatMap((record) => {
    const payload = asRecord(record.payload);
    const item = stickerFromRemoteDoc(payload?.sticker, record.updatedAt);
    return item ? [item] : [];
  });
  return { enabled: true, stickers: uniqueById([...fromStickers, ...fromProjects]) };
}

export async function loadRemoteCharacters(): Promise<{ enabled: boolean; characters: CharacterToken[]; storageWarning?: string }> {
  const [characters, projects] = await Promise.all([getRemoteRecords("characters"), getRemoteRecords("projects")]);
  if (!characters.enabled && !projects.enabled) return { enabled: false, characters: [], storageWarning: characters.storageWarning ?? projects.storageWarning };
  const fromCharacters = characters.records.flatMap((record) => {
    const item = characterFromRemoteDoc(record.payload, record.updatedAt);
    return item ? [item] : [];
  });
  const fromProjects = projects.records.flatMap((record) => {
    const payload = asRecord(record.payload);
    const item = characterFromRemoteDoc(payload?.character, record.updatedAt);
    return item ? [item] : [];
  });
  return { enabled: true, characters: uniqueById([...fromCharacters, ...fromProjects]) };
}

async function postRemoteRecord(kind: RemoteKind, payload: unknown, id = recordId(payload)): Promise<RemoteSyncResult> {
  try {
    const response = await fetch(remoteEndpoint(kind), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind, payload }),
    });
    const body = await response.json().catch(() => ({})) as Partial<RemoteSyncResult> & { error?: string };
    if (response.status === 501) return { enabled: false, storageWarning: body.error ?? "원격 DB가 아직 설정되지 않았습니다." };
    if (!response.ok) throw new Error(body.error ?? `원격 저장에 실패했습니다. (${response.status})`);
    return { enabled: true, syncedAt: body.syncedAt ?? new Date().toISOString(), ownerId: body.ownerId, storagePath: body.storagePath, downloadUrl: body.downloadUrl };
  } catch (error) {
    return { enabled: false, storageWarning: error instanceof Error ? error.message : "원격 저장에 실패했습니다." };
  }
}

async function getRemoteRecords(kind: RemoteKind): Promise<{ enabled: boolean; records: RemoteLibraryRecord[]; storageWarning?: string }> {
  try {
    const response = await fetch(remoteEndpoint(kind), { method: "GET" });
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
      expression: item.expression ?? "unknown",
      gesture: item.gesture || item.poseSummary,
      emotionKey,
      poseData: { poseSummary: item.poseSummary },
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
    color: "#BBB6FF",
    favorite: false,
    ownerId: text(doc.ownerId) || "public",
    isDefault: Boolean(doc.isDefault),
    isPublished: Boolean(doc.isPublished),
    characterTokenId: "remote",
    createdAt: text(doc.createdAt) || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || text(doc.createdAt) || new Date().toISOString(),
  };
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
    ownerId: text(doc.ownerId) || "public",
    isDefault: Boolean(doc.isDefault),
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
  if (id === "background-effects") return compactAssetUrl(project.coreEffectImage, "procedural-background-effect");
  if (id === "accent-effects") return "procedural-accent-effect";
  return "text-layer";
}

function getDominantEmotion(item: Omit<BehaviorCapture, "videoBlob" | "audioBlob">): string {
  return Object.entries(item.emotionScores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "unknown";
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
  const allowed: StickerItem["emotion"][] = ["angry", "disgusted", "fearful", "happy", "neutral", "other", "sad", "surprised", "unknown"];
  return allowed.includes(value as StickerItem["emotion"]) ? value as StickerItem["emotion"] : "unknown";
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
