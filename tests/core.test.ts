import { afterEach, describe, expect, it, vi } from "vitest";
import { createMotionBrief, emotionMeta, initialLayers } from "../src/data";
import { normalizePath } from "../src/router";
import { keyOutConnectedGreen } from "../src/services/image-processing";
import { synchronizedCaptureIssue } from "../src/services/media";
import { encodeApngPngFrames, encodeGifFrames } from "../src/services/renderer";
import { circularBatch, isAnimatedSticker, shuffled } from "../src/services/animated-library";
import {
  advanceShowcaseBodies,
  createShowcaseBodies,
  moveDraggedShowcaseBody,
  releaseDraggedShowcaseBody,
} from "../src/services/showcase-physics";
import { persistGeneratedAsset } from "../src/services/asset-storage";
import { deleteRemoteLibraryItem, loadRemoteProjects, loadRemoteStickers, syncStickerToRemote } from "../src/services/remote-store";
import { normalizeImentivEmotionScores } from "../server/imentiv-emotion";
import { handleOpenAIRequest } from "../server/openai-api";
import { SHOWCASE_IDLE_TIMEOUT_MS, watchForInactivity } from "../src/services/inactivity";
import {
  BODY_GESTURES,
  CANNED_HAND_GESTURES,
  CUSTOM_HAND_GESTURES,
  classifyCustomHandGesture,
  classifyPoseFrame,
  classifyTwoHandGesture,
  getGestureLabel,
  resolvePrimaryGesture,
  selectDominantBodyGesture,
  selectDominantHandGesture,
  type PosePoint,
} from "../src/services/gesture-analysis";
import { isSameOriginRequest } from "../src/app/api/openai/[...path]/route";
import { previewLayerOrder } from "../src/store";
import type { StickerItem, VisionMetrics } from "../src/types";

describe("clean route normalization", () => {
  it("keeps public clean paths and never produces a hash route", () => {
    expect(normalizePath("/edit?frame=2")).toBe("/edit");
    expect(normalizePath("/library/joy-pop")).toBe("/library/joy-pop");
    expect(normalizePath("/showcase")).toBe("/showcase");
    expect(normalizePath("/#home")).toBe("/home");
    expect(normalizePath("/unknown")).toBe("/home");
  });
});

describe("showcase inactivity timer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits three full minutes and restarts after user activity", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const onIdle = vi.fn();
    const stopWatching = watchForInactivity(onIdle, { target });

    vi.advanceTimersByTime(SHOWCASE_IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();

    target.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(SHOWCASE_IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    stopWatching();
  });
});

