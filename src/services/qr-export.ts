import type { QrExportPayload, StickerItem } from "../types";

export async function createQrExportPayload(item: StickerItem): Promise<QrExportPayload> {
  const previewUrl = item.animatedImage || item.image;
  if (!previewUrl) throw new Error("QR로 내보낼 이모티콘 파일이 없습니다.");
  const targetUrl = qrDownloadTarget(item);
  const { default: QRCode } = await import("qrcode");
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    width: 260,
    margin: 1,
    color: { dark: "#201E28", light: "#FCFCFC" },
  });
  return {
    stickerId: item.id,
    title: item.title,
    format: item.animationFormat ?? "APNG",
    previewUrl,
    targetUrl,
    qrDataUrl,
  };
}

export function qrDownloadTarget(item: StickerItem): string {
  const objectName = firebaseObjectName(item.animationStoragePath ?? item.gifStoragePath);
  if (!objectName || typeof window === "undefined") return item.animatedImage || item.image;
  const url = new URL("/api/assets/download", window.location.origin);
  url.searchParams.set("path", objectName);
  url.searchParams.set("name", `${safeFileName(item.title)}.${animationExtension(item.animationFormat ?? "APNG")}`);
  return url.toString();
}

function firebaseObjectName(path?: string): string | null {
  if (!path?.startsWith("firebase-storage://")) return null;
  const withoutScheme = path.slice("firebase-storage://".length);
  const slash = withoutScheme.indexOf("/");
  return slash >= 0 ? withoutScheme.slice(slash + 1) : null;
}

function animationExtension(format: QrExportPayload["format"]): string {
  if (format === "GIF") return "gif";
  if (format === "WEBP") return "webp";
  return "apng";
}

function safeFileName(value: string): string {
  return (value || "emove").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 40) || "emove";
}
