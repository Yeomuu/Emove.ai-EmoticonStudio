import type { VisionMetrics } from "../types";

let worker: Worker | undefined;
let requestId = 0;

export function analyzeVisionFrame(frame: ImageBitmap): Promise<VisionMetrics> {
  worker ??= new Worker(new URL("../workers/vision.worker.ts", import.meta.url), { type: "module" });
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("포즈 분석 시간이 초과되었습니다.")), 12_000);
    const listener = (event: MessageEvent<{ id: number; result?: VisionMetrics; error?: string }>) => {
      if (event.data.id !== id) return;
      window.clearTimeout(timeout);
      worker?.removeEventListener("message", listener);
      event.data.result ? resolve(event.data.result) : reject(new Error(event.data.error ?? "포즈 분석 실패"));
    };
    worker?.addEventListener("message", listener);
    worker?.postMessage(
      {
        id,
        type: "analyze",
        frame,
        wasmPath: import.meta.env.VITE_MEDIAPIPE_WASM_PATH || publicAssetPath("models/wasm"),
        poseModelPath: import.meta.env.VITE_POSE_MODEL_PATH || publicAssetPath("models/pose_landmarker_lite.task"),
        faceModelPath: import.meta.env.VITE_FACE_MODEL_PATH || "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
      },
      [frame],
    );
  });
}

function publicAssetPath(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return `${cleanBase}${path.replace(/^\/+/, "")}`;
}
