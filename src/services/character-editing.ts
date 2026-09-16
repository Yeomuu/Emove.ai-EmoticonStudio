import type { CharacterToken } from "../types";

const appearanceDetails: Record<string, string> = {
  학생: "단정한 머리와 편안한 교복, 둥근 얼굴과 또렷한 눈",
  직장인: "단정한 머리와 깔끔한 셔츠, 친근한 얼굴",
  소년: "짧은 머리와 편안한 일상복, 둥근 얼굴",
  소녀: "단정한 머리와 편안한 일상복, 둥근 얼굴",
  탐험가: "탐험복을 입은 호기심 많은 얼굴",
  펭귄: "작은 부리, 둥근 몸통, 짧은 날개와 밝은 배",
  토끼: "긴 귀와 작은 코, 둥근 몸통",
  고양이: "삼각형 귀와 작은 코, 부드러운 꼬리",
};

export function appearancePrompt(type: string, subType: string, style: "2D" | "3D", detailStyle: string): string {
  return `${type} - ${subType}. ${appearanceDetails[subType] ?? `${subType}의 고유한 형태와 특징이 잘 보이는 간결한 실루엣`}. ${style} ${detailStyle} 스타일, 전신이 보이는 캐릭터, 투명 배경.`;
}

export function reviseCharacter(source: CharacterToken, options: { name: string; traits: string[]; instruction?: string; image?: string; now: string }): CharacterToken {
  const replaceTraits = (values: string[]) => [...values.filter((value) => !source.personalityTags.includes(value)), ...options.traits];
  return {
    ...source,
    version: source.version + 1,
    name: options.name.trim() || source.name,
    personalityTags: [...options.traits],
    observableTraits: replaceTraits(source.observableTraits),
    fixedTraits: replaceTraits(source.fixedTraits),
    prompt: options.instruction?.trim() ? `${source.prompt}\n사용자 외형 수정: ${options.instruction.trim()}` : source.prompt,
    sourceAsset: options.image ?? source.sourceAsset,
    referenceImages: options.image ? [options.image] : source.referenceImages,
    updatedAt: options.now,
  };
}

export function replaceCharacterRecord(records: CharacterToken[], saved: CharacterToken): CharacterToken[] {
  return records.some((item) => item.id === saved.id)
    ? records.map((item) => item.id === saved.id ? saved : item)
    : [saved, ...records];
}
