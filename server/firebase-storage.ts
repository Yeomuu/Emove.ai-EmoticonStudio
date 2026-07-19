import { getStorage } from "firebase-admin/storage";

import {
  firebaseAdminConfigurationError,
  firebaseStorageBucket,
  getEmoveFirebaseApp,
} from "./firebase-admin";

const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const ALLOWED_PREFIXES = new Set(["animations", "characters", "effects", "frames", "thumbnails"]);

export type FirebaseAssetKind = "animations" | "characters" | "effects" | "frames" | "thumbnails";

export interface StoredFirebaseAsset {
  downloadUrl: string;
  objectName: string;
  path: string;
  size: number;
  url: string;
}

export function isFirebaseStorageConfigured(): boolean {
  return firebaseStorageConfigurationError() == null;
}

export function firebaseStorageConfigurationError(): string | null {
  const adminError = firebaseAdminConfigurationError();
  if (adminError) return adminError;
  if (!firebaseStorageBucket()) return "FIREBASE_STORAGE_BUCKET이 설정되지 않았습니다.";
  return null;
}

export async function uploadFirebaseAsset(
  data: Buffer,
  options: { contentType: string; fileName: string; kind: FirebaseAssetKind; requestUrl: string },
): Promise<StoredFirebaseAsset> {
  const configurationError = firebaseStorageConfigurationError();
  if (configurationError) throw new Error(configurationError);
  if (!data.byteLength) throw new Error("업로드할 이미지가 비어 있습니다.");
  if (data.byteLength > MAX_ASSET_BYTES) throw new Error("이미지는 최대 12MB까지 저장할 수 있습니다.");

  const extension = safeExtension(options.fileName, options.contentType);
  const date = new Date();
  const objectName = `assets/${options.kind}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extension}`;
  const file = storageBucket().file(objectName);
  await file.save(data, {
    resumable: data.byteLength > 5 * 1024 * 1024,
    contentType: options.contentType,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: `inline; filename="${safeFileName(options.fileName, extension)}"`,
      metadata: { source: "emove" },
    },
    validation: "crc32c",
  });

  const url = privateAssetUrl(objectName, options.requestUrl);
  const download = new URL("/api/assets/download", options.requestUrl);
  download.searchParams.set("path", objectName);
  download.searchParams.set("name", safeFileName(options.fileName, extension));
  return {
    downloadUrl: download.toString(),
    objectName,
    path: `firebase-storage://${firebaseStorageBucket()}/${objectName}`,
    size: data.byteLength,
    url,
  };
}

export async function downloadFirebaseAsset(objectName: string): Promise<{ data: Buffer; contentType: string }> {
  const configurationError = firebaseStorageConfigurationError();
  if (configurationError) throw new Error(configurationError);
  assertSafeObjectName(objectName);

  const file = storageBucket().file(objectName);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  if (size > MAX_ASSET_BYTES) throw new Error("다운로드 가능한 파일 크기를 초과했습니다.");
  const [data] = await file.download();
  return { data, contentType: metadata.contentType || "application/octet-stream" };
}

function storageBucket() {
  return getStorage(getEmoveFirebaseApp()).bucket(firebaseStorageBucket());
}

function privateAssetUrl(objectName: string, requestUrl: string): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const origin = configuredOrigin || (productionHost ? `https://${productionHost}` : new URL(requestUrl).origin);
  const asset = new URL("/api/assets/file", origin);
  asset.searchParams.set("path", objectName);
  return asset.toString();
}

function assertSafeObjectName(value: string): void {
  const segments = value.split("/").filter(Boolean);
  if (segments.length < 3 || segments[0] !== "assets" || !ALLOWED_PREFIXES.has(segments[1]) || segments.some((segment) => segment === "..")) {
    throw new Error("허용되지 않은 Firebase Storage 파일 경로입니다.");
  }
}

function safeExtension(fileName: string, contentType: string): string {
  const fromName = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (fromName && ["apng", "gif", "jpeg", "jpg", "png", "webp"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (contentType.includes("apng")) return "apng";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg")) return "jpg";
  return "png";
}

function safeFileName(value: string, extension: string): string {
  const stem = value.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").replace(/\.(apng|gif|jpe?g|png|webp)$/i, "").slice(0, 80);
  return `${stem || "emove"}.${extension}`;
}
