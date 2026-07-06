export default function PreviewPage() {
  return (
    <section className="page-pane preview-page">
      <div className="page-heading">
        <p className="eyebrow">PAGE TRANSITION TEST</p>
        <h1>
          Route changes
          <span> with a soft curtain.</span>
        </h1>
      </div>
      <div className="preview-grid">
        <article className="glass-panel preview-media">
          <img src="/assets/home-ecosystem.webp" alt="EMOVE ecosystem preview" />
        </article>
        <article className="glass-panel preview-copy">
          <p className="eyebrow">MYZ-LIKE REVEAL</p>
          <h2>페이지 본문은 아래에서 올라오고, 커튼은 짧게 닫혔다가 열립니다.</h2>
          <p>
            실제 서비스에서는 Home, Character, Input, Edit, Library 사이의 전환에 같은 패턴을 쓸 수 있습니다.
            도구 화면에서는 길게 가리지 않고 400-700ms 안쪽으로 끝내는 쪽이 안전합니다.
          </p>
        </article>
      </div>
    </section>
  );
}
