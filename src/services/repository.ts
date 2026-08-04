import type { BehaviorCapture, CharacterToken, EmoticonProject, StickerItem } from "../types";
import { coerceEmotion, emptyEmotionScores, normalizeEmotionScores } from "../emotion-taxonomy";

const DATABASE = "emove-studio"; const VERSION = 2;
const STORES = ["stickers", "characters", "projects", "captures"] as const;
type StoreName = typeof STORES[number];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => STORES.forEach((store) => { if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: "id" }); });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열 수 없습니다."));
  });
}

async function put<T>(store: StoreName, item: T): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => { const transaction = database.transaction(store, "readwrite"); transaction.objectStore(store).put(item); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const database = await openDatabase();
  const rows = await new Promise<T[]>((resolve, reject) => { const request = database.transaction(store, "readonly").objectStore(store).getAll(); request.onsuccess = () => resolve(request.result as T[]); request.onerror = () => reject(request.error); });
  database.close(); return rows;
}

export const saveSticker = (item: StickerItem) => put("stickers", item);
export const loadStickers = async () => (await getAll<StickerItem>("stickers")).map(normalizeSticker);
export const saveCharacter = (item: CharacterToken) => put("characters", item);
export const loadCharacters = () => getAll<CharacterToken>("characters");
export const saveCapture = (item: BehaviorCapture) => put("captures", item);
export const loadCaptures = async () => (await getAll<BehaviorCapture>("captures")).map(normalizeCapture);

export async function saveProject(item: EmoticonProject): Promise<void> {
  await Promise.all([put("projects", item), put("stickers", item.sticker), put("characters", item.characterToken)]);
}

export const loadProjects = async () => (await getAll<EmoticonProject>("projects")).map(normalizeProject);

function normalizeSticker(item: StickerItem): StickerItem {
  return { ...item, emotion: coerceEmotion(item.emotion) };
}

function normalizeCapture(item: BehaviorCapture): BehaviorCapture {
  const scores = normalizeEmotionScores(item.emotionScores as unknown as Record<string, unknown>)
    ?? { ...emptyEmotionScores(), neutral: 1 };
  return {
    ...item,
    expression: coerceEmotion(item.expression),
    emotionScores: scores,
  };
}

function normalizeProject(item: EmoticonProject): EmoticonProject {
  return {
    ...item,
    sticker: normalizeSticker(item.sticker),
    behaviorCapture: normalizeCapture(item.behaviorCapture as BehaviorCapture),
    motionBrief: {
      ...item.motionBrief,
      emotion: coerceEmotion(item.motionBrief.emotion),
      expressionEmotion: coerceEmotion(item.motionBrief.expressionEmotion),
    },
  };
}

async function deleteKey(store: StoreName, id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, "readwrite");
    transaction.objectStore(store).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export const deleteSticker = (id: string) => deleteKey("stickers", id);
export const deleteCharacter = (id: string) => deleteKey("characters", id);
export const deleteProject = (id: string) => deleteKey("projects", id);
