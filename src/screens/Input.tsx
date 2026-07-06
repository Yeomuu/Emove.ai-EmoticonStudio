import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Waveform } from "../components/Waveform";
import { emotionEffectGuides, emotionMeta, emotionOrder, imageAssets } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { AudioCapture, CameraCapture } from "../services/media";
import { inferEmotionFromText } from "../services/prompt-builder";
import { syncCaptureToRemote } from "../services/remote-store";
import { saveCapture } from "../services/repository";
import { createLiveVisionAnalyzer } from "../services/vision";
import { audioPeak, audioRms, behaviorCapture, characters, coreEffectImage, effectColor, emotion, expressionEmotion, frameDelayMs, frameImages, motionBrief, motionIntensity, motionStyle, notify, selectCharacter, selectedCharacter, setEmotion, sourceTranscript, startNewEmoticonProject, transcript, visionMetrics } from "../store";
import type { AudioFeatures, BehaviorCapture, Emotion, MotionStyle, VisionMetrics } from "../types";

const ai = getAIProvider();
const FRAME_COUNT = 5;
const CAPTURE_DURATION_MS = 5000;
type ProcessState = { title: string; label: string; percent: number };
const motionStyleOptions: Array<{ id: MotionStyle; label: string; delay: number; copy: string }> = [
  { id: "smooth", label: "부드럽게", delay: 140, copy: "완만한 연결" },
  { id: "dynamic", label: "역동적", delay: 90, copy: "빠른 반응" },
  { id: "bouncy", label: "통통 튀게", delay: 110, copy: "탄성 있는 루프" },
  { id: "subtle", label: "은은하게", delay: 170, copy: "작은 움직임" },
];

