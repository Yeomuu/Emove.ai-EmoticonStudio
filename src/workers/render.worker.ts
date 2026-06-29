/// <reference lib="webworker" />

interface RenderMessage {
  id: number;
  type: "background";
  width: number;
  height: number;
  color: string;
}

self.onmessage = (event: MessageEvent<RenderMessage>) => {
  const { id, width, height, color } = event.data;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return self.postMessage({ id, error: "2D context unavailable" });
  const gradient = context.createRadialGradient(width / 2, height / 2, 12, width / 2, height / 2, width / 2);
  gradient.addColorStop(0, `${color}66`);
  gradient.addColorStop(1, "rgba(7,7,17,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ id, bitmap }, [bitmap]);
};

export {};
