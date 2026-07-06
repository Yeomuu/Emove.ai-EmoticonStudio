import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Waveform } from "../components/Waveform";
import { ScrollSlideContainer } from "../components/ScrollSlideContainer";
import { emotionEffectGuides, emotionMeta, emotionOrder, imageAssets } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { AudioCapture, CameraCapture } from "../services/media";
import { inferEmotionFromText } from "../services/prompt-builder";
import { syncCaptureToRemote } from "../services/remote-store";
import { saveCapture } from "../services/repository";
import { createLiveVisionAnalyzer } from "../services/vision";
import { audioPeak, audioRms, behaviorCapture, characters, coreEffectImage, effectColor, emotion, expressionEmotion, frameDelayMs, frameImages, motionBrief, motionIntensity, motionStyle, notify, selectCharacter, selectedCharacter, setEmotion, sourceTranscript, startNewEmoticonProject, transcript, visionMetrics } from "../store";
import type { AudioFeatures, BehaviorCapture, Emotion, ExaggerationTier, MotionStyle, VisionMetrics } from "../types";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useRef(new CameraCapture());
  const audio = useRef(new AudioCapture());
  const idleTimer = useRef<number | undefined>(undefined);

  const [currentStep, setCurrentStep] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [lastCaptureLabel, setLastCaptureLabel] = useState("Preview");
  const [recording, setRecording] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [recorded, setRecorded] = useState<Blob>();
  const [analyzing, setAnalyzing] = useState(false);
  const [generationStep, setGenerationStep] = useState("Ready for Generation");
  const [characterMenu, setCharacterMenu] = useState(false);
  const [process, setProcess] = useState<ProcessState | null>(null);

  const [personDetected, setPersonDetected] = useState(false);
  const [tierOverride, setTierOverride] = useState<ExaggerationTier | null>(null);

  // Always-on camera: start on mount, blur when person not detected
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    camera.current.attach(video).then(() => {
      setCameraReady(true);
    }).catch(() => { /* camera not available */ });
    return () => {
      window.clearTimeout(idleTimer.current);
      camera.current.release();
      audio.current.release();
    };
  }, []);

  const returnToPreview = (message?: string) => {
    window.clearTimeout(idleTimer.current);
    setCapturing(false);
    setRecording(false);
    setCaptureProgress(0);
    setVoiceProgress(0);
    if (message) notify(message);
    setCurrentStep(0);
  };

  const startCaptureFlow = async () => {
    setCurrentStep(1);
    await capturePose();
  };

  const capturePose = async () => {
    if (!videoRef.current || capturing) return;
    window.clearTimeout(idleTimer.current);
    setCapturing(true);
    setRecording(true);
    setAnalyzing(true);
    setCaptureProgress(0);
    setVoiceProgress(0);
    setLevels([]);
    setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "마이크 입력을 준비하는 중...", percent: 6 });
    
    try {
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "MediaPipe 포즈/표정 분석기를 여는 중...", percent: 16 });
      setGenerationStep("영상 분석 모델 준비 중");
      const liveVision = await createLiveVisionAnalyzer();
      await startAudioMeter();
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "5초 입력을 수집하는 중...", percent: 26 });
      setGenerationStep("카메라+음성 5초 입력 분석 중");
      
      const visionTask = liveVision.analyze(videoRef.current, CAPTURE_DURATION_MS);
      const result = await camera.current.record(videoRef.current, CAPTURE_DURATION_MS, (progress) => {
        setCaptureProgress(progress);
        setVoiceProgress(progress);
        setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "포즈와 목소리 입력을 동기화하는 중...", percent: Math.min(58, Math.round(26 + progress * 32)) });
      });
      
      const voice = await stopAudioCapture();
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "사람의 포즈와 표정을 판독하는 중...", percent: 64 });
      
      let metrics: VisionMetrics;
      try {
        metrics = await visionTask;
      } catch (error) {
        metrics = { source: "unavailable", gesture: "Analyzer_Error", diagnostics: error instanceof Error ? error.message : String(error) };
      }
      
      setRecorded(voice.blob);
      setLastCaptureLabel("5초 입력 분석 완료");
      visionMetrics.value = metrics;
      
      if (metrics.source === "mediapipe") {
        setPersonDetected(true);
      }
      
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
        notify(`${metrics.diagnostics ?? "카메라에서 사람의 자세 랜드마크를 찾지 못했습니다."} 상반신과 양손이 화면 안에 들어오도록 다시 촬영해 주세요.`);
        setCurrentStep(2);
        return;
      }
      
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "목소리를 전사하고 감정 키를 정리하는 중...", percent: 78 });
      await applyVoiceAndVision(result.blob, voice.blob, voice.features, metrics);
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "분석 결과 저장 완료", percent: 100 });
      setCurrentStep(2); // Go to results view
    } catch (error) {
      setProcess(null);
      returnToPreview();
      notify(error instanceof Error ? error.message : "자세 촬영에 실패했습니다.");
    } finally {
      setCapturing(false);
      setRecording(false);
      setAnalyzing(false);
      setCaptureProgress(0);
      setVoiceProgress(0);
      window.setTimeout(() => setProcess(null), 420);
    }
  };

  const recordVoiceOnly = async () => {
    if (recording || capturing) return;
    setRecording(true);
    setAnalyzing(true);
    setVoiceProgress(0);
    setLevels([]);
    setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "마이크 입력을 준비하는 중...", percent: 8 });
    
    try {
      await startAudioMeter();
      await waitWithProgress(CAPTURE_DURATION_MS, (progress) => {
        setVoiceProgress(progress);
        setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "5초 음성 입력을 수집하는 중...", percent: Math.min(52, Math.round(12 + progress * 40)) });
      });
      const result = await stopAudioCapture();
      setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "목소리를 전사하고 감정 키를 추출하는 중...", percent: 72 });
      setRecorded(result.blob);
      await applyVoiceAndVision(behaviorCapture.value.videoBlob, result.blob, result.features, visionMetrics.value);
      setProcess({ title: "입력한 목소리를 분석하고 있습니다.", label: "목소리 분석 결과 저장 완료", percent: 100 });
    } catch (error) {
      setProcess(null);
      audio.current.release();
      notify(error instanceof Error ? error.message : "5초 음성 입력에 실패했습니다.");
    } finally {
      setRecording(false);
      setAnalyzing(false);
      setVoiceProgress(0);
      window.setTimeout(() => setProcess(null), 420);
    }
  };

  const proceed = async () => {
    setAnalyzing(true);
    setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "입력 데이터 조건을 확인하는 중...", percent: 6 });
    try {
      if (!selectedCharacter.value.sourceAsset) {
        notify("먼저 Character에서 새 캐릭터를 생성해 주세요.");
        return;
      }
      if (!behaviorCapture.value.videoBlob || visionMetrics.value.source !== "mediapipe") {
        notify("카메라 5초 입력에서 행동이 분석되지 않았습니다. 다시 촬영해 주세요.");
        return;
      }
      if (!behaviorCapture.value.audioBlob || !sourceTranscript.value.trim()) {
        notify("5초 음성 입력과 전사가 완료되어야 이모티콘을 생성할 수 있습니다.");
        return;
      }
      
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "분석 결과를 저장하는 중...", percent: 18 });
      setGenerationStep("입력 데이터 저장 중");
      
      behaviorCapture.value = {
        ...behaviorCapture.value,
        emotionScores: Object.fromEntries(emotionOrder.map((item) => [item, item === emotion.value ? .88 : .015])) as Record<Emotion, number>
      };
      
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
      navigate("/emoticon/edit");
    } catch (error) {
      setProcess(null);
      notify(error instanceof Error ? error.message : "이모티콘 생성에 실패했습니다.");
    } finally {
      setAnalyzing(false);
      setGenerationStep("Ready for Generation");
      window.setTimeout(() => setProcess(null), 420);
    }
  };

  const startAudioMeter = async () => {
    await audio.current.start((nextLevels, features) => {
      setLevels(nextLevels);
      audioRms.value = Math.min(1, features.rms * 4.2);
      audioPeak.value = features.peak;
    });
  };

  const stopAudioCapture = async () => {
    const result = await audio.current.stop();
    audioRms.value = result.features.rms;
    audioPeak.value = result.features.peak;
    return result;
  };

  const applyVoiceAndVision = async (videoBlob: Blob | undefined, audioBlob: Blob, audioFeatures: AudioFeatures, metrics: VisionMetrics) => {
    const resultText = await ai.transcribe(audioBlob);
    sourceTranscript.value = resultText.sourceText;
    transcript.value = resultText.shortText;
    const nextEmotion = resultText.sourceText.trim() ? inferEmotionFromText(resultText.sourceText, audioFeatures) : "unknown";
    expressionEmotion.value = metrics.face?.expression ?? "unknown";
    setEmotion(nextEmotion);
    
    const emotionScores = Object.fromEntries(emotionOrder.map((item) => [item, item === nextEmotion ? .88 : .015])) as Record<Emotion, number>;
    
    behaviorCapture.value = {
      ...behaviorCapture.value,
      id: `capture-${Date.now()}`,
      videoBlob,
      audioBlob,
      poseSummary: describePose(metrics),
      gesture: metrics.gesture ?? "Not_Detected",
      expression: metrics.face?.expression ?? "unknown",
      sourceText: resultText.sourceText,
      shortText: resultText.shortText,
      audio: audioFeatures,
      emotionScores,
      createdAt: new Date().toISOString()
    };
    
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

  const computedTier: ExaggerationTier = motionIntensity.value < .45 ? "minimal" : motionIntensity.value < .72 ? "emotional" : "full";
  const effectiveTier = tierOverride ?? computedTier;
  const intensityTier = effectiveTier === "minimal" ? "낮음" : effectiveTier === "emotional" ? "중간" : "높음";
  const poseSummary = describePose(visionMetrics.value);
  const faceSummary = describeFaceUse(expressionEmotion.value, visionMetrics.value);
  const voiceSummary = describeVoiceUse(sourceTranscript.value, transcript.value, audioRms.value);
  const effectGuide = emotionEffectGuides[emotion.value];
  const selectedMotionStyle = motionStyleOptions.find((item) => item.id === motionStyle.value) ?? motionStyleOptions[0];

  // Define steps for ScrollSlideContainer
  const steps = [
    {
      id: "preview-wait",
      label: "01 · 촬영 대기",
      content: (
        <div className="input-step-layout">
          <div className="step-left">
            <Panel title="✦ 실시간 모니터" className="camera-monitor-panel">
              <div className="pose-media-frame">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={cameraReady ? "visible" : ""}
                  style={cameraReady && !personDetected && !capturing ? { filter: "blur(12px)", transition: "filter 0.5s ease" } : undefined}
                />
                {!cameraReady && <img src={imageAssets.pose} alt="포즈 예시" />}
                <span className="camera-status">
                  <i className={cameraReady ? "on" : ""} />
                  {personDetected ? "인식 완료 ✨" : cameraReady ? "카메라 준비됨 (사람 인식 대기)" : "CAMERA CLOSED"}
                </span>
              </div>
              <p className="step-tip">상반신과 양손이 화면에 모두 들어오도록 카메라 앞에 서 주세요.</p>
            </Panel>
          </div>
          <div className="step-right">
            <Panel title="✦ 촬영 안내" className="step-guide-panel">
              <h3>감정 표현 동작 촬영</h3>
              <p>5초 동안 만들고 싶은 이모티콘의 감정과 어울리는 행동을 몸짓과 목소리로 자유롭게 표현하세요.</p>
              <ul className="guide-list">
                <li>예: 기쁠 때 만세하기, 슬플 때 얼굴 감싸기</li>
                <li>목소리 강도에 따라 캐릭터 동작과 연출이 자동 과장됩니다.</li>
              </ul>
              <button type="button" className="btn-start-capture" onClick={startCaptureFlow} disabled={!cameraReady}>
                <Icon name="camera" />
                촬영 시작하기
              </button>
            </Panel>
          </div>
        </div>
      ),
      validate: () => {
        if (!cameraReady) return "카메라 장치를 초기화하는 중입니다. 대기하거나 권한을 승인해 주세요.";
        return null;
      }
    },
    {
      id: "capturing",
      label: "02 · 촬영 중",
      content: (
        <div className="input-step-layout active-capturing">
          <Panel title="✦ 촬영 진행중" className="capturing-panel full-width">
            <div className="capturing-box">
              <div className="recording-indicator">
                <span className="dot animate-pulse" />
                <span>REC {Math.ceil((1 - captureProgress) * 5)}s</span>
              </div>
              <div className="progress-track">
                <span className="progress-bar" style={{ width: `${captureProgress * 100}%` }} />
              </div>
              <p className="action-hint">목소리와 어울리는 행동을 5초 동안 크게 보여주세요!</p>
              <div className="compact-wave">
                <Waveform levels={levels} active={capturing} />
              </div>
            </div>
          </Panel>
        </div>
      ),
      validate: () => {
        if (capturing) return "현재 촬영이 진행 중입니다. 완료될 때까지 기다려 주세요.";
        return null;
      }
    },
    {
      id: "pose-result",
      label: "03 · 포즈 분석 결과",
      content: (
        <div className="input-step-layout">
          <div className="step-left">
            <Panel title="✦ 촬영 완료 스냅샷" className="snapshot-panel">
              <div className="result-snapshot-placeholder">
                <Icon name="image" size={48} />
                <span className="snapshot-tag">5s Capture completed</span>
              </div>
            </Panel>
          </div>
          <div className="step-right">
            <Panel title="✦ 포즈 판독" className="pose-analysis-panel">
              <div className="analysis-card">
                <Icon name="check" size={24} className="text-emerald" />
                <div>
                  <h4>판독된 몸짓</h4>
                  <p className="highlight-text">{poseSummary}</p>
                </div>
              </div>
              <div className="analysis-card">
                <Icon name="layers" size={24} />
                <div>
                  <h4>포즈 상세 정보</h4>
                  <p>{visionMetrics.value.source === "mediapipe" ? "MediaPipe 기반 관절 랜드마크 분석 완료" : "동작 감지 실패 - 기본 자세로 생성됩니다."}</p>
                </div>
              </div>
              <div className="step-nav-actions">
                <button type="button" className="btn-secondary" onClick={() => returnToPreview()}>
                  <Icon name="reload" />
                  다시 촬영하기
                </button>
                <button type="button" className="btn-primary" onClick={() => setCurrentStep(3)}>
                  다음 단계 이동
                  <Icon name="next" />
                </button>
              </div>
            </Panel>
          </div>
        </div>
      ),
      validate: () => {
        if (visionMetrics.value.source !== "mediapipe") {
          return "동작이 인식되지 않았습니다. 권장하는 팔을 펼친 동작으로 다시 촬영하시는 것을 추천합니다.";
        }
        return null;
      }
    },
    {
      id: "voice-emotion-result",
      label: "04 · 감정 및 상세 설정",
      content: (
        <div className="input-step-layout final-step">
          <div className="step-left">
            <Panel title="✦ 음성 분석 및 감정" className="voice-analysis-panel">
              <div className="voice-card">
                <div className="voice-text-badge">
                  <Icon name="voice" />
                  <span>인식된 키워드 문구</span>
                </div>
                <input
                  type="text"
                  className="keyword-phrase-input"
                  value={transcript.value}
                  onChange={(event) => (transcript.value = event.currentTarget.value)}
                  placeholder="예: 정말 기뻐!"
                />
              </div>

              <div className="exaggeration-indicator-box">
                <span className="box-title">행동 & 감정 과장 선택 (음성 크기 연동)</span>
                <div className="exaggeration-btns">
                  {(["minimal", "emotional", "full"] as const).map((tier) => {
                    const label = tier === "minimal" ? "낮음 (자연스러움)" : tier === "emotional" ? "중간 (감정 효과)" : "높음 (모션 과장)";
                    const isComputed = tier === computedTier && !tierOverride;
                    return (
                      <button
                        key={tier}
                        type="button"
                        className={`tier-btn ${effectiveTier === tier ? "active" : ""}`}
                        data-tier={tier}
                        onClick={() => setTierOverride(tierOverride === tier ? null : tier)}
                      >
                        {label}{isComputed ? " ✨" : tierOverride === tier ? " ✋" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="tier-explain">
                  {effectiveTier === "minimal" && "낮음: 캐릭터의 크기 변화나 뒤틀림을 최소화하고 감정을 깔끔하게 표현합니다."}
                  {effectiveTier === "emotional" && "중간: 분수 눈물, 분노 폭발 등 이모티콘 특유의 극적인 비주얼이 추가됩니다."}
                  {effectiveTier === "full" && "높음: 신체 비율이 팽창하거나 활처럼 휘어지는 등 만화적인 동작이 부여됩니다."}
                </p>
              </div>

              <div className="selected-char-preview">
                <span className="char-thumb">
                  {selectedCharacter.value.sourceAsset ? (
                    <img src={selectedCharacter.value.sourceAsset} alt="선택된 캐릭터" />
                  ) : (
                    <Icon name="image" size={24} />
                  )}
                </span>
                <div className="char-desc">
                  <strong>{selectedCharacter.value.name || "캐릭터 미선택"}</strong>
                  <span>{selectedCharacter.value.stylePreset} 스타일</span>
                </div>
                <button type="button" className="btn-select-char" onClick={() => setCharacterMenu(!characterMenu)}>
                  변경
                </button>
                {characterMenu && (
                  <div className="character-popover">
                    {characters.value.map((token) => (
                      <button
                        key={token.id}
                        type="button"
                        className={token.id === selectedCharacter.value.id ? "active" : ""}
                        onClick={() => {
                          selectCharacter(token.id);
                          setCharacterMenu(false);
                        }}
                      >
                        <img src={token.sourceAsset} alt="" />
                        <span>{token.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="step-right">
            <Panel title="✦ 감정 & 배경 효과" className="effect-settings-panel">
              <div className="emotion-grid-selector">
                <span className="grid-label">원하는 감정 프리셋 직접 선택</span>
                <div className="emotion-buttons">
                  {emotionOrder.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`emo-btn ${emotion.value === item ? "active" : ""}`}
                      onClick={() => setEmotion(item)}
                    >
                      <i style={{ background: emotionMeta[item].color }} />
                      {emotionMeta[item].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-effect-card">
                <h4>배경 이펙트 정보</h4>
                <p className="effect-detail-name">{emotionMeta[emotion.value].effect}</p>
                <span className="effect-color-row">
                  이펙트 강조 색상:
                  <input
                    type="color"
                    value={effectColor.value}
                    onChange={(event) => (effectColor.value = event.currentTarget.value)}
                  />
                </span>
              </div>

              <div className="generate-action-row">
                <button
                  type="button"
                  className="btn-generate-emoticon"
                  onClick={proceed}
                  disabled={recording || capturing || analyzing}
                >
                  <Icon name={analyzing ? "reload" : "star"} className={analyzing ? "spin" : ""} />
                  {analyzing ? "이모티콘 프레임 제작 중..." : "이모티콘 생성하기"}
                </button>
              </div>
            </Panel>
          </div>
        </div>
      ),
      validate: () => {
        if (!transcript.value.trim()) {
          return "전사된 음성 텍스트 문구가 비어 있습니다. 이모티콘에 들어갈 대사를 직접 입력하거나 다시 촬영해 주세요.";
        }
        if (!selectedCharacter.value.sourceAsset) {
          return "선택된 캐릭터가 없습니다. 이모티콘에 사용할 캐릭터를 선택해 주세요.";
        }
        return null;
      }
    }
  ];

  return (
    <div className="workspace-page input-page">
      <header className="screen-brief input-brief">
        <span>02</span>
        <h1>목소리와 몸짓으로 이모티콘을 설계해 보세요.</h1>
        <p>음성 강도 분석과 AI 프롬프트 생성 단계</p>
      </header>

      <ScrollSlideContainer
        steps={steps}
        currentStep={currentStep}
        onStepChange={(index) => setCurrentStep(index)}
        className="input-scroll-slider"
      />

      {process && <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} />}
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
