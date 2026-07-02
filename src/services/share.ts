export interface SharedGifResult {
  enabled: boolean;
  error?: string;
  id?: string;
  path?: string;
  size?: number;
  url?: string;
}

interface PublishGifOptions {
  fileName: string;
  projectId: string;
  title: string;
}

const MAX_SHARE_GIF_BYTES = 5_750_000;

export async function publishGifForQr(gif: Blob, options: PublishGifOptions): Promise<SharedGifResult> {
  if (!gif.size) return { enabled: false, error: "공유할 GIF 데이터가 비어 있습니다." };
  if (gif.size > MAX_SHARE_GIF_BYTES) {
    return { enabled: false, error: `QR 공유 링크는 ${formatBytes(MAX_SHARE_GIF_BYTES)} 이하 GIF만 지원합니다. 현재 파일은 ${formatBytes(gif.size)}입니다.` };
  }

  const endpoint = shareEndpoint();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "image/gif",
        "X-EMOVE-File-Name": encodeURIComponent(options.fileName),
        "X-EMOVE-Project-Id": encodeURIComponent(options.projectId),
        "X-EMOVE-Title": encodeURIComponent(options.title),
      },
      body: gif,
    });
    const result = await response.json().catch(() => ({})) as Partial<SharedGifResult> & { error?: string };
    if (!response.ok || !result.url) {
      return { enabled: false, error: result.error ?? `공유 GIF 저장에 실패했습니다. (${response.status})` };
    }
    return { enabled: true, id: result.id, path: result.path, size: result.size, url: result.url };
  } catch (error) {
    return { enabled: false, error: error instanceof Error ? error.message : "공유 GIF 저장에 실패했습니다." };
  }
}

function shareEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_SHARE_API_BASE?.trim();
  if (!base) return "/api/share/gif";
  const clean = base.replace(/\/+$/, "");
  if (clean.endsWith("/api/share/gif")) return clean;
  if (clean.endsWith("/api")) return `${clean}/share/gif`;
  return `${clean}/api/share/gif`;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}
