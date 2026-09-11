import { afterEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { createQrExportPayload, generateQrDataUrl } from "../src/services/qr-export";
import type { StickerItem } from "../src/types";

const sticker = {
  id: "saved-sticker", title: "Saved animation", image: "/thumbnail.png",
  animatedImage: "/api/assets/file?path=assets/animation.gif", animationFormat: "GIF",
  animationStoragePath: "firebase-storage://test/assets/animation.gif",
} as StickerItem;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("QR export retry boundary", () => {
  it("prepares the saved preview and download independently of QR encoding", () => {
    vi.stubGlobal("window", { location: { origin: "https://emove.example" } });
    const encoder = vi.spyOn(QRCode, "toDataURL").mockRejectedValue(new Error("encoding failed"));
    const payload = createQrExportPayload(sticker);
    expect(payload.previewUrl).toBe(sticker.animatedImage);
    expect(payload.targetUrl).toContain("/download?");
    expect(payload.downloadUrl).toContain("/api/assets/download?");
    expect(encoder).not.toHaveBeenCalled();
  });

  it("only retries encoding when explicitly requested and keeps the same saved target", async () => {
    const encoder = vi.spyOn(QRCode, "toDataURL")
      .mockRejectedValueOnce(new Error("encoding failed"))
      .mockImplementationOnce(() => Promise.resolve("data:image/png;base64,retried"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const payload = createQrExportPayload(sticker);
    await expect(generateQrDataUrl(payload.targetUrl)).rejects.toThrow("encoding failed");
    expect(encoder).toHaveBeenCalledTimes(1);
    await expect(generateQrDataUrl(payload.targetUrl)).resolves.toBe("data:image/png;base64,retried");
    expect(encoder).toHaveBeenCalledTimes(2);
    expect(encoder.mock.calls[0][0]).toBe(encoder.mock.calls[1][0]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
