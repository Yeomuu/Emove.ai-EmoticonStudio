import { Storage } from "@google-cloud/storage";

const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const ALLOWED_PREFIXES = new Set(["animations", "characters", "effects", "frames", "thumbnails"]);

export type GcsAssetKind = "animations" | "characters" | "effects" | "frames" | "thumbnails";

export interface StoredGcsAsset {
  downloadUrl: string;
  objectName: string;
  path: string;
  size: number;
  url: string;
}

let storageClient: Storage | null = null;

export function isGcsConfigured(): boolean {
  return Boolean(bucketName());
}

export async function uploadGcsAsset(
  data: Buffer,
  options: { contentType: string; fileName: string; kind: GcsAssetKind; requestUrl: string },
): Promise<StoredGcsAsset> {
  const bucket = bucketName();
  if (!bucket) throw new Error("GCS_BUCKET_NAME이 설정되지 않았습니다.");
  if (!data.byteLength) throw new Error("업로드할 이미지가 비어 있습니다.");
  if (data.byteLength > MAX_ASSET_BYTES) throw new Error("이미지는 최대 12MB까지 저장할 수 있습니다.");

  const extension = safeExtension(options.fileName, options.contentType);
  const date = new Date();
  const objectName = `assets/${options.kind}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extension}`;
  const file = getStorage().bucket(bucket).file(objectName);
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

  const url = publicAssetUrl(bucket, objectName, options.requestUrl);
  const download = new URL("/api/assets/download", options.requestUrl);
  download.searchParams.set("path", objectName);
  download.searchParams.set("name", safeFileName(options.fileName, extension));
  return {
    downloadUrl: download.toString(),
    objectName,
    path: `gcs://${bucket}/${objectName}`,
    size: data.byteLength,
    url,
  };
}

export async function downloadGcsAsset(objectName: string): Promise<{ data: Buffer; contentType: string }> {
  const bucket = bucketName();
  if (!bucket) throw new Error("GCS_BUCKET_NAME이 설정되지 않았습니다.");
  assertSafeObjectName(objectName);
  const file = getStorage().bucket(bucket).file(objectName);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  if (size > MAX_ASSET_BYTES) throw new Error("다운로드 가능한 파일 크기를 초과했습니다.");
  const [data] = await file.download();
  return { data, contentType: metadata.contentType || "application/octet-stream" };
}

function getStorage(): Storage {
  if (storageClient) return storageClient;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const clientEmail = process.env.GOOGLE_CLOUD_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  storageClient = new Storage({
    projectId: projectId || undefined,
    credentials: clientEmail && privateKey ? { client_email: clientEmail, private_key: privateKey } : undefined,
  });
  return storageClient;
}

function bucketName(): string {
  return (process.env.GCS_BUCKET_NAME || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || "").trim();
}

function publicAssetUrl(bucket: string, objectName: string, requestUrl: string): string {
  const publicBase = process.env.GCS_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (publicBase) return `${publicBase}/${objectName.split("/").map(encodeURIComponent).join("/")}`;

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
    throw new Error("허용되지 않은 GCS 파일 경로입니다.");
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
