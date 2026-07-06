import { CharacterField } from "../components/CharacterField";
import { GenerationDemo } from "../components/GenerationDemo";

const stack = ["Next.js", "GSAP", "Canvas-ready", "Pointer physics", "Netlify"];
const metrics = [
  ["AI calls", "0 during loop"],
  ["Loop target", "5 frames"],
  ["Feel", "liquid glass"],
];

export default function Page() {
  return (
    <>
      <section className="hero" id="lab">
        <div className="hero-copy">
          <p className="eyebrow">NEXT INTERACTION PROTOTYPE</p>
          <h1>
            Touch-responsive
            <span> emoticon studio</span>
          </h1>
          <p className="lede">
            캐릭터가 살아있는 첫 화면, 얇은 유리막, 빠른 합성 파이프라인을 한 번에 검증하는 임시 랜딩 실험입니다.
          </p>
          <div className="hero-actions" aria-label="Primary actions">
            <a className="glass-button primary" href="#ship">Open System</a>
            <GenerationDemo compact />
          </div>
        </div>

        <CharacterField />
      </section>

      <section className="system-grid" id="system" aria-label="Technical stack">
        <div className="glass-panel stack-card">
          <p className="eyebrow">STACK</p>
          <h2>Fast where it matters, expressive where it shows.</h2>
          <div className="stack-list">
            {stack.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        {metrics.map(([label, value]) => (
          <div className="glass-panel metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="ship-panel glass-panel" id="ship">
        <div>
          <p className="eyebrow">PRODUCTION SHAPE</p>
          <h2>AI는 캐릭터 토큰에, 움직임은 브라우저에.</h2>
        </div>
        <div className="ship-copy">
          <p>
            생성 비용과 대기 시간을 낮추려면 이미지 모델은 신규 캐릭터나 고급 포즈 옵션에 집중시키고,
            기본 이모티콘 루프는 Canvas 합성, 레이어 transform, 절차적 감정 효과로 만드는 쪽이 가장 안정적입니다.
          </p>
          <GenerationDemo />
        </div>
      </section>
    </>
  );
}
