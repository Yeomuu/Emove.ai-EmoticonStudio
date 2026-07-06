import type { AnimationFormat } from "../types";

export interface SharedAnimationResult {
  enabled: boolean;
  error?: string;
  id?: string;
  extension?: string;
  format?: AnimationFormat;
  mimeType?: string;
  path?: string;
  size?: number;
  url?: string;
}

interface PublishAnimationOptions {
  fileName: string;
  format: AnimationFormat;
  projectId: string;
  title: string;
}

const MAX_SHARE_ANIMATION_BYTES = 5_750_000;

export async function publishAnimationForQr(animation: Blob, options: PublishAnimationOptions): Promise<SharedAnimationResult> {
  if (!animation.size) return { enabled: false, error: "공유할 애니메이션 데이터가 비어 있습니다." };
  if (animation.size > MAX_SHARE_ANIMATION_BYTES) {
    return { enabled: false, error: `QR 공유 링크는 ${formatBytes(MAX_SHARE_ANIMATION_BYTES)} 이하 애니메이션만 지원합니다. 현재 파일은 ${formatBytes(animation.size)}입니다.` };
  }

  const endpoint = shareEndpoint();
  const mimeType = animationMimeType(options.format);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        "X-EMOVE-File-Name": encodeURIComponent(options.fileName),
        "X-EMOVE-Project-Id": encodeURIComponent(options.projectId),
        "X-EMOVE-Title": encodeURIComponent(options.title),
      },
      body: animation,
    });
    const result = await response.json().catch(() => ({})) as Partial<SharedAnimationResult> & { error?: string };
    if (!response.ok || !result.url) {
      return { enabled: false, error: result.error ?? `공유 애니메이션 저장에 실패했습니다. (${response.status})` };
    }
    return { enabled: true, extension: result.extension, format: result.format ?? options.format, id: result.id, mimeType: result.mimeType ?? mimeType, path: result.path, size: result.size, url: result.url };
  } catch (error) {
    return { enabled: false, error: error instanceof Error ? error.message : "공유 애니메이션 저장에 실패했습니다." };
  }
}

export function publishGifForQr(gif: Blob, options: Omit<PublishAnimationOptions, "format">): Promise<SharedAnimationResult> {
  return publishAnimationForQr(gif, { ...options, format: "GIF" });
}

export function animationExtension(format: AnimationFormat): "apng" | "gif" | "webp" {
  if (format === "GIF") return "gif";
  if (format === "WEBP") return "webp";
  return "apng";
}

export function animationMimeType(format: AnimationFormat): "image/apng" | "image/gif" | "image/webp" {
  if (format === "GIF") return "image/gif";
  if (format === "WEBP") return "image/webp";
  return "image/apng";
}

function shareEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_SHARE_API_BASE?.trim();
  if (!base) return "/api/share/animation";
  const clean = base.replace(/\/+$/, "");
  if (clean.endsWith("/api/share/animation")) return clean;
  if (clean.endsWith("/api/share/gif")) return clean;
  if (clean.endsWith("/api")) return `${clean}/share/animation`;
  return `${clean}/api/share/animation`;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}
