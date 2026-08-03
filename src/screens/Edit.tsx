import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Stage } from "../components/Stage";
import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { effectPresets, emotionMeta } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { waitForImageAssets } from "../services/asset-readiness";
import { persistGeneratedAsset } from "../services/asset-storage";
import { syncProjectToRemote } from "../services/remote-store";
import { downloadBlob, exportAnimation, renderFrame, renderFrameDataUrl } from "../services/renderer";
import { saveProject } from "../services/repository";
import { animationExtension, animationMimeType, publishAnimationForQr } from "../services/share";
import { activeLayer, behaviorCapture, coreEffect, coreEffectImage, editingProject, effectColor, emotion, emoticonTitle, exportAnimationFormat, exportGifBlob, exportModalOpen, exportShareUrl, frameDelayMs, frameImages, frameLayerTransforms, lastSaved, layers, layerTransforms, motionBrief, moveLayer, notify, previewLayerOrder, sanitizeAssetUrl, selectedCharacter, selectedFrame, stickers, textBoxShape, textFont, toggleLayer, transcript, updateLayerTransform } from "../store";
import type { AnimationFormat, EditorLayer, EmoticonProject, LayerKind, StickerItem, TextBoxShape, TextFont } from "../types";
import characterMain from "../assets/images/character-main.webp";

const layerIcons: Record<LayerKind, "image" | "star" | "layers" | "edit"> = { "background-effects": "image", character: "layers", "accent-effects": "star", text: "edit" };
const ai = getAIProvider();

