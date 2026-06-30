# EMOVE

목소리와 몸짓의 감정을 움직이는 이모티콘으로 편집하는 반응형 웹 프로토타입입니다.

## 실행

```bash
pnpm install
pnpm dev
```

기본 주소는 `http://127.0.0.1:5173/home`입니다. 모든 화면은 해시 없이 `/character`, `/input`, `/edit`, `/library`처럼 이동합니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 기술 구조

- Preact + TypeScript + Signals + Vite
- CSS Custom Properties와 `@layer` 기반 반응형 스타일, PC 본문 최대 1440px
- MediaRecorder, Web Audio, getUserMedia
- Web Worker에서 실행되는 MediaPipe Pose Landmarker
- Canvas 4단 합성, 프레임별 위치 저장, 1024×1024 5프레임 GIF89a 인코딩
- IndexedDB 로컬 저장, 선택적 Firebase 동기화
- OpenAI 의존부는 Mock/Server Provider 인터페이스로 분리

## OpenAI 연결 전 상태

현재 `MockOpenAIProvider`가 전사와 이미지 생성 결과를 대체합니다. 실제 키는 `.env.example`을 참고해 프로젝트 루트의 `.env.local` 안 `OPENAI_API_KEY`에 입력하고 `VITE_AI_MODE=openai`로 바꿉니다. 키는 `VITE_` 접두사를 쓰지 않으며 브라우저 번들에 포함되지 않습니다. 로컬 Vite 서버가 `/api/openai/transcribe`, `/api/openai/character`, `/api/openai/frames`, `/api/openai/effect`를 처리합니다. `gpt-image-2` 사용 시 캐릭터/이펙트 이미지는 크로마키 녹색 배경으로 생성한 뒤 브라우저에서 투명 PNG로 변환합니다.

비용 제어를 위해 입력 완료 시에는 5개 캐릭터 프레임만 자동 생성합니다. 코어 이펙트 이미지는 편집 화면의 `코어 이펙트 생성` 버튼을 눌렀을 때만 `gpt-image-2`를 호출하며, 버튼을 누르지 않아도 로컬 Canvas 이펙트가 루프 미리보기와 내보내기에 반영됩니다.

프롬프트 생성/정제는 서버의 `OPENAI_PROMPT_MODEL`이 담당하며, 이미지 생성은 계속 `gpt-image-2`를 사용합니다. 상세 규칙과 예시는 `docs/prompting-rules.md`에 정리했습니다.

## Firebase 연결

루트에 `firebase.json`, `firebase.firestore.rules`, `firebase.storage.rules`가 있습니다. `.env.local`의 `VITE_FIREBASE_CONFIG`에 Firebase Web App 설정 JSON을 넣거나, `VITE_FIREBASE_API_KEY` 등 개별 환경변수를 채우면 익명 로그인 후 `characters`, `captures`, `projects`, `stickers` 컬렉션과 `emoticons/{ownerId}/{fileName}.gif` Storage 경로에 동기화합니다. 원본 카메라/오디오 Blob과 data URL 이미지는 Firestore에 올리지 않고 분석 메타데이터, 편집 상태, 작은 참조값, 최종 GIF URL 중심으로 저장합니다. IndexedDB는 오프라인/즉시 반응용 로컬 저장소로 항상 사용되고, Firebase 설정이 올바를 때 원격 저장이 추가로 실행됩니다.

Firebase JS SDK는 이미 `firebase@^12.15.0`로 설치되어 있습니다. 이 프로젝트는 `pnpm-lock.yaml`을 기준으로 관리하므로 새 패키지를 추가할 때는 `pnpm add firebase` 흐름이 안전합니다. `.npmrc`는 로컬 cache, fund, audit 설정만 둡니다.

수동으로 해야 하는 일은 Firebase Console에서 Web App 설정 확인, Authentication Anonymous provider 활성화, Firestore Database와 Storage 생성, 그리고 위 규칙 배포입니다.

## 배포

Netlify는 일반 `pnpm build` 결과를 배포하면 됩니다. GitHub Pages는 저장소 하위 경로와 History API fallback이 필요하므로 `pnpm build:github`를 사용합니다. `main`에 push하면 `.github/workflows/pages.yml`이 `dist`를 GitHub Pages로 배포하며, 저장소 설정의 Pages Source는 `GitHub Actions`로 지정해야 합니다.

## 폴더

- `src/`: 페이지·컴포넌트·서비스·워커 TypeScript와 스타일·에셋
- `src/assets/images/`: 앱에서 사용하는 화면·캐릭터 이미지
- `src/assets/icons/`: coolicons 단일 아이콘 세트
- `src/assets/font/`: Pretendard, Paperlogy 로컬 폰트
- `public/models/`: MediaPipe WASM과 공식 Pose Landmarker 모델
- `tests/`: 핵심 계약과 GIF 인코더 테스트
- `qa/`: 구현 화면 캡처

GitHub 웹에서 로컬보다 폴더 수가 적게 보이는 것은 정상입니다. `node_modules/`, `dist/`, `.env.local`, 로컬 캐시, QA 산출물 등은 `.gitignore`로 제외되어 저장소에는 실행에 필요한 소스와 설정만 올라갑니다.
