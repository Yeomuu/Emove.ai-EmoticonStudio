import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { QrExportPayload } from "../types";
import { generateQrDataUrl } from "../services/qr-export";

type QrState = { status: "loading" | "error" } | { status: "ready"; image: string };

export function QrExportModal({ payload, onClose }: { payload: QrExportPayload; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [qr, setQr] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setQr({ status: "loading" });
    void generateQrDataUrl(payload.targetUrl).then(
      (image) => { if (!cancelled) setQr({ status: "ready", image }); },
      () => { if (!cancelled) setQr({ status: "error" }); },
    );
    return () => { cancelled = true; };
  }, [payload.targetUrl, attempt]);

  const regenerateQr = () => {
    setQr({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="export-modal glass-panel" role="dialog" aria-modal="true" aria-label="QR 내보내기">
        <header>
          <div>
            <span className="eyebrow">EXPORT COMPLETE</span>
            <h2>{payload.title} 저장이 완료됐어요.</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="QR 내보내기 닫기"><Icon name="close" /></button>
        </header>
        <div className="export-preview">
          <img src={payload.previewUrl} alt={`${payload.title} 미리보기`} />
          <div className="qr-card">
            <div className="qr-code-slot" aria-busy={qr.status === "loading"}>
              {qr.status === "ready" ? (
                <img src={qr.image} alt={`${payload.title} 다운로드 QR 코드`} onError={() => setQr({ status: "error" })} />
              ) : qr.status === "error" ? (
                <p role="alert">저장은 완료됐지만 QR 코드를 만들지 못했어요. 새로고침 버튼을 눌러 다시 시도해 주세요.</p>
              ) : <p role="status">QR 코드를 생성하고 있어요.</p>}
            </div>
            <button className="icon-button qr-reload" type="button" onClick={regenerateQr} disabled={qr.status === "loading"} aria-label="QR 코드 다시 생성" title="QR 코드 다시 생성">
              <Icon name="reload" />
            </button>
            {qr.status === "ready" ? <span>스캔하면 모바일에서 움직임을 미리 본 뒤 내려받을 수 있어요.</span> : null}
          </div>
        </div>
        <p>{payload.format} · 투명 배경 애니메이션</p>
        <div className="export-actions">
          <a className="button primary" href={payload.downloadUrl}>
            <Icon name="download" />
            다운로드
          </a>
        </div>
      </section>
    </div>
  );
}
