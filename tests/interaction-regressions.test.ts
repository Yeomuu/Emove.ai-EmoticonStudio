import { describe, expect, it } from "vitest";
import { layerDropPosition } from "../src/services/layer-order";
import { preferReliableHandGesture, resolvePrimaryGesture, selectDominantBodyGesture, summarizeObservedMotion } from "../src/services/gesture-analysis";
import { hitWaitingTarget, idleWaitingGame, pauseWaitingGame, resumeWaitingGame, startWaitingGame, tickWaitingGame } from "../src/services/waiting-game";
import type { VisionMetrics } from "../src/types";

describe("stable half-row drop zones", () => {
  it("inserts above in the upper half and below in the lower half", () => {
    expect(layerDropPosition(200, 200, 80)).toBe("before");
    expect(layerDropPosition(239, 200, 80)).toBe("before");
    expect(layerDropPosition(240, 200, 80)).toBe("before");
    expect(layerDropPosition(241, 200, 80)).toBe("after");
    expect(layerDropPosition(279, 200, 80)).toBe("after");
  });
});

describe("MediaPipe observations", () => {
  it("keeps a confident model palm instead of a conflicting custom finger shape", () => {
    expect(preferReliableHandGesture({ gesture: "Open_Palm", confidence: .92 }, { gesture: "Four_Fingers", confidence: .74 })?.gesture).toBe("Open_Palm");
    expect(preferReliableHandGesture(undefined, { gesture: "Finger_Heart", confidence: .8 })?.gesture).toBe("Finger_Heart");
  });

  it("recognizes slow bilateral waves even when each frame moves less than the former threshold", () => {
    const samples: VisionMetrics[] = Array.from({ length: 100 }, (_, index) => {
      const offset = Math.sin(index * Math.PI / 20) * .03;
      return { source: "mediapipe", pose: { shoulderTilt: 0, armSpread: .4, shoulderWidth: .25,
        leftWrist: { x: .3 + offset, y: .2, raised: true }, rightWrist: { x: .7 + offset, y: .2, raised: true } } };
    });
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Waving_Both");
    expect(resolvePrimaryGesture({ gesture: "Victory", confidence: .9 }, { gesture: "Waving_Both", confidence: .8 }, true)).toBe("Waving_Both");
  });

  it("uses both hand landmark paths when body wrists are unavailable", () => {
    const samples: VisionMetrics[] = Array.from({ length: 60 }, (_, index) => ({
      source: "mediapipe", hands: ["Left", "Right"].map((side) => ({ side, gesture: "Open_Palm", confidence: .9,
        palm: { x: (side === "Left" ? .3 : .7) + Math.sin(index * .4) * .05, y: .2, raised: true } })),
    }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Waving_Both");
  });

  it("does not invent waving from stationary hands or small tracking jitter", () => {
    const samples: VisionMetrics[] = Array.from({ length: 60 }, (_, index) => ({ source: "mediapipe", pose: {
      shoulderTilt: 0, armSpread: .4, shoulderWidth: .3, bodyGesture: "Both_Hands_Up", bodyConfidence: .8,
      leftWrist: { x: .3 + Math.sin(index) * .003, y: .2, raised: true }, rightWrist: { x: .7, y: .2, raised: true },
    } }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Both_Hands_Up");
  });

  it("does not mistake alternating palm and wrist detections for a wave", () => {
    const samples: VisionMetrics[] = Array.from({ length: 60 }, (_, index) => ({ source: "mediapipe", pose: {
      shoulderTilt: 0, armSpread: .4, shoulderWidth: .3, bodyGesture: "Raised_Left_Hand", bodyConfidence: .8,
      leftWrist: { x: .3, y: .3, raised: true },
    }, hands: index % 2 ? [] : [{ side: "Left", gesture: "Open_Palm", confidence: .9, palm: { x: .36, y: .2, raised: true } }] }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Raised_Left_Hand");
  });

  it("describes measured movement outside named gesture classes without inventing invisible joints", () => {
    const samples: VisionMetrics[] = Array.from({ length: 20 }, (_, index) => {
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
      landmarks[11] = { x: .4, y: .4, visibility: 1 }; landmarks[12] = { x: .6, y: .4, visibility: 1 };
      landmarks[15] = { x: .2 + index * .01, y: .2, visibility: 1 };
      return { source: "mediapipe", pose: { shoulderTilt: 0, armSpread: 0, landmarks } };
    });
    expect(summarizeObservedMotion(samples)).toContain("왼손: 어깨 위, 좌우 이동");
    expect(summarizeObservedMotion(samples)).not.toContain("오른발");
    expect(summarizeObservedMotion([])).toBe("");
  });
});

describe("isolated waiting game", () => {
  it("scores hits, moves targets, and ignores input while inactive", () => {
    const idle = idleWaitingGame();
    expect(hitWaitingTarget(idle, 4, 10, .5)).toBe(idle);
    const started = startWaitingGame(1000);
    const hit = hitWaitingTarget(started, 4, 1100, .5);
    expect(hit.score).toBe(10); expect(hit.hits).toBe(1); expect(hit.target).not.toBe(4);
    const missed = hitWaitingTarget(hit, 4, 1200, .5);
    expect(missed.score).toBe(10); expect(missed.combo).toBe(0);
  });

  it("ends on elapsed time and never awards a late hit", () => {
    const started = startWaitingGame(0);
    expect(hitWaitingTarget(started, 4, 30_001, .5)).toMatchObject({ status: "over", score: 0 });
    expect(tickWaitingGame(started, 1700, .5)).toMatchObject({ remainingMs: 28_300, combo: 0 });
  });

  it("pauses without consuming remaining time and restarts independently", () => {
    const paused = pauseWaitingGame(startWaitingGame(0), 5000);
    expect(tickWaitingGame(paused, 50_000, .5)).toBe(paused);
    expect(resumeWaitingGame(paused, 50_000).endsAt).toBe(75_000);
    expect(startWaitingGame(60_000)).toMatchObject({ score: 0, hits: 0, remainingMs: 30_000 });
  });
});
