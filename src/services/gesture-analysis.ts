import type { VisionMetrics } from "../types";

export type PosePoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
};

type HandGesture = NonNullable<VisionMetrics["hand"]>;
type PoseMetrics = NonNullable<VisionMetrics["pose"]>;

export type GestureDecision = {
  gesture: string;
  confidence: number;
};

export const CANNED_HAND_GESTURES = [
  "Closed_Fist",
  "Open_Palm",
  "Pointing_Up",
  "Thumb_Down",
  "Thumb_Up",
  "Victory",
  "ILoveYou",
] as const;

export const CUSTOM_HAND_GESTURES = [
  "Finger_Heart",
  "Heart_Hands",
  "OK_Sign",
  "Rock_Sign",
  "Call_Me",
  "Finger_Gun",
  "Pointing_Left",
  "Pointing_Right",
  "Pointing_Down",
  "Three_Fingers",
  "Four_Fingers",
] as const;

export const BODY_GESTURES = [
  "Both_Hands_Up",
  "Raised_Left_Hand",
  "Raised_Right_Hand",
  "Arms_Spread",
  "Arms_Crossed",
  "Hands_Together",
  "Hands_Near_Head",
  "Hands_On_Hips",
  "Waving_Left",
  "Waving_Right",
  "Waving_Both",
  "Clapping",
  "Leaning_Left",
  "Leaning_Right",
  "Other_Movement",
  "Natural",
] as const;

const GESTURE_LABELS: Record<string, string> = {
  Victory: "브이(V) 사인 행동",
  Thumb_Up: "엄지 척 행동",
  Thumb_Down: "엄지를 내린 행동",
  Pointing_Up: "위쪽을 가리키는 행동",
  ILoveYou: "사랑해 손동작",
  Closed_Fist: "주먹을 쥔 행동",
  Open_Palm: "손바닥을 펼친 행동",
  Finger_Heart: "손가락 하트 행동",
  Heart_Hands: "두 손 하트 행동",
  OK_Sign: "오케이(OK) 사인 행동",
  Rock_Sign: "락 사인 행동",
  Call_Me: "전화해 손동작",
  Finger_Gun: "손가락 총 행동",
  Pointing_Left: "왼쪽을 가리키는 행동",
  Pointing_Right: "오른쪽을 가리키는 행동",
  Pointing_Down: "아래쪽을 가리키는 행동",
  Three_Fingers: "손가락 세 개를 편 행동",
  Four_Fingers: "손가락 네 개를 편 행동",
  Both_Hands_Up: "양손을 든 행동",
  Raised_Left_Hand: "왼손을 든 행동",
  Raised_Right_Hand: "오른손을 든 행동",
  Arms_Spread: "양팔을 펼친 행동",
  Arms_Crossed: "팔짱을 낀 행동",
  Hands_Together: "두 손을 모은 행동",
  Hands_Near_Head: "두 손을 머리 가까이 댄 행동",
  Hands_On_Hips: "양손을 허리에 댄 행동",
  Clapping: "박수 치는 행동",
  Waving_Left: "왼손을 흔드는 행동",
  Waving_Right: "오른손을 흔드는 행동",
  Waving_Both: "양손을 흔드는 행동",
  Leaning_Left: "상체를 왼쪽으로 기울인 행동",
  Leaning_Right: "상체를 오른쪽으로 기울인 행동",
  Hand_Shape_Unclassified: "손 모양이 감지된 미분류 행동",
  Other_Movement: "분류 범위 밖의 상체 움직임",
  Natural: "상체 중심의 자연스러운 행동",
  Pose_Not_Detected: "행동 미분석",
  Not_Detected: "행동 미분석",
  No_Video: "행동 미분석",
  Analyzer_Error: "행동 미분석",
};

export function getGestureLabel(gesture: string | undefined): string {
  if (!gesture) return "행동 미분석";
  return GESTURE_LABELS[gesture] ?? `${gesture.replaceAll("_", " ")} 동작`;
}