export function InputPage() {
  const videoRef = useRef<HTMLVideoElement>(null); const camera = useRef(new CameraCapture()); const audio = useRef(new AudioCapture()); const idleTimer = useRef<number | undefined>(undefined);
  const [cameraReady, setCameraReady] = useState(false); const [captureProgress, setCaptureProgress] = useState(0); const [capturing, setCapturing] = useState(false); const [lastCaptureLabel, setLastCaptureLabel] = useState("Preview");
  const [recording, setRecording] = useState(false); const [voiceProgress, setVoiceProgress] = useState(0); const [levels, setLevels] = useState<number[]>([]); const [recorded, setRecorded] = useState<Blob>(); const [analyzing, setAnalyzing] = useState(false); const [generationStep, setGenerationStep] = useState("Ready for Generation"); const [characterMenu, setCharacterMenu] = useState(false); const [process, setProcess] = useState<ProcessState | null>(null);
  useEffect(() => () => { window.clearTimeout(idleTimer.current); camera.current.release(); audio.current.release(); }, []);

  const returnToPreview = (message?: string) => { window.clearTimeout(idleTimer.current); camera.current.release(); setCameraReady(false); setCapturing(false); setRecording(false); setCaptureProgress(0); setVoiceProgress(0); if (message) notify(message); };
  const turnCameraOn = async () => { if (!capturing) await capturePose(true); };
  const capturePose = async (autoStartCamera = false) => {
    if (!videoRef.current || capturing || (!cameraReady && !autoStartCamera)) return;
    window.clearTimeout(idleTimer.current); setCapturing(true); setRecording(true); setAnalyzing(true); setCaptureProgress(0); setVoiceProgress(0); setLevels([]); setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "카메라와 마이크 입력을 준비하는 중...", percent: 6 });
    try {
      if (autoStartCamera) { await camera.current.attach(videoRef.current); setCameraReady(true); }
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "MediaPipe 포즈/표정 분석기를 여는 중...", percent: 16 });
      setGenerationStep("영상 분석 모델 준비 중");
      const liveVision = await createLiveVisionAnalyzer();
      await startAudioMeter();
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "5초 입력을 수집하는 중...", percent: 26 });
      setGenerationStep("카메라+음성 5초 입력 분석 중");
      const visionTask = liveVision.analyze(videoRef.current, CAPTURE_DURATION_MS);
      const result = await camera.current.record(videoRef.current, CAPTURE_DURATION_MS, (progress) => { setCaptureProgress(progress); setVoiceProgress(progress); setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "포즈와 목소리 입력을 동기화하는 중...", percent: Math.min(58, Math.round(26 + progress * 32)) }); });
      const voice = await stopAudioCapture();
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "사람의 포즈와 표정을 판독하는 중...", percent: 64 });
      let metrics: VisionMetrics;
      try { metrics = await visionTask; }
      catch (error) { metrics = { source: "unavailable", gesture: "Analyzer_Error", diagnostics: error instanceof Error ? error.message : String(error) }; }
      setRecorded(voice.blob);
      camera.current.release(); setCameraReady(false); setLastCaptureLabel("5초 입력 분석 완료");
      visionMetrics.value = metrics;
      if (metrics.source !== "mediapipe") {
        behaviorCapture.value = {
          ...behaviorCapture.value,
          id: `capture-${Date.now()}`,
          videoBlob: result.blob,
          audioBlob: voice.blob,
          poseSummary: describePose(metrics),
          gesture: metrics.gesture ?? "Not_Detected",
          expression: metrics.face?.expression ?? "unknown",
          emotionScores: Object.fromEntries(emotionOrder.map((item) => [item, item === "unknown" ? 1 : 0])) as Record<Emotion, number>,
          sourceText: "",
          shortText: "",
          audio: voice.features,
          createdAt: new Date().toISOString(),
        };
        setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "포즈 분석 실패를 정리하는 중...", percent: 100 });
        notify(`${metrics.diagnostics ?? "카메라에서 사람의 자세 랜드마크를 찾지 못했습니다."} 상반신과 양손이 화면 안에 들어오도록 다시 촬영해 주세요. OpenAI 전사는 실행하지 않았습니다.`);
        return;
      }
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "목소리를 전사하고 감정 키를 정리하는 중...", percent: 78 });
      await applyVoiceAndVision(result.blob, voice.blob, voice.features, metrics);
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "분석 결과 저장 완료", percent: 100 });
    } catch (error) { setProcess(null); returnToPreview(); notify(error instanceof Error ? error.message : "자세 촬영에 실패했습니다."); } finally { setCapturing(false); setRecording(false); setAnalyzing(false); setCaptureProgress(0); setVoiceProgress(0); window.setTimeout(() => setProcess(null), 420); }
  };

  const recordVoiceOnly = async () => {
    if (recording || capturing) return;
    setRecording(true); setAnalyzing(true); setVoiceProgress(0); setLevels([]); setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "마이크 입력을 준비하는 중...", percent: 8 });
    try {
      await startAudioMeter();
      await waitWithProgress(CAPTURE_DURATION_MS, (progress) => { setVoiceProgress(progress); setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "5초 음성 입력을 수집하는 중...", percent: Math.min(52, Math.round(12 + progress * 40)) }); });
      const result = await stopAudioCapture();
      setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "목소리를 전사하고 감정 키를 추출하는 중...", percent: 72 });
      setRecorded(result.blob);
      await applyVoiceAndVision(behaviorCapture.value.videoBlob, result.blob, result.features, visionMetrics.value);
      setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "목소리 분석 결과 저장 완료", percent: 100 });
    } catch (error) { setProcess(null); audio.current.release(); notify(error instanceof Error ? error.message : "5초 음성 입력에 실패했습니다."); } finally { setRecording(false); setAnalyzing(false); setVoiceProgress(0); window.setTimeout(() => setProcess(null), 420); }
  };

  const proceed = async () => {
    setAnalyzing(true); setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "입력 데이터 조건을 확인하는 중...", percent: 6 });
    try {
      if (!selectedCharacter.value.sourceAsset) { notify("먼저 Character에서 새 캐릭터를 생성해 주세요."); return; }
      if (!behaviorCapture.value.videoBlob || visionMetrics.value.source !== "mediapipe") { notify("카메라 5초 입력에서 행동이 분석되지 않았습니다. 다시 촬영해 주세요."); return; }
      if (!behaviorCapture.value.audioBlob || !sourceTranscript.value.trim()) { notify("5초 음성 입력과 전사가 완료되어야 이모티콘을 생성할 수 있습니다."); return; }
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "분석 결과를 저장하는 중...", percent: 18 });
      setGenerationStep("입력 데이터 저장 중");
      behaviorCapture.value = { ...behaviorCapture.value, emotionScores: Object.fromEntries(emotionOrder.map((item) => [item, item === emotion.value ? .88 : .015])) as Record<Emotion, number> };
      const persistence = await saveCaptureRemoteFirst(behaviorCapture.value);
      if (!persistence.synced) notify(persistence.message);
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "5프레임 프로젝트를 초기화하는 중...", percent: 32 });
      setGenerationStep("캐릭터 행동 프레임 5장 생성 중");
      startNewEmoticonProject();
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "캐릭터 행동 프레임 5장을 생성하는 중...", percent: 46 });
      const frames = await ai.generateCharacterFrames(motionBrief.value, selectedCharacter.value);
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "편집 화면에서 사용할 프레임을 정렬하는 중...", percent: 88 });
      setGenerationStep("편집 캔버스 준비 중");
      frameImages.value = frames.slice(0, FRAME_COUNT);
      coreEffectImage.value = null;
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "이모티콘 생성 완료", percent: 100 });
      navigate("/edit");
    }
    catch (error) { setProcess(null); notify(error instanceof Error ? error.message : "이모티콘 생성에 실패했습니다."); }
    finally { setAnalyzing(false); setGenerationStep("Ready for Generation"); window.setTimeout(() => setProcess(null), 420); }
  };

  const startAudioMeter = async () => {
    await audio.current.start((nextLevels, features) => { setLevels(nextLevels); audioRms.value = Math.min(1, features.rms * 4.2); audioPeak.value = features.peak; });
  };

  const stopAudioCapture = async () => {
    const result = await audio.current.stop();
    audioRms.value = result.features.rms;
    audioPeak.value = result.features.peak;
    return result;
  };

  const applyVoiceAndVision = async (videoBlob: Blob | undefined, audioBlob: Blob, audio: AudioFeatures, metrics: VisionMetrics) => {
    const resultText = await ai.transcribe(audioBlob);
    sourceTranscript.value = resultText.sourceText;
    transcript.value = resultText.shortText;
    const nextEmotion = resultText.sourceText.trim() ? inferEmotionFromText(resultText.sourceText, audio) : "unknown";
    expressionEmotion.value = metrics.face?.expression ?? "unknown";
    setEmotion(nextEmotion);
    const emotionScores = Object.fromEntries(emotionOrder.map((item) => [item, item === nextEmotion ? .88 : .015])) as Record<Emotion, number>;
    behaviorCapture.value = { ...behaviorCapture.value, id: `capture-${Date.now()}`, videoBlob, audioBlob, poseSummary: describePose(metrics), gesture: metrics.gesture ?? "Not_Detected", expression: metrics.face?.expression ?? "unknown", sourceText: resultText.sourceText, shortText: resultText.shortText, audio, emotionScores, createdAt: new Date().toISOString() };
    const persistence = await saveCaptureRemoteFirst(behaviorCapture.value);
    notify(metrics.source === "mediapipe"
      ? `${describePose(metrics)}, ${describeFaceUse(expressionEmotion.value, metrics)}, "${resultText.shortText || resultText.sourceText}" 입력을 분석했어요. ${persistence.synced ? "원격 DB에 저장했습니다." : persistence.message}`
      : "카메라에서 행동을 인식하지 못했습니다. 다시 촬영해 주세요.");
  };

  const chooseMotionStyle = (next: MotionStyle) => {
    const option = motionStyleOptions.find((item) => item.id === next);
    motionStyle.value = next;
    if (option) frameDelayMs.value = option.delay;
  };

  const intensityTier = motionIntensity.value < .45 ? "낮음" : motionIntensity.value < .72 ? "중간" : "높음";
  const poseSummary = describePose(visionMetrics.value);
  const faceSummary = describeFaceUse(expressionEmotion.value, visionMetrics.value);
  const voiceSummary = describeVoiceUse(sourceTranscript.value, transcript.value, audioRms.value);
  const effectGuide = emotionEffectGuides[emotion.value];
  const selectedMotionStyle = motionStyleOptions.find((item) => item.id === motionStyle.value) ?? motionStyleOptions[0];

  return (
    <div className="workspace-page input-page">
        <header className="screen-brief input-brief">
          <span>02</span>
          <h1>캐릭터 생성에 필요한 목소리와 포즈를 촬영해 주세요.</h1>
          <p>입력 단계</p>
        </header>
        <div className="input-composer">
          <Panel title="✦ 포즈" className="pose-capture-panel">
            <div className="pose-media-frame"><video ref={videoRef} muted playsInline className={cameraReady ? "visible" : ""} />{!cameraReady ? <img src={imageAssets.pose} alt="팔을 펼친 자세 입력 예시" /> : null}<span className="camera-status"><i className={cameraReady ? "on" : ""} />{capturing ? `${Math.ceil((1 - captureProgress) * 5)}초 입력 중` : "CAMERA CLOSED"}</span></div>
            <div className="pose-meta"><span>Camera + Voice · 5s</span><span>{lastCaptureLabel}</span></div>
            <div className="pose-playback"><button className="round-tool" type="button" onClick={cameraReady ? () => capturePose() : turnCameraOn} disabled={capturing} aria-label="5초 자세 촬영"><Icon name={capturing ? "pause" : "camera"} /></button><div className="compact-wave"><Waveform levels={capturing && levels.length ? levels : undefined} active={capturing} /></div><span>{capturing ? `${Math.ceil((1 - captureProgress) * 5)}초` : "5초 입력"}</span></div>
            <div className="pose-intensity"><span>행동 강도 · 음성 크기 기반</span><div>{["낮음", "중간", "높음"].map((item) => <button key={item} type="button" className={item === intensityTier ? "active" : ""} disabled>{item}</button>)}</div></div>
            <div className="pose-capture-actions"><button type="button" onClick={turnCameraOn} disabled={capturing || recording}><Icon name="camera" />{capturing ? "입력 중" : "카메라+음성 5초 입력"}</button></div>
          </Panel>

          <div className="input-right-column">
            <div className="input-top-cards">
              <Panel title="✦ 음성" className="voice-source-panel">
                <button className={`audio-source-card ${recording ? "recording" : ""}`} type="button" onClick={recordVoiceOnly} disabled={capturing || recording}><span><Icon name={recording ? "pause" : "voice"} /></span><div><strong>{recording ? "5초 녹음 중" : "음성 다시 입력"}</strong><small>{recorded ? "WAV · 전사 완료" : "5초 동안 말하면 문구와 키워드를 요약합니다"}</small></div></button>
                <div className="voice-playback"><button className="round-tool" type="button" onClick={recordVoiceOnly} disabled={capturing || recording} aria-label="5초 음성 녹음"><Icon name={recording ? "pause" : "play"} /></button><div className="compact-wave"><Waveform levels={recording && levels.length ? levels : undefined} active={recording} /></div><span>{recording ? `${Math.ceil((1 - voiceProgress) * 5)}초` : "5초 입력"}</span></div>
                <div className="voice-actions"><button type="button" onClick={() => notify("음성 전사 문구는 텍스트 레이어, 음량은 모션 강도에 사용됩니다.")}>사용 방식</button><button type="button" onClick={recordVoiceOnly} disabled={capturing || recording}>{recording ? "녹음 중" : "5초 다시 녹음"}</button></div>
                <label className="keyword-input"><span>EMOTICON KEYWORD</span><input value={transcript.value} onChange={(event) => (transcript.value = event.currentTarget.value)} aria-label="이모티콘 문장" /></label>
              </Panel>

              <Panel title="✦ 캐릭터" className="selected-character-panel">
                <button className="selected-character-summary" type="button" onClick={() => setCharacterMenu(!characterMenu)}><span className="selected-character-image">{selectedCharacter.value.sourceAsset ? <img src={selectedCharacter.value.sourceAsset} alt="선택한 캐릭터" /> : <Icon name="image" size={32} />}</span><span><strong><i style={{ background: emotionMeta[emotion.value].color }} />{selectedCharacter.value.sourceAsset ? selectedCharacter.value.name : "캐릭터 필요"}</strong><small>{selectedCharacter.value.sourceAsset ? selectedCharacter.value.isDefault ? "#기본세트　#캐릭터토큰" : "#사용자생성　#캐릭터토큰" : "Character에서 새 캐릭터를 생성하세요"}</small></span></button>
                <button className="select-character-button" type="button" onClick={() => setCharacterMenu(!characterMenu)}>캐릭터 선택하기</button>
                {characterMenu ? <div className="character-popover">{characters.value.length ? characters.value.map((token) => <button key={token.id} type="button" className={token.id === selectedCharacter.value.id ? "active" : ""} onClick={() => { selectCharacter(token.id); setCharacterMenu(false); }}><img src={token.sourceAsset} alt="" /><span>{token.name}<small>{token.stylePreset}</small></span></button>) : <button type="button" onClick={() => navigate("/character")}><span>저장된 캐릭터 없음<small>새 캐릭터를 먼저 생성하세요</small></span></button>}</div> : null}
              </Panel>
            </div>

            <Panel title="✦ 움직이는 이모티콘 설정" className="motion-settings-panel">
              <div className="motion-slider-row"><div className="fixed-frame-card"><span>총 프레임</span><b>{FRAME_COUNT} frames 고정</b></div><label><span>프레임당 속도 <b>{frameDelayMs.value}ms / frame</b></span><input type="range" min="70" max="220" step="10" value={frameDelayMs.value} onChange={(event) => (frameDelayMs.value = Number(event.currentTarget.value))} /></label></div>
              <div className="motion-option-row"><label className="motion-style-select"><span>움직임 스타일</span><select value={motionStyle.value} onChange={(event) => chooseMotionStyle(event.currentTarget.value as MotionStyle)}>{motionStyleOptions.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.copy}</option>)}</select></label><div className="loop-format-note"><span>GIF loop</span><b>{selectedMotionStyle.label}</b></div></div>
              <div className="emotion-setting-row"><span>감정 분석 · 9가지</span><div className="emotion-selector">{emotionOrder.map((item) => <button key={item} type="button" className={emotion.value === item ? "active" : ""} onClick={() => setEmotion(item)}><i style={{ background: emotionMeta[item].color }} />{emotionMeta[item].label}</button>)}</div></div>
              <div className="motion-background-row"><span>배경 / 핵심 효과</span><strong>{emotionMeta[emotion.value].effect}<small>감정 선택은 배경 효과와 핵심 효과 색에만 반영</small></strong><div><i /><i /><i style={{ background: effectColor.value }} /><label className="effect-color-picker" aria-label="효과 색상 직접 선택" style={{ background: effectColor.value }}><input type="color" value={effectColor.value} onChange={(event) => (effectColor.value = event.currentTarget.value)} /><Icon name="add" size={12} /></label></div></div>
              <div className="analysis-readout-grid" aria-label="입력 분석 결과">
                <article><span>행동</span><strong>{poseSummary}</strong><p>{motionBrief.value.pose} · 움직임 강도 {Math.round(motionIntensity.value * 100)}%</p></article>
                <article><span>표정</span><strong>{faceSummary}</strong><p>현재 캐릭터 프레임 표정과 모션 프롬프트에 감정 키로 반영됩니다.</p></article>
                <article><span>목소리</span><strong>{voiceSummary}</strong><p>전사 문장은 텍스트 레이어, 음량은 모션 강도와 프레임 리듬에 사용됩니다.</p></article>
                <article><span>배경 효과</span><strong>{effectGuide.background}</strong><p>{effectGuide.accent} · {effectGuide.motion}</p></article>
              </div>
              <div className="motion-analysis-summary"><span>{poseSummary}</span><span>{intensityTier} · {Math.round(motionIntensity.value * 100)}%</span><span>{emotionMeta[emotion.value].label} · {visionMetrics.value.source === "mediapipe" ? "분석됨" : "대기"}</span><span>프레임 {FRAME_COUNT}</span><span>{frameDelayMs.value}ms/frame</span></div>
              <div className="privacy-note"><Icon name="lock" /><p><strong>입력 제어권은 사용자에게</strong><span>카메라·마이크는 실행 중에만 사용되며 원본과 분석값을 분리 저장합니다.</span></p></div>
            </Panel>

            <div className="input-ready-row"><span className={`generation-status ${analyzing ? "active" : ""}`}><Icon name={analyzing ? "reload" : "check"} className={analyzing ? "spin" : ""} />{analyzing ? generationStep : "Ready for Generation"}</span><button type="button" onClick={proceed} disabled={recording || capturing || analyzing}>{analyzing ? "프레임 만드는 중" : "이모티콘 생성하기"}</button></div>
          </div>
        </div>
        {process ? <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} /> : null}
    </div>
  );
}

