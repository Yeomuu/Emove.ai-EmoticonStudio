import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Stage } from "../components/Stage";
import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { effectPresets, emotionMeta } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { syncProjectToRemote } from "../services/remote-store";
import { downloadBlob, exportAnimation, renderFrame, renderFrameDataUrl } from "../services/renderer";
import { saveProject } from "../services/repository";
import { animationExtension, animationMimeType, publishAnimationForQr } from "../services/share";
import { activeLayer, behaviorCapture, coreEffect, coreEffectImage, editingProject, effectColor, emotion, emoticonTitle, exportAnimationFormat, exportGifBlob, exportModalOpen, exportShareUrl, frameDelayMs, frameImages, frameLayerTransforms, lastSaved, layers, layerTransforms, motionBrief, moveLayer, notify, previewLayerOrder, selectedCharacter, selectedFrame, stickers, textBoxShape, textFont, toggleLayer, transcript, updateLayerTransform } from "../store";
import type { AnimationFormat, EditorLayer, EmoticonProject, LayerKind, StickerItem, TextBoxShape, TextFont } from "../types";

const layerIcons: Record<LayerKind, "image" | "star" | "layers" | "edit"> = { "background-effects": "image", character: "layers", "accent-effects": "star", text: "edit" };
const ai = getAIProvider();