export function classifyPoseFrame(points: PosePoint[]): PoseMetrics {
  const leftShoulder = visiblePoint(points[11]);
  const rightShoulder = visiblePoint(points[12]);
  const leftElbow = visiblePoint(points[13]);
  const rightElbow = visiblePoint(points[14]);
  const leftWrist = visiblePoint(points[15]);
  const rightWrist = visiblePoint(points[16]);
  const leftHip = visiblePoint(points[23]);
  const rightHip = visiblePoint(points[24]);
  const nose = visiblePoint(points[0]);

  const shoulderWidth = Math.max(.08, distance(leftShoulder, rightShoulder) ?? .18);
  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const torsoHeight = Math.max(shoulderWidth, distance(shoulderMid, hipMid) ?? shoulderWidth * 1.35);
  const leftRaised = Boolean(leftWrist && leftShoulder && leftWrist.y < leftShoulder.y - shoulderWidth * .18);
  const rightRaised = Boolean(rightWrist && rightShoulder && rightWrist.y < rightShoulder.y - shoulderWidth * .18);
  const shoulderTilt = leftShoulder && rightShoulder ? Math.abs(leftShoulder.y - rightShoulder.y) : 0;
  const armSpread = leftWrist && rightWrist ? Math.min(1, Math.abs(leftWrist.x - rightWrist.x)) : 0;
  const visibility = averageVisibility([
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
  ]);

  const body = classifyStaticBodyGesture({
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
    leftHip,
    rightHip,
    nose,
    shoulderMid,
    hipMid,
    shoulderWidth,
    torsoHeight,
    leftRaised,
    rightRaised,
    visibility,
  });

  return {
    shoulderTilt,
    armSpread,
    bodyGesture: body.gesture,
    bodyConfidence: body.confidence,
    leftWrist: leftWrist ? { x: leftWrist.x, y: leftWrist.y, raised: leftRaised } : undefined,
    rightWrist: rightWrist ? { x: rightWrist.x, y: rightWrist.y, raised: rightRaised } : undefined,
  };
}

export function classifyCustomHandGesture(points: PosePoint[]): HandGesture | undefined {
  if (points.length < 21) return undefined;
  const wrist = visiblePoint(points[0]);
  const thumbTip = visiblePoint(points[4]);
  const indexTip = visiblePoint(points[8]);
  const middleTip = visiblePoint(points[12]);
  const ringTip = visiblePoint(points[16]);
  const pinkyTip = visiblePoint(points[20]);
  const middleMcp = visiblePoint(points[9]);
  const indexMcp = visiblePoint(points[5]);
  const pinkyMcp = visiblePoint(points[17]);
  if (!wrist || !thumbTip || !indexTip || !middleTip || !ringTip || !pinkyTip || !middleMcp || !indexMcp || !pinkyMcp) {
    return undefined;
  }

  const palmSize = Math.max(
    .025,
    distance(wrist, middleMcp) ?? 0,
    distance(indexMcp, pinkyMcp) ?? 0,
  );
  const thumbExtended = isFingerExtended(points, 2, 3, 4);
  const indexExtended = isFingerExtended(points, 5, 6, 8);
  const middleExtended = isFingerExtended(points, 9, 10, 12);
  const ringExtended = isFingerExtended(points, 13, 14, 16);
  const pinkyExtended = isFingerExtended(points, 17, 18, 20);
  const pinchRatio = (distance(thumbTip, indexTip) ?? palmSize) / palmSize;
  const pinchDistanceFromWrist = (distance(midpoint(thumbTip, indexTip), wrist) ?? 0) / palmSize;
  const foldedMiddleSet = !middleExtended && !ringExtended && !pinkyExtended;

  if (pinchRatio < .38 && middleExtended && ringExtended && pinkyExtended) {
    return { gesture: "OK_Sign", confidence: clamp01(.78 + (.38 - pinchRatio) * .45) };
  }
  if (
    pinchRatio < .42
    && pinchDistanceFromWrist > .82
    && foldedMiddleSet
    && !indexExtended
  ) {
    return { gesture: "Finger_Heart", confidence: clamp01(.72 + (.42 - pinchRatio) * .5) };
  }
  if (thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return { gesture: "ILoveYou", confidence: .84 };
  }
  if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return { gesture: "Rock_Sign", confidence: .82 };
  }
  if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return { gesture: "Call_Me", confidence: .8 };
  }
  if (thumbExtended && indexExtended && foldedMiddleSet) {
    return { gesture: "Finger_Gun", confidence: .78 };
  }
  if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    const fingerGap = (distance(indexTip, middleTip) ?? 0) / palmSize;
    return { gesture: "Victory", confidence: clamp01(.78 + Math.min(.12, fingerGap * .1)) };
  }
  if (indexExtended && foldedMiddleSet) {
    const directionX = indexTip.x - indexMcp.x;
    const directionY = indexTip.y - indexMcp.y;
    if (Math.abs(directionX) > Math.abs(directionY) * 1.15) {
      return { gesture: directionX < 0 ? "Pointing_Left" : "Pointing_Right", confidence: .78 };
    }
    return { gesture: directionY > 0 ? "Pointing_Down" : "Pointing_Up", confidence: .78 };
  }
  if (indexExtended && middleExtended && ringExtended && !pinkyExtended) {
    return { gesture: "Three_Fingers", confidence: .76 };
  }
  if (!thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return { gesture: "Four_Fingers", confidence: .74 };
  }
  return undefined;
}

