import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import { firebaseAdminConfigurationError, getEmoveFirebaseApp } from "./firebase-admin";
import { firebaseStorageConfigurationError, isFirebaseStorageConfigured, uploadFirebaseAsset, type FirebaseAssetKind } from "./firebase-storage";

export type OpenAIJobStatus = "pending" | "running" | "complete" | "failed";

type OpenAIJobDocument = {
  id: string;
  route: string;
  status: OpenAIJobStatus;
  result?: unknown;
  error?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const JOB_COLLECTION = "emove_openai_jobs";
const FIRESTORE_TIMEOUT_MS = 5_000;
let firestoreClient: Firestore | null = null;

export function openAIJobConfigurationError(): string | null {
  return firebaseAdminConfigurationError() ?? firebaseStorageConfigurationError();
}

export function canUseOpenAIJobs(): boolean {
  return openAIJobConfigurationError() == null && isFirebaseStorageConfigured();
}

export async function createOpenAIJob(id: string, route: string): Promise<void> {
  const database = jobFirestore();
  if (!database) throw new Error(openAIJobConfigurationError() ?? "OpenAI 작업 저장소가 설정되지 않았습니다.");
  await withTimeout(database.collection(JOB_COLLECTION).doc(id).set({
    id,
    route,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  } satisfies OpenAIJobDocument));
}

export async function markOpenAIJobRunning(id: string): Promise<void> {
  await updateOpenAIJob(id, { status: "running", error: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
}

export async function completeOpenAIJob(id: string, result: unknown): Promise<void> {
  await updateOpenAIJob(id, { status: "complete", result, error: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
}

export async function failOpenAIJob(id: string, error: unknown): Promise<void> {
  await updateOpenAIJob(id, {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    result: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function readOpenAIJob(id: string): Promise<{ status: OpenAIJobStatus; result?: unknown; error?: string } | null> {
  const database = jobFirestore();
  if (!database) return null;
  const snapshot = await withTimeout(database.collection(JOB_COLLECTION).doc(id).get());
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Partial<OpenAIJobDocument> | undefined;
  const status = data?.status;
  if (status !== "pending" && status !== "running" && status !== "complete" && status !== "failed") return null;
  return { status, result: data?.result, error: data?.error };
}

export async function persistOpenAIJobImages(route: string, result: unknown, requestUrl: string, jobId: string): Promise<unknown> {
  if (!result || typeof result !== "object") return result;
  const source = result as Record<string, unknown>;
  const kind = assetKindForRoute(route);
  const cache = new Map<string, string>();
  const persist = async (value: unknown, suffix: string): Promise<unknown> => {
    if (typeof value !== "string" || !value.startsWith("data:image/")) return value;
    const cached = cache.get(value);
    if (cached) return cached;
    const decoded = decodeImageDataUrl(value);
    const extension = extensionForMime(decoded.contentType);
    const stored = await uploadFirebaseAsset(decoded.data, {
      contentType: decoded.contentType,
      fileName: `${jobId}-${suffix}.${extension}`,
      kind,
      requestUrl,
    });
    cache.set(value, stored.url);
    return stored.url;
  };

  const output: Record<string, unknown> = { ...source };
  if ("imageUrl" in source) output.imageUrl = await persist(source.imageUrl, "primary");
  if (Array.isArray(source.imageUrls)) output.imageUrls = await Promise.all(source.imageUrls.map((value, index) => persist(value, `variation-${index + 1}`)));
  if (Array.isArray(source.frameImages)) output.frameImages = await Promise.all(source.frameImages.map((value, index) => persist(value, `frame-${index + 1}`)));
  return output;
}

async function updateOpenAIJob(id: string, data: Record<string, unknown>): Promise<void> {
  const database = jobFirestore();
  if (!database) throw new Error(openAIJobConfigurationError() ?? "OpenAI 작업 저장소가 설정되지 않았습니다.");
  await withTimeout(database.collection(JOB_COLLECTION).doc(id).set(data, { merge: true }));
}

function jobFirestore(): Firestore | null {
  if (openAIJobConfigurationError()) return null;
  if (firestoreClient) return firestoreClient;
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim();
  firestoreClient = databaseId ? getFirestore(getEmoveFirebaseApp(), databaseId) : getFirestore(getEmoveFirebaseApp());
  return firestoreClient;
}

function assetKindForRoute(route: string): FirebaseAssetKind {
  if (route === "character") return "characters";
  return "frames";
}

function decodeImageDataUrl(value: string): { contentType: string; data: Buffer } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(value);
  if (!match) throw new Error("OpenAI 이미지 데이터 형식을 읽을 수 없습니다.");
  return { contentType: match[1], data: Buffer.from(match[2], "base64") };
}

function extensionForMime(value: string): string {
  if (value.includes("webp")) return "webp";
  if (value.includes("jpeg")) return "jpg";
  return "png";
}

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OpenAI 작업 저장 시간이 초과되었습니다.")), FIRESTORE_TIMEOUT_MS);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
