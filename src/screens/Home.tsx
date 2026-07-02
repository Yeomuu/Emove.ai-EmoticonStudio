import { imageAssets } from "../data";
import { navigate } from "../router";

export function HomePage() {
  return (
    <section className="home-hero">
      <img className="home-ecosystem" src={imageAssets.hero} alt="다양한 3D 캐릭터와 제작 도구가 연결된 EMOVE 제작 생태계" />
      <div className="hero-glow" />
      <div className="home-copy">
        <p className="hero-kicker">EMOTICON STUDIO</p>
        <h1>EM<span className="logo-letter"><img src={imageAssets.logo} alt="O" /></span>VE</h1>
        <div className="hero-actions">
          <button className="hero-button" type="button" onClick={() => navigate("/library")}><span className="button-aura" aria-hidden="true" /><span>이모티콘 구경가기</span></button>
          <button className="hero-button" type="button" onClick={() => navigate("/character")}><span className="button-aura" aria-hidden="true" /><span>이모티콘 제작하기</span></button>
        </div>
      </div>
      <footer className="home-footer">© 2026. Capstone Design. All rights reserved.</footer>
    </section>
  );
}