export function classifyTwoHandGesture(hands: PosePoint[][]): HandGesture | undefined {
  if (hands.length < 2 || hands[0].length < 21 || hands[1].length < 21) return undefined;
  const [left, right] = hands;
  const leftWrist = visiblePoint(left[0]);
  const rightWrist = visiblePoint(right[0]);
  const leftIndex = visiblePoint(left[8]);
  const rightIndex = visiblePoint(right[8]);
  const leftThumb = visiblePoint(left[4]);
  const rightThumb = visiblePoint(right[4]);
  const leftMiddleMcp = visiblePoint(left[9]);
  const rightMiddleMcp = visiblePoint(right[9]);
  if (!leftWrist || !rightWrist || !leftIndex || !rightIndex || !leftThumb || !rightThumb || !leftMiddleMcp || !rightMiddleMcp) {
    return undefined;
  }

  const scale = Math.max(
    .025,
    ((distance(leftWrist, leftMiddleMcp) ?? 0) + (distance(rightWrist, rightMiddleMcp) ?? 0)) / 2,
  );
  const indexGap = (distance(leftIndex, rightIndex) ?? scale) / scale;
  const thumbGap = (distance(leftThumb, rightThumb) ?? scale) / scale;
  const wristGap = (distance(leftWrist, rightWrist) ?? 0) / scale;
  const indexMid = midpoint(leftIndex, rightIndex);
  const thumbMid = midpoint(leftThumb, rightThumb);
  const heartVerticalGap = indexMid && thumbMid ? (thumbMid.y - indexMid.y) / scale : 0;
  if (
    indexGap < .72
    && thumbGap < .72
    && wristGap > 1.15
    && wristGap < 4.8
    && heartVerticalGap > .18
  ) {
    return {
      gesture: "Heart_Hands",
      confidence: clamp01(.7 + (.72 - Math.max(indexGap, thumbGap)) * .22),
    };
  }
  return undefined;
}

export function selectDominantHandGesture(
  samples: HandGesture[],
  totalFrameCount = samples.length,
): HandGesture | undefined {
  if (!samples.length || totalFrameCount < 1) return undefined;

  const groups = new Map<string, { count: number; confidenceTotal: number }>();
  samples.forEach((sample) => {
    if (!sample.gesture || sample.gesture === "None" || sample.confidence < .5) return;
    const current = groups.get(sample.gesture) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += sample.confidence;
    groups.set(sample.gesture, current);
  });

  const minimumFrames = Math.max(3, Math.ceil(totalFrameCount * .16));
  const candidates = [...groups.entries()]
    .map(([gesture, value]) => ({
      gesture,
      confidence: value.confidenceTotal / value.count,
      count: value.count,
      score: value.count * (value.confidenceTotal / value.count),
    }))
    .filter((candidate) => candidate.count >= minimumFrames && candidate.confidence >= .55)
    .sort((left, right) => right.score - left.score);
  const specificMinimumFrames = Math.max(4, Math.ceil(totalFrameCount * .2));
  const strongestSpecific = candidates
    .filter((candidate) => !["Open_Palm", "Closed_Fist"].includes(candidate.gesture))
    .filter((candidate) => (
      candidate.count >= specificMinimumFrames
      || (candidate.confidence >= .82 && candidate.count >= Math.max(4, Math.ceil(totalFrameCount * .12)))
    ))
    .sort((left, right) => right.score - left.score)[0];
  const strongest = strongestSpecific ?? candidates[0];

  return strongest ? { gesture: strongest.gesture, confidence: strongest.confidence } : undefined;
}

