export type AssetKind = "characters" | "effects" | "frames" | "thumbnails";

export interface PersistedAsset {
  downloadUrl?: string;
  enabled: boolean;
  error?: string;
  path?: string;
  url: string;
}

export async function persistGeneratedAsset(source: string, options: { fileName: string; kind: AssetKind }): Promise<PersistedAsset> {
  if (!source || /^https?:\/\//i.test(source)) return { enabled: true, url: source };
  try {
    const blob = await sourceToBlob(source);
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": normalizedImageType(blob.type),
        "X-EMOVE-Asset-Kind": options.kind,
        "X-EMOVE-File-Name": encodeURIComponent(options.fileName),
      },
      body: blob,
    });
    const payload = await response.json().catch(() => ({})) as { downloadUrl?: string; error?: string; path?: string; url?: string };
    if (!response.ok || !payload.url) return { enabled: false, error: payload.error || `GCS 업로드에 실패했습니다. (${response.status})`, url: source };
    return { enabled: true, downloadUrl: payload.downloadUrl, path: payload.path, url: payload.url };
  } catch (error) {
    return { enabled: false, error: error instanceof Error ? error.message : "GCS 업로드에 실패했습니다.", url: source };
  }
}

export async function persistGeneratedAssets(sources: string[], options: { filePrefix: string; kind: AssetKind }): Promise<{ assets: PersistedAsset[]; warning?: string }> {
  const assets: PersistedAsset[] = [];
  for (const [index, source] of sources.entries()) {
    assets.push(await persistGeneratedAsset(source, { fileName: `${options.filePrefix}-${index + 1}.png`, kind: options.kind }));
  }
  return { assets, warning: assets.find((asset) => !asset.enabled)?.error };
}

async function sourceToBlob(source: string): Promise<Blob> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("생성 이미지를 업로드 데이터로 변환하지 못했습니다.");
  return response.blob();
}

function normalizedImageType(value: string): string {
  return ["image/apng", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(value) ? value : "image/png";
}