function WorkProcessScreen({ title, label, percent }: ProcessState) {
  return (
    <section className="work-process-screen" role="status" aria-live="polite">
      <div className="work-process-inner">
        <h2>{title}</h2>
        <div className="work-process-meter" aria-label={`진행률 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p><span>{label}</span><strong>{percent}%</strong></p>
      </div>
    </section>
  );
}

function describePose(metrics: VisionMetrics): string {
  if (metrics.source !== "mediapipe") return "행동 미분석";
  if (metrics.gesture === "Raised_Hand") return "손을 든 인사 행동";
  if ((metrics.pose?.armSpread ?? 0) > .62) return "양팔을 펼친 행동";
  if ((metrics.pose?.shoulderTilt ?? 0) > .12) return "상체가 기운 행동";
  return "상체 중심의 자연스러운 행동";
}

function describeFaceUse(current: Emotion, metrics: VisionMetrics): string {
  if (!metrics.face) return "표정 미분석";
  const meta = emotionMeta[metrics.face.expression ?? current];
  return `${meta.label} 표정 · ${Math.round(metrics.face.confidence * 100)}%`;
}

function describeVoiceUse(source: string, shortText: string, rms: number): string {
  const text = shortText.trim() || source.trim();
  const level = rms < .22 ? "낮은 음량" : rms < .58 ? "중간 음량" : "큰 음량";
  return text ? `${level} · "${text}"` : `${level} · 음성 대기`;
}

function waitWithProgress(durationMs: number, onProgress: (progress: number) => void): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      onProgress(progress);
      if (progress >= 1) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

async function saveCaptureRemoteFirst(capture: BehaviorCapture): Promise<{ synced: boolean; message: string }> {
  try {
    const sync = await syncCaptureToRemote(capture);
    await saveCapture(capture);
    return sync.enabled
      ? { synced: true, message: "원격 DB에 입력 분석을 저장했습니다." }
      : { synced: false, message: `${sync.storageWarning ?? "원격 DB 설정이 없습니다."} IndexedDB에만 임시 저장했습니다.` };
  } catch (error) {
    await saveCapture(capture);
    return { synced: false, message: `원격 DB 저장 실패로 IndexedDB에만 임시 저장했습니다: ${error instanceof Error ? error.message : String(error)}` };
  }
}
