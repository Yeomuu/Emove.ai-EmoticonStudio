import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Waveform } from "../components/Waveform";
import { ScrollSlideContainer } from "../components/ScrollSlideContainer";
import { emotionMeta, emotionOrder, imageAssets } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { waitForImageAssets } from "../services/asset-readiness";

import { AudioCapture, CameraCapture } from "../services/media";
import { analyzeEmotionPriority } from "../services/emotion-analysis";
import { syncCaptureToRemote } from "../services/remote-store";
import { saveCapture } from "../services/repository";
import { createLiveVisionAnalyzer } from "../services/vision";
import { audioPeak, audioRms, behaviorCapture, characters, coreEffectImage, effectColor, emotion, expressionEmotion, frameImages, motionBrief, motionIntensity, notify, sanitizeAssetUrl, selectCharacter, selectedCharacter, setEmotion, sourceTranscript, startNewEmoticonProject, transcript, visionMetrics } from "../store";
import type { AudioFeatures, BehaviorCapture, Emotion, ExaggerationTier, VisionMetrics } from "../types";

const ai = getAIProvider();
const FRAME_COUNT = 5;
const CAPTURE_DURATION_MS = 5000;
type ProcessState = { title: string; label: string; percent: number };

export function InputPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useRef(new CameraCapture());
  const audio = useRef(new AudioCapture());
  const idleTimer = useRef<number | undefined>(undefined);
  const captureLockRef = useRef(false);
  const generationLockRef = useRef(false);

  const [currentStep, setCurrentStep] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingFrames, setGeneratingFrames] = useState(false);
  const [characterMenu, setCharacterMenu] = useState(false);
  const [process, setProcess] = useState<ProcessState | null>(null);

  const [personDetected, setPersonDetected] = useState(false);
  const [tierOverride, setTierOverride] = useState<ExaggerationTier | null>(null);

  useEffect(() => {
    window.clearTimeout(idleTimer.current);
    if (currentStep < 2 || capturing || analyzing || generatingFrames || recording || process) return;
    idleTimer.current = window.setTimeout(() => navigate("/showcase"), 10_000);
    return () => window.clearTimeout(idleTimer.current);
  }, [currentStep, capturing, analyzing, generatingFrames, recording, process]);

  // Always-on camera: start on mount, blur when person not detected
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    let tickId = 0;
    camera.current.attach(video).then(() => {
      setCameraReady(true);
      createLiveVisionAnalyzer().then((analyzer) => {
        const checkFrame = () => {
          if (!active) return;
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const metrics = analyzer.detectFrame?.(video);
              if (metrics && metrics.source === "mediapipe") {
                setPersonDetected(true);
              } else {
                setPersonDetected(false);
              }
            } catch (err) {
              // Ignore frame errors
            }
          }
          tickId = window.setTimeout(checkFrame, 250);
        };
        checkFrame();
      }).catch(() => {
        // Fallback for offline/no internet: clear blur after 3 seconds
        window.setTimeout(() => {
          if (active) setPersonDetected(true);
        }, 3000);
      });
    }).catch(() => { /* camera not available */ });

    return () => {
      active = false;
      window.clearTimeout(tickId);
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
    if (message) notify(message);
    setCurrentStep(0);
  };

  const startCaptureFlow = async () => {
    setCurrentStep(1);
    await capturePose();
  };

  const capturePose = async () => {
    if (!videoRef.current || captureLockRef.current) return;
    captureLockRef.current = true;
    window.clearTimeout(idleTimer.current);
    setCapturing(true);
    setRecording(true);
    setAnalyzing(false);
    setCaptureProgress(0);
    setLevels([]);
    
    try {
      const liveVision = await createLiveVisionAnalyzer();
      await startAudioMeter();
      
      const visionTask = liveVision.analyze(videoRef.current, CAPTURE_DURATION_MS);
      const result = await camera.current.record(videoRef.current, CAPTURE_DURATION_MS, (progress) => {
        setCaptureProgress(progress);
      });
      
      const voice = await stopAudioCapture();
      
      // Recording complete. Now show full-screen analysis overlay
      setAnalyzing(true);
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "사람의 포즈와 표정을 판독하는 중...", percent: 64 });
      
      let metrics: VisionMetrics;
      try {
        metrics = await visionTask;
      } catch (error) {
        metrics = { source: "unavailable", gesture: "Analyzer_Error", diagnostics: error instanceof Error ? error.message : String(error) };
      }
      
      visionMetrics.value = metrics;
      
      if (metrics.source === "mediapipe") {
        setPersonDetected(true);
      }
      
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "목소리를 전사하고 감정 키를 정리하는 중...", percent: 78 });
      await applyVoiceAndVision(result.blob, voice.blob, voice.features, metrics);
      setProcess({ title: "입력한 포즈를 분석하고 있습니다.", label: "분석 결과 저장 완료", percent: 100 });
      if (metrics.source !== "mediapipe") {
        notify(`${metrics.diagnostics ?? "카메라에서 사람의 자세 랜드마크를 찾지 못했습니다."} 목소리 감정은 저장했지만 행동 생성을 위해 다시 촬영해 주세요.`);
      }
      setCurrentStep(2); // Go to results view
    } catch (error) {
      setProcess(null);
      returnToPreview();
      notify(error instanceof Error ? error.message : "자세 촬영에 실패했습니다.");
    } finally {
      captureLockRef.current = false;
      setCapturing(false);
      setRecording(false);
      setAnalyzing(false);
      setCaptureProgress(0);
      window.setTimeout(() => setProcess(null), 420);
    }
  };
 
  const proceed = async () => {
    if (generationLockRef.current || captureLockRef.current) return;
    generationLockRef.current = true;
    setGeneratingFrames(true);
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
      
      const persistence = await saveCaptureRemoteFirst(behaviorCapture.value);
      if (!persistence.synced) notify(persistence.message);
      
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "5프레임 프로젝트를 초기화하는 중...", percent: 32 });
      
      startNewEmoticonProject();
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "캐릭터 행동 프레임 5장을 생성하는 중...", percent: 46 });
      
      const frames = await ai.generateCharacterFrames(motionBrief.value, selectedCharacter.value);
      await waitForImageAssets(frames.slice(0, FRAME_COUNT));
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "편집 화면에서 사용할 프레임을 정렬하는 중...", percent: 88 });
      frameImages.value = frames.slice(0, FRAME_COUNT);
      coreEffectImage.value = null;
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "이모티콘 생성 완료", percent: 100 });
      navigate("/edit");
    } catch (error) {
      setProcess(null);
      notify(error instanceof Error ? error.message : "이모티콘 생성에 실패했습니다.");
    } finally {
      generationLockRef.current = false;
      setGeneratingFrames(false);
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
    expressionEmotion.value = metrics.face?.expression ?? "unknown";
    const analyzedEmotion = await analyzeEmotionPriority(
      audioBlob,
      resultText.sourceText,
      audioFeatures,
      metrics,
      (label, percent) => setProcess({ title: "입력한 목소리와 포즈를 분석하고 있습니다.", label, percent }),
    );
    setEmotion(analyzedEmotion.emotion);
    
    behaviorCapture.value = {
      ...behaviorCapture.value,
      id: `capture-${Date.now()}`,
      videoBlob,
      audioBlob,
      poseSummary: describePose(metrics),
      gesture: metrics.gesture ?? "Not_Detected",
      expression: metrics.face?.expression ?? "unknown",
      emotionSource: analyzedEmotion.source,
      emotionProvider: analyzedEmotion.provider,
      emotionConfidence: analyzedEmotion.confidence,
      emotionWarning: analyzedEmotion.warning,
      sourceText: resultText.sourceText,
      shortText: resultText.shortText,
      audio: audioFeatures,
      emotionScores: analyzedEmotion.scores,
      createdAt: new Date().toISOString()
    };
    
    const persistence = await saveCaptureRemoteFirst(behaviorCapture.value);
    notify(metrics.source === "mediapipe"
      ? `${emotionAnalysisLabel(behaviorCapture.value)}, ${describePose(metrics)}, ${describeFaceUse(expressionEmotion.value, metrics)}을 분석했어요. ${persistence.synced ? "원격 DB에 저장했습니다." : persistence.message}`
      : `${emotionAnalysisLabel(behaviorCapture.value)}은 저장했습니다. 카메라 행동은 인식하지 못해 다시 촬영해야 합니다.`);
  };

  const computedTier: ExaggerationTier = motionIntensity.value < .45 ? "minimal" : motionIntensity.value < .72 ? "emotional" : "full";
  const effectiveTier = tierOverride ?? computedTier;
  const poseSummary = describePose(visionMetrics.value);

  // Define steps for ScrollSlideContainer
  const steps = [
    {
      id: "preview-wait",
      label: "01 · 촬영 대기",
      content: (
        <div className="input-composer">
          <div className="pose-capture-panel">
            <Panel title="✦ 실시간 모니터" className="camera-monitor-panel">
              <div className={`pose-media-frame${cameraReady && !personDetected && !capturing ? " is-awaiting-person" : ""}`}>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={cameraReady ? "visible" : ""}
                  style={{
                    transform: "scaleX(-1)",
                    ...(cameraReady && !personDetected && !capturing ? { filter: "blur(8px) brightness(0.68)", transition: "filter 0.5s ease" } : {})
                  }}
                />
                {!cameraReady && <img src={imageAssets.pose} alt="포즈 예시" />}
                <span className="camera-status">
                  <i className={cameraReady ? "on" : ""} />
                  {personDetected ? "인식 완료 ✨" : cameraReady ? "카메라 준비됨 (사람 인식 대기)" : "CAMERA CLOSED"}
                </span>
              </div>
              <p className="step-tip">상반신과 양손이 화면에 모두 들어오도록 카메라 앞에 서 주세요.</p>
              <button type="button" className="btn-start-capture" onClick={startCaptureFlow} disabled={!cameraReady}>
                <Icon name="camera" />
                <span>촬영 시작하기</span>
              </button>
            </Panel>
          </div>
          <div className="input-right-column">
            <aside className="input-stage-panel" aria-label="입력 단계">
              <strong>입력단계</strong>
              {["촬영", "분석", "포즈 분석 결과", "음성 분석 결과"].map((label, index) => (
                <div
                  key={label}
                  className={index === currentStep ? "active" : index < currentStep ? "complete" : ""}
                  aria-current={index === currentStep ? "step" : undefined}
                >
                  <span aria-hidden="true" />
                  {label}
                </div>
              ))}
            </aside>
          </div>
        </div>
      ),
      validate: () => {
        if (!cameraReady) return "카메라 장치를 초기화하는 중입니다. 대기하거나 권한을 승인해 주세요.";
        return "촬영 시작하기 버튼을 눌러 5초 촬영을 먼저 완료해 주세요.";
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
        <div className="input-composer">
          <div className="pose-capture-panel">
            <Panel title="✦ 촬영 완료 스냅샷" className="snapshot-panel">
              <div className="result-snapshot-placeholder">
                <Icon name="image" size={48} />
                <span className="snapshot-tag">5s Capture completed</span>
              </div>
            </Panel>
          </div>
          <div className="input-right-column">
            <Panel title="✦ 포즈 판독" className="pose-analysis-panel">
              <div className="analysis-card" style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <Icon name="check" size={24} className="text-emerald" />
                <div>
                  <h4>판독된 몸짓</h4>
                  <p className="highlight-text" style={{ fontSize: "16px", fontWeight: "700", color: "#7b69ff" }}>{poseSummary}</p>
                </div>
              </div>
              <div className="analysis-card" style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                <Icon name="layers" size={24} />
                <div>
                  <h4>포즈 상세 정보</h4>
                  <p style={{ color: "#aaa6b4", fontSize: "13px" }}>{visionMetrics.value.source === "mediapipe" ? "MediaPipe 기반 관절 랜드마크 분석 완료" : "동작 감지 실패 - 기본 자세로 생성됩니다."}</p>
                </div>
              </div>
              <div className="step-nav-actions" style={{ display: "flex", gap: "12px" }}>
                <button type="button" className="btn-secondary" onClick={() => returnToPreview()} style={{ flex: 1 }}>
                  <Icon name="reload" />
                  다시 촬영하기
                </button>
                <button type="button" className="btn-primary" onClick={() => setCurrentStep(3)} style={{ flex: 1 }}>
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
        <div className="input-composer">
          <div className="pose-capture-panel">
            <Panel title="✦ 음성 분석 및 감정" className="voice-analysis-panel overflow-visible">
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
                <p className="emotion-analysis-source">
                  {emotionAnalysisLabel(behaviorCapture.value)}
                </p>
              </div>

              <div className="exaggeration-indicator-box" style={{ marginTop: "18px" }}>
                <span className="box-title">행동 & 감정 과장 선택 (음성 크기 연동)</span>
                <div className="exaggeration-btns" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "8px" }}>
                  {(["minimal", "emotional", "full"] as const).map((tier) => {
                    const label = tier === "minimal" ? "낮음" : tier === "emotional" ? "중간" : "높음";
                    const isComputed = tier === computedTier && !tierOverride;
                    return (
                      <button
                        key={tier}
                        type="button"
                        className={`tier-btn button subtle ${effectiveTier === tier ? "active" : ""}`}
                        style={{ border: effectiveTier === tier ? "1px solid #7b69ff" : "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", height: "38px" }}
                        onClick={() => setTierOverride(tierOverride === tier ? null : tier)}
                      >
                        {label}{isComputed ? " ✨" : tierOverride === tier ? " ✋" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="tier-explain" style={{ marginTop: "8px", fontSize: "12px", color: "#aaa6b4" }}>
                  {effectiveTier === "minimal" && "낮음: 캐릭터의 크기 변화나 뒤틀림을 최소화하고 감정을 깔끔하게 표현합니다."}
                  {effectiveTier === "emotional" && "중간: 분수 눈물, 분노 폭발 등 이모티콘 특유의 극적인 비주얼이 추가됩니다."}
                  {effectiveTier === "full" && "높음: 신체 비율이 팽창하거나 활처럼 휘어지는 등 만화적인 동작이 부여됩니다."}
                </p>
              </div>

              <div className="selected-char-preview" style={{ marginTop: "18px", display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
                <span className="char-thumb" style={{ width: "40px", height: "40px", borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,9,18,0.3)" }}>
                  {selectedCharacter.value.sourceAsset ? (
                    <img src={sanitizeAssetUrl(selectedCharacter.value.sourceAsset)} alt="선택된 캐릭터" style={{ width: "90%", height: "90%", objectFit: "contain" }} />
                  ) : (
                    <Icon name="image" size={24} />
                  )}
                </span>
                <div className="char-desc" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <strong style={{ color: "#fff" }}>{selectedCharacter.value.name || "캐릭터 미선택"}</strong>
                  <span style={{ fontSize: "11px", color: "#aaa6b4" }}>{selectedCharacter.value.stylePreset} 스타일</span>
                </div>
                <button type="button" className="btn-select-char" onClick={() => setCharacterMenu(!characterMenu)} style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>
                  변경
                </button>
                {characterMenu && (
                  <div className="character-popover" style={{ position: "absolute", bottom: "100%", right: "12px", background: "#171522", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "6px", zIndex: 10 }}>
                    {characters.value.map((token) => (
                      <button
                        key={token.id}
                        type="button"
                        className={token.id === selectedCharacter.value.id ? "active" : ""}
                        onClick={() => {
                          selectCharacter(token.id);
                          setCharacterMenu(false);
                        }}
                        style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "6px 12px", border: "none", background: "none", color: "#fff", fontSize: "12px", textAlign: "left" }}
                      >
                        <img src={sanitizeAssetUrl(token.sourceAsset)} alt="" style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
                        <span>{token.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="input-right-column">
            <Panel title="✦ 감정 & 배경 효과" className="effect-settings-panel">
              <div className="emotion-grid-selector">
                <span className="grid-label">원하는 감정 프리셋 직접 선택</span>
                <div className="emotion-buttons" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "8px" }}>
                  {emotionOrder.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`emo-btn ${emotion.value === item ? "active" : ""}`}
                      onClick={() => setEmotion(item)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 8px", fontSize: "12px", borderRadius: "8px" }}
                    >
                      <i style={{ background: emotionMeta[item].color, width: "8px", height: "8px", borderRadius: "50%" }} />
                      {emotionMeta[item].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-effect-card" style={{ marginTop: "18px", padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <h4 style={{ margin: 0, fontSize: "13px" }}>배경 이펙트 정보</h4>
                <p className="effect-detail-name" style={{ color: "#ffd2e8", margin: "4px 0" }}>{emotionMeta[emotion.value].effect}</p>
                <span className="effect-color-row" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#aaa6b4" }}>
                  이펙트 강조 색상:
                  <input
                    type="color"
                    value={effectColor.value}
                    onChange={(event) => (effectColor.value = event.currentTarget.value)}
                    style={{ border: "none", background: "none", width: "24px", height: "24px" }}
                  />
                </span>
              </div>

              <div className="generate-action-row" style={{ marginTop: "24px" }}>
                <button
                  type="button"
                  className="btn-generate-emoticon"
                  onClick={proceed}
                  disabled={recording || capturing || analyzing || generatingFrames}
                  style={{ width: "100%" }}
                >
                  <Icon name={generatingFrames ? "reload" : "star"} className={generatingFrames ? "spin" : ""} />
                  {generatingFrames ? "이모티콘 프레임 제작 중..." : "이모티콘 생성하기"}
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
        <h1>캐릭터 생성에 필요한<br />목소리와 포즈를 촬영해 주세요.</h1>
        <p>음성 강도 분석과 AI 프롬프트 생성 단계</p>
      </header>

      <ScrollSlideContainer
        steps={steps}
        currentStep={currentStep}
        onStepChange={(index) => setCurrentStep(index)}
        onComplete={proceed}
        busy={capturing || analyzing || generatingFrames}
        completeLabel="이모티콘 생성하기"
        busyLabel={generatingFrames ? "프레임 생성 중" : "분석 중"}
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

function emotionAnalysisLabel(capture: BehaviorCapture): string {
  const source = capture.emotionSource === "voice" ? "목소리" : capture.emotionSource === "action" ? "행동" : capture.emotionSource === "expression" ? "표정" : "감정";
  const provider = capture.emotionProvider === "imentiv" ? "Imentiv" : capture.emotionProvider === "mediapipe" ? "MediaPipe" : "로컬 음성 휴리스틱";
  const confidence = Math.round((capture.emotionConfidence ?? 0) * 100);
  return `${source} 우선 분석 · ${provider} · 신뢰도 ${confidence}%`;
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