export function EditPage() {
  const [exporting, setExporting] = useState(false); const [density, setDensity] = useState(64); const [qr, setQr] = useState<string>();
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string>();
  const [generatingEffect, setGeneratingEffect] = useState(false);
  const effectLockRef = useRef(false);
  const exportLockRef = useRef(false);
  const [dragId, setDragId] = useState<LayerKind>(); const [dragPreview, setDragPreview] = useState<EditorLayer[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: LayerKind; position: "before" | "after" } | null>(null); const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const activeLayerId = activeLayer.value;
  const transform = activeLayerId ? layerTransforms.value[activeLayerId] : null; const active = activeLayerId ? layers.value.find((layer) => layer.id === activeLayerId) : null;
  const displayedLayers = dragPreview ?? layers.value;
  const exportLabel = animationLabel(exportAnimationFormat.value);
  const exportExtension = animationExtension(exportAnimationFormat.value);
  useEffect(() => {
    if (!emoticonTitle.value.trim()) emoticonTitle.value = editingProject.value?.sticker.title || transcript.value.trim().slice(0, 12) || "새 이모티콘";
  }, []);
  useEffect(() => {
    if (!exportModalOpen.value || !exportGifBlob.value) {
      setExportPreviewUrl(undefined);
      return;
    }
    const previewUrl = URL.createObjectURL(exportGifBlob.value);
    setExportPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [exportModalOpen.value, exportGifBlob.value]);
  const chooseCoreEffect = (preset: string) => {
    coreEffect.value = preset;
    coreEffectImage.value = null;
  };
  const generateCoreEffect = async () => {
    if (effectLockRef.current || exportLockRef.current) return;
    effectLockRef.current = true;
    setGeneratingEffect(true);
    try {
      const generatedEffect = await ai.generateCoreEffect(motionBrief.value);
      if (generatedEffect) await waitForImageAssets([generatedEffect]);
      coreEffectImage.value = generatedEffect;
      notify(generatedEffect ? "코어 이펙트 이미지가 화면에 준비되었습니다." : "생성형 코어 이펙트를 만들지 못해 로컬 이펙트로 미리봅니다.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "코어 이펙트 생성에 실패했습니다.");
    } finally {
      effectLockRef.current = false;
      setGeneratingEffect(false);
    }
  };

  const beginLayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, sourceId: LayerKind) => {
    if (event.button !== 0) return;
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
    const renderOptions = { characterUrl: sanitizeAssetUrl(selectedCharacter.value.sourceAsset), characterFrames: frameImages.value, coreEffectUrl: coreEffectImage.value, brief: motionBrief.value, layers: layers.value, transforms: layerTransforms.value, frameTransforms: frameLayerTransforms.value, textShape: textBoxShape.value, textFont: textFont.value, width: EXPORT_SIZE, height: EXPORT_SIZE };
    const [animation, thumbnailSource] = await Promise.all([exportAnimation(renderOptions, "APNG"), renderFrameDataUrl(renderOptions, 0)]);
    const now = new Date().toISOString(); const id = original?.id ?? `emove-${Date.now()}`;
    const originalSticker = original?.sticker;
    const title = normalizedStickerTitle(originalSticker?.title);
    emoticonTitle.value = title;
    exportAnimationFormat.value = animation.format;
    const localAnimationUrl = URL.createObjectURL(animation.blob);
    const sharedAnimation = await publishAnimationForQr(animation.blob, { fileName: `${safeFileName(title)}.${animation.extension}`, format: animation.format, projectId: id, title });
    const thumbnailAsset = await persistGeneratedAsset(thumbnailSource, { fileName: `${safeFileName(title)}-thumbnail.png`, kind: "thumbnails" });
    const thumbnail = thumbnailAsset.url;
    const sticker: StickerItem = {
      id: originalSticker?.id ?? id,
      title,
      phrase: transcript.value,
      emotion: emotion.value,
      image: thumbnail,
      animatedImage: sharedAnimation.url ?? localAnimationUrl,
      animationFormat: animation.format,
      animationStoragePath: sharedAnimation.path ?? originalSticker?.animationStoragePath,
      thumbnail,
      projectId: id,
      gifStoragePath: sharedAnimation.path ?? originalSticker?.gifStoragePath,
      group: originalSticker?.group,
      frameDelayMs: frameDelayMs.value,
      color: effectColor.value,
      favorite: originalSticker?.favorite ?? false,
      ownerId: original?.ownerId ?? originalSticker?.ownerId ?? "local-user",
      isDefault: false,
      isPublished: originalSticker?.isPublished ?? false,
      characterTokenId: selectedCharacter.value.id,
      createdAt: originalSticker?.createdAt ?? original?.createdAt ?? now,
      updatedAt: now,
    };
    const { videoBlob: _video, audioBlob: _audio, ...captureMeta } = behaviorCapture.value;
    let project: EmoticonProject = { id, ownerId: original?.ownerId ?? sticker.ownerId, sticker, gifBlob: animation.blob, animationBlob: animation.blob, animationFormat: animation.format, characterToken: selectedCharacter.value, behaviorCapture: captureMeta, frameImages: frameImages.value, layers: layers.value, layerTransforms: layerTransforms.value, frameLayerTransforms: frameLayerTransforms.value, coreEffectImage: coreEffectImage.value, textStyle: { shape: textBoxShape.value, font: textFont.value }, motionBrief: motionBrief.value, createdAt: original?.createdAt ?? now, updatedAt: now };
    let sync: Awaited<ReturnType<typeof syncProjectToRemote>> = { enabled: false };
    let remoteError: string | null = null;
    try {
      sync = await syncProjectToRemote(project);
    } catch (error) {
      remoteError = error instanceof Error ? error.message : "원격 DB 동기화에 실패했습니다.";
    }
    if (sharedAnimation.url || sharedAnimation.path || sync.downloadUrl || sync.storagePath || sync.ownerId) {
      const remoteAnimationUrl = sharedAnimation.url ?? sync.downloadUrl;
      const remoteAnimationPath = sharedAnimation.path ?? sync.storagePath;
      const syncedSticker = { ...sticker, ownerId: sync.ownerId ?? sticker.ownerId, animatedImage: remoteAnimationUrl ?? sticker.animatedImage, animationStoragePath: remoteAnimationPath ?? sticker.animationStoragePath, gifStoragePath: remoteAnimationPath ?? sticker.gifStoragePath, updatedAt: new Date().toISOString() };
      project = { ...project, ownerId: sync.ownerId ?? project.ownerId, sticker: syncedSticker };
    }
    await saveProject(project);
    const currentIndex = stickers.value.findIndex((item) => item.id === project.sticker.id);
    stickers.value = currentIndex >= 0
      ? stickers.value.map((item, index) => (index === currentIndex ? project.sticker : item))
      : [project.sticker, ...stickers.value];
    editingProject.value = project;
    lastSaved.value = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    exportGifBlob.value = animation.blob; exportShareUrl.value = sharedAnimation.downloadUrl ?? sharedAnimation.url ?? sync.downloadUrl ?? null;
    const savedCopy = original ? "원본 이모티콘을 현재 위치에 덮어 저장했어요." : "이모티콘을 저장했어요.";
    notify(remoteError
      ? `${savedCopy} 원격 DB 동기화 실패: ${remoteError}`
      : sharedAnimation.url
        ? `${savedCopy} QR 공유 링크도 생성했어요.`
        : sharedAnimation.error
          ? `${savedCopy} QR 공유 링크 생성 실패: ${sharedAnimation.error}`
          : sync.storageWarning
            ? `${savedCopy} ${sync.storageWarning}`
            : original
              ? sync.enabled ? "원본 이모티콘을 현재 위치에 덮어 저장하고 원격 DB도 갱신했어요." : "원본 이모티콘을 현재 위치에 덮어 저장했어요."
              : sync.enabled ? `프로젝트와 1024 ${animation.format} 메타데이터를 원격 DB에 저장했어요.` : "이모티콘을 기기에 저장했어요."); return project;
  };

  const save = async () => {
    if (exportLockRef.current || effectLockRef.current) return;
    exportLockRef.current = true;
    setExporting(true);
    try { await buildAndSave(); }
    catch (error) { notify(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { exportLockRef.current = false; setExporting(false); }
  };
  const openExport = async () => {
    if (exportLockRef.current || effectLockRef.current) return;
    exportLockRef.current = true;
    setExporting(true);
    try {
      const project = await buildAndSave();
      const qrTarget = exportShareUrl.value ?? new URL(`/library/${project.sticker.id}`, window.location.origin).toString();
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(qrTarget, { width: 260, margin: 1, color: { dark: "#201E28", light: "#FCFCFC" } }));
      exportModalOpen.value = true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "내보내기에 실패했습니다.");
    } finally {
      exportLockRef.current = false;
      setExporting(false);
    }
  };
  const share = async () => {
    const format = exportAnimationFormat.value;
    if (!exportGifBlob.value) return; const file = new File([exportGifBlob.value], `${safeFileName(emoticonTitle.value || `emove-${emotion.value}`)}.${animationExtension(format)}`, { type: animationMimeType(format) });
    if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: "EMOVE 이모티콘", text: transcript.value, files: [file] }); }
    else { window.location.href = `mailto:?subject=${encodeURIComponent("EMOVE 이모티콘")}&body=${encodeURIComponent(`${format} 다운로드: ${exportShareUrl.value ?? window.location.href}`)}`; }
  };


  return (
    <>
      <div className={`editor-page is-layer-${activeLayerId ?? "none"}`}>
        <header className="screen-brief edit-brief">
          <h1>이모티콘의 이펙트와 텍스트를<br/>자유롭게 수정하세요.</h1>
        </header>

        <header className="editor-toolbar glass-panel"><div className="editor-title-group"><span className="eyebrow">STEP 03 · EDIT</span><strong>{emotionMeta[emotion.value].label} 모션 편집</strong><label className="emoticon-title-control"><span>NAME</span><input value={emoticonTitle.value} maxLength={28} onChange={(event) => (emoticonTitle.value = event.currentTarget.value)} aria-label="이모티콘 저장 이름" /></label></div><div className="toolbar-actions"><span className="save-state">{lastSaved.value ? `${lastSaved.value} 저장됨` : "저장 전"}</span><button className="button secondary" type="button" onClick={save} disabled={exporting || generatingEffect}><Icon name="save" />{exporting ? "저장 중" : "저장"}</button><button className="button primary" type="button" onClick={openExport} disabled={exporting || generatingEffect}><Icon name="download" />{exporting ? `${exportLabel} 만드는 중` : "내보내기"}</button></div></header>

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
                  <>
                    ...
                  </>
                )}

                {activeLayerId === "background-effects" && (
                  <>
                    ...
                  </>
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
                      <select
                        value={textFont.value}
                        onChange={(event) =>
                          (textFont.value =
                            event.currentTarget.value as TextFont)
                        }>
                        <option value="Pretendard">Pretendard</option>
                        <option value="Paperlogy">Paperlogy</option>
                      </select>
                    </label>

                    <label className="control-item">
                      <span>말풍선 모양</span>
                      <select
                        value={textBoxShape.value}
                        onChange={(event) =>
                          (textBoxShape.value =
                            event.currentTarget.value as TextBoxShape)
                        }
                      >
                        <option value="pill">둥근 pill</option>
                        <option value="rounded">라운드</option>
                        <option value="caption">말풍선</option>
                      </select>
                    </label>

                    <label className="control-item color-picker">
                      <span>텍스트 색상</span>
                      <select></select>
                    </label>

                  </div>
                </div>
                )}

              </section>

          </Panel>

          {/* 2. 에디터 스테이지 */}
          <div className="editor-stage"><Stage />

              {/* 스테이지 - 레이어 정보 패널 */}
              <Panel className="layer-properties">

                  <div className="layer-properties-header">
                    <h3>레이어 위치 및 변환</h3>
                  </div>

                {activeLayerId && transform ? (
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

                {activeLayerId && active ? (
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


        </div>

        {dragId && dragPoint ? <div className="layer-drag-preview" style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}><Icon name={layerIcons[dragId]} /><span><strong>{layers.value.find((layer) => layer.id === dragId)?.label}</strong><small>놓을 위치 미리보기</small></span></div> : null}

      </div>
      {exportModalOpen.value && exportGifBlob.value ? <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && (exportModalOpen.value = false)}><section className="export-modal glass-panel" role="dialog" aria-modal="true" aria-label={`${exportLabel} 내보내기`}><header><div><span className="eyebrow">EXPORT COMPLETE</span><h2>{exportLabel}가 준비됐어요.</h2></div><button className="icon-button" type="button" onClick={() => (exportModalOpen.value = false)}><Icon name="close" /></button></header><div className="export-preview">{exportPreviewUrl ? <img src={exportPreviewUrl} alt={`완성된 ${exportLabel}`} /> : null}{qr ? <div className="qr-card"><img src={qr} alt={`${exportAnimationFormat.value} 다운로드 QR 코드`} /><span>모바일에서 바로 보기</span></div> : null}</div><p>{EXPORT_SIZE}×{EXPORT_SIZE} · {FRAME_COUNT} frames · {frameDelayMs.value}ms/frame · {exportLabel}{exportShareUrl.value ? " · QR 공유 링크" : " · 공유 API 연결 시 QR 생성"}</p><div className="export-actions"><button className="button secondary" type="button" onClick={() => downloadBlob(exportGifBlob.value!, `${safeFileName(emoticonTitle.value || "emove")}.${exportExtension}`)}><Icon name="download" />기기에 저장</button><button className="button primary" type="button" onClick={share}><Icon name="next" />메일·앱으로 보내기</button></div></section></div> : null}
    </>
  );
}

