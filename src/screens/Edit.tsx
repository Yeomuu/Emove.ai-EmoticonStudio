import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ColorPickerDropdown } from "../components/ColorPickerDropdown";
import { BackgroundEffectPreview } from "../components/BackgroundEffectPreview";
import { EditorSelectDropdown } from "../components/EditorSelectDropdown";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Stage } from "../components/Stage";
import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { emotionMeta } from "../data";
import { navigate } from "../router";
import { persistGeneratedAsset, persistGeneratedAssets } from "../services/asset-storage";
import { createQrExportPayload } from "../services/qr-export";
import { syncProjectToRemote } from "../services/remote-store";
import { exportAnimation, renderFrame, renderFrameDataUrl } from "../services/renderer";
import { publishAnimationForQr } from "../services/share";
import { accentColor, accentEffect, accentEffectBlur, accentEffectOpacity, activeLayer, backgroundEffectBlur, backgroundEffectOpacity, behaviorCapture, editingProject, effectColor, emotion, emoticonTitle, exportAnimationFormat, frameDelayMs, frameImages, frameLayerTransforms, lastSaved, layers, layerTransforms, motionBrief, moveLayer, notify, pendingQrExport, previewLayerOrder, sanitizeAssetUrl, selectedCharacter, selectedFrame, stickers, textBoxShape, textColor, textFont, toggleLayer, transcript, updateLayerTransform } from "../store";
import type { AccentEffect, EditorLayer, EmoticonProject, LayerKind, StickerItem, TextBoxShape, TextFont } from "../types";
import characterMain from "../assets/images/character-main.webp";

const layerIcons: Record<LayerKind, "image" | "star" | "layers" | "edit"> = { "background-effects": "image", character: "layers", "accent-effects": "star", text: "edit" };
const accentOptions: Array<{ value: AccentEffect; label: string }> = [
  { value: "stars", label: "별" },
  { value: "petals", label: "꽃잎" },
  { value: "hearts", label: "하트" },
  { value: "sparkles", label: "반짝이" },
  { value: "speech-bubbles", label: "말풍선" },
  { value: "clouds", label: "구름" },
];

const fontOptions = [
  { value: "Pretendard", label: "프리텐다드", fontFamily: "Pretendard" },
  { value: "Paperlogy", label: "페이퍼로지", fontFamily: "Paperlogy" },
] as const;

const textShapeOptions = [
  { value: "rounded", label: "라운드 박스", previewClassName: "shape-rounded" },
  { value: "pill", label: "둥근 타원", previewClassName: "shape-pill" },
  { value: "caption", label: "말풍선", previewClassName: "shape-caption" },
] as const;

