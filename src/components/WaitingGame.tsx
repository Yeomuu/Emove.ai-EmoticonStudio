import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { hitWaitingTarget, idleWaitingGame, pauseWaitingGame, rankWaitingScores, resumeWaitingGame, startWaitingGame, targetDuration, tickWaitingGame } from "../services/waiting-game";

// Session-only scores never touch generation state or remote user assets.
let sessionScores: number[] = [];

export function WaitingGame({ image }: { image: string }) {
  const [game, setGame] = useState(idleWaitingGame);
  const [scores, setScores] = useState(sessionScores);
  const recorded = useRef(false);
  useEffect(() => {
    if (game.status === "playing") recorded.current = false;
    if (game.status !== "over" || recorded.current) return;
    recorded.current = true;
    sessionScores = rankWaitingScores(sessionScores, game.score);
    setScores(sessionScores);
  }, [game.status, game.score]);

  const hit = (index: number) => {
    const now = performance.now();
    const random = Math.random();
    setGame((current) => hitWaitingTarget(current, index, now, random));
  };

  useEffect(() => {
    if (game.status !== "playing") return;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const random = Math.random();
      setGame((current) => tickWaitingGame(current, now, random));
    }, 100);
    const pauseWhenHidden = () => {
      if (document.hidden) setGame((current) => pauseWaitingGame(current, performance.now()));
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", pauseWhenHidden); };
  }, [game.status]);

  return (
    <section className="waiting-game" aria-label="캐릭터 캐치 미니게임">
      <div className="waiting-game-scoreboard">
        <div><span>SCORE</span><strong aria-live="polite">{game.score}</strong></div>
        <div><span>COMBO</span><strong>{game.combo}<small>x</small></strong></div>
        <div><span>TIME</span><strong>{Math.ceil(game.remainingMs / 1000)}<small>s</small></strong></div>
        <div><span>MISS</span><strong>{game.mistakes}<small>/3</small></strong></div>
      </div>
      <div className="waiting-game-layout">
      <div className="waiting-game-arena">
        <div className="waiting-game-board" aria-label="캐릭터 타깃" onClick={(event) => { if (event.target === event.currentTarget) hit(-1); }}>
          {Array.from({ length: 9 }, (_, index) => (
            <button key={index} type="button" className={`waiting-game-cell ${game.target === index ? "is-target" : ""}`} disabled={game.status !== "playing"}
              aria-label={`${index + 1}번 ${game.target === index ? "캐릭터 잡기" : "빈 자리"}`}
              onClick={() => hit(index)}>
              <span className="waiting-card-flip">
                <span className="waiting-card-back"><Icon name="add" size={16} /></span>
                <span className="waiting-card-front"><img src={image} alt="" draggable={false} /></span>
              </span>
              {game.feedback?.cell === index ? <span key={game.feedback.id} className={`waiting-cell-feedback ${game.feedback.kind}`} aria-hidden="true">{game.feedback.kind === "miss" ? "MISS" : `+${10 + Math.min(game.combo - 1, 5) * 2}`}</span> : null}
            </button>
          ))}
        </div>
        {game.feedback ? <div key={game.feedback.id} className={`waiting-game-feedback ${game.feedback.kind}`} role="status">{game.feedback.kind === "miss" ? `MISS ${game.mistakes}/3` : game.feedback.kind === "level" ? `${game.combo} COMBO · SPEED UP` : `${game.combo} COMBO`}</div> : null}
        {game.status !== "playing" ? <div className="waiting-game-overlay">
          <strong>{game.status === "over" ? `GAME OVER · ${game.score}점` : game.status === "paused" ? "잠시 쉬는 중" : "캐릭터 캐치"}</strong>
          <button className="button primary" type="button" onClick={() => setGame((current) => current.status === "paused" ? resumeWaitingGame(current, performance.now()) : startWaitingGame(performance.now()))}>
            <Icon name="play" />{game.status === "paused" ? "계속하기" : game.status === "over" ? "다시 도전" : "게임 시작"}
          </button>
        </div> : null}
      </div>
      <aside className="waiting-game-ranking" aria-label="이번 접속 점수 순위">
        <h3>SESSION TOP 5</h3>
        <div className="current-score"><span>현재 점수</span><strong>{game.score}</strong></div>
        <ol>{Array.from({ length: 5 }, (_, index) => <li key={index}><span>{index + 1}위</span><strong>{scores[index] ?? "-"}</strong></li>)}</ol>
      </aside>
      </div>
      <div className="waiting-game-controls">
        <span>30초 · {targetDuration(game.level) / 1000}s</span>
        <button type="button" className="icon-button" title="게임 일시정지" aria-label="게임 일시정지" disabled={game.status !== "playing"} onClick={() => setGame((current) => pauseWaitingGame(current, performance.now()))}><Icon name="pause" /></button>
        <button type="button" className="icon-button" title="게임 다시 시작" aria-label="게임 다시 시작" onClick={() => setGame(startWaitingGame(performance.now()))}><Icon name="reload" /></button>
      </div>
    </section>
  );
}
