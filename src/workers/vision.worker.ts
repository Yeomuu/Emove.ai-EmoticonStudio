/// <reference lib="webworker" />

import type { Emotion, VisionMetrics } from "../types";

type AnalyzeMessage = {
  id: number;
  type: "analyze";
  frame: ImageBitmap;
  wasmPath: string;
  poseModelPath: string;
  faceModelPath: string;
};

type BlendshapeCategory = { categoryName?: string; score?: number };
type VisionFileset = Awaited<ReturnType<(typeof import("@mediapipe/tasks-vision"))["FilesetResolver"]["forVisionTasks"]>>;

let fileset: VisionFileset | undefined;
let poseLandmarker: import("@mediapipe/tasks-vision").PoseLandmarker | undefined;
let faceLandmarker: import("@mediapipe/tasks-vision").FaceLandmarker | undefined;
let faceUnavailable = false;

self.onmessage = async (event: MessageEvent<AnalyzeMessage>) => {
  const { id, frame, wasmPath, poseModelPath, faceModelPath } = event.data;
  try {
    const pose = await ensurePoseLandmarker(wasmPath, poseModelPath);
    const poseResult = pose.detect(frame);
    const faceResult = await detectFace(frame, wasmPath, faceModelPath);
    const metrics = buildMetrics(poseResult.landmarks[0], faceResult?.faceBlendshapes[0]?.categories as BlendshapeCategory[] | undefined);
    frame.close();
    self.postMessage({ id, result: metrics });
  } catch (error) {
    frame.close();
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

async function ensureFileset(wasmPath: string) {
  if (!fileset) {
    const { FilesetResolver } = await import("@mediapipe/tasks-vision");
    fileset = await FilesetResolver.forVisionTasks(wasmPath);
  }
  return fileset;
}

async function ensurePoseLandmarker(wasmPath: string, modelPath: string) {
  if (!poseLandmarker) {
    const [{ PoseLandmarker }, nextFileset] = await Promise.all([import("@mediapipe/tasks-vision"), ensureFileset(wasmPath)]);
    poseLandmarker = await PoseLandmarker.createFromOptions(nextFileset, {
      baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
      runningMode: "IMAGE",
      numPoses: 1,
    });
  }
  return poseLandmarker;
}

async function detectFace(frame: ImageBitmap, wasmPath: string, modelPath: string) {
  if (faceUnavailable || !modelPath) return undefined;
  try {
    if (!faceLandmarker) {
      const [{ FaceLandmarker }, nextFileset] = await Promise.all([import("@mediapipe/tasks-vision"), ensureFileset(wasmPath)]);
      faceLandmarker = await FaceLandmarker.createFromOptions(nextFileset, {
        baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
    }
    return faceLandmarker.detect(frame);
  } catch {
    faceUnavailable = true;
    return undefined;
  }
}

function buildMetrics(points: Array<{ x: number; y: number }> | undefined, blendshapes: BlendshapeCategory[] | undefined): VisionMetrics {
  if (!points) return { source: "unavailable", gesture: "Not_Detected" };
  const leftShoulder = points[11];
  const rightShoulder = points[12];
  const leftWrist = points[15];
  const rightWrist = points[16];
  return {
    source: "mediapipe",
    pose: {
      shoulderTilt: Math.abs((leftShoulder?.y ?? 0) - (rightShoulder?.y ?? 0)),
      armSpread: Math.min(1, Math.abs((leftWrist?.x ?? 0) - (rightWrist?.x ?? 0))),
    },
    face: blendshapes?.length ? summarizeFace(blendshapes) : undefined,
    gesture: (leftWrist?.y ?? 1) < (leftShoulder?.y ?? 0) || (rightWrist?.y ?? 1) < (rightShoulder?.y ?? 0) ? "Raised_Hand" : "Natural",
  };
}

function summarizeFace(categories: BlendshapeCategory[]): NonNullable<VisionMetrics["face"]> {
  const smile = average(score(categories, "mouthSmileLeft"), score(categories, "mouthSmileRight"));
  const frown = average(score(categories, "mouthFrownLeft"), score(categories, "mouthFrownRight"));
  const blink = average(score(categories, "eyeBlinkLeft"), score(categories, "eyeBlinkRight"));
  const eyeWide = average(score(categories, "eyeWideLeft"), score(categories, "eyeWideRight"));
  const mouthOpen = score(categories, "jawOpen");
  const browRaise = score(categories, "browInnerUp");
  const browDown = average(score(categories, "browDownLeft"), score(categories, "browDownRight"));
  const eyeOpenness = clamp01(1 - blink + eyeWide * .45);
  const expression = pickExpression({ smile, frown, mouthOpen, browRaise, browDown, eyeWide });
  const confidence = Math.max(smile, frown, mouthOpen, browRaise, browDown, eyeWide, .35);
  return { smile, eyeOpenness, mouthOpen, browRaise, expression, confidence: clamp01(confidence) };
}

function pickExpression(values: { smile: number; frown: number; mouthOpen: number; browRaise: number; browDown: number; eyeWide: number }): Emotion {
  if (values.smile > .28) return "happy";
  if (values.mouthOpen > .32 || values.eyeWide > .36) return "surprised";
  if (values.browDown > .24 && values.smile < .18) return "angry";
  if (values.frown > .2 || (values.browRaise > .34 && values.smile < .14)) return "sad";
  if (values.eyeWide > .24 && values.browRaise > .18) return "fearful";
  return "neutral";
}

function score(categories: BlendshapeCategory[], name: string): number {
  return categories.find((category) => category.categoryName === name)?.score ?? 0;
}

function average(left: number, right: number): number {
  return (left + right) / 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export {};
