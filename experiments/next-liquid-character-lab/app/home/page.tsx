import { CharacterField } from "../../components/CharacterField";
import { GenerationDemo } from "../../components/GenerationDemo";
import { PageTransitionLink } from "../../components/PageTransitionLink";

const checks = [
  ["01 System", "Next App Router shell"],
  ["02 Motion", "route curtain + depth tabs"],
  ["03 Character", "pointer push, drag, collision"],
  ["04 Progress", "measured preload, staged generation"],
];

const referenceMoves = [
  ["Nudot / MYZ / Finenuts", "numbered navigation, work-index rhythm"],
  ["Kakao Sustainability", "agenda grouping, dense but calm information hierarchy"],
  ["Towards / Startrail", "full-screen loading surface, immersive digital-art entry"],
  ["Wembi / Narnia", "numbered technical sections, AI solution credibility"],
  ["Littly / CreativeMore", "design blocks, playful mascot moments, option cards"],
];

export default function HomePage() {
  return (
    <>
      <section className="hero home-feature" id="home">
        <div className="hero-copy">
          <p className="eyebrow">EMOVE NEXT LAB · LIQUID MOTION STUDIO</p>
          <h1>
            Emotion to
            <span>motion.</span>
          </h1>
          <p className="lede">
            노션 디자인 시스템의 다크 글래스, 보라 그라디언트, 중앙 preview 우선 구조를 기준으로,
            레퍼런스 사이트의 메뉴 리듬과 정보 구조, 로딩 감각, playful 캐릭터 요소를 필요한 곳에만 차용합니다.
          </p>
          <div className="hero-actions" aria-label="Primary actions">
            <PageTransitionLink className="glass-button primary" href="/character">캐릭터 만들기</PageTransitionLink>
            <PageTransitionLink className="glass-button" href="/input">행동 입력</PageTransitionLink>
            <GenerationDemo compact />
          </div>
          <div className="home-checks">
            {checks.map(([label, value]) => (
              <div className="glass-panel readout-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <CharacterField />
      </section>

      <section className="reference-board glass-panel" aria-label="Reference application map">
        <div>
          <p className="eyebrow">REFERENCE MAP</p>
          <h2>차용은 요소 단위로, 시스템은 EMOVE 기준으로.</h2>
        </div>
        <div className="reference-list">
          {referenceMoves.map(([label, value], index) => (
            <article key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{label}</strong>
              <p>{value}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