function normalizedStickerTitle(fallback?: string): string {
  return emoticonTitle.value.replace(/\s+/g, " ").trim().slice(0, 28) || fallback || transcript.value.trim().slice(0, 12) || "새 이모티콘";
}

function safeFileName(value: string): string {
  return (value || "emove").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 40) || "emove";
}

function animationLabel(format: AnimationFormat): string {
  if (format === "GIF") return "투명 GIF";
  if (format === "WEBP") return "투명 WebP";
  return "투명 APNG";
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
        coreEffectUrl: coreEffectImage.value,
        brief: motionBrief.value,
        layers: layers.value,
        transforms: frameLayerTransforms.value[frame] ?? layerTransforms.value,
        frameTransforms: frameLayerTransforms.value,
        textShape: textBoxShape.value,
        textFont: textFont.value,
        width: canvas.width,
        height: canvas.height,
        gifSafe: false,
      }, frame / (FRAME_COUNT - 1));
      timeout = window.setTimeout(() => renderLoop((frame + 1) % FRAME_COUNT), frameDelayMs.value);
    };
    void renderLoop(0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [motionBrief.value, layers.value, frameImages.value, frameLayerTransforms.value, coreEffectImage.value, textBoxShape.value, textFont.value, frameDelayMs.value]);

  return (
    <div className="loop-preview glass-panel" aria-label="루프 미리보기">
      <header><span>LOOP PREVIEW</span><strong>{frameDelayMs.value}ms / frame</strong></header>
      <canvas ref={canvasRef} width={EXPORT_SIZE} height={EXPORT_SIZE} />
    </div>
  );
}
