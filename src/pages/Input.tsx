import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Waveform } from "../components/Waveform";
import { emotionEffectGuides, emotionMeta, emotionOrder, imageAssets } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { AudioCapture, CameraCapture } from "../services/media";
import { inferEmotionFromText } from "../services/prompt-builder";
import { syncCaptureToFirebase } from "../services/firebase";
import { saveCapture } from "../services/repository";
import { analyzeVisionFrame } from "../services/vision";
import { applyAnalyzedEmotion, audioPeak, audioRms, behaviorCapture, characters, coreEffectImage, emotion, expressionEmotion, frameDelayMs, frameImages, motionBrief, motionIntensity, notify, selectCharacter, selectedCharacter, setEmotion, sourceTranscript, startNewEmoticonProject, transcript, visionMetrics } from "../store";
import type { Emotion, VisionMetrics } from "../types";

const ai = getAIProvider();
const FRAME_COUNT = 5;

export function InputPage() {
  const videoRef = useRef<HTMLVideoElement>(null); const camera = useRef(new CameraCapture()); const audio = useRef(new AudioCapture()); const idleTimer = useRef<number>();
  const [cameraReady, setCameraReady] = useState(false); const [snapshot, setSnapshot] = useState<string>(); const [captureProgress, setCaptureProgress] = useState(0); const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false); const [levels, setLevels] = useState<number[]>([]); const [recorded, setRecorded] = useState<Blob>(); const [analyzing, setAnalyzing] = useState(false); const [generationStep, setGenerationStep] = useState("Ready for Generation"); const [characterMenu, setCharacterMenu] = useState(false);
  useEffect(() => () => { window.clearTimeout(idleTimer.current); camera.current.release(); audio.current.release(); }, []);

  const returnToPreview = (message?: string) => { window.clearTimeout(idleTimer.current); camera.current.release(); setCameraReady(false); setCapturing(false); setCaptureProgress(0); if (message) notify(message); };
  const turnCameraOn = async () => { if (!capturing) await capturePose(true); };
  const capturePose = async (autoStartCamera = false) => {
    if (!videoRef.current || capturing || (!cameraReady && !autoStartCamera)) return;
    window.clearTimeout(idleTimer.current); setSnapshot(undefined); setCapturing(true); setAnalyzing(true); setCaptureProgress(0);
    try {
      if (autoStartCamera) { await camera.current.attach(videoRef.current); setCameraReady(true); }
      const result = await camera.current.record(videoRef.current, 5000, setCaptureProgress); setSnapshot(result.dataUrl); camera.current.release(); setCameraReady(false);
      try { visionMetrics.value = await analyzeVisionFrame(result.frame); } catch { try { result.frame.close(); } catch { /* detached */ } visionMetrics.value = { source: "mock", pose: { shoulderTilt: .08, armSpread: .72 }, gesture: "Open_Palm" }; }
      behaviorCapture.value = { ...behaviorCapture.value, id: `capture-${Date.now()}`, videoBlob: result.blob, poseSummary: describePose(visionMetrics.value), gesture: visionMetrics.value.gesture ?? "Open_Palm", createdAt: new Date().toISOString() };
      await saveCapture(behaviorCapture.value); void syncCaptureToFirebase(behaviorCapture.value).catch(() => undefined); notify(`${describePose(visionMetrics.value)}로 분석했어요.`);
    } catch (error) { returnToPreview(); notify(error instanceof Error ? error.message : "자세 촬영에 실패했습니다."); } finally { setCapturing(false); setAnalyzing(false); setCaptureProgress(0); }
  };

  const toggleRecording = async () => {
    try {
      if (!recording) { await audio.current.start((nextLevels, features) => { setLevels(nextLevels); audioRms.value = Math.min(1, features.rms * 4.2); audioPeak.value = features.peak; }); setRecording(true); }
      else {
        const result = await audio.current.stop(); setRecorded(result.blob); setRecording(false); setAnalyzing(true); audioRms.value = result.features.rms; audioPeak.value = result.features.peak;
        const resultText = await ai.transcribe(result.blob); sourceTranscript.value = resultText.sourceText; transcript.value = resultText.shortText;
        const nextEmotion = inferEmotionFromText(resultText.sourceText, result.features);
        applyAnalyzedEmotion(nextEmotion); transcript.value = resultText.shortText;
        const emotionScores = Object.fromEntries(emotionOrder.map((item) => [item, item === nextEmotion ? .88 : .015])) as Record<Emotion, number>;
        behaviorCapture.value = { ...behaviorCapture.value, id: `capture-${Date.now()}`, audioBlob: result.blob, sourceText: resultText.sourceText, shortText: resultText.shortText, audio: result.features, emotionScores, createdAt: new Date().toISOString() };
        await saveCapture(behaviorCapture.value); void syncCaptureToFirebase(behaviorCapture.value).catch(() => undefined); notify(`${emotionMeta[nextEmotion].label} 감정과 "${resultText.shortText}" 문구를 적용했어요.`);
      }
    } catch (error) { setRecording(false); notify(error instanceof Error ? error.message : "녹음을 시작할 수 없습니다."); } finally { setAnalyzing(false); }
  };

  const proceed = async () => {
    setAnalyzing(true);
    try {
      setGenerationStep("입력 데이터 저장 중");
      behaviorCapture.value = { ...behaviorCapture.value, emotionScores: Object.fromEntries(emotionOrder.map((item) => [item, item === expressionEmotion.value ? .88 : .015])) as Record<Emotion, number> };
      await saveCapture(behaviorCapture.value);
      setGenerationStep("캐릭터 행동 프레임 5장 생성 중");
      startNewEmoticonProject();
      const frames = await ai.generateCharacterFrames(motionBrief.value, selectedCharacter.value);
      setGenerationStep("편집 캔버스 준비 중");
      frameImages.value = frames.slice(0, FRAME_COUNT);
      coreEffectImage.value = null;
      navigate("/edit");
    }
    finally { setAnalyzing(false); setGenerationStep("Ready for Generation"); }
  };

  const intensityTier = motionIntensity.value < .45 ? "낮음" : motionIntensity.value < .72 ? "중간" : "높음";
  const poseSummary = describePose(visionMetrics.value);
  const faceSummary = describeFaceUse(expressionEmotion.value);
  const voiceSummary = describeVoiceUse(sourceTranscript.value, transcript.value, audioRms.value);
  const effectGuide = emotionEffectGuides[emotion.value];

  return (
    <div class="workspace-page input-page">
        <div class="input-composer">
          <Panel title="✦ 포즈" class="pose-capture-panel">
            <div class="pose-media-frame">{snapshot ? <img src={snapshot} alt="촬영한 자세" /> : null}<video ref={videoRef} muted playsInline class={cameraReady && !snapshot ? "visible" : ""} />{!cameraReady && !snapshot ? <img src={imageAssets.pose} alt="팔을 펼친 자세 입력 예시" /> : null}<span class="camera-status"><i class={cameraReady ? "on" : ""} />{capturing ? `${Math.ceil((1 - captureProgress) * 5)}초 촬영 중` : cameraReady ? "CAMERA READY" : "PREVIEW"}</span></div>
            <div class="pose-meta"><span>1920×1080</span><span>{snapshot ? "Captured now" : "Preview"}</span></div>
            <div class="pose-playback"><button class="round-tool" type="button" onClick={cameraReady ? () => capturePose() : turnCameraOn} disabled={capturing} aria-label="5초 자세 촬영"><Icon name={capturing ? "pause" : "camera"} /></button><div class="compact-wave"><Waveform levels={capturing && levels.length ? levels : undefined} active={capturing} /></div><span>00:04　/　00:08</span></div>
            <div class="pose-intensity"><span>행동 강도 · 음성 크기 기반</span><div>{["낮음", "중간", "높음"].map((item) => <button type="button" class={item === intensityTier ? "active" : ""} disabled>{item}</button>)}</div></div>
            <div class="pose-capture-actions"><button type="button" onClick={turnCameraOn} disabled={capturing}><Icon name="camera" />{capturing ? "촬영 중" : snapshot ? "다시 촬영하기" : "5초 촬영하기"}</button></div>
          </Panel>

          <div class="input-right-column">
            <div class="input-top-cards">
              <Panel title="✦ 음성" class="voice-source-panel">
                <button class={`audio-source-card ${recording ? "recording" : ""}`} type="button" onClick={toggleRecording}><span><Icon name={recording ? "pause" : "voice"} /></span><div><strong>{recording ? "녹음 중" : "오디오 소스 01"}</strong><small>{recorded ? "WAV · 분석 준비 완료" : "WAV · 48kHz · 음성을 입력해주세요"}</small></div></button>
                <div class="voice-playback"><button class="round-tool" type="button" onClick={toggleRecording} aria-label={recording ? "녹음 중지" : "녹음 시작"}><Icon name={recording ? "pause" : "play"} /></button><div class="compact-wave"><Waveform levels={recording && levels.length ? levels : undefined} active={recording} /></div><span>FFT　/　LIVE</span></div>
                <div class="voice-actions"><button type="button" onClick={() => notify("음성의 톤은 감정 분석 결과와 함께 조정됩니다.")}>톤 조정</button><button type="button" onClick={toggleRecording}>{recording ? "녹음 중지" : "다시 녹음하기"}</button></div>
                <label class="keyword-input"><span>EMOTICON KEYWORD</span><input value={transcript.value} onInput={(event) => (transcript.value = event.currentTarget.value)} aria-label="이모티콘 문장" /></label>
              </Panel>

              <Panel title="✦ 캐릭터" class="selected-character-panel">
                <button class="selected-character-summary" type="button" onClick={() => setCharacterMenu(!characterMenu)}><span class="selected-character-image"><img src={selectedCharacter.value.sourceAsset} alt="선택한 캐릭터" /></span><span><strong><i style={{ background: emotionMeta[emotion.value].color }} />{selectedCharacter.value.name}</strong><small>#귀여운　#파스텔　#친근한</small></span></button>
                <button class="select-character-button" type="button" onClick={() => setCharacterMenu(!characterMenu)}>캐릭터 선택하기</button>
                {characterMenu ? <div class="character-popover">{characters.value.map((token) => <button type="button" class={token.id === selectedCharacter.value.id ? "active" : ""} onClick={() => { selectCharacter(token.id); setCharacterMenu(false); }}><img src={token.sourceAsset} alt="" /><span>{token.name}<small>{token.stylePreset}</small></span></button>)}</div> : null}
              </Panel>
            </div>

            <Panel title="✦ 움직이는 이모티콘 설정" class="motion-settings-panel">
              <div class="motion-slider-row"><div class="fixed-frame-card"><span>총 프레임</span><b>{FRAME_COUNT} frames 고정</b></div><label><span>프레임당 속도 <b>{frameDelayMs.value}ms / frame</b></span><input type="range" min="70" max="220" step="10" value={frameDelayMs.value} onInput={(event) => (frameDelayMs.value = Number(event.currentTarget.value))} /></label></div>
              <div class="motion-option-row"><button type="button"><span>반복 재생</span><i class="toggle on" /></button><button type="button"><span>움직임 스타일</span><b>부드럽게⌄</b></button></div>
              <div class="emotion-setting-row"><span>감정 분석 · 9가지</span><div class="emotion-selector">{emotionOrder.map((item) => <button type="button" class={emotion.value === item ? "active" : ""} onClick={() => setEmotion(item)}><i style={{ background: emotionMeta[item].color }} />{emotionMeta[item].label}</button>)}</div></div>
              <div class="motion-background-row"><span>배경 / 핵심 효과</span><strong>{emotionMeta[emotion.value].effect}</strong><div><i /><i /><i style={{ background: emotionMeta[emotion.value].color }} /><button type="button" aria-label="직접 색상 선택"><Icon name="add" size={12} /></button></div></div>
              <div class="analysis-readout-grid" aria-label="입력 분석 결과">
                <article><span>행동</span><strong>{poseSummary}</strong><p>{motionBrief.value.pose} · 움직임 강도 {Math.round(motionIntensity.value * 100)}%</p></article>
                <article><span>표정</span><strong>{faceSummary}</strong><p>현재 캐릭터 프레임 표정과 모션 프롬프트에 감정 키로 반영됩니다.</p></article>
                <article><span>목소리</span><strong>{voiceSummary}</strong><p>전사 문장은 텍스트 레이어, 음량은 모션 강도와 프레임 리듬에 사용됩니다.</p></article>
                <article><span>배경 효과</span><strong>{effectGuide.background}</strong><p>{effectGuide.accent} · {effectGuide.motion}</p></article>
              </div>
              <div class="motion-analysis-summary"><span>{visionMetrics.value.gesture === "Raised_Hand" ? "손을 든 자세" : "양팔을 펼친 자세"}</span><span>{intensityTier} · {Math.round(motionIntensity.value * 100)}%</span><span>{emotionMeta[emotion.value].label} · 88%</span><span>프레임 {FRAME_COUNT}</span><span>{frameDelayMs.value}ms/frame</span></div>
              <div class="privacy-note"><Icon name="lock" /><p><strong>입력 제어권은 사용자에게</strong><span>카메라·마이크는 실행 중에만 사용되며 원본과 분석값을 분리 저장합니다.</span></p></div>
            </Panel>

            <div class="input-ready-row"><span class={`generation-status ${analyzing ? "active" : ""}`}><Icon name={analyzing ? "reload" : "check"} class={analyzing ? "spin" : ""} />{analyzing ? generationStep : "Ready for Generation"}</span><button type="button" onClick={proceed} disabled={recording || capturing || analyzing}>{analyzing ? "프레임 만드는 중" : "이모티콘 생성하기"}</button></div>
          </div>
        </div>
    </div>
  );
}

function describePose(metrics: VisionMetrics): string {
  if (metrics.gesture === "Raised_Hand") return "손을 든 인사 행동";
  if ((metrics.pose?.armSpread ?? 0) > .62) return "양팔을 펼친 행동";
  if ((metrics.pose?.shoulderTilt ?? 0) > .12) return "상체가 기운 행동";
  return "상체 중심의 자연스러운 행동";
}

function describeFaceUse(current: Emotion): string {
  const meta = emotionMeta[current];
  return `${meta.label} 표정 키`;
}

function describeVoiceUse(source: string, shortText: string, rms: number): string {
  const text = shortText.trim() || source.trim();
  const level = rms < .22 ? "낮은 음량" : rms < .58 ? "중간 음량" : "큰 음량";
  return text ? `${level} · "${text}"` : `${level} · 음성 대기`;
}
