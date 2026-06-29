/// <reference lib="webworker" />

import type { VisionMetrics } from "../types";

type AnalyzeMessage = { id: number; type: "analyze"; frame: ImageBitmap; wasmPath: string; modelPath: string };

let landmarker: import("@mediapipe/tasks-vision").PoseLandmarker | undefined;

self.onmessage = async (event: MessageEvent<AnalyzeMessage>) => {
  const { id, frame, wasmPath, modelPath } = event.data;
  try {
    if (!landmarker) {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    }
    const result = landmarker.detect(frame);
    const points = result.landmarks[0];
    const leftShoulder = points?.[11];
    const rightShoulder = points?.[12];
    const leftWrist = points?.[15];
    const rightWrist = points?.[16];
    const metrics: VisionMetrics = points
      ? {
          source: "mediapipe",
          pose: {
            shoulderTilt: Math.abs((leftShoulder?.y ?? 0) - (rightShoulder?.y ?? 0)),
            armSpread: Math.min(1, Math.abs((leftWrist?.x ?? 0) - (rightWrist?.x ?? 0))),
          },
          gesture: (leftWrist?.y ?? 1) < (leftShoulder?.y ?? 0) ? "Raised_Hand" : "Natural",
        }
      : { source: "mock", pose: { shoulderTilt: 0.08, armSpread: 0.72 }, gesture: "Natural" };
    frame.close();
    self.postMessage({ id, result: metrics });
  } catch (error) {
    frame.close();
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
