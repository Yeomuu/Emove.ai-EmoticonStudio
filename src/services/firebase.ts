import type { BehaviorCapture, CharacterToken, EmoticonProject, StickerItem } from "../types";
import type { FirebaseApp } from "firebase/app";
import { EXPORT_SIZE, FRAME_COUNT } from "../constants";

export interface FirebaseSyncResult { enabled: boolean; syncedAt?: string; downloadUrl?: string; storagePath?: string; ownerId?: string }

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

let analyticsStarted = false;

function getConfig(): FirebaseConfig | null {
  const text = import.meta.env.VITE_FIREBASE_CONFIG?.trim();
  if (text) {
    try {
      const config = JSON.parse(text) as FirebaseConfig;
      return hasRequiredConfig(config) ? config : null;
    } catch { throw new Error("VITE_FIREBASE_CONFIG JSON 형식이 올바르지 않습니다."); }
  }
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  } as FirebaseConfig;
  return hasRequiredConfig(config) ? config : null;
}

function hasRequiredConfig(config: FirebaseConfig): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.storageBucket && config.messagingSenderId && config.appId);
}

async function enableAnalytics(app: FirebaseApp, config: FirebaseConfig): Promise<void> {
  if (analyticsStarted || typeof window === "undefined" || !config.measurementId) return;
  analyticsStarted = true;
  try {
    const analytics = await import("firebase/analytics");
    if (await analytics.isSupported()) analytics.getAnalytics(app);
  } catch {
    analyticsStarted = false;
  }
}

async function getFirebase() {
  const config = getConfig(); if (!config) return null;
  const [{ initializeApp, getApps }, firestore, storage, auth] = await Promise.all([import("firebase/app"), import("firebase/firestore/lite"), import("firebase/storage"), import("firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(config);
  void enableAnalytics(app, config);
  const session = auth.getAuth(app);
  if (!session.currentUser) {
    try { await auth.signInAnonymously(session); }
    catch { throw new Error("Firebase 익명 인증을 사용할 수 없습니다. 콘솔에서 Authentication > Anonymous provider를 활성화해 주세요."); }
  }
  const ownerId = session.currentUser?.uid ?? "anonymous";
  return { firestore, storage, database: firestore.getFirestore(app), bucket: storage.getStorage(app), ownerId };
}

export async function syncStickerToFirebase(item: StickerItem): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { firestore, ownerId } = firebase;
  await firestore.setDoc(firestore.doc(firebase.database, "stickers", item.id), createStickerDoc(item, ownerId, firestore.serverTimestamp()), { merge: true });
  return { enabled: true, syncedAt: new Date().toISOString(), ownerId };
}

export async function syncCharacterToFirebase(item: CharacterToken): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { firestore, ownerId } = firebase;
  await firestore.setDoc(firestore.doc(firebase.database, "characters", item.id), createCharacterDoc(item, ownerId, firestore.serverTimestamp()), { merge: true });
  return { enabled: true, syncedAt: new Date().toISOString(), ownerId };
}

export async function syncCaptureToFirebase(item: BehaviorCapture): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { firestore, ownerId } = firebase;
  const { videoBlob: _video, audioBlob: _audio, ...capture } = item as BehaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  await firestore.setDoc(firestore.doc(firebase.database, "captures", item.id), createCaptureDoc(capture, ownerId, firestore.serverTimestamp()), { merge: true });
  return { enabled: true, syncedAt: new Date().toISOString(), ownerId };
}

export async function syncProjectToFirebase(project: EmoticonProject): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { ownerId } = firebase;
  const storagePath = `emoticons/${ownerId}/${project.id}.gif`;
  const gifRef = firebase.storage.ref(firebase.bucket, storagePath);
  await firebase.storage.uploadBytes(gifRef, project.gifBlob, { contentType: "image/gif", customMetadata: { projectId: project.id, characterTokenId: project.characterToken.id, ownerId, isPublished: String(project.sticker.isPublished) } });
  const downloadUrl = await firebase.storage.getDownloadURL(gifRef); const { videoBlob: _video, audioBlob: _audio, ...capture } = project.behaviorCapture as typeof project.behaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  const timestamp = firebase.firestore.serverTimestamp();
  const sticker = { ...project.sticker, ownerId, animatedImage: downloadUrl, gifStoragePath: storagePath };
  const characterToken = { ...project.characterToken, ownerId };
  await Promise.all([
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "captures", capture.id), createCaptureDoc(capture, ownerId, timestamp), { merge: true }),
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "projects", project.id), createProjectDoc(project, ownerId, downloadUrl, timestamp), { merge: true }),
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "stickers", project.sticker.id), createStickerDoc(sticker, ownerId, timestamp), { merge: true }),
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "characters", project.characterToken.id), createCharacterDoc(characterToken, ownerId, timestamp), { merge: true }),
  ]);
  return { enabled: true, syncedAt: new Date().toISOString(), downloadUrl, storagePath, ownerId };
}

function createCharacterDoc(item: CharacterToken, ownerId: string, timestamp: unknown) {
  return {
    id: item.id,
    ownerId,
    name: item.name,
    token: item.id,
    styleMode: item.styleMode,
    isDefault: item.isDefault,
    imageUrl: compactAssetUrl(item.sourceAsset, `character://${item.id}`),
    metadata: {
      generatedAt: timestamp,
      prompt: item.prompt,
    },
  };
}

function createCaptureDoc(item: Omit<BehaviorCapture, "videoBlob" | "audioBlob">, ownerId: string, timestamp: unknown) {
  const emotionKey = getDominantEmotion(item);
  const expression = item.expression ?? "unknown";
  return {
    id: item.id,
    ownerId,
    behavior: {
      expression,
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
      capturedAt: timestamp,
    },
  };
}

function createProjectDoc(project: EmoticonProject, ownerId: string, gifUrl: string, timestamp: unknown) {
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
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function createStickerDoc(item: StickerItem, ownerId: string, timestamp: unknown) {
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
    createdAt: timestamp,
  };
}

function layerType(id: EmoticonProject["layers"][number]["id"]): "backgroundEffect" | "character" | "accentEffect" | "text" {
  if (id === "background-effects") return "backgroundEffect";
  if (id === "accent-effects") return "accentEffect";
  return id;
}

function layerAssetUrl(project: EmoticonProject, id: EmoticonProject["layers"][number]["id"], frameIndex: number): string {
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
  return /^(data:|blob:)/.test(value) ? fallback : value;
}
