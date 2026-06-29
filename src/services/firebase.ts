import type { BehaviorCapture, CharacterToken, EmoticonProject, StickerItem } from "../types";
import type { FirebaseApp } from "firebase/app";

export interface FirebaseSyncResult { enabled: boolean; syncedAt?: string; downloadUrl?: string; ownerId?: string }

let analyticsStarted = false;

function getConfig(): Record<string, string> | null {
  const text = import.meta.env.VITE_FIREBASE_CONFIG; if (!text) return null;
  try { return JSON.parse(text) as Record<string, string>; } catch { throw new Error("VITE_FIREBASE_CONFIG JSON 형식이 올바르지 않습니다."); }
}

async function enableAnalytics(app: FirebaseApp, config: Record<string, string>): Promise<void> {
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
  await firestore.setDoc(firestore.doc(firebase.database, "stickers", item.id), { ...item, ownerId, syncedAt: firestore.serverTimestamp() }, { merge: true });
  return { enabled: true, syncedAt: new Date().toISOString(), ownerId };
}

export async function syncCharacterToFirebase(item: CharacterToken): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { firestore, ownerId } = firebase;
  await firestore.setDoc(firestore.doc(firebase.database, "characters", item.id), { ...item, ownerId, syncedAt: firestore.serverTimestamp() }, { merge: true });
  return { enabled: true, syncedAt: new Date().toISOString(), ownerId };
}

export async function syncCaptureToFirebase(item: BehaviorCapture): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { firestore, ownerId } = firebase;
  const { videoBlob: _video, audioBlob: _audio, ...capture } = item as BehaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  await firestore.setDoc(firestore.doc(firebase.database, "captures", item.id), { ...capture, ownerId, syncedAt: firestore.serverTimestamp() }, { merge: true });
  return { enabled: true, syncedAt: new Date().toISOString(), ownerId };
}

export async function syncProjectToFirebase(project: EmoticonProject): Promise<FirebaseSyncResult> {
  const firebase = await getFirebase(); if (!firebase) return { enabled: false };
  const { ownerId } = firebase;
  const gifRef = firebase.storage.ref(firebase.bucket, `emoticons/${ownerId}/${project.id}.gif`);
  await firebase.storage.uploadBytes(gifRef, project.gifBlob, { contentType: "image/gif", customMetadata: { projectId: project.id, characterTokenId: project.characterToken.id, ownerId, isPublished: String(project.sticker.isPublished) } });
  const downloadUrl = await firebase.storage.getDownloadURL(gifRef); const { videoBlob: _video, audioBlob: _audio, ...capture } = project.behaviorCapture as typeof project.behaviorCapture & { videoBlob?: Blob; audioBlob?: Blob };
  const sticker = { ...project.sticker, ownerId };
  const characterToken = { ...project.characterToken, ownerId };
  await Promise.all([
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "projects", project.id), { ...project, ownerId, sticker, characterToken, gifBlob: undefined, gifUrl: downloadUrl, coreEffectImage: undefined, behaviorCapture: { ...capture, ownerId }, syncedAt: firebase.firestore.serverTimestamp() }, { merge: true }),
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "stickers", project.sticker.id), { ...sticker, image: downloadUrl, syncedAt: firebase.firestore.serverTimestamp() }, { merge: true }),
    firebase.firestore.setDoc(firebase.firestore.doc(firebase.database, "characters", project.characterToken.id), { ...characterToken, syncedAt: firebase.firestore.serverTimestamp() }, { merge: true }),
  ]);
  return { enabled: true, syncedAt: new Date().toISOString(), downloadUrl, ownerId };
}
