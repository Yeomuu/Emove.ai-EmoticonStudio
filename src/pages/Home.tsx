import { imageAssets } from "../data";
import { navigate } from "../router";

export function HomePage() {
  return (
    <section class="home-hero">
      <img class="home-ecosystem" src={imageAssets.hero} alt="다양한 3D 캐릭터와 제작 도구가 연결된 EMOVE 제작 생태계" />
      <div class="hero-glow" />
      <div class="home-copy">
        <p class="hero-kicker">EMOTICON STUDIO</p>
        <h1>EM<span class="logo-letter"><img src={imageAssets.logo} alt="O" /></span>VE</h1>
        <div class="hero-actions">
          <button class="hero-button" type="button" onClick={() => navigate("/library")}><span class="button-aura" aria-hidden="true" /><span>이모티콘 구경가기</span></button>
          <button class="hero-button" type="button" onClick={() => navigate("/character")}><span class="button-aura" aria-hidden="true" /><span>이모티콘 제작하기</span></button>
        </div>
      </div>
      <footer class="home-footer">© 2026. Capstone Design. All rights reserved.</footer>
    </section>
  );
}
