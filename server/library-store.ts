import {
  deleteFirebaseJson,
  firebaseStorageConfigurationError,
  listFirebaseJson,
  readFirebaseJson,
  writeFirebaseJson,
} from "./firebase-storage";

type LibraryRecord = {
  id: string;
  kind: string;
  payload: unknown;
};

type StoredLibraryRecord = LibraryRecord & {
  createdAt: string;
  updatedAt: string;
};

const LIBRARY_METADATA_ROOT = "metadata/library";

export function libraryStoreConfigurationError(): string | null {
  return firebaseStorageConfigurationError();
}

export async function saveLibraryRecord(record: LibraryRecord): Promise<{ enabled: boolean; syncedAt?: string; storagePath?: string; ownerId?: string; error?: string }> {
  const configurationError = libraryStoreConfigurationError();
  if (configurationError) return { enabled: false, error: configurationError };

  const objectName = recordObjectName(record.kind, record.id);
  const now = new Date().toISOString();
  try {
    const existing = await readFirebaseJson<StoredLibraryRecord>(objectName);
    const stored: StoredLibraryRecord = {
      id: record.id,
      kind: record.kind,
      payload: removeUndefinedValues(record.payload),
      createdAt: existing?.value.createdAt || now,
      updatedAt: now,
    };
    const result = await writeFirebaseJson(objectName, stored);
    return {
      enabled: true,
      syncedAt: now,
      storagePath: result.path,
      ownerId: "public",
    };
  } catch (error) {
    return { enabled: false, error: storageError("Firebase Storage 메타데이터 저장", error) };
  }
}

export async function deleteLibraryRecord(kind: string, id: string): Promise<{ enabled: boolean; deletedAt?: string; error?: string }> {
  const configurationError = libraryStoreConfigurationError();
  if (configurationError) return { enabled: false, error: configurationError };
  try {
    await deleteFirebaseJson(recordObjectName(kind, id));
    return { enabled: true, deletedAt: new Date().toISOString() };
  } catch (error) {
    return { enabled: false, error: storageError("Firebase Storage 메타데이터 삭제", error) };
  }
}

export async function listLibraryRecords(kind: string): Promise<{ enabled: boolean; records?: StoredLibraryRecord[]; error?: string }> {
  const configurationError = libraryStoreConfigurationError();
  if (configurationError) return { enabled: false, error: configurationError };
  try {
    const records = await listFirebaseJson<StoredLibraryRecord>(`${LIBRARY_METADATA_ROOT}/${safeSegment(kind)}`, 200);
    return {
      enabled: true,
      records: records
        .map((record) => record.value)
        .filter((record) => record && typeof record.id === "string" && record.kind === kind)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    };
  } catch (error) {
    return { enabled: false, error: storageError("Firebase Storage 메타데이터 조회", error) };
  }
}

function recordObjectName(kind: string, id: string): string {
  return `${LIBRARY_METADATA_ROOT}/${safeSegment(kind)}/${Buffer.from(id, "utf8").toString("base64url")}.json`;
}

function safeSegment(value: string): string {
  const segment = value.trim().replace(/[^a-z0-9_-]/gi, "");
  if (!segment) throw new Error("올바른 메타데이터 분류가 필요합니다.");
  return segment;
}

function removeUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefinedValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, removeUndefinedValues(item)]));
}

function storageError(label: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : "알 수 없는 오류";
  return `${label}에 실패했습니다. (${detail})`;
}