describe("MediaPipe hand gesture consensus", () => {
  it("selects the strongest sustained hand shape without a hardcoded V bias", () => {
    const samples = [
      ...Array.from({ length: 18 }, () => ({ gesture: "Victory", confidence: .82 })),
      ...Array.from({ length: 7 }, () => ({ gesture: "Open_Palm", confidence: .89 })),
    ];
    expect(selectDominantHandGesture(samples, 36)).toEqual({
      gesture: "Victory",
      confidence: expect.closeTo(.82, 5),
    });

    expect(selectDominantHandGesture([
      ...Array.from({ length: 8 }, () => ({ gesture: "Victory", confidence: .9 })),
      ...Array.from({ length: 18 }, () => ({ gesture: "Thumb_Up", confidence: .8 })),
    ], 40)?.gesture).toBe("Thumb_Up");
  });

  it("ignores a brief low-confidence V-shaped false positive", () => {
    expect(selectDominantHandGesture([
      { gesture: "Victory", confidence: .48 },
      { gesture: "Victory", confidence: .47 },
    ], 40)).toBeUndefined();
  });

  it("recognizes a pinched finger heart from 21 hand landmarks", () => {
    const points = makeHandLandmarks({
      0: [.5, .82],
      2: [.42, .68],
      3: [.46, .58],
      4: [.5, .5],
      5: [.56, .67],
      6: [.56, .57],
      8: [.51, .51],
      9: [.58, .68],
      10: [.59, .59],
      12: [.58, .64],
      13: [.61, .69],
      14: [.62, .61],
      16: [.61, .66],
      17: [.64, .71],
      18: [.65, .64],
      20: [.64, .69],
    });
    expect(classifyCustomHandGesture(points)?.gesture).toBe("Finger_Heart");
  });

  it("recognizes a V sign from finger geometry even when the canned classifier flickers", () => {
    const points = makeHandLandmarks({
      0: [.5, .82],
      5: [.44, .68],
      6: [.43, .54],
      8: [.42, .3],
      9: [.52, .68],
      10: [.52, .52],
      12: [.52, .26],
      13: [.58, .7],
      14: [.59, .62],
      16: [.58, .69],
      17: [.63, .72],
      18: [.64, .66],
      20: [.63, .71],
    });
    expect(classifyCustomHandGesture(points)?.gesture).toBe("Victory");
  });

  it("does not collapse I-love-you into the similar rock sign", () => {
    const points = makeHandLandmarks({
      0: [.5, .82],
      2: [.4, .7],
      3: [.34, .62],
      4: [.27, .56],
      5: [.43, .68],
      6: [.42, .53],
      8: [.41, .28],
      9: [.5, .69],
      10: [.5, .62],
      12: [.5, .68],
      13: [.57, .7],
      14: [.57, .63],
      16: [.57, .69],
      17: [.64, .69],
      18: [.65, .54],
      20: [.66, .29],
    });
    expect(classifyCustomHandGesture(points)?.gesture).toBe("ILoveYou");
  });

  it("keeps a sustained specific sign ahead of a generic open-palm fallback", () => {
    expect(selectDominantHandGesture([
      ...Array.from({ length: 10 }, () => ({ gesture: "Victory", confidence: .86 })),
      ...Array.from({ length: 22 }, () => ({ gesture: "Open_Palm", confidence: .78 })),
    ], 45)?.gesture).toBe("Victory");
  });

  it("recognizes a heart made with both hands", () => {
    const left = makeHandLandmarks({
      0: [.35, .68],
      4: [.48, .52],
      8: [.49, .41],
      9: [.4, .58],
    });
    const right = makeHandLandmarks({
      0: [.65, .68],
      4: [.52, .52],
      8: [.51, .41],
      9: [.6, .58],
    });
    expect(classifyTwoHandGesture([left, right])?.gesture).toBe("Heart_Hands");
  });
});