export function EditPage() {
  const [exporting, setExporting] = useState(false); const [density, setDensity] = useState(64);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const exportLockRef = useRef(false);
  const [dragId, setDragId] = useState<LayerKind>(); const [dragPreview, setDragPreview] = useState<EditorLayer[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: LayerKind; position: "before" | "after" } | null>(null); const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const activeLayerId = activeLayer.value;
  const transform = activeLayerId ? layerTransforms.value[activeLayerId] : null; const active = activeLayerId ? layers.value.find((layer) => layer.id === activeLayerId) : null;
  const displayedLayers = dragPreview ?? layers.value;
  useEffect(() => {
    if (frameImages.value.length > 0 || !selectedCharacter.value.sourceAsset) return;
    const source = sanitizeAssetUrl(selectedCharacter.value.sourceAsset);
    frameImages.value = Array.from({ length: FRAME_COUNT }, () => source);
  }, []);
  useEffect(() => {
    if (!emoticonTitle.value.trim()) emoticonTitle.value = editingProject.value?.sticker.title || transcript.value.trim().slice(0, 12) || "새 이모티콘";
  }, []);
  const beginLayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, sourceId: LayerKind) => {
    if (event.button !== 0 || sourceId === "background-effects") return;
    event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget as HTMLButtonElement; handle.setPointerCapture(event.pointerId);
    const original = [...layers.value]; const start = { x: event.clientX, y: event.clientY }; let currentPreview: EditorLayer[] | null = null; let moved = false;
    setDragId(sourceId); setDragPreview(original); setDragPoint(start); setDropTarget(null);
    const move = (next: PointerEvent) => {
      next.preventDefault(); setDragPoint({ x: next.clientX, y: next.clientY });
      if (Math.hypot(next.clientX - start.x, next.clientY - start.y) < 4) return;
      moved = true;
      const row = document.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>("[data-layer-id]");
      const targetId = row?.dataset.layerId as LayerKind | undefined;
      if (!row || !targetId || targetId === sourceId) { currentPreview = null; setDragPreview(original); setDropTarget(null); return; }
      const position = next.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 ? "before" : "after";
      currentPreview = previewLayerOrder(original, sourceId, targetId, position); setDragPreview(currentPreview); setDropTarget({ id: targetId, position });
    };
    const finish = (cancelled = false) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      if (!cancelled && moved && currentPreview) {
        layers.value = currentPreview; const index = currentPreview.findIndex((layer) => layer.id === sourceId); const label = currentPreview[index]?.label ?? "레이어";
        notify(`${label} 레이어를 ${index + 1}번째 위치로 옮겼어요.`);
      } else if (!cancelled && moved) notify("레이어 행의 위쪽이나 아래쪽에 놓아주세요.");
      setDragId(undefined); setDragPreview(null); setDropTarget(null); setDragPoint(null);
    };
    const up = () => finish(false); const cancel = () => finish(true);
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up, { once: true }); window.addEventListener("pointercancel", cancel, { once: true });
  };

  const buildAndSave = async (): Promise<EmoticonProject> => {
    const original = editingProject.value;
    const renderOptions = {
      characterUrl: sanitizeAssetUrl(selectedCharacter.value.sourceAsset),
      characterFrames: frameImages.value,
      brief: motionBrief.value,
      layers: layers.value,
      transforms: layerTransforms.value,
      frameTransforms: frameLayerTransforms.value,
      textShape: textBoxShape.value,
      textFont: textFont.value,
      textColor: textColor.value,
      backgroundEffectStyle: { blur: backgroundEffectBlur.value, opacity: backgroundEffectOpacity.value },
      accentEffectStyle: { blur: accentEffectBlur.value, opacity: accentEffectOpacity.value },
      width: EXPORT_SIZE,
      height: EXPORT_SIZE,
    };
    const [animation, thumbnailSource] = await Promise.all([exportAnimation(renderOptions, "APNG"), renderFrameDataUrl(renderOptions, 0)]);
    const now = new Date().toISOString(); const id = original?.id ?? `emove-${Date.now()}`;
    const originalSticker = original?.sticker;
    const title = normalizedStickerTitle(originalSticker?.title);
    emoticonTitle.value = title;
    exportAnimationFormat.value = animation.format;
    if (frameImages.value.length !== FRAME_COUNT) {
      throw new Error(`캐릭터 행동 프레임은 정확히 ${FRAME_COUNT}개여야 합니다.`);
    }
    const [sharedAnimation, thumbnailAsset, storedFrames] = await Promise.all([
      publishAnimationForQr(animation.blob, { fileName: `${safeFileName(title)}.${animation.extension}`, format: animation.format, projectId: id, title }),
      persistGeneratedAsset(thumbnailSource, { fileName: `${safeFileName(title)}-thumbnail.png`, kind: "thumbnails" }),
      persistGeneratedAssets(frameImages.value, { filePrefix: `${id}-frame`, kind: "frames" }),
    ]);
    if (!sharedAnimation.enabled || !sharedAnimation.url || !sharedAnimation.path) {
      throw new Error(sharedAnimation.error || "완성 애니메이션을 Firebase Storage에 저장하지 못했습니다.");
    }
    if (!thumbnailAsset.enabled || !thumbnailAsset.url) {
      throw new Error(thumbnailAsset.error || "썸네일을 Firebase Storage에 저장하지 못했습니다.");
    }
    const failedFrame = storedFrames.assets.find((asset) => !asset.enabled || !asset.url || /^(data:|blob:)/.test(asset.url));
    if (failedFrame || storedFrames.assets.length !== FRAME_COUNT) {
      throw new Error(failedFrame?.error || storedFrames.warning || "5개 캐릭터 행동 프레임을 Firebase Storage에 저장하지 못했습니다.");
    }
    const storedFrameUrls = storedFrames.assets.map((asset) => asset.url);
    const thumbnail = thumbnailAsset.url;
    const sticker: StickerItem = {
      id: originalSticker?.id ?? id,
      title,
      phrase: transcript.value,
      emotion: emotion.value,
      image: thumbnail,
      animatedImage: sharedAnimation.url,
      animationFormat: animation.format,
      animationStoragePath: sharedAnimation.path ?? originalSticker?.animationStoragePath,
      thumbnail,
      projectId: id,
      gifStoragePath: sharedAnimation.path ?? originalSticker?.gifStoragePath,
      group: originalSticker?.group,
      frameDelayMs: frameDelayMs.value,
      color: effectColor.value,
      favorite: originalSticker?.favorite ?? false,
      ownerId: "public",
      isDefault: false,
      isPublished: originalSticker?.isPublished ?? false,
      characterTokenId: selectedCharacter.value.id,
      createdAt: originalSticker?.createdAt ?? original?.createdAt ?? now,
      updatedAt: now,
    };
    const { videoBlob: _video, audioBlob: _audio, ...captureMeta } = behaviorCapture.value;
    const project: EmoticonProject = { id, ownerId: "public", sticker, gifBlob: animation.blob, animationBlob: animation.blob, animationFormat: animation.format, characterToken: selectedCharacter.value, behaviorCapture: captureMeta, frameImages: storedFrameUrls, layers: layers.value, layerTransforms: layerTransforms.value, frameLayerTransforms: frameLayerTransforms.value, textStyle: { shape: textBoxShape.value, font: textFont.value, color: textColor.value }, effectSettings: { background: { blur: backgroundEffectBlur.value, opacity: backgroundEffectOpacity.value }, accent: { blur: accentEffectBlur.value, opacity: accentEffectOpacity.value } }, motionBrief: motionBrief.value, createdAt: original?.createdAt ?? now, updatedAt: now };
    const sync = await syncProjectToRemote(project);
    if (!sync.enabled) {
      throw new Error(sync.storageWarning || "프로젝트 메타데이터를 Firebase Storage에 저장하지 못했습니다.");
    }
    const currentIndex = stickers.value.findIndex((item) => item.id === project.sticker.id);
    stickers.value = currentIndex >= 0
      ? stickers.value.map((item, index) => (index === currentIndex ? project.sticker : item))
      : [project.sticker, ...stickers.value];
    editingProject.value = project;
    lastSaved.value = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    frameImages.value = storedFrameUrls;
    pendingQrExport.value = await createQrExportPayload(project.sticker);
    notify(original ? "원본 이모티콘을 Firebase Storage에 덮어 저장했어요." : "이모티콘을 Firebase Storage에 저장했어요.");
    return project;
  };

  const save = async () => {
    if (exportLockRef.current) return;
    exportLockRef.current = true;
    setExporting(true);
    setSaveError(null);
    try {
      await buildAndSave();
      navigate("/library");
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : "저장에 실패했습니다.";
      const message = `저장에 실패했습니다. Firebase Storage 설정과 연결을 확인한 뒤 저장하기 버튼을 다시 눌러 주세요. ${detail}`;
      setSaveError(message);
      notify(message);
    }
    finally { exportLockRef.current = false; setExporting(false); }
  };


  return (
    <>
      <div className={`editor-page is-layer-${activeLayerId ?? "none"}`}>
        <header className="screen-brief edit-brief">
          <h1>이모티콘의 이펙트와 텍스트를<br/>자유롭게 수정하세요.</h1>
        </header>

        {/* Edit 화면 전체 그리드 구조 */}
        <div className="editor-grid">

          {/* 1. 레이어 선택 페널 */}
          <Panel className="layer-settings">

              {/* 레이어 목록 */}
              <aside className="layer-list">

                {displayedLayers.map((layer, index) => (
                  <div
                    key={layer.id}
                    data-layer-id={layer.id}
                    role="group"
                    aria-label={`${layer.label} 레이어`}
                    className={`layer-row ${
                      activeLayer.value === layer.id ? "active" : ""
                    } ${
                      dragId === layer.id ? "is-dragging" : ""
                    } ${
                      dropTarget?.id === layer.id
                        ? `drop-${dropTarget.position}`
                        : ""
                    }`}
                    onClick={() => (activeLayer.value = layer.id)}
                    onFocusCapture={() => (activeLayer.value = layer.id)}
                  >

                    <button
                      className="drag-handle-button"
                      type="button"
                      aria-label={`${layer.label} 레이어 선택 및 순서 이동`}
                      disabled={layer.id === "background-effects"}
                      onPointerDown={(event) =>
                        beginLayerDrag(event, layer.id)
                      }
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowUp" ||
                          event.key === "ArrowDown"
                        ) {
                          event.preventDefault();
                          event.stopPropagation();

                          moveLayer(
                            layer.id,
                            event.key === "ArrowUp" ? -1 : 1
                          );

                          notify(
                            `${layer.label} 레이어 순서를 옮겼어요.`
                          );
                        }
                      }}
                    >
                      <Icon
                        name="drag"
                        className="drag-handle"
                        draggable={false}
                      />
                    </button>

                    <span className="layer-title">
                      <strong>{layer.label}</strong>
                    </span>

                  </div>
                ))}

              </aside>

              {/* 레이어 속성 */}
              <section className="layer-editor">

                {activeLayerId === "character" && (
                  <section className="character-panel">

                    {/* 캐릭터 미리보기 */}
                    <div className="character-preview-section">

                      <h3 className="character-section-title">
                        캐릭터 정보
                      </h3>

                      <div className="character-preview">

                        <span className="character-tag">
                          남극의 펭귄
                        </span>

                        <img
                          src={
                            selectedCharacter.value?.sourceAsset
                              ? sanitizeAssetUrl(selectedCharacter.value.sourceAsset)
                              : "/assets/images/character-main.webp"
                          }
                          alt={selectedCharacter.value?.name ?? "캐릭터"}
                          className="character-image"
                        />

                      </div>

                    </div>

                    {/* 우측 : 캐릭터 정보 */}
                    <div className="character-info">

                      <div className="character-group">
                        <h3>캐릭터 타입</h3>

                        <div className="option-row">
                          <button className="property-value">동물</button>

                          <span className="arrow">▶</span>

                          <button className="property-value">펭귄</button>
                        </div>
                      </div>

                      <div className="character-group">
                        <h3>생성 스타일</h3>

                        <div className="option-row">
                          <button className="property-value">3D</button>
                          <button className="property-value">Soft 3D</button>
                        </div>
                      </div>

                      <div className="character-group">
                        <h3>컬러 팔레트</h3>

                        <div className="palette-row">

                          <span className="palette-name">
                            Soft Pastel
                          </span>

                          <button className="color mint"></button>
                          <button className="color purple"></button>
                          <button className="color pink"></button>
                          <button className="color yellow"></button>
                          <button className="color blue"></button>

                        </div>
                      </div>

                    </div>

                  </section>
                )}

                {activeLayerId === "accent-effects" && (
                  <section className="effect-editor-panel" aria-label="부가 이펙트 편집">
                    <div className="effect-preset-browser">
                      <header>
                        <div>
                          <h3>부가 이펙트</h3>
                          <p>스티커처럼 더할 효과를 선택합니다.</p>
                        </div>
                        <button
                          type="button"
                          className={accentEffect.value === "none" ? "active" : ""}
                          onClick={() => (accentEffect.value = "none")}
                        >
                          효과 없음
                        </button>
                      </header>
                      <div className="effect-preset-grid">
                        {accentOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={accentEffect.value === option.value ? "active" : ""}
                            aria-pressed={accentEffect.value === option.value}
                            onClick={() => (accentEffect.value = option.value)}
                          >
                            <span className={`accent-effect-glyph is-${option.value}`} style={{ color: accentColor.value }} aria-hidden="true">
                              <Icon name={option.value === "speech-bubbles" ? "image" : "star"} size={24} />
                            </span>
                            <strong>{option.label}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="effect-detail-controls">
                      <div className="effect-control-group">
                        <span className="effect-control-label">스티커 색상</span>
                        <ColorPickerDropdown
                          value={accentColor.value}
                          onChange={(color) => (accentColor.value = color)}
                          ariaLabel="부가 이펙트 색상 선택"
                        />
                      </div>
                      <EffectSlider
                        label="블러"
                        value={accentEffectBlur.value}
                        max={24}
                        suffix="px"
                        onChange={(value) => (accentEffectBlur.value = value)}
                      />
                      <EffectSlider
                        label="투명도"
                        value={accentEffectOpacity.value}
                        max={100}
                        suffix="%"
                        onChange={(value) => (accentEffectOpacity.value = value)}
                      />
                    </div>
                  </section>
                )}

                {activeLayerId === "background-effects" && (
                  <section className="effect-editor-panel" aria-label="고정 배경 이펙트 정보">
                    <div className="background-effect-card">
                      <span className="effect-lock-badge"><Icon name="lock" size={13} /> 감정 분석 자동 고정</span>
                      <BackgroundEffectPreview />
                    </div>
                    <div className="effect-detail-controls background-effect-controls">
                      <div className="fixed-effect-summary">
                        <span>분석 감정</span>
                        <strong>{emotionMeta[emotion.value].label} · {emotionMeta[emotion.value].effect}</strong>
                        <small>이펙트 종류와 대표 색상은 분석 결과에 따라 고정됩니다.</small>
                      </div>
                      <div className="fixed-effect-color" aria-label={`고정 대표 색상 ${emotionMeta[emotion.value].color}`}>
                        <span>고정 대표 색상</span>
                        <strong>{emotionMeta[emotion.value].color}</strong>
                        <i style={{ background: emotionMeta[emotion.value].color }} aria-hidden="true" />
                      </div>
                      <EffectSlider
                        label="블러"
                        value={backgroundEffectBlur.value}
                        max={24}
                        suffix="px"
                        onChange={(value) => (backgroundEffectBlur.value = value)}
                      />
                      <EffectSlider
                        label="투명도"
                        value={backgroundEffectOpacity.value}
                        max={100}
                        suffix="%"
                        onChange={(value) => (backgroundEffectOpacity.value = value)}
                      />
                    </div>
                  </section>
                )}

                {activeLayerId === "text" && (
                  <div className="text-style-controls">
                  <label className="text-field">
                    <span>텍스트 내용</span>
                    <textarea
                      rows={3}
                      value={transcript.value}
                      onChange={(event) =>
                        (transcript.value = event.currentTarget.value)
                      }
                    />
                  </label>

                  <div className="text-control-grid">

                    <label className="control-item">
                      <span>폰트 스타일</span>
                      <EditorSelectDropdown<TextFont>
                        value={textFont.value}
                        options={fontOptions}
                        onChange={(value) => (textFont.value = value)}
                        ariaLabel="폰트 스타일 선택"
                      />
                    </label>

                    <label className="control-item">
                      <span>말풍선 모양</span>
                      <EditorSelectDropdown<TextBoxShape>
                        value={textBoxShape.value}
                        options={textShapeOptions}
                        onChange={(value) => (textBoxShape.value = value)}
                        ariaLabel="말풍선 모양 선택"
                      />
                    </label>

                    <div className="control-item color-picker-field">
                      <span>텍스트 색상</span>
                      <ColorPickerDropdown
                        value={textColor.value}
                        onChange={(color) => (textColor.value = color)}
                        ariaLabel="텍스트 색상 선택"
                      />
                    </div>

                  </div>
                </div>
                )}

              </section>

          </Panel>

          {/* 2. 에디터 스테이지 */}
          <div className={`editor-stage${previewing ? " is-previewing" : ""}`}>
            {previewing ? <LoopPreview /> : <Stage />}

              {/* 스테이지 - 레이어 정보 패널 */}
              <Panel className="layer-properties">

                  <div className="layer-properties-header">
                    <h3>레이어 위치 및 변환</h3>
                  </div>

                {activeLayerId && activeLayerId !== "background-effects" && transform ? (
                  <div className="property-grid">
                    <label>
                      <span>X</span>
                      <input
                        type="number"
                        value={Math.round(transform.x)}
                        onChange={(event) =>
                          updateLayerTransform(activeLayerId, {
                            x: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>Y</span>
                      <input
                        type="number"
                        value={Math.round(transform.y)}
                        onChange={(event) =>
                          updateLayerTransform(activeLayerId, {
                            y: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>크기(%)</span>
                      <input
                        type="number"
                        min="25"
                        max="240"
                        value={Math.round(transform.scale * 100)}
                        onChange={(event) =>
                          updateLayerTransform(activeLayerId, {
                            scale: Number(event.currentTarget.value) / 100,
                          })
                        }
                      />
                    </label>

                    <label>
                      <span>회전(°)</span>
                      <input
                        type="number"
                        value={Math.round(transform.rotation)}
                        onChange={(event) =>
                          updateLayerTransform(activeLayerId, {
                            rotation: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <p className="no-layer-selected">
                    캔버스 요소나 타임라인 레이어를 선택하면 위치, 크기,
                    회전을 조정할 수 있어요.
                  </p>
                )}

                {activeLayerId && activeLayerId !== "background-effects" && active ? (
                  <div className="field-group">
                    <span className="field-label">레이어 상태</span>

                    <div className="state-buttons">
                      <button
                        type="button"
                        onClick={() =>
                          toggleLayer(activeLayerId, "visible")
                        }
                      >
                        {active.visible ? "표시" : "숨김"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          toggleLayer(activeLayerId, "locked")
                        }
                      >
                        {active.locked ? "잠김" : "편집"}
                      </button>
                    </div>
                  </div>
                ) : null}

              </Panel>
          
          </div>


        </div>

        {/* 타임라인 패널 */}
        <div className="timeline">

          <header>
            <div>
              <h1>프레임</h1>
            </div>

            <div>
              <button
                className="icon-button"
                type="button"
                onClick={() =>
                  (selectedFrame.value =
                    selectedFrame.value === 0 ? 4 : selectedFrame.value - 1)
                }
              >
                <Icon name="previous" />
              </button>

             <span className="frame-counter">
                FRAME {selectedFrame.value + 1} / 5
              </span>

              <button
                className="icon-button"
                type="button"
                onClick={() =>
                  (selectedFrame.value =
                    selectedFrame.value === 4 ? 0 : selectedFrame.value + 1)
                }
              >
                <Icon name="next" />
              </button>
            </div>
          </header>

          {/* 다섯 프레임 타임라인 */}
          <div className="timeline-body">
              {Array.from({ length: FRAME_COUNT }).map((_, index) => { const image = frameImages.value[index]; const hasImage = !!image;
            return ( <button
            key={index}
            type="button"
            className={selectedFrame.value === index ? "active" : ""}
            onClick={() => (selectedFrame.value = index)}
            >
<img
  src={hasImage ? image : characterMain.src}
  alt={`${index + 1}번째 프레임`}
  className={!hasImage ? "placeholder" : ""}
/>
            <span>{index + 1}</span></button>);})}
          </div>

          <div className="timeline-controls" aria-label="프레임 편집 이동">
            <button
              className="timeline-step-button"
              type="button"
              disabled={selectedFrame.value === 0}
              onClick={() => (selectedFrame.value = Math.max(0, selectedFrame.value - 1))}
            >
              <Icon name="previous" />
              이전 프레임
            </button>
            <button
              className={`timeline-preview-button${previewing ? " active" : ""}`}
              type="button"
              aria-pressed={previewing}
              onClick={() => setPreviewing((value) => !value)}
            >
              <Icon name={previewing ? "pause" : "play"} />
              <span>{previewing ? "미리보기 정지" : "루프 미리보기"}</span>
            </button>
            {selectedFrame.value < FRAME_COUNT - 1 ? (
              <button
                className="timeline-step-button next"
                type="button"
                onClick={() => (selectedFrame.value = Math.min(FRAME_COUNT - 1, selectedFrame.value + 1))}
              >
                다음 프레임
                <Icon name="next" />
              </button>
            ) : (
              <div className="timeline-save-group">
                <label>
                  <span>이모티콘 이름</span>
                  <input
                    value={emoticonTitle.value}
                    maxLength={28}
                    onChange={(event) => (emoticonTitle.value = event.currentTarget.value)}
                  />
                </label>
                <button className="button primary" type="button" disabled={exporting} onClick={save}>
                  <Icon name="save" />
                  {exporting ? "저장 중" : "저장하기"}
                </button>
              </div>
            )}
          </div>

          {lastSaved.value ? <p className="timeline-save-status">마지막 저장 {lastSaved.value}</p> : null}
          {saveError ? <p className="timeline-save-error" role="alert">{saveError}</p> : null}


        </div>

        {dragId && dragPoint ? <div className="layer-drag-preview" style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}><Icon name={layerIcons[dragId]} /><span><strong>{layers.value.find((layer) => layer.id === dragId)?.label}</strong><small>놓을 위치 미리보기</small></span></div> : null}

      </div>
    </>
  );
}

function normalizedStickerTitle(fallback?: string): string {
  return emoticonTitle.value.replace(/\s+/g, " ").trim().slice(0, 28) || fallback || transcript.value.trim().slice(0, 12) || "새 이모티콘";
}

function safeFileName(value: string): string {
  return (value || "emove").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 40) || "emove";
}

function LoopPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let timeout = 0;
    const renderLoop = async (frame = 0) => {
      const canvas = canvasRef.current; const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !context || cancelled) return;
      await renderFrame(context, {
        characterUrl: sanitizeAssetUrl(selectedCharacter.value.sourceAsset),
        characterFrames: frameImages.value,
        brief: motionBrief.value,
        layers: layers.value,
        transforms: frameLayerTransforms.value[frame] ?? layerTransforms.value,
        frameTransforms: frameLayerTransforms.value,
        textShape: textBoxShape.value,
        textFont: textFont.value,
        textColor: textColor.value,
        backgroundEffectStyle: { blur: backgroundEffectBlur.value, opacity: backgroundEffectOpacity.value },
        accentEffectStyle: { blur: accentEffectBlur.value, opacity: accentEffectOpacity.value },
        width: canvas.width,
        height: canvas.height,
        gifSafe: false,
      }, frame / (FRAME_COUNT - 1));
      timeout = window.setTimeout(() => renderLoop((frame + 1) % FRAME_COUNT), frameDelayMs.value);
    };
    void renderLoop(0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [motionBrief.value, layers.value, frameImages.value, frameLayerTransforms.value, textBoxShape.value, textFont.value, textColor.value, frameDelayMs.value, backgroundEffectBlur.value, backgroundEffectOpacity.value, accentEffectBlur.value, accentEffectOpacity.value]);

  return (
    <div className="loop-preview glass-panel" aria-label="루프 미리보기">
      <header><span>LOOP PREVIEW</span><strong>{frameDelayMs.value}ms / frame</strong></header>
      <canvas ref={canvasRef} width={EXPORT_SIZE} height={EXPORT_SIZE} />
    </div>
  );
}

function EffectSlider({ label, value, max, suffix, onChange }: { label: string; value: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="effect-slider-control">
      <span><strong>{label}</strong><output>{value}{suffix}</output></span>
      <input
        type="range"
        min="0"
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
