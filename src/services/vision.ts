import type { Emotion, VisionMetrics } from "../types";
import {
  classifyCustomHandGesture,
  classifyPoseFrame,
  classifyTwoHandGesture,
  resolvePrimaryGesture,
  selectDominantBodyGesture,
  selectDominantHandGesture,
  type GestureDecision,
  type PosePoint,
} from "./gesture-analysis";

type BlendshapeCategory = { categoryName?: string; score?: number };
type GestureRecognizerResult = import("@mediapipe/tasks-vision").GestureRecognizerResult;
type VisionFileset = Awaited<ReturnType<(typeof import("@mediapipe/tasks-vision"))["FilesetResolver"]["forVisionTasks"]>>;
type HandGesture = NonNullable<VisionMetrics["hand"]>;

export type LiveVisionAnalyzer = {
  analyze(video: HTMLVideoElement, durationMs: number, onProgress?: (progress: number) => void): Promise<VisionMetrics>;
  detectFrame?(video: HTMLVideoElement): VisionMetrics;
};

let fileset: VisionFileset | undefined;
let filesetPromise: Promise<VisionFileset> | undefined;
let poseLandmarker: import("@mediapipe/tasks-vision").PoseLandmarker | undefined;
let poseLandmarkerPromise: Promise<void> | undefined;
let faceLandmarker: import("@mediapipe/tasks-vision").FaceLandmarker | undefined;
let faceLandmarkerPromise: Promise<void> | undefined;
let gestureRecognizer: import("@mediapipe/tasks-vision").GestureRecognizer | undefined;
let gestureRecognizerPromise: Promise<void> | undefined;
let faceUnavailable = false;
let poseDelegate: "GPU" | "CPU" | undefined;
let faceDelegate: "GPU" | "CPU" | undefined;
let gestureDelegate: "GPU" | "CPU" | undefined;
let restoreConsoleTimer: ReturnType<typeof setTimeout> | undefined;
let originalConsoleError: typeof console.error | undefined;

export async function createLiveVisionAnalyzer(): Promise<LiveVisionAnalyzer> {
  beginBenignTfliteLogFilter();
  try {
    await Promise.all([ensurePoseLandmarker(), ensureGestureRecognizer()]);
    void ensureFaceLandmarker().finally(scheduleConsoleRestore);
  } catch (error) {
    scheduleConsoleRestore();
    throw error;
  }
  return {
    analyze: analyzeVideoStream,
    detectFrame: (video: HTMLVideoElement) => {
      return detectCurrentVideoFrame(video, performance.now());
    }
  };
}

function beginBenignTfliteLogFilter(): void {
  if (typeof window === "undefined") return;
  if (!originalConsoleError) {
    originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const message = args.map(String).join(" ");
      if (message.includes("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.")) {
        console.info(...args);
        return;
      }
      originalConsoleError?.(...args);
    };
  }
  if (restoreConsoleTimer) clearTimeout(restoreConsoleTimer);
}

function scheduleConsoleRestore(): void {
  if (!originalConsoleError) return;
  if (restoreConsoleTimer) clearTimeout(restoreConsoleTimer);
  restoreConsoleTimer = setTimeout(() => {
    if (originalConsoleError) console.error = originalConsoleError;
    originalConsoleError = undefined;
    restoreConsoleTimer = undefined;
  }, 1800);
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
  let handGesture: HandGesture | undefined;
  let handDetected = false;
  let faceCategories: BlendshapeCategory[] | undefined;
  try {
    const handResult = gestureRecognizer?.recognizeForVideo(video, timestampMs);
    handDetected = Boolean(handResult?.landmarks.length);
    handGesture = pickFrameHandGesture(handResult);
  } catch {
    handGesture = undefined;
  }
  try {
    faceCategories = faceLandmarker?.detectForVideo(video, timestampMs).faceBlendshapes[0]?.categories as BlendshapeCategory[] | undefined;
  } catch {
    faceUnavailable = true;
  }
  return buildMetrics(poseResult?.landmarks[0], faceCategories, handGesture, handDetected);
}

