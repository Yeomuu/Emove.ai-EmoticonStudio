import { loadProjects, loadStickers } from "./repository";
import { loadRemoteStickers } from "./remote-store";
import type { AnimationFormat, StickerItem } from "../types";

export const SHOWCASE_BATCH_SIZE = 12;
export const SHOWCASE_INTERVAL_MS = 20_000;

export type AnimatedStickerCollection = {
  items: StickerItem[];
  refresh: Promise<StickerItem[]>;
  release: () => void;
};

export async function loadAnimatedStickerCollection(): Promise<AnimatedStickerCollection> {
  const [saved, projects] = await Promise.all([
    loadStickers(),
    loadProjects(),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const objectUrls: string[] = [];

  const local = saved.map((item) => {
    const project = projectById.get(item.projectId ?? item.id);
    const animationBlob = project?.animationBlob ?? project?.gifBlob;
    if (!animationBlob) return item;
    const animatedImage = URL.createObjectURL(animationBlob);
    objectUrls.push(animatedImage);
    return {
      ...item,
      animatedImage,
      animationFormat: project?.animationFormat ?? item.animationFormat ?? inferBlobFormat(animationBlob),
    };
  });

  const items = mergeAnimatedStickers(local, []);
  const refresh = loadRemoteStickers()
    .then((remote) => mergeAnimatedStickers(local, remote.enabled ? remote.stickers : []))
    .catch(() => items);

  return {
    items,
    refresh,
    release: () => objectUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}

function mergeAnimatedStickers(local: StickerItem[], remote: StickerItem[]): StickerItem[] {
  const byId = new Map<string, StickerItem>();
  [...local, ...remote]
    .filter(isAnimatedSticker)
    .forEach((item) => {
      const current = byId.get(item.id);
      if (!current || recordTime(item) >= recordTime(current)) byId.set(item.id, item);
    });
  return [...byId.values()].sort((a, b) => recordTime(b) - recordTime(a));
}

function recordTime(item: StickerItem): number {
  const parsed = Date.parse(item.updatedAt || item.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isAnimatedSticker(item: StickerItem): boolean {
  if (item.isDefault || !item.animatedImage) return false;
  if (item.animationFormat) return true;
  return /(?:image\/(?:apng|gif|webp)|\.(?:apng|gif|webp)(?:$|[?#]))/i.test(item.animatedImage);
}

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function circularBatch<T>(items: readonly T[], cursor: number, size = SHOWCASE_BATCH_SIZE): T[] {
  if (items.length <= size) return [...items];
  return Array.from({ length: size }, (_, offset) => items[(cursor + offset) % items.length]);
}

function inferBlobFormat(blob: Blob): AnimationFormat {
  if (blob.type === "image/gif") return "GIF";
  if (blob.type === "image/webp") return "WEBP";
  return "APNG";
}
