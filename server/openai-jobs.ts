import {
  firebaseStorageConfigurationError,
  isFirebaseStorageConfigured,
  readFirebaseJson,
  uploadFirebaseAsset,
  writeFirebaseJson,
  type FirebaseAssetKind,
} from "./firebase-storage";

export type OpenAIJobStatus = "pending" | "running" | "complete" | "failed";

type OpenAIJobDocument = {
  id: string;
  route: string;
  status: OpenAIJobStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const JOB_METADATA_ROOT = "metadata/openai-jobs";

export function openAIJobConfigurationError(): string | null {
  return firebaseStorageConfigurationError();
}

export function canUseOpenAIJobs(): boolean {
  return openAIJobConfigurationError() == null && isFirebaseStorageConfigured();
}

export async function createOpenAIJob(id: string, route: string): Promise<void> {
  const now = new Date().toISOString();
  await writeFirebaseJson(jobObjectName(id), {
    id,
    route,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  } satisfies OpenAIJobDocument);
}

export async function markOpenAIJobRunning(id: string): Promise<void> {
  await updateOpenAIJob(id, { status: "running", error: undefined });
}

export async function completeOpenAIJob(id: string, result: unknown): Promise<void> {
  await updateOpenAIJob(id, { status: "complete", result, error: undefined });
}

export async function failOpenAIJob(id: string, error: unknown): Promise<void> {
  await updateOpenAIJob(id, {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    result: undefined,
  });
}

export async function readOpenAIJob(id: string): Promise<{ status: OpenAIJobStatus; result?: unknown; error?: string } | null> {
  const stored = await readFirebaseJson<OpenAIJobDocument>(jobObjectName(id));
  if (!stored) return null;
  const { status, result, error } = stored.value;
  if (status !== "pending" && status !== "running" && status !== "complete" && status !== "failed") return null;
  return { status, result, error };
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
    const clientUrl = openAIJobClientAssetUrl(stored.url);
    cache.set(value, clientUrl);
    return clientUrl;
  };

  const output: Record<string, unknown> = { ...source };
  if ("imageUrl" in source) output.imageUrl = await persist(source.imageUrl, "primary");
  if (Array.isArray(source.imageUrls)) output.imageUrls = await Promise.all(source.imageUrls.map((value, index) => persist(value, `variation-${index + 1}`)));
  if (Array.isArray(source.frameImages)) output.frameImages = await Promise.all(source.frameImages.map((value, index) => persist(value, `frame-${index + 1}`)));
  return output;
}

export function openAIJobClientAssetUrl(source: string): string {
  try {
    const url = new URL(source);
    if (url.pathname === "/api/assets/file") return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return source;
  }
  return source;
}

async function updateOpenAIJob(id: string, patch: Partial<OpenAIJobDocument>): Promise<void> {
  const objectName = jobObjectName(id);
  const stored = await readFirebaseJson<OpenAIJobDocument>(objectName);
  if (!stored) throw new Error("OpenAI 작업 정보를 찾지 못했습니다.");
  await writeFirebaseJson(objectName, {
    ...stored.value,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function jobObjectName(id: string): string {
  const safeId = id.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("올바른 OpenAI 작업 ID가 필요합니다.");
  return `${JOB_METADATA_ROOT}/${safeId}.json`;
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