async function ensureFileset(): Promise<VisionFileset> {
  if (fileset) return fileset;
  filesetPromise ??= import("@mediapipe/tasks-vision")
    .then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(
      process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_PATH || publicAssetPath("models/wasm"),
    ))
    .then((resolvedFileset) => {
      fileset = resolvedFileset;
      return resolvedFileset;
    })
    .catch((error) => {
      filesetPromise = undefined;
      throw error;
    });
  fileset = await filesetPromise;
  return fileset;
}

async function ensurePoseLandmarker(): Promise<void> {
  if (poseLandmarker) return;
  poseLandmarkerPromise ??= (async () => {
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
  })().catch((error) => {
    poseLandmarkerPromise = undefined;
    throw error;
  });
  await poseLandmarkerPromise;
}

async function ensureGestureRecognizer(): Promise<void> {
  if (gestureRecognizer) return;
  gestureRecognizerPromise ??= (async () => {
    const [{ GestureRecognizer }, nextFileset] = await Promise.all([import("@mediapipe/tasks-vision"), ensureFileset()]);
    const modelAssetPath = process.env.NEXT_PUBLIC_GESTURE_MODEL_PATH || publicAssetPath("models/gesture_recognizer.task");
    const options = {
      baseOptions: { modelAssetPath, delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      numHands: 2,
      minHandDetectionConfidence: .5,
      minHandPresenceConfidence: .5,
      minTrackingConfidence: .5,
      cannedGesturesClassifierOptions: {
        maxResults: 1,
        scoreThreshold: .5,
        categoryDenylist: ["None"],
      },
      customGesturesClassifierOptions: {
        maxResults: 1,
        scoreThreshold: .5,
        categoryDenylist: ["None"],
      },
    };
    try {
      gestureRecognizer = await GestureRecognizer.createFromOptions(nextFileset, options);
      gestureDelegate = "GPU";
    } catch {
      gestureRecognizer = await GestureRecognizer.createFromOptions(nextFileset, {
        ...options,
        baseOptions: { modelAssetPath },
      });
      gestureDelegate = "CPU";
    }
  })().catch((error) => {
    gestureRecognizerPromise = undefined;
    throw error;
  });
  await gestureRecognizerPromise;
}

async function ensureFaceLandmarker(): Promise<void> {
  if (faceLandmarker || faceUnavailable) return;
  faceLandmarkerPromise ??= (async () => {
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
  })();
  await faceLandmarkerPromise;
}

function summarizeVideoSamples(samples: VisionMetrics[], lastError: Error | undefined): VisionMetrics {
  const mediapipeSamples = samples.filter((sample) => sample.source === "mediapipe");
  const poseSamples = mediapipeSamples.filter((sample) => sample.pose);
  const faceSamples = samples.filter((sample) => sample.face);
  const bestFace = faceSamples.sort((left, right) => (right.face?.confidence ?? 0) - (left.face?.confidence ?? 0))[0]?.face;
  const dominantHand = selectDominantHandGesture(
    mediapipeSamples.flatMap((sample) => sample.hand ? [sample.hand] : []),
    mediapipeSamples.length,
  );
  const dominantBody = selectDominantBodyGesture(poseSamples);
  const handDetectedFrames = mediapipeSamples.filter((sample) => sample.handDetected).length;
  const handDetected = handDetectedFrames >= Math.max(2, Math.ceil(mediapipeSamples.length * .14));

  if (!mediapipeSamples.length) {
    return {
      source: "unavailable",
      gesture: bestFace ? "Pose_Not_Detected" : "Not_Detected",
      face: bestFace,
      diagnostics: bestFace
        ? `5초 영상에서 얼굴은 인식했지만 상체/팔 포즈를 추적하지 못했습니다. MediaPipe face=${faceDelegate ?? "off"}, pose=${poseDelegate ?? "off"}.`
        : lastError?.message ?? `5초 영상에서 사람 포즈를 추적하지 못했습니다. MediaPipe pose=${poseDelegate ?? "off"}.`,
    };
  }

  const armSpread = percentile(poseSamples.map((sample) => sample.pose?.armSpread ?? 0), .75);
  const shoulderTilt = percentile(poseSamples.map((sample) => sample.pose?.shoulderTilt ?? 0), .75);
  const primaryGesture = resolvePrimaryGesture(dominantHand, dominantBody, handDetected);

  return {
    source: "mediapipe",
    pose: {
      shoulderTilt,
      armSpread,
      bodyGesture: dominantBody?.gesture,
      bodyConfidence: dominantBody?.confidence,
    },
    face: bestFace,
    hand: dominantHand,
    handDetected,
    gesture: primaryGesture,
    diagnostics: `5초 영상에서 ${mediapipeSamples.length}회 손가락을, ${poseSamples.length}회 상체 관절과 이동 궤적을 추적했습니다. MediaPipe pose=${poseDelegate ?? "unknown"}, gesture=${gestureDelegate ?? "off"}${dominantHand ? `, hand=${dominantHand.gesture} ${Math.round(dominantHand.confidence * 100)}%` : handDetected ? ", hand=unclassified" : ""}${dominantBody ? `, body=${dominantBody.gesture} ${Math.round(dominantBody.confidence * 100)}%` : ""}${faceDelegate ? `, face=${faceDelegate}` : ""}.`,
  };
}

function buildMetrics(
  points: PosePoint[] | undefined,
  blendshapes: BlendshapeCategory[] | undefined,
  handGesture: HandGesture | undefined,
  handDetected: boolean,
): VisionMetrics {
  const face = blendshapes?.length ? summarizeFace(blendshapes) : undefined;
  if (!points) {
    return {
      source: handGesture || handDetected ? "mediapipe" : "unavailable",
      gesture: handGesture?.gesture ?? (face ? "Pose_Not_Detected" : "Not_Detected"),
      hand: handGesture,
      handDetected,
      face,
      diagnostics: face
        ? `얼굴은 인식했지만 상체/팔 포즈 랜드마크를 찾지 못했습니다. MediaPipe face=${faceDelegate ?? "off"}, pose=${poseDelegate ?? "off"}.`
        : `사람 포즈 랜드마크를 찾지 못했습니다. MediaPipe pose=${poseDelegate ?? "off"}.`,
    };
  }
  const pose = classifyPoseFrame(points);
  const body: GestureDecision | undefined = pose.bodyGesture
    ? { gesture: pose.bodyGesture, confidence: pose.bodyConfidence ?? 0 }
    : undefined;
  return {
    source: "mediapipe",
    pose,
    face,
    hand: handGesture,
    handDetected,
    gesture: resolvePrimaryGesture(handGesture, body, handDetected),
    diagnostics: `MediaPipe pose=${poseDelegate ?? "unknown"}, gesture=${gestureDelegate ?? "off"}${faceDelegate ? `, face=${faceDelegate}` : ""}.`,
  };
}

function pickFrameHandGesture(result: GestureRecognizerResult | undefined): HandGesture | undefined {
  const cannedCandidates = (result?.gestures ?? [])
    .flat()
    .map((category) => ({
      gesture: category.categoryName ?? "",
      confidence: category.score ?? 0,
    }))
    .filter((candidate) => candidate.gesture && candidate.gesture !== "None" && candidate.confidence >= .5)
    .sort((left, right) => right.confidence - left.confidence);
  const handLandmarks = (result?.landmarks ?? []) as PosePoint[][];
  const twoHandGesture = classifyTwoHandGesture(handLandmarks);
  const customCandidates = [
    ...handLandmarks.map((landmarks) => classifyCustomHandGesture(landmarks)),
  ]
    .filter((candidate): candidate is HandGesture => Boolean(candidate))
    .sort((left, right) => right.confidence - left.confidence);
  const custom = customCandidates[0];
  const canned = cannedCandidates[0];
  if (twoHandGesture && twoHandGesture.confidence >= .7) return twoHandGesture;
  if (custom && custom.confidence >= .72) return custom;
  return canned ?? custom;
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
  if (values.smile > .28) return "joy";
  if (values.mouthOpen > .32 || values.eyeWide > .36) return "surprise";
  if (values.browDown > .24 && values.smile < .18) return "anger";
  if (values.frown > .2 || (values.browRaise > .34 && values.smile < .14)) return "sadness";
  if (values.eyeWide > .24 && values.browRaise > .18) return "anxiety";
  return "neutral";
}

function score(categories: BlendshapeCategory[], name: string): number {
  return categories.find((category) => category.categoryName === name)?.score ?? 0;
}

function average(left: number, right: number): number {
  return (left + right) / 2;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))] ?? 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function publicAssetPath(path: string): string {
  return `/${path.replace(/^\/+/, "")}`;
}
