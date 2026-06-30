import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Shell";
import { Stage } from "../components/Stage";
import { EXPORT_SIZE, FRAME_COUNT } from "../constants";
import { effectPresets, emotionMeta } from "../data";
import { navigate } from "../router";
import { getAIProvider } from "../services/ai-provider";
import { syncProjectToFirebase } from "../services/firebase";
import { downloadBlob, exportGif, renderFrame, renderFrameDataUrl } from "../services/renderer";
import { saveProject } from "../services/repository";
import { activeLayer, behaviorCapture, coreEffect, coreEffectImage, editingProject, effectColor, emotion, emoticonTitle, exportGifBlob, exportModalOpen, exportShareUrl, frameDelayMs, frameImages, frameLayerTransforms, lastSaved, layers, layerTransforms, motionBrief, moveLayer, notify, previewLayerOrder, selectedCharacter, selectedFrame, stickers, textBoxShape, textFont, toggleLayer, transcript, updateLayerTransform } from "../store";
import type { EditorLayer, EmoticonProject, LayerKind, StickerItem, TextBoxShape, TextFont } from "../types";

const layerIcons: Record<LayerKind, "image" | "star" | "layers" | "edit"> = { "background-effects": "image", character: "layers", "accent-effects": "star", text: "edit" };
const ai = getAIProvider();

