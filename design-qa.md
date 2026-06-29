# EMOVE Design QA

검증일: 2026-06-25  
대상: Figma `0621 3차평가`, 제공된 6개 SVG/추출 코드, 현재 v1 구현

## 사용한 시각·구조 근거

- Figma 노드 `1666:1386` 캡처: `qa/figma-0621-3rd-eval-3600.png`
- 기존 Figma/브라우저 비교 캡처:
  - `qa/figma-0621-3rd-eval.png`
  - `qa/current-home-glass-pass.png`
  - `qa/current-edit-glass-pass.png`
  - `qa/current-library-glass-pass.png`
- SVG 렌더 기준:
  - `qa/references/home-reference.png`
  - `qa/references/character-reference.png`
  - `qa/references/input-reference.png`
  - `qa/references/edit-reference.png`
  - `qa/references/library-reference.png`
  - `qa/references/library-detail-reference.png`
- 이번 패스의 in-app browser DOM 검증:
  - 1440×1080 desktop
  - 390×844 responsive/mobile

## 이번 패스에서 수정한 항목

1. 공통 Liquid Glass를 near-black translucent surface, lavender rim light, top glint, subtle refraction cue 중심으로 재정의했다.
2. Nav 텍스트와 pill 선택 상태가 한쪽으로 쏠리지 않도록 line-height, grid centering, selection pill height/position을 보정했다.
3. `min-height: 760px`로 조정하고, 더 작은 브라우저에서는 문서 스크롤이 되도록 shell/body overflow 구조를 유지했다.
4. Character 화면은 기존 캐릭터가 보이지 않는 empty-start 생성 화면으로 변경했다.
   - palette preset dropdown
   - point color swatch
   - custom color picker swatch
   - 생성 전 저장 버튼 disabled
5. Input 음성 파형은 대기 중 dot baseline, 녹음 중 FFT frequency bar로 보이도록 조정했다.
6. Input은 5프레임 고정으로 두고, 프레임당 delay range 값이 우측 요약 숫자와 즉시 동기화되도록 했다.
7. Edit canvas에는 `EXPORT 360×360` 경계를 명확히 표시하고, stage overflow를 visible로 바꿔 작업 영역이 답답하게 잘리지 않도록 했다.
8. Edit text layer는 문구, bubble shape, font를 변경할 수 있으며 renderer/export 옵션에 연결했다.
9. Timeline layer drag preview/drop indicator를 유지하고, 위쪽 layer가 canvas에서도 최상단임을 DOM 순서로 확인했다.
10. Library는 이모티콘/캐릭터 보기로 분리하고, masonry column이 아니라 가로 우선 3-column grid로 정렬했다.
11. Library category filter rail은 horizontal overflow/drag 구조와 edge gradient fade를 갖도록 수정했다.
12. 마이크로 인터랙션은 press/hover/drag/selection 중심으로 줄이고 overflow가 생기기 쉬운 버튼 계열은 `overflow: clip`으로 제한했다.

## 브라우저 확인 결과

- Character `/character`
  - 직접 캐릭터 이미지 없음: 통과
  - empty state 표시: 통과
  - 저장 버튼 disabled: 통과
  - palette dropdown/custom swatch 색상 표시: 통과
- Input `/input`
  - idle waveform count: 2개 확인
  - frame text: `5 frames 고정`
  - speed text: `120ms / frame`
  - summary includes `프레임 5`, `120ms/frame`: 통과
- Edit `/edit`
  - stage overflow: `visible`
  - export boundary label: `EXPORT 360×360`
  - text layer 선택 시 text control grid 표시: 통과
  - layer order: 텍스트 → 부가 이펙트 → 캐릭터 → 배경 이펙트
- Library `/library`
  - grid display: `grid`
  - desktop columns: 3 columns
  - 첫 3개 카드 y 좌표 동일: 가로 우선 정렬 통과
  - category rail overflow: `scrollWidth > clientWidth`
- Responsive 390×844
  - document scroll height > viewport height
  - app overflow: `visible`
  - clipped 대신 scrolling 가능: 통과

## 자동 검증

- TypeScript strict typecheck: 통과 (`node_modules/.bin/tsc --noEmit`)
- Vitest: 1 file / 6 tests 통과
- Production build: 통과

참고: `pnpm typecheck`는 pnpm이 registry 메타데이터를 가져오려다 네트워크 제한으로 실패했지만, 로컬 의존성의 `tsc` 직접 실행은 통과했다.

## 제한 사항

- 이번 세션에서 in-app browser의 `Page.captureScreenshot`가 visible/background/new tab/clip/fullPage 모두에서 timeout되어 신규 스크린샷 파일 저장은 실패했다.
- 따라서 이번 패스의 최종 판단은 DOM 구조, 실제 열린 브라우저 상태, 타입/테스트/빌드 검증을 기준으로 한다.

final result: passed with screenshot-capture limitation
