import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import type { BehaviorCapture, CharacterToken, EmoticonProject, StickerItem } from "../types";

export interface RemoteSyncResult {
  enabled: boolean;
  syncedAt?: string;
  downloadUrl?: string;
  storagePath?: string;
  ownerId?: string;
  storageWarning?: string;
}

type RemoteKind = "characters" | "captures" | "projects" | "stickers";

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
  const result = await postRemoteRecord("projects", payload, project.id);
  return { ...result, ownerId };
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
    },
  };
}

function createStickerDoc(item: StickerItem, ownerId: string) {
  return {
    id: item.id,
    ownerId,
    name: item.title,
    projectId: item.projectId ?? item.id,
    gifStoragePath: item.gifStoragePath ?? "",
    gifUrl: compactAssetUrl(item.animatedImage, ""),
    thumbnail: compactAssetUrl(item.thumbnail ?? item.image, item.animatedImage ?? ""),
    metadata: {
      totalFrames: FRAME_COUNT,
      averageDelay: item.frameDelayMs ?? 120,
      width: EXPORT_SIZE,
      height: EXPORT_SIZE,
      format: "GIF",
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