describe("MediaPipe full-body gesture analysis", () => {
  it("separates both-hands-up and arms-spread poses", () => {
    const bothHandsUp = makePoseLandmarks({
      13: [.3, .23],
      14: [.7, .23],
      15: [.27, .1],
      16: [.73, .1],
    });
    const armsSpread = makePoseLandmarks({
      13: [.27, .35],
      14: [.73, .35],
      15: [.1, .36],
      16: [.9, .36],
    });
    expect(classifyPoseFrame(bothHandsUp).bodyGesture).toBe("Both_Hands_Up");
    expect(classifyPoseFrame(armsSpread).bodyGesture).toBe("Arms_Spread");
  });

  it("uses wrist travel and direction changes to recognize waving", () => {
    const xPattern = [.28, .39, .3, .42, .29, .41, .3, .4, .28, .39, .3, .42];
    const samples: VisionMetrics[] = xPattern.map((x) => ({
      source: "mediapipe",
      gesture: "Raised_Left_Hand",
      pose: {
        shoulderTilt: 0,
        armSpread: .4,
        bodyGesture: "Raised_Left_Hand",
        bodyConfidence: .82,
        leftWrist: { x, y: .2, raised: true },
        rightWrist: { x: .68, y: .56, raised: false },
      },
    }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Waving_Left");
  });

  it("recognizes repeated two-hand convergence as clapping", () => {
    const gaps = [.3, .07, .28, .06, .31, .07, .29, .06, .3, .07];
    const samples: VisionMetrics[] = gaps.map((gap) => ({
      source: "mediapipe",
      gesture: "Hands_Together",
      pose: {
        shoulderTilt: 0,
        armSpread: gap,
        bodyGesture: "Hands_Together",
        bodyConfidence: .8,
        leftWrist: { x: .5 - gap / 2, y: .5, raised: false },
        rightWrist: { x: .5 + gap / 2, y: .5, raised: false },
      },
    }));
    expect(selectDominantBodyGesture(samples)?.gesture).toBe("Clapping");
  });

  it("separates hands together from crossed arms", () => {
    const handsTogether = makePoseLandmarks({
      13: [.42, .46],
      14: [.58, .46],
      15: [.49, .52],
      16: [.51, .52],
    });
    const armsCrossed = makePoseLandmarks({
      13: [.43, .49],
      14: [.57, .49],
      15: [.59, .54],
      16: [.41, .54],
    });
    expect(classifyPoseFrame(handsTogether).bodyGesture).toBe("Hands_Together");
    expect(classifyPoseFrame(armsCrossed).bodyGesture).toBe("Arms_Crossed");
  });

  it("keeps specific finger signs, but lets body motion explain an open palm", () => {
    expect(resolvePrimaryGesture(
      { gesture: "Victory", confidence: .84 },
      { gesture: "Raised_Left_Hand", confidence: .8 },
      true,
    )).toBe("Victory");
    expect(resolvePrimaryGesture(
      { gesture: "Open_Palm", confidence: .8 },
      { gesture: "Waving_Left", confidence: .86 },
      true,
    )).toBe("Waving_Left");
  });

  it("has reader-facing Korean labels for every supported gesture", () => {
    [...CANNED_HAND_GESTURES, ...CUSTOM_HAND_GESTURES, ...BODY_GESTURES].forEach((gesture) => {
      expect(getGestureLabel(gesture)).not.toBe("사용자 정의 손동작");
    });
  });
});

function makePoseLandmarks(overrides: Record<number, [number, number]>): PosePoint[] {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1, presence: 1 }));
  const defaults: Record<number, [number, number]> = {
    0: [.5, .18],
    11: [.4, .35],
    12: [.6, .35],
    13: [.35, .48],
    14: [.65, .48],
    15: [.3, .6],
    16: [.7, .6],
    23: [.44, .72],
    24: [.56, .72],
  };
  Object.entries({ ...defaults, ...overrides }).forEach(([index, [x, y]]) => {
    points[Number(index)] = { x, y, visibility: 1, presence: 1 };
  });
  return points;
}

function makeHandLandmarks(overrides: Record<number, [number, number]>): PosePoint[] {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .7, visibility: 1, presence: 1 }));
  Object.entries(overrides).forEach(([index, [x, y]]) => {
    points[Number(index)] = { x, y, visibility: 1, presence: 1 };
  });
  return points;
}

