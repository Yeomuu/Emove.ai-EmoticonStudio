import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { hitWaitingTarget, idleWaitingGame, pauseWaitingGame, resumeWaitingGame, startWaitingGame, tickWaitingGame } from "../services/waiting-game";

export function WaitingGame({ image }: { image: string }) {
  const [game, setGame] = useState(idleWaitingGame);

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
      </div>
      <div className="waiting-game-arena">
        <div className="waiting-game-board" aria-label="캐릭터 타깃">
          {Array.from({ length: 9 }, (_, index) => (
            <button key={index} type="button" className={`waiting-game-cell ${game.target === index ? "is-target" : ""}`} disabled={game.status !== "playing"}
              aria-label={`${index + 1}번 ${game.target === index ? "캐릭터 잡기" : "빈 자리"}`}
              onClick={() => { const now = performance.now(); const random = Math.random(); setGame((current) => hitWaitingTarget(current, index, now, random)); }}>
              {game.target === index ? <img src={image} alt="" draggable={false} /> : <Icon name="add" size={16} />}
            </button>
          ))}
        </div>
        {game.status !== "playing" ? <div className="waiting-game-overlay">
          <strong>{game.status === "over" ? `${game.score}점 · ${game.hits}회 성공` : game.status === "paused" ? "잠시 쉬는 중" : "캐릭터 캐치"}</strong>
          <button className="button primary" type="button" onClick={() => setGame((current) => current.status === "paused" ? resumeWaitingGame(current, performance.now()) : startWaitingGame(performance.now()))}>
            <Icon name="play" />{game.status === "paused" ? "계속하기" : game.status === "over" ? "다시 도전" : "게임 시작"}
          </button>
        </div> : null}
      </div>
      <div className="waiting-game-controls">
        <span>30초 라운드</span>
        <button type="button" className="icon-button" title="게임 일시정지" aria-label="게임 일시정지" disabled={game.status !== "playing"} onClick={() => setGame((current) => pauseWaitingGame(current, performance.now()))}><Icon name="pause" /></button>
        <button type="button" className="icon-button" title="게임 다시 시작" aria-label="게임 다시 시작" onClick={() => setGame(startWaitingGame(performance.now()))}><Icon name="reload" /></button>
      </div>
    </section>
  );
}
