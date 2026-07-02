import type { Emotion, VisionMetrics } from "../types";

type BlendshapeCategory = { categoryName?: string; score?: number };
type VisionFileset = Awaited<ReturnType<(typeof import("@mediapipe/tasks-vision"))["FilesetResolver"]["forVisionTasks"]>>;

type LiveVisionAnalyzer = {
  analyze(video: HTMLVideoElement, durationMs: number, onProgress?: (progress: number) => void): Promise<VisionMetrics>;
};

let fileset: VisionFileset | undefined;
let poseLandmarker: import("@mediapipe/tasks-vision").PoseLandmarker | undefined;
let faceLandmarker: import("@mediapipe/tasks-vision").FaceLandmarker | undefined;
let faceUnavailable = false;
let poseDelegate: "GPU" | "CPU" | undefined;
let faceDelegate: "GPU" | "CPU" | undefined;

export async function createLiveVisionAnalyzer(): Promise<LiveVisionAnalyzer> {
  await ensurePoseLandmarker();
  await ensureFaceLandmarker();
  return { analyze: analyzeVideoStream };
}

async function analyzeVideoStream(video: HTMLVideoElement, durationMs: number, onProgress?: (progress: number) => void): Promise<VisionMetrics> {
  if (!poseLandmarker || !video.videoWidth) {
    return { source: "unavailable", gesture: "No_Video", diagnostics: "카메라 영상이 아직 분석 가능한 상태가 아닙니다." };
  }

  const samples: VisionMetrics[] = [];
  let lastError: Error | undefined;
  let lastAnalyzedAt = -Infinity;
  const startedAt = performance.now();
  const minIntervalMs = 80;

  return new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      const elapsed = now - startedAt;
      onProgress?.(Math.min(1, elapsed / durationMs));

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && elapsed - lastAnalyzedAt >= minIntervalMs) {
        lastAnalyzedAt = elapsed;
        try {
          samples.push(detectCurrentVideoFrame(video, now));
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      if (elapsed >= durationMs) resolve(summarizeVideoSamples(samples, lastError));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

function detectCurrentVideoFrame(video: HTMLVideoElement, timestampMs: number): VisionMetrics {
  const poseResult = poseLandmarker?.detectForVideo(video, timestampMs);
  let faceCategories: BlendshapeCategory[] | undefined;
  try {
    faceCategories = faceLandmarker?.detectForVideo(video, timestampMs).faceBlendshapes[0]?.categories as BlendshapeCategory[] | undefined;
  } catch {
    faceUnavailable = true;
  }
  return buildMetrics(poseResult?.landmarks[0], faceCategories);
}

async function ensureFileset(): Promise<VisionFileset> {
  if (!fileset) {
    const { FilesetResolver } = await import("@mediapipe/tasks-vision");
    fileset = await FilesetResolver.forVisionTasks(process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_PATH || publicAssetPath("models/wasm"));
  }
  return fileset;
}

async function ensurePoseLandmarker(): Promise<void> {
  if (poseLandmarker) return;
  const [{ PoseLandmarker }, nextFileset] = await Promise.all([import("@mediapipe/tasks-vision"), ensureFileset()]);
  const modelAssetPath = process.env.NEXT_PUBLIC_POSE_MODEL_PATH || publicAssetPath("models/pose_landmarker_lite.task");
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(nextFileset, {
      baseOptions: { modelAssetPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    poseDelegate = "GPU";
  } catch {
    poseLandmarker = await PoseLandmarker.createFromOptions(nextFileset, {
      baseOptions: { modelAssetPath },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    poseDelegate = "CPU";
  }
}

async function ensureFaceLandmarker(): Promise<void> {
  if (faceLandmarker || faceUnavailable) return;
  const modelAssetPath = process.env.NEXT_PUBLIC_FACE_MODEL_PATH || "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
  if (!modelAssetPath) return;
  try {
    const [{ FaceLandmarker }, nextFileset] = await Promise.all([import("@mediapipe/tasks-vision"), ensureFileset()]);
    try {
      faceLandmarker = await FaceLandmarker.createFromOptions(nextFileset, {
        baseOptions: { modelAssetPath, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      faceDelegate = "GPU";
    } catch {
      faceLandmarker = await FaceLandmarker.createFromOptions(nextFileset, {
        baseOptions: { modelAssetPath },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      faceDelegate = "CPU";
    }
  } catch {
    faceUnavailable = true;
  }
}

function summarizeVideoSamples(samples: VisionMetrics[], lastError: Error | undefined): VisionMetrics {
  const poseSamples = samples.filter((sample) => sample.source === "mediapipe");
  const faceSamples = samples.filter((sample) => sample.face);
  const bestFace = faceSamples.sort((left, right) => (right.face?.confidence ?? 0) - (left.face?.confidence ?? 0))[0]?.face;

  if (!poseSamples.length) {
    return {
      source: "unavailable",
      gesture: bestFace ? "Pose_Not_Detected" : "Not_Detected",
      face: bestFace,
      diagnostics: bestFace
        ? `5초 영상에서 얼굴은 인식했지만 상체/팔 포즈를 추적하지 못했습니다. MediaPipe face=${faceDelegate ?? "off"}, pose=${poseDelegate ?? "off"}.`
        : lastError?.message ?? `5초 영상에서 사람 포즈를 추적하지 못했습니다. MediaPipe pose=${poseDelegate ?? "off"}.`,
    };
  }

  const armSpread = Math.max(...poseSamples.map((sample) => sample.pose?.armSpread ?? 0));
  const shoulderTilt = Math.max(...poseSamples.map((sample) => sample.pose?.shoulderTilt ?? 0));
  const raisedFrames = poseSamples.filter((sample) => sample.gesture === "Raised_Hand").length;

  return {
    source: "mediapipe",
    pose: { shoulderTilt, armSpread },
    face: bestFace,
    gesture: raisedFrames >= Math.max(1, Math.ceil(poseSamples.length * .16)) ? "Raised_Hand" : "Natural",
    diagnostics: `5초 영상에서 ${poseSamples.length}회 포즈를 실시간 추적했습니다. MediaPipe pose=${poseDelegate ?? "unknown"}${faceDelegate ? `, face=${faceDelegate}` : ""}.`,
  };
}

function buildMetrics(points: Array<{ x: number; y: number }> | undefined, blendshapes: BlendshapeCategory[] | undefined): VisionMetrics {
  const face = blendshapes?.length ? summarizeFace(blendshapes) : undefined;
  if (!points) {
    return {
      source: "unavailable",
      gesture: face ? "Pose_Not_Detected" : "Not_Detected",
      face,
      diagnostics: face
        ? `얼굴은 인식했지만 상체/팔 포즈 랜드마크를 찾지 못했습니다. MediaPipe face=${faceDelegate ?? "off"}, pose=${poseDelegate ?? "off"}.`
        : `사람 포즈 랜드마크를 찾지 못했습니다. MediaPipe pose=${poseDelegate ?? "off"}.`,
    };
  }
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
    face,
    gesture: (leftWrist?.y ?? 1) < (leftShoulder?.y ?? 0) || (rightWrist?.y ?? 1) < (rightShoulder?.y ?? 0) ? "Raised_Hand" : "Natural",
    diagnostics: `MediaPipe pose=${poseDelegate ?? "unknown"}${faceDelegate ? `, face=${faceDelegate}` : ""}.`,
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

function publicAssetPath(path: string): string {
  return `/${path.replace(/^\/+/, "")}`;
}
