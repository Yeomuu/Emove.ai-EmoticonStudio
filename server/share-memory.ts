export type SharedGifMemoryEntry = {
  data: Uint8Array;
  fileName: string;
};

const globalForShare = globalThis as typeof globalThis & {
  __emoveSharedGifs?: Map<string, SharedGifMemoryEntry>;
};

export function sharedGifMemoryStore(): Map<string, SharedGifMemoryEntry> {
  globalForShare.__emoveSharedGifs ??= new Map<string, SharedGifMemoryEntry>();
  return globalForShare.__emoveSharedGifs;
}
