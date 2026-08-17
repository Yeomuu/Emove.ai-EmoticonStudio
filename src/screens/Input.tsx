import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { BackgroundEffectPreview } from "../components/BackgroundEffectPreview";
import { Panel } from "../components/Shell";
import { Waveform } from "../components/Waveform";
import { ScrollSlideContainer } from "../components/ScrollSlideContainer";
import { FRAME_COUNT } from "../constants";
import { emotionMeta, emotionOrder, imageAssets } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { waitForImageAssets } from "../services/asset-readiness";

import { AudioCapture, CameraCapture, synchronizedCaptureIssue } from "../services/media";
import { analyzeEmotionPriority } from "../services/emotion-analysis";
import { getGestureLabel } from "../services/gesture-analysis";
import { createLiveVisionAnalyzer } from "../services/vision";
import { audioPeak, audioRms, behaviorCapture, characters, emotion, exaggerationTierOverride, expressionEmotion, frameImages, motionBrief, motionIntensity, notify, sanitizeAssetUrl, selectCharacter, selectedCharacter, selectedCharacterId, setEmotion, sourceTranscript, startNewEmoticonProject, transcript, visionMetrics } from "../store";
import type { AudioFeatures, BehaviorCapture, CharacterToken, Emotion, ExaggerationTier, VisionMetrics } from "../types";

const ai = getAIProvider();
const CAPTURE_DURATION_MS = 5000;
type ProcessState = { title: string; label: string; percent: number };
type CapturePhase = "idle" | "preparing" | "recording";
type CameraStatus = "connecting" | "ready" | "blocked" | "unavailable" | "closed";

