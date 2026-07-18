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
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    this.recorder = new MediaRecorder(this.stream, { mimeType });
    this.chunks = []; this.rmsSamples = []; this.peak = 0;
    this.recorder.ondataavailable = (event) => event.data.size && this.chunks.push(event.data);
    this.recorder.start(120); this.startedAt = performance.now();
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256; this.analyser.smoothingTimeConstant = 0.66; source.connect(this.analyser);
    const frequency = new Uint8Array(this.analyser.frequencyBinCount);
    const time = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(frequency); this.analyser.getByteTimeDomainData(time);
      const rms = Math.sqrt(time.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / time.length);
      const peak = Math.max(...time.map((value) => Math.abs((value - 128) / 128)));
      this.rmsSamples.push(rms); this.peak = Math.max(this.peak, peak);
      const bins = Array.from({ length: 34 }, (_, index) => {
        const start = Math.floor(index * frequency.length / 34);
        const end = Math.max(start + 1, Math.floor((index + 1) * frequency.length / 34));
        return Math.max(0.025, frequency.slice(start, end).reduce((sum, value) => sum + value, 0) / (end - start) / 255);
      });
      onFrame(bins, { rms, peak }); this.animationFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): Promise<AudioCaptureResult> {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error("진행 중인 녹음이 없습니다."));
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

  async attach(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라 입력을 지원하지 않습니다.");
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = this.stream;
    await new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const error = () => { cleanup(); reject(new Error("카메라 영상을 불러오지 못했습니다.")); };
      const cleanup = () => { video.removeEventListener("canplay", ready); video.removeEventListener("error", error); };
      video.addEventListener("canplay", ready, { once: true });
      video.addEventListener("error", error, { once: true });
      void video.play().catch((playError: DOMException) => {
        if (playError.name !== "AbortError") error();
      });
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready();
    });
  }

  async record(video: HTMLVideoElement, durationMs = 5000, onProgress?: (progress: number) => void): Promise<CameraCaptureResult> {
    if (!this.stream || !video.videoWidth) throw new Error("카메라 프레임이 아직 준비되지 않았습니다.");
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(this.stream, { mimeType }); const chunks: Blob[] = []; const startedAt = performance.now();
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data); recorder.start(100);
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
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
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); }); recorder.stop(); await stopped;
    context?.drawImage(video, 0, 0);
    return { blob: new Blob(chunks, { type: mimeType }), durationMs: performance.now() - startedAt, dataUrl: canvas.toDataURL("image/jpeg", .88) };
  }

  release(): void { this.stream?.getTracks().forEach((track) => track.stop()); this.stream = undefined; }
}
