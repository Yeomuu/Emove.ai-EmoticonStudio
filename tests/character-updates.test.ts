import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCharacterTokens } from "../src/data";
import { appearancePrompt, replaceCharacterRecord, reviseCharacter } from "../src/services/character-editing";
import { boundedStageProgress, nextStageBoundary } from "../src/services/stage-progress";
import { hitWaitingTarget, pauseWaitingGame, rankWaitingScores, resumeWaitingGame, startWaitingGame, targetDuration } from "../src/services/waiting-game";
import { loadRemoteCharacters, syncCharacterToRemote } from "../src/services/remote-store";
import { handleOpenAIRequest } from "../server/openai-api";

afterEach(() => vi.unstubAllGlobals());

describe("catch game", () => {
  it("ends after three mistakes and ignores further clicks", () => {
    let game = startWaitingGame(0);
    for (let i = 1; i <= 3; i++) game = hitWaitingTarget(game, 0, i * 10, 0);
    expect(game).toMatchObject({ status: "over", mistakes: 3, score: 0 });
    expect(hitWaitingTarget(game, game.target, 100, 0)).toBe(game);
  });
  it("speeds up at five and ten hits, capped at 600ms", () => {
    let game = startWaitingGame(0);
    for (let i = 1; i <= 15; i++) {
      game = hitWaitingTarget(game, game.target, i * 100, .2);
      if (i === 5) expect(game.targetEndsAt - i * 100).toBe(1500);
      if (i === 10) expect(game.targetEndsAt - i * 100).toBe(1000);
    }
    expect(game.feedback?.kind).toBe("level");
    expect(targetDuration(game.level)).toBe(600);
  });
  it("preserves remaining target time on pause and rejects expired hits", () => {
    const game = startWaitingGame(0);
    const resumed = resumeWaitingGame(pauseWaitingGame(game, 500), 10000);
    expect(resumed.targetEndsAt).toBe(11500);
    expect(hitWaitingTarget(game, game.target, 2001, 0).score).toBe(0);
  });
  it("keeps exactly the top five completed scores", () => {
    expect(rankWaitingScores([10, 200, 30, 50, 40, NaN], 80)).toEqual([200, 80, 50, 40, 30]);
  });
});

describe("character revisions", () => {
  it("derives the appearance from the selected subject and dimensional style", () => {
    const prompt = appearancePrompt("인물", "학생", "2D", "일러스트");
    expect(prompt).toContain("인물 - 학생");
    expect(prompt).toContain("교복");
    expect(prompt).toContain("2D");
    expect(prompt).not.toContain("3D");
  });
  it("keeps identity, image, creation time and ordering for personality-only edits", () => {
    const original = defaultCharacterTokens[0];
    const edited = reviseCharacter(original, { name: "수정 이름", traits: ["활발한"], now: "2026-09-16T00:00:00Z" });
    expect(edited).toMatchObject({ id: original.id, sourceAsset: original.sourceAsset, createdAt: original.createdAt, personalityTags: ["활발한"], version: original.version + 1 });
    expect(replaceCharacterRecord(defaultCharacterTokens, edited).map(item => item.id)).toEqual(defaultCharacterTokens.map(item => item.id));
    expect(reviseCharacter(original, { name: original.name, traits: [], image: "/new.webp", now: edited.updatedAt }).referenceImages).toEqual(["/new.webp"]);
  });
  it("round trips character settings through public metadata", async () => {
    const original = reviseCharacter({ ...defaultCharacterTokens[0], category: "기타", subType: "공룡" }, { name: "시험", traits: ["차분한"], now: "2026-09-16T00:00:00Z" });
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: true })));
    vi.stubGlobal("fetch", mock);
    await syncCharacterToRemote(original);
    const record = JSON.parse(mock.mock.calls[0][1].body);
    mock.mockResolvedValue(new Response(JSON.stringify({ records: [{ ...record, updatedAt: original.updatedAt }] })));
    const result = await loadRemoteCharacters();
    expect(result.characters[0]).toMatchObject({ id: original.id, category: "기타", subType: "공룡", personalityTags: original.personalityTags, colors: original.colors, styleMode: original.styleMode, version: original.version });
  });
  it("sends the original and two extra references as multipart images", async () => {
    const mock = vi.fn().mockImplementation(async (url) => String(url).startsWith("data:")
      ? new Response(new Blob(["reference"], { type: "image/png" }))
      : new Response(JSON.stringify({ data: [{ b64_json: "AA==" }] })));
    vi.stubGlobal("fetch", mock);
    const response = await handleOpenAIRequest(new Request("http://localhost/api/openai/character", { method: "POST", body: JSON.stringify({ prompt: "change hat", editExisting: true, referenceImages: Array(3).fill("data:image/png;base64,AA==") }) }), { OPENAI_API_KEY: "sk-test-not-a-real-key" });
    expect(response?.status).toBe(200);
    const form = mock.mock.calls.at(-1)?.[1].body as FormData;
    expect(form.getAll("image[]")).toHaveLength(3);
    expect(form.get("background")).toBe("transparent");
  });
});

describe("bounded progress", () => {
  it("waits two seconds and never completes the current stage by elapsed time", () => {
    expect(boundedStageProgress(0, 10, 1999)).toBe(0);
    expect(boundedStageProgress(0, 10, 2000)).toBeGreaterThan(0);
    expect(boundedStageProgress(0, 10, 999999)).toBeLessThan(10);
    expect(boundedStageProgress(90, 100, 999999)).toBeLessThan(100);
    expect(boundedStageProgress(100, 100, 0)).toBe(100);
    expect(nextStageBoundary(10, [5, 10, 35, 100])).toBe(35);
  });
});
