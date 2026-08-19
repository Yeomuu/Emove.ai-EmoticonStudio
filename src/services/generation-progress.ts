import type { FrameGenerationEvent } from "../types";

export interface GenerationProgressState {
  title: string;
  label: string;
  percent: number;
  completedFrames: number;
}

const GENERATION_TITLE = "감정을 다섯 장면으로 이어 붙이고 있어요.";
const FRAME_LABELS = [
  "시작 동작",
  "움직임을 여는 동작",
  "감정이 가장 크게 드러나는 동작",
  "여운을 정리하는 동작",
  "루프를 잇는 마무리 동작",
] as const;

export function generationProgressFromEvent(event: FrameGenerationEvent): GenerationProgressState {
  const total = Math.max(1, event.total);
  if (event.phase === "reference-preparing") {
    return state("캐릭터의 모습과 생성 조건을 정리하는 중", 3, 0);
  }
  if (event.phase === "reference-ready") {
    return state("캐릭터 기준 이미지를 준비했어요", 8, 0);
  }

  const index = clamp(event.index, 0, total - 1);
  const frameLabel = FRAME_LABELS[index] ?? `${index + 1}번째 동작`;
  const frameSpan = 85 / total;
  const frameBase = 8 + frameSpan * index;
  const completedFrames = event.phase === "frame-ready" ? event.completed : index;

  if (event.phase === "frame-requested") {
    return state(`${frameLabel}을 생성하고 결과를 기다리는 중 · ${index + 1}/${total}`, frameBase + frameSpan * .06, completedFrames);
  }
  if (event.phase === "job-status") {
    const label = event.status === "pending"
      ? `${frameLabel} 생성 순서를 확인하는 중 · ${index + 1}/${total}`
      : `${frameLabel}을 한 장면으로 그리는 중 · ${index + 1}/${total}`;
    return state(label, frameBase + frameSpan * (event.status === "pending" ? .12 : .24), completedFrames);
  }
  if (event.phase === "frame-received") {
    return state(`${frameLabel} 결과를 받아왔어요 · ${index + 1}/${total}`, frameBase + frameSpan * .66, completedFrames);
  }
  if (event.phase === "frame-processing") {
    return state(`${frameLabel}의 초록 배경을 투명하게 정리하는 중 · ${index + 1}/${total}`, frameBase + frameSpan * .84, completedFrames);
  }
  return state(`${frameLabel} 준비 완료 · ${event.completed}/${total}`, frameBase + frameSpan, event.completed);
}

function state(label: string, percent: number, completedFrames: number): GenerationProgressState {
  return {
    title: GENERATION_TITLE,
    label,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    completedFrames,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
