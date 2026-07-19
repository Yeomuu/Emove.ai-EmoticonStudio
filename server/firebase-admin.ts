import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";

let firebaseApp: App | null = null;

export function firebaseAdminConfigurationError(): string | null {
  const projectId = firebaseProjectId();
  const clientEmail = firebaseClientEmail();
  const privateKey = firebasePrivateKey();
  const hasCredentialFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  if (!projectId) return "FIREBASE_PROJECT_ID가 설정되지 않았습니다.";
  if (!hasCredentialFile && !clientEmail) return "FIREBASE_CLIENT_EMAIL이 설정되지 않았습니다.";
  if (!hasCredentialFile && !privateKey) return "FIREBASE_PRIVATE_KEY가 설정되지 않았습니다.";
  return null;
}

export function getEmoveFirebaseApp(): App {
  const configurationError = firebaseAdminConfigurationError();
  if (configurationError) throw new Error(configurationError);
  if (firebaseApp) return firebaseApp;

  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
    return firebaseApp;
  }

  const projectId = firebaseProjectId();
  const clientEmail = firebaseClientEmail();
  const privateKey = firebasePrivateKey();
  const credential = clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();

  firebaseApp = initializeApp({
    credential,
    projectId,
    storageBucket: firebaseStorageBucket(),
  });
  return firebaseApp;
}

export function firebaseStorageBucket(): string {
  return process.env.FIREBASE_STORAGE_BUCKET?.trim() || "";
}

function firebaseProjectId(): string {
  return process.env.FIREBASE_PROJECT_ID?.trim() || "";
}

function firebaseClientEmail(): string {
  return process.env.FIREBASE_CLIENT_EMAIL?.trim() || "";
}

function firebasePrivateKey(): string {
  return (process.env.FIREBASE_PRIVATE_KEY?.trim() || "").replace(/\\n/g, "\n");
}
