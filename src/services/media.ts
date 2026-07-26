import type { AudioFeatures } from "../types";

export interface AudioCaptureResult { blob: Blob; durationMs: number; features: AudioFeatures }
export interface CameraCaptureResult { blob: Blob; durationMs: number; dataUrl: string }

export class AudioCapture {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private animationFrame?: number;
  private rmsSamples: number[] = [];
  private peak = 0;

  async start(onFrame: (levels: number[], features: { rms: number; peak: number }) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 마이크 입력을 지원하지 않습니다.");
    if (typeof MediaRecorder === "undefined") throw new Error("이 브라우저는 음성 녹음을 지원하지 않습니다.");
    this.release();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      const mimeType = supportedRecorderMimeType([
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/aac",
      ]);
      this.recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);
      this.chunks = [];
      this.rmsSamples = [];
      this.peak = 0;
      this.recorder.ondataavailable = (event) => event.data.size && this.chunks.push(event.data);
      this.recorder.start(120);
      this.startedAt = performance.now();
      this.context = new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.66;
      source.connect(this.analyser);
      const frequency = new Uint8Array(this.analyser.frequencyBinCount);
      const time = new Uint8Array(this.analyser.fftSize);
      const tick = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(frequency);
        this.analyser.getByteTimeDomainData(time);
        const rms = Math.sqrt(time.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / time.length);
        const peak = Math.max(...time.map((value) => Math.abs((value - 128) / 128)));
        this.rmsSamples.push(rms);
        this.peak = Math.max(this.peak, peak);
        const bins = Array.from({ length: 34 }, (_, index) => {
          const start = Math.floor(index * frequency.length / 34);
          const end = Math.max(start + 1, Math.floor((index + 1) * frequency.length / 34));
          return Math.max(0.025, frequency.slice(start, end).reduce((sum, value) => sum + value, 0) / (end - start) / 255);
        });
        onFrame(bins, { rms, peak });
        this.animationFrame = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      this.release();
      throw error;
    }
  }

  stop(): Promise<AudioCaptureResult> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") return reject(new Error("진행 중인 녹음이 없습니다."));
      const recorder = this.recorder;
      recorder.onstop = () => {
        const average = this.rmsSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, this.rmsSamples.length);
        const normalized = Math.min(1, average * 4.2);
        const result = { blob: new Blob(this.chunks, { type: recorder.mimeType }), durationMs: performance.now() - this.startedAt,
          features: { rms: normalized, peak: Math.min(1, this.peak), energy: Math.min(1, normalized * .8 + this.peak * .2), capturedAt: new Date().toISOString() } };
        this.release(); resolve(result);
      };
      recorder.stop();
    });
  }

  release(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.stream?.getTracks().forEach((track) => track.stop());
    const context = this.context;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    this.stream = undefined; this.recorder = undefined; this.analyser = undefined; this.context = undefined; this.animationFrame = undefined;
  }
}

export class CameraCapture {
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private requestVersion = 0;

  async attach(video: HTMLVideoElement, onEnded?: () => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라 입력을 지원하지 않습니다.");
    this.release();
    const requestVersion = this.requestVersion;
    const mediaRequest = navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false,
    });
    const stream = await withTimeout(
      mediaRequest,
      20_000,
      "카메라 권한 응답 시간이 초과되었습니다. 브라우저 권한 창을 확인한 뒤 다시 연결해 주세요.",
      (lateStream) => lateStream.getTracks().forEach((track) => track.stop()),
    );
    if (requestVersion !== this.requestVersion) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException("카메라 연결 요청이 취소되었습니다.", "AbortError");
    }

    this.stream = stream;
    this.video = video;
    video.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    track?.addEventListener("ended", () => {
      if (this.stream !== stream) return;
      this.stream = undefined;
      if (video.srcObject === stream) video.srcObject = null;
      onEnded?.();
    }, { once: true });

    try {
      await new Promise<void>((resolve, reject) => {
        let timeoutId = 0;
        const ready = () => { cleanup(); resolve(); };
        const error = () => { cleanup(); reject(new Error("카메라 영상을 불러오지 못했습니다.")); };
        const cleanup = () => {
          window.clearTimeout(timeoutId);
          video.removeEventListener("canplay", ready);
          video.removeEventListener("error", error);
        };
        video.addEventListener("canplay", ready, { once: true });
        video.addEventListener("error", error, { once: true });
        timeoutId = window.setTimeout(() => {
          cleanup();
          reject(new Error("카메라 프레임 준비 시간이 초과되었습니다. 다시 연결해 주세요."));
        }, 8_000);
        void video.play().catch((playError: DOMException) => {
          if (playError.name !== "AbortError") error();
        });
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
      });
    } catch (error) {
      this.release();
      throw error;
    }
  }

  isReady(video?: HTMLVideoElement): boolean {
    const target = video ?? this.video;
    return Boolean(
      this.stream
      && target
      && target.srcObject === this.stream
      && target.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && this.stream.getVideoTracks().some((track) => track.readyState === "live"),
    );
  }

  async record(video: HTMLVideoElement, durationMs = 5000, onProgress?: (progress: number) => void): Promise<CameraCaptureResult> {
    if (!this.stream || !video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error("카메라 프레임이 아직 준비되지 않았습니다.");
    }
    if (typeof MediaRecorder === "undefined") throw new Error("이 브라우저는 카메라 녹화를 지원하지 않습니다.");
    if (!this.stream.getVideoTracks().some((track) => track.readyState === "live")) {
      throw new Error("카메라 연결이 중단되었습니다. 권한과 장치 연결을 확인해 주세요.");
    }
    if (video.paused) await video.play();

    const videoStream = new MediaStream(this.stream.getVideoTracks());
    const mimeType = supportedRecorderMimeType([
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ]);
    const recorder = mimeType
      ? new MediaRecorder(videoStream, { mimeType })
      : new MediaRecorder(videoStream);
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.start(100);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    await new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - startedAt;
        onProgress?.(Math.min(1, elapsed / durationMs));
        if (elapsed < durationMs) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.stop();
    await stopped;
    context?.drawImage(video, 0, 0);
    return {
      blob: new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }),
      durationMs: performance.now() - startedAt,
      dataUrl: canvas.toDataURL("image/jpeg", .88),
    };
  }

  release(): void {
    this.requestVersion += 1;
    const stream = this.stream;
    const video = this.video;
    stream?.getTracks().forEach((track) => track.stop());
    if (video && video.srcObject === stream) video.srcObject = null;
    this.stream = undefined;
    this.video = undefined;
  }
}

function supportedRecorderMimeType(candidates: string[]): string | undefined {
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onLateResolve?: (value: T) => void,
): Promise<T> {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (timedOut && onLateResolve) void promise.then(onLateResolve).catch(() => undefined);
  }
}
