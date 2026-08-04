import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

import { firebaseAdminConfigurationError, getEmoveFirebaseApp } from "./firebase-admin";

type LibraryRecord = {
  id: string;
  kind: string;
  payload: unknown;
};

type StoredLibraryRecord = LibraryRecord & {
  createdAt: string;
  updatedAt: string;
};

const LIBRARY_ROOT_COLLECTION = "emove_library";
const FIRESTORE_OPERATION_TIMEOUT_MS = 12_000;

let firestoreClient: Firestore | null = null;

export function libraryStoreConfigurationError(): string | null {
  return firebaseAdminConfigurationError();
}

export async function saveLibraryRecord(record: LibraryRecord): Promise<{ enabled: boolean; syncedAt?: string; storagePath?: string; error?: string }> {
  const database = getLibraryFirestore();
  if (!database) return { enabled: false, error: libraryStoreConfigurationError() ?? "Firestore가 설정되지 않았습니다." };

  const syncedAt = new Date().toISOString();
  const reference = recordCollection(database, record.kind).doc(documentId(record.id));
  try {
    await withFirestoreTimeout(reference.set({
      id: record.id,
      kind: record.kind,
      payload: removeUndefinedValues(record.payload),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  } catch (error) {
    return { enabled: false, error: firestoreError("Firestore 저장", error) };
  }

  return {
    enabled: true,
    syncedAt,
    storagePath: `firestore://${LIBRARY_ROOT_COLLECTION}/${record.kind}/records/${record.id}`,
  };
}

export async function deleteLibraryRecord(kind: string, id: string): Promise<{ enabled: boolean; deletedAt?: string; error?: string }> {
  const database = getLibraryFirestore();
  if (!database) return { enabled: false, error: libraryStoreConfigurationError() ?? "Firestore가 설정되지 않았습니다." };

  try {
    await withFirestoreTimeout(recordCollection(database, kind).doc(documentId(id)).delete());
    return { enabled: true, deletedAt: new Date().toISOString() };
  } catch (error) {
    return { enabled: false, error: firestoreError("Firestore 삭제", error) };
  }
}

export async function listLibraryRecords(kind: string): Promise<{ enabled: boolean; records?: StoredLibraryRecord[]; error?: string }> {
  const database = getLibraryFirestore();
  if (!database) return { enabled: false, error: libraryStoreConfigurationError() ?? "Firestore가 설정되지 않았습니다." };

  let snapshot;
  try {
    snapshot = await withFirestoreTimeout(recordCollection(database, kind)
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get());
  } catch (error) {
    return { enabled: false, error: firestoreError("Firestore 조회", error) };
  }

  return {
    enabled: true,
    records: snapshot.docs.map((document) => {
      const data = document.data() as Partial<LibraryRecord>;
      return {
        id: typeof data.id === "string" ? data.id : document.id,
        kind: typeof data.kind === "string" ? data.kind : kind,
        payload: data.payload,
        createdAt: document.createTime.toDate().toISOString(),
        updatedAt: document.updateTime.toDate().toISOString(),
      };
    }),
  };
}

function getLibraryFirestore(): Firestore | null {
  if (libraryStoreConfigurationError()) return null;
  if (firestoreClient) return firestoreClient;

  const app = getEmoveFirebaseApp();
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim();
  firestoreClient = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  return firestoreClient;
}

function removeUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefinedValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, removeUndefinedValues(item)]));
}

function recordCollection(database: Firestore, kind: string) {
  return database.collection(LIBRARY_ROOT_COLLECTION).doc(kind).collection("records");
}

function documentId(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function withFirestoreTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("요청 시간이 초과되었습니다.")), FIRESTORE_OPERATION_TIMEOUT_MS);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function firestoreError(label: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : "알 수 없는 오류";
  return `${label}를 사용할 수 없어 로컬 보관함으로 전환합니다. (${detail})`;
}
