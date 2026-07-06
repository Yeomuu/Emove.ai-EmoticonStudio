export type SharedAnimationMemoryEntry = {
  data: Uint8Array;
  fileName: string;
  contentType: string;
  format: string;
};

export type SharedGifMemoryEntry = SharedAnimationMemoryEntry;

const globalForShare = globalThis as typeof globalThis & {
  __emoveSharedAnimations?: Map<string, SharedAnimationMemoryEntry>;
  __emoveSharedGifs?: Map<string, SharedAnimationMemoryEntry>;
};

export function sharedAnimationMemoryStore(): Map<string, SharedAnimationMemoryEntry> {
  globalForShare.__emoveSharedAnimations ??= globalForShare.__emoveSharedGifs ?? new Map<string, SharedAnimationMemoryEntry>();
  globalForShare.__emoveSharedGifs = globalForShare.__emoveSharedAnimations;
  return globalForShare.__emoveSharedAnimations;
}

export function sharedGifMemoryStore(): Map<string, SharedGifMemoryEntry> {
  return sharedAnimationMemoryStore();
}
