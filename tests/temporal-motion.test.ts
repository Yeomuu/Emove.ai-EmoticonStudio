import { describe, expect, it } from "vitest";
import { classifyPoseFrame, describeGestureMotion, getGestureLabel, resolvePrimaryGesture, selectDominantBodyGesture, summarizeObservedMotion } from "../src/services/gesture-analysis";
import { buildFramePrompts } from "../src/services/prompt-builder";
import { createMotionBrief, defaultCharacterTokens } from "../src/data";
import type { VisionMetrics } from "../src/types";

function sequence(movement: (index: number) => { x: number; y: number }, joint = 15): VisionMetrics[] {
  return Array.from({ length: 60 }, (_, index) => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    landmarks[0] = { x: .5, y: .15, visibility: 1 };
    landmarks[11] = { x: .4, y: .4, visibility: 1 };
    landmarks[12] = { x: .6, y: .4, visibility: 1 };
    landmarks[15] = { x: .42, y: .22, visibility: 1 };
    landmarks[16] = { x: .58, y: .22, visibility: 1 };
    landmarks[joint] = { ...movement(index), visibility: 1 };
    return { source: "mediapipe", pose: classifyPoseFrame(landmarks), hand: { gesture: "Hand_Shape_Unclassified", confidence: .8 } };
  });
}

describe("temporal motion rather than static gesture labels", () => {
  it("recognizes a vertical wave near the head despite an unclassified/downward hand shape", () => {
    const samples = sequence((index) => ({ x: .42, y: .22 + Math.sin(index * .4) * .035 }));
    samples.forEach((sample) => {
      expect(sample.pose?.bodyGesture).toBe("Hands_Near_Head");
      sample.hands = [{ side: "Left", gesture: "Hand_Shape_Unclassified", confidence: 0,
        palm: { ...sample.pose!.leftWrist!, raised: false } }];
    });
    const body = selectDominantBodyGesture(samples);
    expect(body?.gesture).toBe("Waving_Left");
    expect(resolvePrimaryGesture(samples[0].hand, body, true)).toBe("Waving_Left");
    const motionSummary = summarizeObservedMotion(samples, true);
    expect(motionSummary).toContain("왼손: 상하 반복 흔들기");
    expect(describeGestureMotion({ ...samples[0], motionSummary })).not.toContain("머리 근처");
  });

  it("recognizes diagonal movement without requiring a palm gesture", () => {
    const samples = sequence((index) => ({ x: .42 + Math.sin(index * .4) * .03, y: .22 + Math.sin(index * .4) * .035 }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Waving_Left");
    expect(summarizeObservedMotion(samples, true)).toContain("좌우 반복 흔들기");
    expect(summarizeObservedMotion(samples, true)).toContain("상하 반복 흔들기");
  });

  it("keeps a stationary near-head pose and does not infer physical contact", () => {
    const samples = sequence(() => ({ x: .42, y: .22 }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Hands_Near_Head");
    expect(summarizeObservedMotion(samples, true)).toBe("");
    expect(getGestureLabel("Hands_Near_Head")).toBe("양손이 머리 근처에 있는 자세");
  });

  it("preserves unnamed knee motion instead of allowing a hand pose to replace it", () => {
    const samples = sequence((index) => ({ x: .4, y: .7 + Math.sin(index * .4) * .05 }), 25);
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Other_Movement");
    expect(summarizeObservedMotion(samples, true)).toContain("왼무릎: 상하 반복 흔들기");
    expect(resolvePrimaryGesture({ gesture: "Victory", confidence: .9 }, selectDominantBodyGesture(samples), true)).toBe("Other_Movement");
  });

  it("does not turn whole-body translation into a relative arm wave", () => {
    const samples = sequence(() => ({ x: .42, y: .22 }));
    samples.forEach((sample, index) => {
      const offset = Math.sin(index * .4) * .07;
      sample.pose = classifyPoseFrame(sample.pose!.landmarks!.map((point) => ({ ...point, x: point.x + offset })));
    });
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Other_Movement");
    expect(summarizeObservedMotion(samples, true)).toContain("화면 속 상체: 좌우 반복 흔들기");
    expect(summarizeObservedMotion(samples, true)).not.toContain("왼손");
  });

  it("does not join separated static observations into repeated movement", () => {
    const samples = sequence((index) => ({ x: .42, y: .18 + Math.floor(index / 15) % 2 * .08 }));
    samples.forEach((sample, index) => { if (index % 15 >= 5) sample.pose = undefined; });
    expect(summarizeObservedMotion(samples, true)).toBe("");
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Hands_Near_Head");
  });

  it("does not mix body-relative and screen coordinates during intermittent pose loss", () => {
    const samples = sequence(() => ({ x: .42, y: .22 }));
    samples.forEach((sample, index) => {
      sample.hands = [{ side: "Left", gesture: "Open_Palm", confidence: .9, palm: { x: .42, y: .22, raised: true } }];
      if (index % 2) sample.pose = undefined;
    });
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Hands_Near_Head");
  });

  it("passes unnamed motion evidence into all five frame prompts", () => {
    const pose = summarizeObservedMotion(sequence((index) => ({ x: .4, y: .7 + Math.sin(index * .4) * .05 }), 25), true);
    const brief = { ...createMotionBrief("joy", "#000000", "", "", .5, defaultCharacterTokens[0].id, 120, "generated-background"), pose };
    buildFramePrompts(brief, defaultCharacterTokens[0]).forEach((prompt) => {
      expect(prompt).toContain(pose);
      expect(prompt).toContain("even without a recognized gesture class");
      expect(prompt).toContain("not a replacement for the observed movement");
    });
  });
});