describe("OpenAI proxy origin validation", () => {
  it("accepts a browser origin preserved by the forwarded host", () => {
    const request = new Request("http://localhost:3008/api/openai/frame", {
      headers: {
        origin: "http://127.0.0.1:3008",
        host: "localhost:3008",
        "x-forwarded-host": "127.0.0.1:3008",
        "x-forwarded-proto": "http",
      },
    });
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects an unrelated browser origin", () => {
    const request = new Request("https://emove-emoticonstudio.vercel.app/api/openai/frame", {
      headers: {
        origin: "https://attacker.example",
        host: "emove-emoticonstudio.vercel.app",
        "x-forwarded-host": "emove-emoticonstudio.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("rejects mutation requests that omit browser origin evidence", () => {
    const request = new Request("https://emove-emoticonstudio.vercel.app/api/openai/frame", {
      method: "POST",
      headers: {
        host: "emove-emoticonstudio.vercel.app",
      },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("keeps same-origin read endpoints available without an Origin header", () => {
    const request = new Request("https://emove-emoticonstudio.vercel.app/api/emotion/audio?id=job-1");
    expect(isSameOriginRequest(request)).toBe(true);
  });
});

describe("animated showcase rotation", () => {
  it("shows at most twelve items and wraps without skipping the end of the deck", () => {
    const deck = Array.from({ length: 15 }, (_, index) => index);
    expect(circularBatch(deck, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(circularBatch(deck, 12)).toEqual([12, 13, 14, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not mutate the source while shuffling", () => {
    const source = [1, 2, 3, 4];
    expect(shuffled(source, () => 0)).toEqual([2, 3, 4, 1]);
    expect(source).toEqual([1, 2, 3, 4]);
  });

  it("accepts only non-default animated sticker assets", () => {
    const base: StickerItem = {
      id: "animated-1", title: "움직이는 테스트", phrase: "", emotion: "joy", image: "thumb.png",
      animatedImage: "https://assets.example.test/emove.apng", animationFormat: "APNG", color: "#BBB6FF",
      favorite: false, ownerId: null, isDefault: false, isPublished: false, characterTokenId: "character-1",
      createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
    };
    expect(isAnimatedSticker(base)).toBe(true);
    expect(isAnimatedSticker({ ...base, isDefault: true })).toBe(false);
    expect(isAnimatedSticker({ ...base, animatedImage: undefined, animationFormat: undefined })).toBe(false);
  });
});

describe("generated asset persistence", () => {
  it("keeps an existing remote URL without uploading it again", async () => {
    const source = "https://storage.googleapis.com/emove-test/assets/characters/example.png";
    await expect(persistGeneratedAsset(source, { fileName: "example.png", kind: "characters" })).resolves.toEqual({
      enabled: true,
      url: source,
    });
  });
});

describe("shared Firebase library", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes every browser into the same public library without an auth token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: true, ownerId: "public" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const sticker: StickerItem = {
      id: "shared-sticker", title: "공용 이모티콘", phrase: "안녕", emotion: "joy",
      image: "https://example.test/thumb.png", animatedImage: "https://example.test/shared.apng",
      animationFormat: "APNG", color: "#BBB6FF", favorite: false, ownerId: "browser-specific-value",
      isDefault: false, isPublished: true, characterTokenId: "character-1",
      createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    };

    await expect(syncStickerToRemote(sticker)).resolves.toMatchObject({ enabled: true, ownerId: "public" });
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(options?.body));
    expect(body.payload.ownerId).toBe("public");
    expect(options?.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("hydrates the shared sticker favorite instead of resetting it per browser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      enabled: true,
      records: [{
        id: "shared-sticker",
        kind: "stickers",
        updatedAt: "2026-08-01T00:00:00.000Z",
        payload: {
          id: "shared-sticker",
          name: "공용 이모티콘",
          projectId: "shared-project",
          gifUrl: "https://example.test/shared.apng",
          thumbnail: "https://example.test/shared.png",
          favorite: true,
          category: { emotion: "happy", group: "이모티콘 그룹" },
          metadata: { format: "APNG", averageDelay: 120 },
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await loadRemoteStickers();
    expect(result.enabled).toBe(true);
    expect(result.stickers[0]).toMatchObject({ id: "shared-sticker", emotion: "joy", favorite: true, ownerId: "public" });
  });

  it("deletes both sticker and project records for a shared emoticon", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: true, deletedAt: "2026-08-01T00:00:00.000Z" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteRemoteLibraryItem("emoticon", "sticker-1", "project-1")).resolves.toMatchObject({ enabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      "/api/library/stickers?id=sticker-1",
      "/api/library/projects?id=project-1",
    ]));
    expect(fetchMock.mock.calls.every(([, options]) => options?.method === "DELETE")).toBe(true);
  });

  it("restores legacy shared projects so another browser can open the editor", async () => {
    const transform = { x: 0, y: 0, scale: 1, rotation: 0 };
    const layer = (type: string, layerOrder: number, assetUrl: string, extra = {}) => ({ type, layerOrder, assetUrl, transform, ...extra });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      records: [{
        id: "project-1",
        kind: "projects",
        updatedAt: "2026-08-01T00:00:00.000Z",
        payload: {
          project: {
            id: "project-1",
            generatedPrompt: "기쁜 인사",
            frames: Array.from({ length: 5 }, (_, frameIndex) => ({
              frameIndex,
              delay: 120,
              layers: [
                layer("text", 0, "text-layer", { content: "안녕!", style: { shape: "pill", font: "Pretendard" } }),
                layer("accentEffect", 1, "procedural-accent-effect"),
                layer("character", 2, `https://example.test/frame-${frameIndex}.png`),
                layer("backgroundEffect", 3, "procedural-background-effect"),
              ],
            })),
            metadata: { format: "APNG", createdAt: "2026-07-01T00:00:00.000Z" },
          },
          sticker: {
            id: "sticker-1", name: "안녕!", projectId: "project-1", gifUrl: "https://example.test/sticker.apng",
            thumbnail: "https://example.test/thumb.png", category: { emotion: "happy" }, metadata: { format: "APNG" },
          },
          character: {
            id: "character-1", name: "공용 캐릭터", imageUrl: "https://example.test/character.png", styleMode: "3D",
          },
          capture: {
            id: "capture-1", behavior: { expression: "happy", gesture: "Victory", emotionKey: "happy", poseData: { poseSummary: "브이 포즈" } },
            voice: { speechText: "안녕", voiceIntensity: .5, waveformData: [.3, .5, .4] }, metadata: { capturedAt: "2026-07-01T00:00:00.000Z" },
          },
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await loadRemoteProjects();
    expect(result.projects[0]).toMatchObject({
      id: "project-1",
      ownerId: "public",
      sticker: { id: "sticker-1" },
      characterToken: { id: "character-1" },
      frameImages: expect.arrayContaining(["https://example.test/frame-0.png"]),
      motionBrief: { shortText: "안녕!", pose: "브이 포즈" },
    });
    expect(result.projects[0].frameLayerTransforms).toHaveLength(5);
  });
});

describe("four layer edit contract", () => {
  it("contains the required layers in top-to-bottom editor order", () => {
    expect(initialLayers.map((layer) => layer.id)).toEqual([
      "text",
      "accent-effects",
      "character",
      "background-effects",
    ]);
    expect(new Set(initialLayers.map((layer) => layer.id)).size).toBe(4);
    expect(initialLayers.at(-1)).toMatchObject({ id: "background-effects", visible: true, locked: true });
  });

  it("reorders editable layers while keeping the fixed background at the bottom", () => {
    expect(previewLayerOrder(initialLayers, "background-effects", "text", "before").map((layer) => layer.id)).toEqual([
      "text", "accent-effects", "character", "background-effects",
    ]);
    expect(previewLayerOrder(initialLayers, "text", "background-effects", "after").map((layer) => layer.id)).toEqual([
      "text", "accent-effects", "character", "background-effects",
    ]);
    expect(previewLayerOrder(initialLayers, "character", "text", "before").map((layer) => layer.id)).toEqual([
      "character", "text", "accent-effects", "background-effects",
    ]);
  });
});

describe("showcase floating interaction", () => {
  const bounds = { width: 1280, height: 720 };

  it("starts every animated item with a left-to-right and top-to-bottom drift", () => {
    const bodies = createShowcaseBodies(["a", "b", "c"], bounds, () => .5);
    expect(bodies).toHaveLength(3);
    bodies.forEach((body) => {
      expect(body.vx).toBeGreaterThan(0);
      expect(body.vy).toBeGreaterThan(0);
      expect(body.x).toBeGreaterThan(0);
      expect(body.y).toBeGreaterThan(0);
    });
  });

  it("pushes an emoticon away when the pointer reaches its visible bounds", () => {
    const [body] = createShowcaseBodies(["a"], bounds, () => .5);
    body.x = 400;
    body.y = 300;
    const initialVelocity = body.vx;

    advanceShowcaseBodies([body], bounds, { active: true, x: 380, y: 300 }, .05, 1);
    expect(body.vx).toBeGreaterThan(initialVelocity);
  });

  it("keeps a dragged emoticon inside the stage and resumes forward flow after release", () => {
    const [body] = createShowcaseBodies(["a"], bounds, () => .5);
    moveDraggedShowcaseBody(body, bounds, -100, 900, .016);
    expect(body.x).toBeGreaterThan(0);
    expect(body.y).toBeLessThan(bounds.height);

    releaseDraggedShowcaseBody(body);
    expect(body.vx).toBeGreaterThan(0);
    expect(body.vy).toBeGreaterThan(0);
  });

  it("wraps right and bottom exits back to the left and top edges", () => {
    const [body] = createShowcaseBodies(["a"], bounds, () => .5);
    body.x = bounds.width + body.size;
    body.y = bounds.height + body.size;

    advanceShowcaseBodies([body], bounds, { active: false, x: 0, y: 0 }, .016, 2);
    expect(body.x).toBeLessThan(0);
    expect(body.y).toBeLessThan(0);
  });
});

describe("OpenAI image-cost boundary", () => {
  it("does not expose a generated background-effect route", async () => {
    const response = await handleOpenAIRequest(new Request("http://localhost/api/openai/effect", { method: "POST" }), {
      OPENAI_API_KEY: "sk-test-only-not-a-real-key",
    });
    expect(response?.status).toBe(404);
    expect(await response?.json()).toMatchObject({ error: "지원하지 않는 OpenAI 경로입니다." });
  });
});

describe("synchronized camera and microphone capture", () => {
  const video = (durationMs = 5020, bytes = 8) => ({ blob: new Blob([new Uint8Array(bytes)], { type: "video/webm" }), durationMs, dataUrl: "data:image/jpeg;base64,AA==" });
  const audio = (durationMs = 4980, bytes = 8) => ({ blob: new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), durationMs, features: { rms: .4, peak: .6, energy: .44, capturedAt: "2026-08-04T00:00:00.000Z" } });

  it("accepts one five-second session when both streams are present and aligned", () => {
    expect(synchronizedCaptureIssue(video(), audio(), 5000)).toBeNull();
  });

  it("rejects missing, truncated, or desynchronized media before analysis", () => {
    expect(synchronizedCaptureIssue(video(5020, 0), audio(), 5000)).toContain("카메라 녹화 데이터");
    expect(synchronizedCaptureIssue(video(), audio(3200), 5000)).toContain("마이크 녹음이 5초보다 일찍");
    expect(synchronizedCaptureIssue(video(5200), audio(4100), 5000)).toContain("녹화 시간이 맞지");
  });
});

describe("emotion motion brief", () => {
  it("locks the background preset and color while preserving editable accent settings", () => {
    const brief = createMotionBrief("joy", "#112233", "오늘 진짜 너무 좋아", "완전 좋아!", .72, "default-penguin-soft3d", 120, "legacy-generated-effect", "joy", "양손 만세", "dynamic", "hearts", "#44CCFF");
    expect(brief.coreEffect).toBe(emotionMeta.joy.effect);
    expect(brief.effectColor).toBe(emotionMeta.joy.color);
    expect(brief.accentEffect).toBe("hearts");
    expect(brief.accentColor).toBe("#44CCFF");
    expect(brief.frameDelayMs).toBe(120);
    expect(brief.duration).toBe(0.6);
    expect(brief.confidence).toBeGreaterThan(0.8);
  });

  it("exposes the exact nine EMOVE emotion matrix labels", () => {
    expect(Object.keys(emotionMeta)).toEqual(["happiness", "joy", "admiration", "neutral", "surprise", "tension", "sadness", "anger", "anxiety"]);
    expect(Object.values(emotionMeta).map((item) => item.label)).toEqual(["행복", "기쁨", "감탄", "중립", "놀람", "긴장", "슬픔", "분노", "불안"]);
  });

  it("normalizes Imentiv nuanced labels into the nine-category EMOVE contract", () => {
    const scores = normalizeImentivEmotionScores({
      love: 20,
      joy: 40,
      admiration: 20,
      nervousness: 20,
    });
    expect(scores).not.toBeNull();
    expect(scores?.happiness).toBeCloseTo(.2);
    expect(scores?.joy).toBeCloseTo(.4);
    expect(scores?.admiration).toBeCloseTo(.2);
    expect(scores?.tension).toBeCloseTo(.2);
    expect(Object.values(scores ?? {}).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("covers every official Imentiv acoustic emotion without leaving the EMOVE taxonomy", () => {
    const scores = normalizeImentivEmotionScores({
      Anger: 1,
      Boredom: 1,
      Disgust: 1,
      Fear: 1,
      Happiness: 1,
      Neutral: 1,
      Sadness: 1,
      Surprise: 1,
    });

    expect(Object.keys(scores ?? {})).toEqual(Object.keys(emotionMeta));
    expect(scores?.anger).toBeCloseTo(.25);
    expect(scores?.neutral).toBeCloseTo(.25);
    expect(scores?.anxiety).toBeCloseTo(.125);
    expect(scores?.happiness).toBeCloseTo(.125);
    expect(scores?.sadness).toBeCloseTo(.125);
    expect(scores?.surprise).toBeCloseTo(.125);
  });

  it("keeps Imentiv vocal tone primary while using transcript emotion for nuance", () => {
    const scores = normalizeImentivEmotionScores(
      { happiness: 60, neutral: 40 },
      { joy: 50, admiration: 25, nervousness: 25 },
    );
    expect(scores?.happiness).toBeCloseTo(.42);
    expect(scores?.neutral).toBeCloseTo(.28);
    expect(scores?.joy).toBeCloseTo(.15);
    expect(scores?.admiration).toBeCloseTo(.075);
    expect(scores?.tension).toBeCloseTo(.075);
  });
});

describe("GIF export encoder", () => {
  it("encodes multiple RGBA frames into a valid GIF89a blob", async () => {
    const width = 12;
    const height = 12;
    const makeFrame = (red: number) => {
      const frame = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < frame.length; index += 4) {
        frame[index] = red;
        frame[index + 1] = 96;
        frame[index + 2] = 210;
        frame[index + 3] = 255;
      }
      return frame;
    };
    const blob = encodeGifFrames([makeFrame(80), makeFrame(180)], width, height, 100);
    const header = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 6));
    expect(blob.type).toBe("image/gif");
    expect(header).toBe("GIF89a");
    expect(blob.size).toBeGreaterThan(40);
  });
});

describe("transparent animation pipeline", () => {
  it("removes connected chroma green while preserving the character-colored center pixel", () => {
    const width = 3;
    const height = 3;
    const pixels = new Uint8ClampedArray([
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      0, 255, 0, 255, 184, 178, 255, 255, 0, 255, 0, 255,
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
    ]);

    keyOutConnectedGreen(pixels, width, height);

    expect(Array.from({ length: 9 }, (_, index) => pixels[index * 4 + 3])).toEqual([
      0, 0, 0,
      0, 255, 0,
      0, 0, 0,
    ]);
    expect(Array.from(pixels.slice(16, 20))).toEqual([184, 178, 255, 255]);
  });

  it("packages multiple PNG frames into a looping APNG container", async () => {
    const transparentPng = Uint8Array.from(
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwW5WQAAAABJRU5ErkJggg==", "base64"),
    );
    const blob = encodeApngPngFrames([transparentPng, transparentPng], 120);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ascii = new TextDecoder("latin1").decode(bytes);

    expect(blob.type).toBe("image/apng");
    expect(ascii).toContain("acTL");
    expect(ascii.match(/fcTL/g)).toHaveLength(2);
    expect(ascii).toContain("fdAT");
  });
});
