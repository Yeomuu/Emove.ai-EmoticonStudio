import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

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

let firestoreClient: Firestore | null = null;

export function libraryStoreConfigurationError(): string | null {
  const projectId = firebaseProjectId();
  const clientEmail = firebaseClientEmail();
  const privateKey = firebasePrivateKey();
  const hasApplicationDefaultCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  if (!projectId) return "FIREBASE_PROJECT_ID 또는 GOOGLE_CLOUD_PROJECT가 설정되지 않았습니다.";
  if (!hasApplicationDefaultCredentials && !clientEmail) {
    return "FIREBASE_CLIENT_EMAIL 또는 GOOGLE_CLOUD_CLIENT_EMAIL이 설정되지 않았습니다.";
  }
  if (!hasApplicationDefaultCredentials && !privateKey) {
    return "FIREBASE_PRIVATE_KEY 또는 GOOGLE_CLOUD_PRIVATE_KEY가 설정되지 않았습니다.";
  }
  return null;
}

export async function saveLibraryRecord(record: LibraryRecord): Promise<{ enabled: boolean; syncedAt?: string; storagePath?: string; error?: string }> {
  const database = getLibraryFirestore();
  if (!database) return { enabled: false, error: libraryStoreConfigurationError() ?? "Firestore가 설정되지 않았습니다." };

  const syncedAt = new Date().toISOString();
  const reference = recordCollection(database, record.kind).doc(documentId(record.id));
  await reference.set({
    id: record.id,
    kind: record.kind,
    payload: record.payload,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    enabled: true,
    syncedAt,
    storagePath: `firestore://${LIBRARY_ROOT_COLLECTION}/${record.kind}/records/${record.id}`,
  };
}

export async function listLibraryRecords(kind: string): Promise<{ enabled: boolean; records?: StoredLibraryRecord[]; error?: string }> {
  const database = getLibraryFirestore();
  if (!database) return { enabled: false, error: libraryStoreConfigurationError() ?? "Firestore가 설정되지 않았습니다." };

  const snapshot = await recordCollection(database, kind)
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get();

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

  const app = getFirebaseApp();
  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim();
  firestoreClient = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  firestoreClient.settings({ ignoreUndefinedProperties: true });
  return firestoreClient;
}

function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = firebaseProjectId();
  const clientEmail = firebaseClientEmail();
  const privateKey = firebasePrivateKey();
  const credential = clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();

  return initializeApp({
    credential,
    projectId,
    storageBucket: process.env.GCS_BUCKET_NAME?.trim() || undefined,
  });
}

function recordCollection(database: Firestore, kind: string) {
  return database.collection(LIBRARY_ROOT_COLLECTION).doc(kind).collection("records");
}

function documentId(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function firebaseProjectId(): string {
  return process.env.FIREBASE_PROJECT_ID?.trim()
    || process.env.GOOGLE_CLOUD_PROJECT?.trim()
    || "";
}

function firebaseClientEmail(): string {
  return process.env.FIREBASE_CLIENT_EMAIL?.trim()
    || process.env.GOOGLE_CLOUD_CLIENT_EMAIL?.trim()
    || "";
}

function firebasePrivateKey(): string {
  const value = process.env.FIREBASE_PRIVATE_KEY?.trim()
    || process.env.GOOGLE_CLOUD_PRIVATE_KEY?.trim()
    || "";
  return value.replace(/\\n/g, "\n");
}