export function InputPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useRef(new CameraCapture());
  const audio = useRef(new AudioCapture());
  const captureLockRef = useRef(false);
  const generationLockRef = useRef(false);
  const cameraConnectRef = useRef<Promise<boolean> | undefined>(undefined);
  const mountedRef = useRef(false);

  const [characterConfirmed, setCharacterConfirmed] = useState(false);
  const [draftCharacterId, setDraftCharacterId] = useState(selectedCharacterId.value);
  const [currentStep, setCurrentStep] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("closed");
  const [captureProgress, setCaptureProgress] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingFrames, setGeneratingFrames] = useState(false);
  const [process, setProcess] = useState<ProcessState | null>(null);

  const [personDetected, setPersonDetected] = useState(false);
  const [visionAvailable, setVisionAvailable] = useState<boolean | null>(null);
  const [tierOverride, setTierOverride] = useState<ExaggerationTier | null>(null);
  const [transcriptionWarning, setTranscriptionWarning] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cameraIssue, setCameraIssue] = useState<string | null>(null);
  const cameraReady = cameraStatus === "ready";

  const connectCamera = useCallback(async (showNotification = true): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) return false;
    if (camera.current.isReady(video)) {
      setCameraStatus("ready");
      setCameraIssue(null);
      return true;
    }
    if (cameraConnectRef.current) return cameraConnectRef.current;

    setCameraStatus("connecting");
    setCameraIssue(null);
    setPersonDetected(false);
    const task = (async () => {
      try {
        await camera.current.attach(video, () => {
          if (!mountedRef.current) return;
          setCameraStatus("closed");
          setPersonDetected(false);
          setVisionAvailable(null);
          setCameraIssue("카메라 연결이 종료되었습니다. 아래 버튼을 눌러 다시 연결해 주세요.");
        });
        if (!mountedRef.current) {
          camera.current.release();
          return false;
        }
        setCameraStatus("ready");
        setCameraIssue(null);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return false;
        const message = captureFailureMessage(error);
        if (mountedRef.current) {
          setCameraStatus(cameraStatusFromError(error));
          setPersonDetected(false);
          setVisionAvailable(null);
          setCameraIssue(message);
          if (showNotification) notify(message);
        }
        return false;
      }
    })();
    cameraConnectRef.current = task;
    try {
      return await task;
    } finally {
      if (cameraConnectRef.current === task) cameraConnectRef.current = undefined;
    }
  }, []);

  // Camera access begins only after the user explicitly confirms a character.
  useEffect(() => {
    mountedRef.current = true;
    if (characterConfirmed) {
      void connectCamera(false);
    } else {
      setCameraStatus("closed");
    }
    return () => {
      mountedRef.current = false;
      cameraConnectRef.current = undefined;
      camera.current.release();
      audio.current.release();
    };
  }, [characterConfirmed, connectCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    let active = true;
    let tickId = 0;
    setVisionAvailable(null);
    createLiveVisionAnalyzer().then((analyzer) => {
      if (!active) return;
      setVisionAvailable(true);
      const checkFrame = () => {
        if (!active) return;
        if (!camera.current.isReady(video)) {
          setCameraStatus("closed");
          setPersonDetected(false);
          return;
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const metrics = analyzer.detectFrame?.(video);
            setPersonDetected(Boolean(metrics && metrics.source === "mediapipe"));
          } catch {
            setPersonDetected(false);
          }
        }
        tickId = window.setTimeout(checkFrame, 250);
      };
      checkFrame();
    }).catch((error) => {
      if (!active) return;
      setVisionAvailable(false);
      setPersonDetected(false);
      setCameraIssue(`카메라는 연결되었지만 행동 분석 모델을 준비하지 못했습니다. ${error instanceof Error ? error.message : ""}`.trim());
    });

    return () => {
      active = false;
      window.clearTimeout(tickId);
    };
  }, [cameraReady]);

  const returnToPreview = (message?: string) => {
    setCapturing(false);
    setCapturePhase("idle");
    setRecording(false);
    setCaptureProgress(0);
    if (message) notify(message);
    setCurrentStep(0);
  };

  const startCaptureFlow = async () => {
    setCaptureError(null);
    setCameraIssue(null);
    const ready = await connectCamera(true);
    if (!ready) return;
    await capturePose();
  };

  const capturePose = async () => {
    const activeVideo = videoRef.current;
    if (!activeVideo || captureLockRef.current) return;
    captureLockRef.current = true;
    setCapturing(true);
    setCapturePhase("preparing");
    setRecording(false);
    setAnalyzing(false);
    setCaptureProgress(0);
    setLevels([]);
    setTranscriptionWarning(null);
    setTierOverride(null);
    exaggerationTierOverride.value = null;
    let audioStarted = false;
    let audioPrepared = false;
    let visionTask: Promise<VisionMetrics> | undefined;

    try {
      const liveVision = await createLiveVisionAnalyzer();
      await prepareAudioMeter();
      audioPrepared = true;
      const result = await camera.current.record(activeVideo, CAPTURE_DURATION_MS, (progress) => {
        setCaptureProgress(progress);
      }, () => {
        audio.current.begin();
        audioStarted = true;
        setRecording(true);
        setCapturePhase("recording");
        visionTask = Promise.resolve().then(() => liveVision.analyze(activeVideo, CAPTURE_DURATION_MS));
      });

      const voice = await stopAudioCapture();
      audioStarted = false;
      audioPrepared = false;
      setRecording(false);
      const synchronizationError = synchronizedCaptureIssue(result, voice, CAPTURE_DURATION_MS);
      if (synchronizationError) throw new Error(synchronizationError);
      if (!visionTask) throw new Error("카메라 행동 분석이 녹화와 함께 시작되지 않았습니다. 다시 촬영해 주세요.");
      setCapturePhase("idle");

      // Recording complete. Keep capture as the underlying slide while the full-screen analysis surface is visible.
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
      setCurrentStep(1);
    } catch (error) {
      if (audioStarted || audioPrepared) audio.current.release();
      const message = captureFailureMessage(error);
      setProcess(null);
      returnToPreview();
      setCaptureError(message);
      notify(message);
    } finally {
      captureLockRef.current = false;
      setCapturing(false);
      setCapturePhase("idle");
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
      if (!behaviorCapture.value.audioBlob) {
        notify("5초 음성 입력이 완료되어야 이모티콘을 생성할 수 있습니다.");
        return;
      }
      if (!transcript.value.trim()) {
        notify("전사 문구가 비어 있습니다. 이모티콘에 들어갈 문구를 직접 입력하거나 다시 촬영해 주세요.");
        return;
      }
      
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: "수동 감정과 과장 설정을 생성 조건에 반영하는 중...", percent: 18 });
      
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: `${FRAME_COUNT}프레임 프로젝트를 초기화하는 중...`, percent: 32 });
      
      startNewEmoticonProject();
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: `캐릭터 행동 프레임 ${FRAME_COUNT}장을 생성하는 중...`, percent: 46 });
      
      const frames = await ai.generateCharacterActionFrames(motionBrief.value, selectedCharacter.value);
      await waitForImageAssets(frames);
      setProcess({ title: "포즈와 목소리 데이터를 기반으로 이모티콘을 생성중입니다.", label: `고정 배경 이펙트와 캐릭터 행동 ${FRAME_COUNT}프레임을 연결하는 중...`, percent: 88 });
      frameImages.value = frames;
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

  const prepareAudioMeter = async () => {
    await audio.current.prepare((nextLevels, features) => {
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
    let resultText = { sourceText: "", shortText: "" };
    try {
      resultText = await ai.transcribe(audioBlob);
      setTranscriptionWarning(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setTranscriptionWarning(`음성 전사에 실패했습니다. 원본 녹음은 감정 분석에 사용했어요. 문구를 직접 입력하거나 다시 녹음해 주세요. (${detail})`);
    }
    sourceTranscript.value = resultText.sourceText;
    transcript.value = resultText.shortText;
    expressionEmotion.value = metrics.face?.expression ?? "neutral";
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
      handGesture: metrics.hand?.gesture,
      handConfidence: metrics.hand?.confidence,
      bodyGesture: metrics.pose?.bodyGesture,
      bodyConfidence: metrics.pose?.bodyConfidence,
      expression: metrics.face?.expression ?? "neutral",
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
    
    notify(metrics.source === "mediapipe"
      ? `${emotionAnalysisLabel(behaviorCapture.value)}, ${describePose(metrics)}, ${describeFaceUse(expressionEmotion.value, metrics)}을 분석했어요.`
      : `${emotionAnalysisLabel(behaviorCapture.value)}은 저장했습니다. 카메라 행동은 인식하지 못해 다시 촬영해야 합니다.`);
  };

  const computedTier: ExaggerationTier = motionIntensity.value < .45 ? "minimal" : motionIntensity.value < .72 ? "emotional" : "full";
  const effectiveTier = tierOverride ?? computedTier;
  const poseSummary = describePose(visionMetrics.value);
  const progressIndex = analyzing ? 1 : currentStep === 0 ? 0 : currentStep + 1;
  const progressItems = [
    { id: "capture", label: "촬영", targetStep: 0 },
    { id: "analysis", label: "분석" },
    { id: "pose", label: "포즈 분석 결과", targetStep: 1 },
    { id: "voice", label: "음성 분석 결과", targetStep: 2 },
  ];

  const confirmCharacter = () => {
    const character = characters.value.find((item) => item.id === draftCharacterId);
    if (!character?.sourceAsset) {
      notify("이모티콘에 사용할 캐릭터를 선택해 주세요.");
      return;
    }
    selectCharacter(character.id);
    setCharacterConfirmed(true);
  };

  // Define steps for ScrollSlideContainer
  const steps = [
    {
      id: "preview-wait",
      label: "01 · 촬영 대기",
      content: (
        <>
          <div className="input-composer">
            <div className="pose-capture-panel">
              <Panel className="camera-monitor-panel">
                <div className={`pose-media-frame${cameraReady && visionAvailable === true && !personDetected && !capturing ? " is-awaiting-person" : ""}${capturing ? " is-recording" : ""}`}>
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={cameraReady ? "visible" : ""}
                    style={{
                      transform: "scaleX(-1)",
                      ...(cameraReady && visionAvailable === true && !personDetected && !capturing ? { filter: "blur(8px) brightness(0.68)", transition: "filter 0.5s ease" } : {})
                    }}
                  />
                  {!cameraReady && <img src={imageAssets.pose} alt="포즈 예시" />}
                  <span className="camera-status">
                    <i className={cameraReady ? capturing ? capturePhase : "on" : cameraStatus} />
                    {capturing
                      ? capturePhase === "recording"
                        ? "포즈와 목소리를 동시에 기록하고 있습니다"
                        : "카메라와 마이크를 준비하고 있습니다"
                      : cameraStatus === "connecting"
                        ? "카메라 연결 중"
                      : personDetected
                        ? "인식 완료"
                        : cameraReady
                          ? visionAvailable === false
                            ? "카메라 준비됨 (행동 분석 모델 오류)"
                            : visionAvailable === null
                              ? "카메라 준비됨 (행동 분석 모델 준비 중)"
                              : "카메라 준비됨 (사람 인식 대기)"
                          : cameraStatus === "blocked"
                            ? "카메라 권한 필요"
                            : cameraStatus === "unavailable"
                              ? "카메라 사용 불가"
                              : "카메라 연결 종료"}
                  </span>
                  {capturing ? (
                    <div className="camera-capture-hud" role="status" aria-live="polite">
                      <div className="camera-capture-meta">
                        <strong>{capturePhase === "recording" ? "REC" : "READY"}</strong>
                        <span>{capturePhase === "recording" ? `${Math.max(1, Math.ceil((1 - captureProgress) * 5))}초` : "잠시만 기다려 주세요"}</span>
                        <span>{capturePhase === "recording" ? "카메라 · 마이크 동시 수집" : "분석 모델 · 입력 장치 확인"}</span>
                      </div>
                      <Waveform levels={levels} active={capturePhase === "recording"} />
                      <div
                        className={`camera-capture-progress${capturePhase === "preparing" ? " is-preparing" : ""}`}
                        role="progressbar"
                        aria-label="카메라와 목소리 촬영 진행률"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={capturePhase === "recording" ? Math.round(captureProgress * 100) : undefined}
                      >
                        <span style={{ width: `${captureProgress * 100}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className="step-tip">
                  {capturing
                    ? capturePhase === "recording"
                      ? "화면을 보며 목소리와 어울리는 동작을 끝까지 유지해 주세요."
                      : "입력 장치가 준비되면 5초 촬영이 자동으로 시작됩니다."
                    : "상반신과 양손이 화면에 모두 들어오도록 카메라 앞에 서 주세요."}
                </p>
                <button
                  type="button"
                  className="btn-start-capture"
                  onClick={startCaptureFlow}
                  disabled={cameraStatus === "connecting" || capturing || analyzing}
                  aria-busy={cameraStatus === "connecting" || capturing}
                >
                  <Icon name="camera" />
                  <span>
                    {capturing
                      ? capturePhase === "recording"
                        ? `${Math.max(1, Math.ceil((1 - captureProgress) * 5))}초 촬영 중`
                        : "촬영 준비 중"
                      : cameraStatus === "connecting"
                        ? "카메라 연결 중"
                        : cameraReady
                          ? "촬영 시작하기"
                          : "카메라 다시 연결하기"}
                  </span>
                </button>
              </Panel>
            </div>
            <div className="input-right-column">
              <InputStagePanel activeIndex={0} />
            </div>
          </div>
          {captureError || cameraIssue ? (
            <div className="input-capture-error" role="alert" aria-live="assertive">
              <strong>{captureError ? "분석을 완료하지 못했습니다." : "카메라 연결을 확인해 주세요."}</strong>
              <span>{captureError ?? cameraIssue}</span>
              <button type="button" onClick={() => {
                setCaptureError(null);
                setCameraIssue(null);
              }}>확인</button>
            </div>
          ) : (
            <ul className="input-capture-notes" aria-label="촬영 안내">
              <li>다양한 움직임을 표현하면 더 풍부한 결과를 생성할 수 있습니다.</li>
              <li>음성 데이터로부터 감정을 추출하여 이모티콘에 반영합니다.</li>
              <li>주변이 소란스럽지 않은지 확인해 주세요.</li>
            </ul>
          )}
        </>
      ),
      validate: () => {
        if (!cameraReady) return "카메라 장치를 초기화하는 중입니다. 대기하거나 권한을 승인해 주세요.";
        if (behaviorCapture.value.videoBlob && behaviorCapture.value.audioBlob) return null;
        return "촬영 시작하기 버튼을 눌러 5초 촬영을 먼저 완료해 주세요.";
      }
    },
    {
      id: "pose-result",
      label: "03 · 포즈 분석 결과",
      content: (
        <div className="input-result-layout pose-result-layout">
          <div className="input-result-main">
            <Panel className="result-media-panel">
              <CapturedVideoPreview blob={behaviorCapture.value.videoBlob} />
              <div className="input-result-facts">
                <span><Icon name="check" size={15} />판독된 몸짓</span>
                <strong>{poseSummary}</strong>
                <small>{describePoseDetail(visionMetrics.value)}</small>
              </div>
            </Panel>
            <div className="input-result-actions">
              <button type="button" className="btn-secondary" onClick={() => returnToPreview()}>
                <Icon name="reload" />
                다시 촬영하기
              </button>
              <button type="button" className="btn-primary" onClick={() => setCurrentStep(2)}>
                다음 단계 이동하기
                <Icon name="next" />
              </button>
            </div>
          </div>
          <InputStagePanel activeIndex={2} />
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
        <div className="input-result-layout voice-result-layout">
          <div className="input-result-main">
            <Panel className="voice-result-panel">
              <div className="voice-result-settings">
                <span className="input-result-label">감정 분석 결과</span>
                <div className="emotion-buttons">
                  {emotionOrder.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={emotion.value === item ? "active" : ""}
                      onClick={() => setEmotion(item)}
                    >
                      {emotionMeta[item].label}
                    </button>
                  ))}
                </div>
                <label className="voice-result-transcript">
                  <span>인식된 문구</span>
                  <input value={transcript.value} onChange={(event) => (transcript.value = event.currentTarget.value)} placeholder="이모티콘에 들어갈 문구" />
                </label>
                {transcriptionWarning ? <p className="voice-transcription-warning" role="alert">{transcriptionWarning}</p> : null}
                <span className="input-result-label">행동 과장 정도</span>
                <div className="exaggeration-btns">
                  {(["minimal", "emotional", "full"] as const).map((tier) => {
                    const label = tier === "minimal" ? "약" : tier === "emotional" ? "중" : "강";
                    return (
                      <button
                        key={tier}
                        type="button"
                        className={effectiveTier === tier ? "active" : ""}
                        onClick={() => {
                          const nextTier = tierOverride === tier ? null : tier;
                          setTierOverride(nextTier);
                          exaggerationTierOverride.value = nextTier;
                        }}
                      >
                        <span className="voice-tier-character"><img src={sanitizeAssetUrl(selectedCharacter.value.sourceAsset)} alt="" /></span>
                        <strong>{label}</strong>
                      </button>
                    );
                  })}
                </div>
                <p className="tier-explain">
                  {effectiveTier === "minimal" && "동작 변형을 최소화하고 감정을 정돈해 표현합니다."}
                  {effectiveTier === "emotional" && "감정 이펙트를 강조하고 행동은 안정적으로 유지합니다."}
                  {effectiveTier === "full" && "동작과 감정 이펙트를 함께 크게 과장합니다."}
                </p>
                <p className="emotion-analysis-source">{emotionAnalysisLabel(behaviorCapture.value)}</p>
              </div>
              <div className="voice-effect-preview-panel">
                <span className="input-result-label">배경 이펙트 미리보기</span>
                <BackgroundEffectPreview />
                <div className="voice-effect-meta">
                  <strong>{emotionMeta[emotion.value].effect}</strong>
                  <span>감정별 고정 이펙트</span>
                  <i style={{ background: emotionMeta[emotion.value].color }} aria-hidden="true" />
                </div>
              </div>
            </Panel>
            <div className="input-result-actions">
              <button type="button" className="btn-secondary" onClick={() => returnToPreview()}>
                다시 녹음하기
              </button>
              <button type="button" className="btn-primary" onClick={proceed} disabled={recording || capturing || analyzing || generatingFrames}>
                <Icon name={generatingFrames ? "reload" : "star"} className={generatingFrames ? "spin" : ""} />
                {generatingFrames ? "이모티콘 프레임 제작 중" : "이모티콘 생성하기"}
              </button>
            </div>
          </div>
          <InputStagePanel activeIndex={3} />
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

  if (!characterConfirmed) {
    return (
      <CharacterSelectionScreen
        characters={characters.value}
        selectedId={draftCharacterId}
        onSelect={setDraftCharacterId}
        onConfirm={confirmCharacter}
      />
    );
  }

  return (
    <div className="workspace-page input-page">
      <header className="screen-brief input-brief">
        <span>02</span>
        <h1>
          {currentStep === 0 ? <>캐릭터 생성에 필요한<br />목소리와 포즈를 촬영해 주세요.</> : null}
          {currentStep === 1 ? <>포즈 분석이<br />완료되었습니다.</> : null}
          {currentStep === 2 ? <>음성 분석이<br />완료되었습니다.</> : null}
        </h1>
        <p>{currentStep === 0 ? "카메라와 마이크를 5초 동안 동시에 기록합니다." : "촬영한 입력을 단계별로 확인해 주세요."}</p>
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
        progressItems={progressItems}
        progressIndex={progressIndex}
      />

      {process && <WorkProcessScreen title={process.title} label={process.label} percent={process.percent} />}
    </div>
  );
}

function CharacterSelectionScreen({
  characters: availableCharacters,
  selectedId,
  onSelect,
  onConfirm,
}: {
  characters: CharacterToken[];
  selectedId: string;
  onSelect: (id: string) => void;
  onConfirm: () => void;
}) {
  const selected = availableCharacters.find((item) => item.id === selectedId);

  return (
    <div className="workspace-page input-page input-character-selection-page">
      <header className="screen-brief input-brief input-character-selection-brief">
        <span>02</span>
        <h1>이모티콘에 사용할<br />캐릭터를 선택해 주세요.</h1>
        <p>선택한 캐릭터의 외형과 스타일을 유지해 다섯 개의 행동 프레임을 생성합니다.</p>
      </header>

      <Panel className="input-character-selection-panel">
        <div className="input-character-selection-heading">
          <div>
            <span>CHARACTER</span>
            <h2>캐릭터 선택</h2>
          </div>
          <button type="button" className="input-character-create-link" onClick={() => navigate("/character")}>
            <Icon name="add" />
            새 캐릭터 만들기
          </button>
        </div>

        <div className="input-character-selection-list" role="listbox" aria-label="이모티콘에 사용할 캐릭터">
          {availableCharacters.map((character) => {
            const active = character.id === selectedId;
            return (
              <button
                key={character.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`input-character-option${active ? " active" : ""}`}
                onClick={() => onSelect(character.id)}
                disabled={!character.sourceAsset}
              >
                <span className="input-character-option-preview">
                  <img src={sanitizeAssetUrl(character.sourceAsset)} alt="" />
                </span>
                <span className="input-character-option-copy">
                  <strong>{character.name}</strong>
                  <small>{character.styleMode} · {character.stylePreset}</small>
                </span>
                <span className="input-character-option-check" aria-hidden="true">
                  {active ? <Icon name="check" size={14} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="input-character-selection-actions">
          <span>{selected ? `${selected.name} 선택됨` : "캐릭터를 하나 선택해 주세요."}</span>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={!selected?.sourceAsset}>
            이 캐릭터로 시작하기
            <Icon name="next" />
          </button>
        </div>
      </Panel>
    </div>
  );
}

function InputStagePanel({ activeIndex }: { activeIndex: number }) {
  return (
    <aside className="input-stage-panel" aria-label="입력 단계">
      <strong>입력단계</strong>
      {["촬영", "분석", "포즈 분석 결과", "음성 분석 결과"].map((label, index) => (
        <div key={label} className={index === activeIndex ? "active" : index < activeIndex ? "complete" : ""} aria-current={index === activeIndex ? "step" : undefined}>
          <span aria-hidden="true" />
          {label}
        </div>
      ))}
    </aside>
  );
}

function CapturedVideoPreview({ blob }: { blob?: Blob }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string>();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !url) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  return (
    <div className="captured-video-preview">
      {url ? (
        <video ref={videoRef} src={url} muted playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      ) : (
        <div className="captured-video-empty"><Icon name="image" size={40} /><span>5s Capture completed</span></div>
      )}
      <div className="captured-video-controls">
        <button type="button" onClick={togglePlayback} disabled={!url} aria-label={playing ? "촬영 영상 일시정지" : "촬영 영상 재생"}>
          <Icon name={playing ? "pause" : "play"} size={15} />
        </button>
        <Waveform levels={levelsFromCapture(behaviorCapture.value.audio)} active={playing} />
        <span>00:05</span>
      </div>
    </div>
  );
}

function levelsFromCapture(features?: AudioFeatures): number[] {
  const strength = Math.max(.12, Math.min(1, (features?.rms ?? 0) * 5));
  return Array.from({ length: 28 }, (_, index) => strength * (.32 + ((index * 7) % 11) / 14));
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
  const primary = getGestureLabel(metrics.gesture);
  const bodyGesture = metrics.pose?.bodyGesture;
  if (!bodyGesture || bodyGesture === "Natural" || bodyGesture === metrics.gesture) return primary;
  return `${primary} · ${getGestureLabel(bodyGesture)}`;
}

function describePoseDetail(metrics: VisionMetrics): string {
  if (metrics.source !== "mediapipe") return "동작 감지 실패 - 다시 촬영해 주세요.";
  const details: string[] = [];
  if (metrics.hand) {
    details.push(`손 ${getGestureLabel(metrics.hand.gesture).replace(/ 행동$/, "")} ${Math.round(metrics.hand.confidence * 100)}%`);
  } else if (metrics.handDetected) {
    details.push("손 모양 미분류");
  }
  if (metrics.pose?.bodyGesture && metrics.pose.bodyGesture !== "Natural") {
    details.push(`상체 ${getGestureLabel(metrics.pose.bodyGesture).replace(/ 행동$/, "")} ${Math.round((metrics.pose.bodyConfidence ?? 0) * 100)}%`);
  }
  return details.length
    ? `MediaPipe 관절·손가락·이동 분석 · ${details.join(" · ")}`
    : "MediaPipe 관절·손가락·이동 분석 완료";
}

function describeFaceUse(current: Emotion, metrics: VisionMetrics): string {
  if (!metrics.face) return "표정 미분석";
  const meta = emotionMeta[metrics.face.expression ?? current];
  return `${meta.label} 표정 · ${Math.round(metrics.face.confidence * 100)}%`;
}

function cameraStatusFromError(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : String(error || "");
  if (/NotAllowedError|SecurityError/i.test(name) || /permission denied|permission dismissed|권한/i.test(message)) {
    return "blocked";
  }
  if (
    /NotFoundError|NotReadableError|OverconstrainedError/i.test(name)
    || /device in use|could not start|no device|찾지 못|사용 중/i.test(message)
  ) {
    return "unavailable";
  }
  return "closed";
}

function captureFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const name = error instanceof DOMException ? error.name : "";
  if (/NotAllowedError|SecurityError/i.test(name) || /permission denied|notallowederror|permission dismissed/i.test(message)) {
    return "카메라와 마이크 권한이 필요합니다. 브라우저 주소창의 권한 설정에서 두 장치를 허용한 뒤 다시 촬영해 주세요.";
  }
  if (/NotReadableError/i.test(name) || /notreadableerror|could not start|device in use|track start/i.test(message)) {
    return "카메라 또는 마이크를 다른 앱에서 사용 중입니다. 해당 앱을 닫은 뒤 다시 촬영해 주세요.";
  }
  if (/NotFoundError|OverconstrainedError/i.test(name) || /notfounderror|requested device not found|no device/i.test(message)) {
    return "사용 가능한 카메라 또는 마이크를 찾지 못했습니다. 장치 연결 상태를 확인해 주세요.";
  }
  if (/시간이 초과|timeout|timed out/i.test(message)) {
    return "카메라 권한 또는 영상 준비 응답이 지연되고 있습니다. 브라우저 권한 창을 확인한 뒤 다시 연결해 주세요.";
  }
  if (/quota|billing|hard limit|usage limit/i.test(message)) {
    return "OpenAI API 사용 한도를 초과했습니다. 결제 및 사용량 설정을 확인한 뒤 다시 촬영해 주세요.";
  }
  return message || "자세 촬영에 실패했습니다.";
}

function emotionAnalysisLabel(capture: BehaviorCapture): string {
  const source = capture.emotionSource === "voice" ? "목소리" : capture.emotionSource === "action" ? "행동" : capture.emotionSource === "expression" ? "표정" : "감정";
  const provider = capture.emotionProvider === "imentiv" ? "Imentiv" : capture.emotionProvider === "mediapipe" ? "MediaPipe" : "로컬 음성 휴리스틱";
  const confidence = Math.round((capture.emotionConfidence ?? 0) * 100);
  return `${source} 우선 분석 · ${provider} · 신뢰도 ${confidence}%`;
}
