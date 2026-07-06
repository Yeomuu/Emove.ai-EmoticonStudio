import { GenerationDemo } from "../../components/GenerationDemo";

const steps = [
  ["01", "Capture facts", "표정, 제스처, 음성 텍스트를 먼저 확정"],
  ["02", "Reuse token", "캐릭터 이미지는 캐시된 토큰을 우선 사용"],
  ["03", "Local motion", "5프레임은 브라우저 합성으로 빠르게 생성"],
  ["04", "Export loop", "GIF-safe 팔레트로 미리보기와 결과를 일치"],
];

export default function PipelinePage() {
  return (
    <section className="page-pane pipeline-page">
      <div className="page-heading">
        <p className="eyebrow">GENERATION PIPELINE</p>
        <h1>
          Fast loops,
          <span> honest loading.</span>
        </h1>
      </div>
      <div className="pipeline-grid">
        {steps.map(([number, title, body]) => (
          <article className="glass-panel process-card" key={number}>
            <span>{number}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="pipeline-run glass-panel">
        <div>
          <p className="eyebrow">LOADER TEST</p>
          <h2>진행률이 있는 생성 대기 화면</h2>
        </div>
        <GenerationDemo />
      </div>
    </section>
  );
}