export function selectDominantBodyGesture(samples: VisionMetrics[]): GestureDecision | undefined {
  const poseSamples = samples.filter((sample) => sample.source === "mediapipe" && sample.pose);
  if (!poseSamples.length) return undefined;

  const clap = selectClapGesture(poseSamples);
  if (clap) return clap;

  const wave = selectWaveGesture(poseSamples);
  if (wave) return wave;

  const groups = new Map<string, { count: number; confidenceTotal: number }>();
  poseSamples.forEach((sample) => {
    const gesture = sample.pose?.bodyGesture;
    const confidence = sample.pose?.bodyConfidence ?? 0;
    if (!gesture || gesture === "Natural" || confidence < .45) return;
    const current = groups.get(gesture) ?? { count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += confidence;
    groups.set(gesture, current);
  });

  const minimumFrames = Math.max(3, Math.ceil(poseSamples.length * .18));
  const strongest = [...groups.entries()]
    .map(([gesture, value]) => ({
      gesture,
      confidence: value.confidenceTotal / value.count,
      count: value.count,
      score: value.count * (value.confidenceTotal / value.count),
    }))
    .filter((candidate) => candidate.count >= minimumFrames && candidate.confidence >= .52)
    .sort((left, right) => right.score - left.score)[0];
  if (strongest) return { gesture: strongest.gesture, confidence: strongest.confidence };

  const leftMotion = wristMotion(poseSamples, "left");
  const rightMotion = wristMotion(poseSamples, "right");
  if (Math.max(leftMotion.path, rightMotion.path) > .28) {
    return {
      gesture: "Other_Movement",
      confidence: clamp01(.45 + Math.max(leftMotion.path, rightMotion.path) * .35),
    };
  }
  return { gesture: "Natural", confidence: .72 };
}

export function resolvePrimaryGesture(
  hand: HandGesture | undefined,
  body: GestureDecision | undefined,
  handDetected: boolean,
): string {
  const specificHandGesture = hand && !["Open_Palm", "Closed_Fist"].includes(hand.gesture);
  if (specificHandGesture) return hand.gesture;
  if (body && body.gesture !== "Natural") return body.gesture;
  if (hand) return hand.gesture;
  if (handDetected) return "Hand_Shape_Unclassified";
  return body?.gesture ?? "Natural";
}

function classifyStaticBodyGesture(input: {
  leftShoulder?: PosePoint;
  rightShoulder?: PosePoint;
  leftElbow?: PosePoint;
  rightElbow?: PosePoint;
  leftWrist?: PosePoint;
  rightWrist?: PosePoint;
  leftHip?: PosePoint;
  rightHip?: PosePoint;
  nose?: PosePoint;
  shoulderMid?: PosePoint;
  hipMid?: PosePoint;
  shoulderWidth: number;
  torsoHeight: number;
  leftRaised: boolean;
  rightRaised: boolean;
  visibility: number;
}): GestureDecision {
  const {
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
    leftHip,
    rightHip,
    nose,
    shoulderMid,
    hipMid,
    shoulderWidth,
    torsoHeight,
    leftRaised,
    rightRaised,
    visibility,
  } = input;
  const confidence = (base: number) => clamp01(base * (.72 + visibility * .28));

  if (
    leftWrist
    && rightWrist
    && nose
    && distance(leftWrist, nose)! < shoulderWidth * 1.05
    && distance(rightWrist, nose)! < shoulderWidth * 1.05
    && leftWrist.y > nose.y - shoulderWidth * .35
    && rightWrist.y > nose.y - shoulderWidth * .35
    && leftWrist.y < (shoulderMid?.y ?? .5) + torsoHeight * .12
    && rightWrist.y < (shoulderMid?.y ?? .5) + torsoHeight * .12
  ) {
    return { gesture: "Hands_Near_Head", confidence: confidence(.86) };
  }

  const leftShoulderSide = leftShoulder && shoulderMid ? Math.sign(leftShoulder.x - shoulderMid.x) : 0;
  const rightShoulderSide = rightShoulder && shoulderMid ? Math.sign(rightShoulder.x - shoulderMid.x) : 0;
  const wristsCrossedSides = leftWrist
    && rightWrist
    && leftShoulderSide
    && rightShoulderSide
    && shoulderMid
    && Math.sign(leftWrist.x - shoulderMid.x) === -leftShoulderSide
    && Math.sign(rightWrist.x - shoulderMid.x) === -rightShoulderSide;
  const crossedByElbows = wristsCrossedSides
    && leftWrist
    && rightWrist
    && leftElbow
    && rightElbow
    && distance(leftWrist, rightElbow)! < shoulderWidth * .78
    && distance(rightWrist, leftElbow)! < shoulderWidth * .78;
  const crossedByCenter = wristsCrossedSides
    && leftWrist
    && rightWrist
    && shoulderMid
    && hipMid
    && distance(leftWrist, rightWrist)! < shoulderWidth * 1.25
    && leftWrist.y > shoulderMid.y
    && rightWrist.y > shoulderMid.y
    && leftWrist.y < shoulderMid.y + torsoHeight * .72
    && rightWrist.y < shoulderMid.y + torsoHeight * .72;
  if (crossedByElbows || crossedByCenter) {
    return { gesture: "Arms_Crossed", confidence: confidence(crossedByElbows ? .9 : .74) };
  }

  if (
    leftWrist
    && rightWrist
    && shoulderMid
    && distance(leftWrist, rightWrist)! < shoulderWidth * .46
    && leftWrist.y > shoulderMid.y - torsoHeight * .12
    && rightWrist.y > shoulderMid.y - torsoHeight * .12
  ) {
    return { gesture: "Hands_Together", confidence: confidence(.84) };
  }

  if (
    leftWrist
    && rightWrist
    && leftHip
    && rightHip
    && distance(leftWrist, leftHip)! < shoulderWidth * .82
    && distance(rightWrist, rightHip)! < shoulderWidth * .82
  ) {
    return { gesture: "Hands_On_Hips", confidence: confidence(.82) };
  }

  if (leftRaised && rightRaised) {
    return { gesture: "Both_Hands_Up", confidence: confidence(.88) };
  }

  const wristDistance = distance(leftWrist, rightWrist) ?? 0;
  const leftExtended = armExtension(leftShoulder, leftElbow, leftWrist);
  const rightExtended = armExtension(rightShoulder, rightElbow, rightWrist);
  const armsNearShoulderHeight = leftWrist
    && rightWrist
    && leftShoulder
    && rightShoulder
    && Math.abs(leftWrist.y - leftShoulder.y) < torsoHeight * .55
    && Math.abs(rightWrist.y - rightShoulder.y) < torsoHeight * .55;
  if (
    wristDistance > shoulderWidth * 2.05
    && armsNearShoulderHeight
    && leftExtended > .68
    && rightExtended > .68
  ) {
    return { gesture: "Arms_Spread", confidence: confidence(.86) };
  }

  if (leftRaised) return { gesture: "Raised_Left_Hand", confidence: confidence(.8) };
  if (rightRaised) return { gesture: "Raised_Right_Hand", confidence: confidence(.8) };

  if (shoulderMid && hipMid) {
    const lean = (shoulderMid.x - hipMid.x) / shoulderWidth;
    if (lean < -.3) return { gesture: "Leaning_Left", confidence: confidence(Math.min(.84, .55 + Math.abs(lean) * .35)) };
    if (lean > .3) return { gesture: "Leaning_Right", confidence: confidence(Math.min(.84, .55 + Math.abs(lean) * .35)) };
  }

  return { gesture: "Natural", confidence: confidence(.72) };
}

function selectWaveGesture(samples: VisionMetrics[]): GestureDecision | undefined {
  const left = wristMotion(samples, "left");
  const right = wristMotion(samples, "right");
  const leftWave = isWave(left);
  const rightWave = isWave(right);
  if (!leftWave && !rightWave) return undefined;

  const confidence = clamp01(.58 + Math.max(left.score, right.score) * .32);
  if (leftWave && rightWave) return { gesture: "Waving_Both", confidence };
  return { gesture: leftWave ? "Waving_Left" : "Waving_Right", confidence };
}

function selectClapGesture(samples: VisionMetrics[]): GestureDecision | undefined {
  const distances = samples
    .map((sample) => {
      const left = sample.pose?.leftWrist;
      const right = sample.pose?.rightWrist;
      return left && right ? Math.hypot(left.x - right.x, left.y - right.y) : undefined;
    })
    .filter((value): value is number => value !== undefined);
  if (distances.length < 8) return undefined;

  const minimum = Math.min(...distances);
  const maximum = Math.max(...distances);
  let directionChanges = 0;
  let previousDirection = 0;
  let travel = 0;
  for (let index = 1; index < distances.length; index += 1) {
    const delta = distances[index] - distances[index - 1];
    travel += Math.abs(delta);
    const direction = Math.abs(delta) >= .008 ? Math.sign(delta) : 0;
    if (direction && previousDirection && direction !== previousDirection) directionChanges += 1;
    if (direction) previousDirection = direction;
  }
  if (minimum <= .1 && maximum - minimum >= .1 && travel >= .38 && directionChanges >= 3) {
    return {
      gesture: "Clapping",
      confidence: clamp01(.62 + Math.min(.28, travel * .22 + directionChanges * .025)),
    };
  }
  return undefined;
}

function wristMotion(samples: VisionMetrics[], side: "left" | "right"): {
  path: number;
  xRange: number;
  directionChanges: number;
  raisedRatio: number;
  score: number;
} {
  const points = samples
    .map((sample) => side === "left" ? sample.pose?.leftWrist : sample.pose?.rightWrist)
    .filter((point): point is NonNullable<PoseMetrics["leftWrist"]> => Boolean(point));
  if (points.length < 5) return { path: 0, xRange: 0, directionChanges: 0, raisedRatio: 0, score: 0 };

  let path = 0;
  let directionChanges = 0;
  let previousDirection = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    path += Math.hypot(current.x - previous.x, current.y - previous.y);
    const deltaX = current.x - previous.x;
    const direction = Math.abs(deltaX) >= .006 ? Math.sign(deltaX) : 0;
    if (direction && previousDirection && direction !== previousDirection) directionChanges += 1;
    if (direction) previousDirection = direction;
  }

  const xValues = points.map((point) => point.x);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const raisedRatio = points.filter((point) => point.raised).length / points.length;
  const score = clamp01(xRange * 3.5 + path * .55 + directionChanges * .08 + raisedRatio * .12);
  return { path, xRange, directionChanges, raisedRatio, score };
}