export function EditPage() {
  const [exporting, setExporting] = useState(false); const [density, setDensity] = useState(64); const [qr, setQr] = useState<string>();
  const [generatingEffect, setGeneratingEffect] = useState(false);
  const [dragId, setDragId] = useState<LayerKind>(); const [dragPreview, setDragPreview] = useState<EditorLayer[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: LayerKind; position: "before" | "after" } | null>(null); const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const transform = layerTransforms.value[activeLayer.value]; const active = layers.value.find((layer) => layer.id === activeLayer.value);
  const displayedLayers = dragPreview ?? layers.value;
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

  const beginLayerDrag = (event: PointerEvent, sourceId: LayerKind) => {
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
    const [gifBlob, thumbnail] = await Promise.all([exportGif(renderOptions), renderFrameDataUrl(renderOptions, 0)]);
    const now = new Date().toISOString(); const id = original?.id ?? `emove-${Date.now()}`;
    const originalSticker = original?.sticker;
    const title = normalizedStickerTitle(originalSticker?.title);
    emoticonTitle.value = title;
    const localGifUrl = URL.createObjectURL(gifBlob);
    const sticker: StickerItem = {
      id: originalSticker?.id ?? id,
      title,
      phrase: transcript.value,
      emotion: emotion.value,
      image: thumbnail,
      animatedImage: localGifUrl,
      thumbnail,
      projectId: id,
      gifStoragePath: originalSticker?.gifStoragePath,
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
    let project: EmoticonProject = { id, ownerId: original?.ownerId ?? sticker.ownerId, sticker, gifBlob, characterToken: selectedCharacter.value, behaviorCapture: captureMeta, frameImages: frameImages.value, layers: layers.value, layerTransforms: layerTransforms.value, frameLayerTransforms: frameLayerTransforms.value, coreEffectImage: coreEffectImage.value, textStyle: { shape: textBoxShape.value, font: textFont.value }, motionBrief: motionBrief.value, createdAt: original?.createdAt ?? now, updatedAt: now };
    let sync: Awaited<ReturnType<typeof syncProjectToFirebase>> = { enabled: false };
    let firebaseError: string | null = null;
    try {
      sync = await syncProjectToFirebase(project);
    } catch (error) {
      firebaseError = error instanceof Error ? error.message : "Firebase 동기화에 실패했습니다.";
    }
    if (sync.downloadUrl || sync.storagePath || sync.ownerId) {
      const syncedSticker = { ...sticker, ownerId: sync.ownerId ?? sticker.ownerId, animatedImage: sync.downloadUrl ?? sticker.animatedImage, gifStoragePath: sync.storagePath ?? sticker.gifStoragePath, updatedAt: new Date().toISOString() };
      project = { ...project, ownerId: sync.ownerId ?? project.ownerId, sticker: syncedSticker };
    }
    await saveProject(project);
    const currentIndex = stickers.value.findIndex((item) => item.id === project.sticker.id);
    stickers.value = currentIndex >= 0
      ? stickers.value.map((item, index) => (index === currentIndex ? project.sticker : item))
      : [project.sticker, ...stickers.value];
    editingProject.value = project;
    lastSaved.value = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    exportGifBlob.value = gifBlob; exportShareUrl.value = sync.downloadUrl ?? null;
    notify(firebaseError
      ? `${original ? "원본 이모티콘을 현재 위치에 덮어 저장했어요." : "이모티콘을 기기에 저장했어요."} Firebase 동기화 실패: ${firebaseError}`
      : sync.storageWarning
        ? `${original ? "원본 이모티콘을 현재 위치에 덮어 저장했어요." : "이모티콘을 저장했어요."} Firebase 메타데이터는 저장했고, GIF 직접 링크는 Storage 설정 후 사용할 수 있어요.`
      : original
        ? sync.enabled ? "원본 이모티콘을 현재 위치에 덮어 저장하고 Firebase도 갱신했어요." : "원본 이모티콘을 현재 위치에 덮어 저장했어요."
        : sync.enabled ? "프로젝트와 1024 GIF를 Firebase에 저장했어요." : "Firebase 연결이 없어 QR 직접 다운로드 링크 없이 기기에 저장했어요."); return project;
  };

  const save = async () => { setExporting(true); try { await buildAndSave(); } catch (error) { notify(error instanceof Error ? error.message : "저장에 실패했습니다."); } finally { setExporting(false); } };
  const openExport = async () => { setExporting(true); try { await buildAndSave(); if (exportShareUrl.value) { const { default: QRCode } = await import("qrcode"); setQr(await QRCode.toDataURL(exportShareUrl.value, { width: 260, margin: 1, color: { dark: "#201E28", light: "#FCFCFC" } })); } else setQr(undefined); exportModalOpen.value = true; } catch (error) { notify(error instanceof Error ? error.message : "내보내기에 실패했습니다."); } finally { setExporting(false); } };
  const share = async () => {
    if (!exportGifBlob.value) return; const file = new File([exportGifBlob.value], `${safeFileName(emoticonTitle.value || `emove-${emotion.value}`)}.gif`, { type: "image/gif" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: "EMOVE 이모티콘", text: transcript.value, files: [file] }); }
    else { window.location.href = `mailto:?subject=${encodeURIComponent("EMOVE 이모티콘")}&body=${encodeURIComponent(`GIF 다운로드: ${exportShareUrl.value ?? window.location.href}`)}`; }
  };

  return (
    <>
      <div class="editor-page">
        <header class="editor-toolbar glass-panel"><div class="editor-title-group"><span class="eyebrow">STEP 03 · EDIT</span><strong>{emotionMeta[emotion.value].label} 모션 편집</strong><label class="emoticon-title-control"><span>NAME</span><input value={emoticonTitle.value} maxLength={28} onInput={(event) => (emoticonTitle.value = event.currentTarget.value)} aria-label="이모티콘 저장 이름" /></label></div><div class="toolbar-actions"><span class="save-state">{lastSaved.value ? `${lastSaved.value} 저장됨` : "저장 전"}</span><button class="button secondary" type="button" onClick={save} disabled={exporting}><Icon name="save" />저장</button><button class="button primary" type="button" onClick={openExport} disabled={exporting}><Icon name="download" />{exporting ? "투명 GIF 만드는 중" : "내보내기"}</button></div></header>
        <div class="editor-grid">
          <Panel title="Core effect" meta="VOICE → VISUAL" class="effect-settings">
            <div class="effect-hero"><span style={{ background: `${effectColor.value}24` }}><Icon name="star" size={28} /></span><div><small>RECOMMENDED</small><strong>{coreEffect.value}</strong><p>음성 감정에서 제안된 하나의 핵심 효과예요.</p></div></div>
            <div class="field-group"><span class="field-label">코어 이펙트 생성 세트</span><div class="preset-list">{effectPresets.map((preset) => <button type="button" class={coreEffect.value === preset ? "active" : ""} onClick={() => chooseCoreEffect(preset)}><i style={{ background: effectColor.value }} />{preset}</button>)}</div></div>
            <label class="color-field"><span><b>이펙트 컬러</b><em>{effectColor.value.toUpperCase()}</em></span><input type="color" value={effectColor.value} onInput={(event) => (effectColor.value = event.currentTarget.value)} /></label>
            <label class="range-field"><span>부가 이펙트 밀도 <strong>{density}</strong></span><input type="range" min="20" max="100" value={density} onInput={(event) => setDensity(Number(event.currentTarget.value))} /></label>
            <button class="button subtle full" type="button" onClick={generateCoreEffect} disabled={generatingEffect}><Icon name={generatingEffect ? "reload" : "star"} class={generatingEffect ? "spin" : ""} />{generatingEffect ? "이펙트 생성 중" : "코어 이펙트 생성"}</button>
            <div class="effect-note"><Icon name="check" /><span>코어 이펙트는 별도 레이어로 생성하고, 부가 이펙트만 고정 별 파츠로 유지합니다.</span></div>
          </Panel>

          <section class="editor-stage-wrap"><div class="editor-stage glass-panel"><Stage /><div class="stage-rulers"><span>EXPORT {EXPORT_SIZE}</span><span>LOOP</span></div></div><p class="canvas-help">행동 프레임은 유지하면서 레이어 위치와 크기만 같은 좌표계로 조정합니다.</p><LoopPreview /></section>

          <Panel title="Layer properties" meta="CANVAS SYNC" class="layer-properties">
            <div class="selected-layer"><Icon name={layerIcons[activeLayer.value]} /><div><small>SELECTED LAYER</small><strong>{active?.label}</strong></div></div>
            <div class="property-grid"><label><span>X</span><input type="number" value={Math.round(transform.x)} onInput={(event) => updateLayerTransform(activeLayer.value, { x: Number(event.currentTarget.value) })} /></label><label><span>Y</span><input type="number" value={Math.round(transform.y)} onInput={(event) => updateLayerTransform(activeLayer.value, { y: Number(event.currentTarget.value) })} /></label><label><span>크기 %</span><input type="number" min="25" max="240" value={Math.round(transform.scale * 100)} onInput={(event) => updateLayerTransform(activeLayer.value, { scale: Number(event.currentTarget.value) / 100 })} /></label><label><span>회전 °</span><input type="number" value={Math.round(transform.rotation)} onInput={(event) => updateLayerTransform(activeLayer.value, { rotation: Number(event.currentTarget.value) })} /></label></div>
            {activeLayer.value === "text" ? <div class="text-style-controls">
              <label class="text-field"><span>문구</span><textarea rows={3} value={transcript.value} onInput={(event) => (transcript.value = event.currentTarget.value)} /></label>
              <div class="text-control-grid">
                <label><span>말풍선 모양</span><select value={textBoxShape.value} onChange={(event) => (textBoxShape.value = event.currentTarget.value as TextBoxShape)}><option value="pill">둥근 pill</option><option value="rounded">라운드 박스</option><option value="caption">꼬리 말풍선</option></select></label>
                <label><span>텍스트 폰트</span><select value={textFont.value} onChange={(event) => (textFont.value = event.currentTarget.value as TextFont)}><option value="Pretendard">Pretendard</option><option value="Paperlogy">Paperlogy</option></select></label>
              </div>
            </div> : null}
            <div class="field-group"><span class="field-label">레이어 상태</span><div class="state-buttons"><button type="button" onClick={() => toggleLayer(activeLayer.value, "visible")}><Icon name="image" />{active?.visible ? "표시 중" : "숨김"}</button><button type="button" onClick={() => toggleLayer(activeLayer.value, "locked")}><Icon name={active?.locked ? "lock" : "unlock"} />{active?.locked ? "잠김" : "편집 가능"}</button></div></div>
            <button class="button subtle full" type="button" onClick={() => navigate("/input")}><Icon name="previous" />입력 다시 분석</button>
          </Panel>
        </div>

        <section class="timeline glass-panel">
          <header><div><Icon name="layers" /><strong>4-Layer & 5-Frame editor</strong><span>위 레이어가 캔버스에서도 앞에 표시됩니다</span></div><div><button class="icon-button" type="button" onClick={() => (selectedFrame.value = Math.max(0, selectedFrame.value - 1))}><Icon name="previous" /></button><span>FRAME {selectedFrame.value + 1} / 5</span><button class="icon-button" type="button" onClick={() => (selectedFrame.value = Math.min(4, selectedFrame.value + 1))}><Icon name="next" /></button></div></header>
          <div class="timeline-body">
            <div class="layer-stack">
              {displayedLayers.map((layer, index) => <div data-layer-id={layer.id} role="button" tabIndex={0} class={`layer-row ${activeLayer.value === layer.id ? "active" : ""} ${dragId === layer.id ? "is-dragging" : ""} ${dropTarget?.id === layer.id ? `drop-${dropTarget.position}` : ""}`} onClick={() => (activeLayer.value = layer.id)}>
                <button class="drag-handle-button" type="button" aria-label={`${layer.label} 레이어 순서 이동`} onPointerDown={(event) => beginLayerDrag(event, layer.id)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); moveLayer(layer.id, event.key === "ArrowUp" ? -1 : 1); notify(`${layer.label} 레이어 순서를 옮겼어요.`); } }}><Icon name="drag" class="drag-handle" draggable={false} /></button>
                <span class="layer-icon"><Icon name={layerIcons[layer.id]} /></span><span class="layer-copy"><strong>{layer.label}</strong><small>{layer.description}</small></span><span class="layer-order">{4 - index}</span><span class="layer-controls"><i onClick={(event) => { event.stopPropagation(); toggleLayer(layer.id, "visible"); }}><Icon name={layer.visible ? "check" : "close"} size={13} /></i><i onClick={(event) => { event.stopPropagation(); toggleLayer(layer.id, "locked"); }}><Icon name={layer.locked ? "lock" : "unlock"} size={14} /></i></span><span class="layer-move"><i onClick={(event) => { event.stopPropagation(); moveLayer(layer.id, -1); }}><Icon name="previous" size={13} class="rotate-up" /></i><i onClick={(event) => { event.stopPropagation(); moveLayer(layer.id, 1); }}><Icon name="next" size={13} class="rotate-down" /></i></span>
              </div>)}
              <p class={`layer-drag-guide ${dragId ? "active" : ""}`} aria-live="polite">{dragId ? dropTarget ? `${layers.value.find((layer) => layer.id === dragId)?.label} → ${layers.value.find((layer) => layer.id === dropTarget.id)?.label} ${dropTarget.position === "before" ? "위" : "아래"}` : "다른 레이어 행 위로 끌어주세요" : "점 핸들을 끌면 놓일 위치를 미리 볼 수 있어요"}</p>
            </div>
            <div class="frame-track"><div class="frame-grid">{frameImages.value.map((image, index) => <button type="button" class={selectedFrame.value === index ? "active" : ""} onClick={() => (selectedFrame.value = index)}><img src={image} alt={`${index + 1}번째 동작 프레임`} /><span>FRAME {String(index + 1).padStart(2, "0")}</span></button>)}</div></div>
          </div>
        </section>
        {dragId && dragPoint ? <div class="layer-drag-preview" style={{ left: dragPoint.x + 14, top: dragPoint.y + 14 }}><Icon name={layerIcons[dragId]} /><span><strong>{layers.value.find((layer) => layer.id === dragId)?.label}</strong><small>놓을 위치 미리보기</small></span></div> : null}
      </div>
      {exportModalOpen.value && exportGifBlob.value ? <div class="modal-backdrop" onClick={(event) => event.target === event.currentTarget && (exportModalOpen.value = false)}><section class="export-modal glass-panel" role="dialog" aria-modal="true" aria-label="투명 GIF 내보내기"><header><div><span class="eyebrow">EXPORT COMPLETE</span><h2>투명 GIF가 준비됐어요.</h2></div><button class="icon-button" type="button" onClick={() => (exportModalOpen.value = false)}><Icon name="close" /></button></header><div class="export-preview"><img src={URL.createObjectURL(exportGifBlob.value)} alt="완성된 투명 GIF" />{qr ? <div class="qr-card"><img src={qr} alt="GIF 다운로드 QR 코드" /><span>모바일에서 바로 보기</span></div> : null}</div><p>{EXPORT_SIZE}×{EXPORT_SIZE} · {FRAME_COUNT} frames · {frameDelayMs.value}ms/frame · 투명 GIF{exportShareUrl.value ? " · QR 직접 링크" : " · Firebase 연결 시 QR 생성"}</p><div class="export-actions"><button class="button secondary" type="button" onClick={() => downloadBlob(exportGifBlob.value!, `${safeFileName(emoticonTitle.value || "emove")}.gif`)}><Icon name="download" />기기에 저장</button><button class="button primary" type="button" onClick={share}><Icon name="next" />메일·앱으로 보내기</button></div></section></div> : null}
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
        gifSafe: true,
      }, frame / (FRAME_COUNT - 1));
      timeout = window.setTimeout(() => renderLoop((frame + 1) % FRAME_COUNT), frameDelayMs.value);
    };
    void renderLoop(0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [motionBrief.value, layers.value, frameImages.value, frameLayerTransforms.value, coreEffectImage.value, textBoxShape.value, textFont.value, frameDelayMs.value]);

  return (
    <div class="loop-preview glass-panel" aria-label="루프 미리보기">
      <header><span>LOOP PREVIEW</span><strong>{frameDelayMs.value}ms / frame</strong></header>
      <canvas ref={canvasRef} width={EXPORT_SIZE} height={EXPORT_SIZE} />
    </div>
  );
}
