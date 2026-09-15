import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraFrameCrop } from "../src/services/camera-framing";
import { CameraCapture } from "../src/services/media";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared 4:3 camera framing", () => {
  it.each([
    [960, 720, { x: 0, y: 0, width: 960, height: 720 }],
    [1920, 1080, { x: 240, y: 0, width: 1440, height: 1080 }],
    [720, 1280, { x: 0, y: 370, width: 720, height: 540 }],
  ])("center crops %sx%s without distortion", (width, height, crop) => {
    expect(cameraFrameCrop(width, height)).toEqual(crop);
    expect(crop.width / crop.height).toBeCloseTo(4 / 3);
  });

  it("rejects unavailable frame dimensions", () => {
    expect(() => cameraFrameCrop(0, 720)).toThrow();
    expect(() => cameraFrameCrop(960, NaN)).toThrow();
  });
});

function setupCamera() {
  vi.useFakeTimers();
  const sourceTrack = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn() };
  const outputTrack = { stop: vi.fn() };
  const source = { getTracks: () => [sourceTrack], getVideoTracks: () => [sourceTrack] };
  const output = { getTracks: () => [outputTrack] };
  const drawImage = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), captureStream: vi.fn(() => output), toDataURL: vi.fn(() => "data:image/jpeg;base64,test") };
  const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2, paused: false, srcObject: null,
    play: vi.fn(async () => {}), addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLVideoElement;
  let recorder: FakeRecorder;
  class FakeRecorder {
    static isTypeSupported = () => true;
    state = "inactive";
    mimeType = "video/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    constructor(readonly stream: unknown) { recorder = this; }
    start() { this.state = "recording"; }
    stop = vi.fn(() => {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["recorded frames"]) });
      this.onstop?.();
    });
  }
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => source) } });
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  return { camera: new CameraCapture(), video, canvas, drawImage, sourceTrack, outputTrack, output, getRecorder: () => recorder! };
}

describe("camera recording lifecycle", () => {
  it("records cropped canvas frames, keeps preview alive, then releases only output tracks", async () => {
    const fixture = setupCamera();
    await fixture.camera.attach(fixture.video);
    const started = vi.fn();
    const recording = fixture.camera.record(fixture.video, 5000, undefined, started);
    expect(started).toHaveBeenCalledOnce();
    expect(fixture.getRecorder().stream).toBe(fixture.output);
    expect(fixture.canvas.width).toBe(960);
    expect(fixture.canvas.height).toBe(720);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await recording;
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.durationMs).toBe(5000);
    expect(fixture.drawImage).toHaveBeenLastCalledWith(fixture.video, 240, 0, 1440, 1080, 0, 0, 960, 720);
    expect(fixture.outputTrack.stop).toHaveBeenCalledOnce();
    expect(fixture.sourceTrack.stop).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    fixture.camera.release();
    expect(fixture.sourceTrack.stop).toHaveBeenCalledOnce();
    expect(fixture.video.srcObject).toBeNull();
  });

  it("cleans up when synchronized microphone startup fails", async () => {
    const fixture = setupCamera();
    await fixture.camera.attach(fixture.video);
    await expect(fixture.camera.record(fixture.video, 5000, undefined, () => { throw new Error("microphone failed"); })).rejects.toThrow("microphone failed");
    expect(fixture.outputTrack.stop).toHaveBeenCalledOnce();
    expect(fixture.getRecorder().stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels recording and stops its timers when leaving capture", async () => {
    const fixture = setupCamera();
    await fixture.camera.attach(fixture.video);
    const result = fixture.camera.record(fixture.video);
    const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
    fixture.camera.release();
    await rejection;
    expect(fixture.outputTrack.stop).toHaveBeenCalledOnce();
    expect(fixture.sourceTrack.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up recorder errors and disconnected camera tracks", async () => {
    const fixture = setupCamera();
    await fixture.camera.attach(fixture.video);
    const result = fixture.camera.record(fixture.video);
    const rejection = expect(result).rejects.toThrow("카메라 녹화에 실패");
    fixture.getRecorder().onerror?.();
    await rejection;
    expect(fixture.outputTrack.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    const retry = fixture.camera.record(fixture.video);
    const disconnected = expect(retry).rejects.toThrow("카메라 연결이 중단");
    fixture.sourceTrack.readyState = "ended";
    await vi.advanceTimersByTimeAsync(40);
    await disconnected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