function isWave(motion: ReturnType<typeof wristMotion>): boolean {
  return motion.xRange >= .075
    && motion.path >= .3
    && motion.directionChanges >= 2
    && motion.raisedRatio >= .18;
}

function armExtension(shoulder?: PosePoint, elbow?: PosePoint, wrist?: PosePoint): number {
  const upper = distance(shoulder, elbow);
  const lower = distance(elbow, wrist);
  const reach = distance(shoulder, wrist);
  if (!upper || !lower || !reach) return 0;
  return clamp01(reach / (upper + lower));
}

function isFingerExtended(points: PosePoint[], mcpIndex: number, pipIndex: number, tipIndex: number): boolean {
  const wrist = visiblePoint(points[0]);
  const mcp = visiblePoint(points[mcpIndex]);
  const pip = visiblePoint(points[pipIndex]);
  const tip = visiblePoint(points[tipIndex]);
  if (!wrist || !mcp || !pip || !tip) return false;
  const angle = jointAngle(mcp, pip, tip);
  const tipReach = distance(wrist, tip) ?? 0;
  const pipReach = distance(wrist, pip) ?? 1;
  return angle >= 145 && tipReach > pipReach * 1.04;
}

function jointAngle(first: PosePoint, center: PosePoint, last: PosePoint): number {
  const firstVector = { x: first.x - center.x, y: first.y - center.y };
  const lastVector = { x: last.x - center.x, y: last.y - center.y };
  const firstLength = Math.hypot(firstVector.x, firstVector.y);
  const lastLength = Math.hypot(lastVector.x, lastVector.y);
  if (!firstLength || !lastLength) return 0;
  const cosine = clamp(
    (firstVector.x * lastVector.x + firstVector.y * lastVector.y) / (firstLength * lastLength),
    -1,
    1,
  );
  return Math.acos(cosine) * (180 / Math.PI);
}

function visiblePoint(point: PosePoint | undefined): PosePoint | undefined {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  if ((point.visibility ?? 1) < .32 || (point.presence ?? 1) < .32) return undefined;
  return point;
}

function midpoint(left?: PosePoint, right?: PosePoint): PosePoint | undefined {
  if (!left || !right) return undefined;
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    visibility: Math.min(left.visibility ?? 1, right.visibility ?? 1),
  };
}

function distance(left?: PosePoint, right?: PosePoint): number | undefined {
  if (!left || !right) return undefined;
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function averageVisibility(points: Array<PosePoint | undefined>): number {
  const visible = points.filter((point): point is PosePoint => Boolean(point));
  if (!visible.length) return 0;
  return visible.reduce((total, point) => total + (point.visibility ?? 1), 0) / visible.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
