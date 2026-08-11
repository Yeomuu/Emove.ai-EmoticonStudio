import { Icon } from "./Icon";
import type { QrExportPayload } from "../types";

export function QrExportModal({ payload, onClose }: { payload: QrExportPayload; onClose: () => void }) {
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
            <img src={payload.qrDataUrl} alt={`${payload.title} 다운로드 QR 코드`} />
            <span>스캔하면 파일을 바로 내려받아요.</span>
          </div>
        </div>
        <p>{payload.format} · Firebase Storage 직접 다운로드</p>
        <div className="export-actions">
          <a className="button primary" href={payload.targetUrl}>
            <Icon name="download" />
            다운로드
          </a>
        </div>
      </section>
    </div>
  );
}