export function EditPage() {
  const [exporting, setExporting] = useState(false); const [density, setDensity] = useState(64); const [qr, setQr] = useState<string>();
  const [generatingEffect, setGeneratingEffect] = useState(false);
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
  const chooseCoreEffect = (preset: string) => {
    coreEffect.value = preset;
    coreEffectImage.value = null;
  };
  const generateCoreEffect = async () => {
    setGeneratingEffect(true);
    try {
      coreEffectImage.value = await ai.generateCoreEffect(motionBrief.value);
      notify(coreEffectImage.value ? "코어 이펙트 레이어를 새로 생성했어요." : "생성형 코어 이펙트를 만들지 못해 로컬 이펙트로 미리봅니다.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "코어 이펙트 생성에 실패했습니다.");
    } finally {
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
    const renderOptions = { characterUrl: selectedCharacter.value.sourceAsset, characterFrames: frameImages.value, coreEffectUrl: coreEffectImage.value, brief: motionBrief.value, layers: layers.value, transforms: layerTransforms.value, frameTransforms: frameLayerTransforms.value, textShape: textBoxShape.value, textFont: textFont.value, width: EXPORT_SIZE, height: EXPORT_SIZE };
    const [animation, thumbnail] = await Promise.all([exportAnimation(renderOptions, "APNG"), renderFrameDataUrl(renderOptions, 0)]);
    const now = new Date().toISOString(); const id = original?.id ?? `emove-${Date.now()}`;
    const originalSticker = original?.sticker;
    const title = normalizedStickerTitle(originalSticker?.title);
    emoticonTitle.value = title;
    exportAnimationFormat.value = animation.format;
    const localAnimationUrl = URL.createObjectURL(animation.blob);
    const sharedAnimation = await publishAnimationForQr(animation.blob, { fileName: `${safeFileName(title)}.${animation.extension}`, format: animation.format, projectId: id, title });
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
    exportGifBlob.value = animation.blob; exportShareUrl.value = sharedAnimation.url ?? sync.downloadUrl ?? null;
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

  const save = async () => { setExporting(true); try { await buildAndSave(); } catch (error) { notify(error instanceof Error ? error.message : "저장에 실패했습니다."); } finally { setExporting(false); } };
  const openExport = async () => { setExporting(true); try { await buildAndSave(); if (exportShareUrl.value) { const { default: QRCode } = await import("qrcode"); setQr(await QRCode.toDataURL(exportShareUrl.value, { width: 260, margin: 1, color: { dark: "#201E28", light: "#FCFCFC" } })); } else setQr(undefined); exportModalOpen.value = true; } catch (error) { notify(error instanceof Error ? error.message : "내보내기에 실패했습니다."); } finally { setExporting(false); } };
  const share = async () => {
    const format = exportAnimationFormat.value;
    if (!exportGifBlob.value) return; const file = new File([exportGifBlob.value], `${safeFileName(emoticonTitle.value || `emove-${emotion.value}`)}.${animationExtension(format)}`, { type: animationMimeType(format) });
    if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: "EMOVE 이모티콘", text: transcript.value, files: [file] }); }
    else { window.location.href = `mailto:?subject=${encodeURIComponent("EMOVE 이모티콘")}&body=${encodeURIComponent(`${format} 다운로드: ${exportShareUrl.value ?? window.location.href}`)}`; }
  };

  return (
    <>
      <div className="editor-page">
        <header className="screen-brief edit-brief">
          <span>03</span>
          <h1>이모티콘의 이펙트와 텍스트를 자유롭게 수정하세요.</h1>
          <p>1024×1024 export canvas</p>
        </header>
        <header className="editor-toolbar glass-panel"><div className="editor-title-group"><span className="eyebrow">STEP 03 · EDIT</span><strong>{emotionMeta[emotion.value].label} 모션 편집</strong><label className="emoticon-title-control"><span>NAME</span><input value={emoticonTitle.value} maxLength={28} onChange={(event) => (emoticonTitle.value = event.currentTarget.value)} aria-label="이모티콘 저장 이름" /></label></div><div className="toolbar-actions"><span className="save-state">{lastSaved.value ? `${lastSaved.value} 저장됨` : "저장 전"}</span><button className="button secondary" type="button" onClick={save} disabled={exporting}><Icon name="save" />저장</button><button className="button primary" type="button" onClick={openExport} disabled={exporting}><Icon name="download" />{exporting ? `${exportLabel} 만드는 중` : "내보내기"}</button></div></header>
        <div className="editor-grid">
          <Panel title="Core effect" meta="VOICE → VISUAL" className="effect-settings">
            <div className="effect-hero"><span style={{ background: `${effectColor.value}24` }}><Icon name="star" size={28} /></span><div><small>RECOMMENDED</small><strong>{coreEffect.value}</strong><p>음성 감정에서 제안된 하나의 핵심 효과예요.</p></div></div>
            <div className="field-group"><span className="field-label">코어 이펙트 생성 세트</span><div className="preset-list">{effectPresets.map((preset) => <button key={preset} type="button" className={coreEffect.value === preset ? "active" : ""} onClick={() => chooseCoreEffect(preset)}><i style={{ background: effectColor.value }} />{preset}</button>)}</div></div>
            <label className="color-field"><span><b>이펙트 컬러</b><em>{effectColor.value.toUpperCase()}</em></span><input type="color" value={effectColor.value} onChange={(event) => (effectColor.value = event.currentTarget.value)} /></label>
            <label className="range-field"><span>부가 이펙트 밀도 <strong>{density}</strong></span><input type="range" min="20" max="100" value={density} onChange={(event) => setDensity(Number(event.currentTarget.value))} /></label>
            <button className="button subtle full" type="button" onClick={generateCoreEffect} disabled={generatingEffect}><Icon name={generatingEffect ? "reload" : "star"} className={generatingEffect ? "spin" : ""} />{generatingEffect ? "이펙트 생성 중" : "코어 이펙트 생성"}</button>
            <div className="effect-note"><Icon name="check" /><span>코어 이펙트는 별도 레이어로 생성하고, 부가 이펙트만 고정 별 파츠로 유지합니다.</span></div>
          </Panel>

          <section className="editor-stage-wrap"><div className="editor-stage glass-panel"><Stage /><div className="stage-rulers"><span>EXPORT {EXPORT_SIZE}</span><span>LOOP</span></div></div><p className="canvas-help">행동 프레임은 유지하면서 레이어 위치와 크기만 같은 좌표계로 조정합니다.</p><LoopPreview /></section>

          <Panel title="Layer properties" meta="CANVAS SYNC" className="layer-properties">
            <div className="selected-layer"><Icon name={activeLayerId ? layerIcons[activeLayerId] : "layers"} /><div><small>{activeLayerId ? "SELECTED LAYER" : "NO LAYER SELECTED"}</small><strong>{active?.label ?? "레이어를 선택해 주세요"}</strong></div></div>
            {activeLayerId && transform ? <div className="property-grid"><label><span>X</span><input type="number" value={Math.round(transform.x)} onChange={(event) => updateLayerTransform(activeLayerId, { x: Number(event.currentTarget.value) })} /></label><label><span>Y</span><input type="number" value={Math.round(transform.y)} onChange={(event) => updateLayerTransform(activeLayerId, { y: Number(event.currentTarget.value) })} /></label><label><span>크기 %</span><input type="number" min="25" max="240" value={Math.round(transform.scale * 100)} onChange={(event) => updateLayerTransform(activeLayerId, { scale: Number(event.currentTarget.value) / 100 })} /></label><label><span>회전 °</span><input type="number" value={Math.round(transform.rotation)} onChange={(event) => updateLayerTransform(activeLayerId, { rotation: Number(event.currentTarget.value) })} /></label></div> : <p className="no-layer-selected">캔버스 요소나 타임라인 레이어를 선택하면 위치, 크기, 회전을 조정할 수 있어요.</p>}
            {activeLayerId === "text" ? <div className="text-style-controls">
              <label className="text-field"><span>문구</span><textarea rows={3} value={transcript.value} onChange={(event) => (transcript.value = event.currentTarget.value)} /></label>
              <div className="text-control-grid">
                <label><span>말풍선 모양</span><select value={textBoxShape.value} onChange={(event) => (textBoxShape.value = event.currentTarget.value as TextBoxShape)}><option value="pill">둥근 pill</option><option value="rounded">라운드 박스</option><option value="caption">꼬리 말풍선</option></select></label>
                <label><span>텍스트 폰트</span><select value={textFont.value} onChange={(event) => (textFont.value = event.currentTarget.value as TextFont)}><option value="Pretendard">Pretendard</option><option value="Paperlogy">Paperlogy</option></select></label>
              </div>
            </div> : null}
            {activeLayerId && active ? <div className="field-group"><span className="field-label">레이어 상태</span><div className="state-buttons"><button type="button" onClick={() => toggleLayer(activeLayerId, "visible")}><Icon name="image" />{active.visible ? "표시 중" : "숨김"}</button><button type="button" onClick={() => toggleLayer(activeLayerId, "locked")}><Icon name={active.locked ? "lock" : "unlock"} />{active.locked ? "잠김" : "편집 가능"}</button></div></div> : null}
            <button className="button subtle full" type="button" onClick={() => navigate("/emoticon")}><Icon name="previous" />입력 다시 분석</button>
          </Panel>
        </div>

        <section className="timeline glass-panel">
          <header><div><Icon name="layers" /><strong>4-Layer & 5-Frame editor</strong><span>위 레이어가 캔버스에서도 앞에 표시됩니다</span></div><div><button className="icon-button" type="button" onClick={() => (selectedFrame.value = Math.max(0, selectedFrame.value - 1))}><Icon name="previous" /></button><span>FRAME {selectedFrame.value + 1} / 5</span><button className="icon-button" type="button" onClick={() => (selectedFrame.value = Math.min(4, selectedFrame.value + 1))}><Icon name="next" /></button></div></header>
          <div className="timeline-body">
            <div className="layer-stack">
              {displayedLayers.map((layer, index) => <div key={layer.id} data-layer-id={layer.id} role="button" tabIndex={0} className={`layer-row ${activeLayer.value === layer.id ? "active" : ""} ${dragId === layer.id ? "is-dragging" : ""} ${dropTarget?.id === layer.id ? `drop-${dropTarget.position}` : ""}`} onClick={() => (activeLayer.value = layer.id)}>
                <button className="drag-handle-button" type="button" aria-label={`${layer.label} 레이어 순서 이동`} onPointerDown={(event) => beginLayerDrag(event, layer.id)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); moveLayer(layer.id, event.key === "ArrowUp" ? -1 : 1); notify(`${layer.label} 레이어 순서를 옮겼어요.`); } }}><Icon name="drag" className="drag-handle" draggable={false} /></button>
                <span className="layer-icon"><Icon name={layerIcons[layer.id]} /></span><span className="layer-copy"><strong>{layer.label}</strong><small>{layer.description}</small></span><span className="layer-order">{4 - index}</span><span className="layer-controls"><i onClick={(event) => { event.stopPropagation(); toggleLayer(layer.id, "visible"); }}><Icon name={layer.visible ? "check" : "close"} size={13} /></i><i onClick={(event) => { event.stopPropagation(); toggleLayer(layer.id, "locked"); }}><Icon name={layer.locked ? "lock" : "unlock"} size={14} /></i></span><span className="layer-move"><i onClick={(event) => { event.stopPropagation(); moveLayer(layer.id, -1); }}><Icon name="previous" size={13} className="rotate-up" /></i><i onClick={(event) => { event.stopPropagation(); moveLayer(layer.id, 1); }}><Icon name="next" size={13} className="rotate-down" /></i></span>
              </div>)}
              <p className={`layer-drag-guide ${dragId ? "active" : ""}`} aria-live="polite">{dragId ? dropTarget ? `${layers.value.find((layer) => layer.id === dragId)?.label} → ${layers.value.find((layer) => layer.id === dropTarget.id)?.label} ${dropTarget.position === "before" ? "위" : "아래"}` : "다른 레이어 행 위로 끌어주세요" : "점 핸들을 끌면 놓일 위치를 미리 볼 수 있어요"}</p>
            </div>
            <div className="frame-track"><div className="frame-grid">{frameImages.value.map((image, index) => <button key={`${image}-${index}`} type="button" className={selectedFrame.value === index ? "active" : ""} onClick={() => (selectedFrame.value = index)}><img src={image} alt={`${index + 1}번째 동작 프레임`} /><span>FRAME {String(index + 1).padStart(2, "0")}</span></button>)}</div></div>
          </div>
        </section>
        {dragId && dragPoint ? <div className="layer-drag-preview" style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}><Icon name={layerIcons[dragId]} /><span><strong>{layers.value.find((layer) => layer.id === dragId)?.label}</strong><small>놓을 위치 미리보기</small></span></div> : null}
      </div>
      {exportModalOpen.value && exportGifBlob.value ? <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && (exportModalOpen.value = false)}><section className="export-modal glass-panel" role="dialog" aria-modal="true" aria-label={`${exportLabel} 내보내기`}><header><div><span className="eyebrow">EXPORT COMPLETE</span><h2>{exportLabel}가 준비됐어요.</h2></div><button className="icon-button" type="button" onClick={() => (exportModalOpen.value = false)}><Icon name="close" /></button></header><div className="export-preview"><img src={URL.createObjectURL(exportGifBlob.value)} alt={`완성된 ${exportLabel}`} />{qr ? <div className="qr-card"><img src={qr} alt={`${exportAnimationFormat.value} 다운로드 QR 코드`} /><span>모바일에서 바로 보기</span></div> : null}</div><p>{EXPORT_SIZE}×{EXPORT_SIZE} · {FRAME_COUNT} frames · {frameDelayMs.value}ms/frame · {exportLabel}{exportShareUrl.value ? " · QR 공유 링크" : " · 공유 API 연결 시 QR 생성"}</p><div className="export-actions"><button className="button secondary" type="button" onClick={() => downloadBlob(exportGifBlob.value!, `${safeFileName(emoticonTitle.value || "emove")}.${exportExtension}`)}><Icon name="download" />기기에 저장</button><button className="button primary" type="button" onClick={share}><Icon name="next" />메일·앱으로 보내기</button></div></section></div> : null}
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
        characterUrl: selectedCharacter.value.sourceAsset,
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
