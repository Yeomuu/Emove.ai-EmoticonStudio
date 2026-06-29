# EMOVE 기술 검증 기록

검증일: 2026-06-24

## 근거와 적용

- emotion2vec+ 공개 모델 카드의 9개 출력 라벨(angry, disgusted, fearful, happy, neutral, other, sad, surprised, unknown)을 타입과 UI에 그대로 반영했습니다. 근거: https://huggingface.co/iic/emotion2vec_plus_large
- MediaPipe Pose Landmarker는 Web Worker에서 지연 로드하며, 5초 영상 촬영 결과의 마지막 프레임을 자세 분석 입력으로 사용합니다. 근거: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- Google 로그인은 Firebase Auth popup 흐름, Kakao는 Firebase OpenID Connect provider 흐름으로 분리했습니다. 근거: https://firebase.google.com/docs/auth/web/google-signin , https://firebase.google.com/docs/auth/web/openid-connect
- OpenAI 이미지 생성은 서버 전용 키, 캐릭터 참조 이미지 edit 요청, 5개 동작 프레임 프롬프트 계약으로 구성했습니다. `gpt-image-2`는 투명 배경 요청을 지원하지 않으므로 캐릭터/이펙트는 크로마키 녹색 배경으로 생성한 뒤 브라우저 Canvas에서 배경과 연결된 녹색 픽셀을 alpha 0으로 제거해 투명 PNG data URL로 저장·표시합니다. 근거: https://platform.openai.com/docs/guides/image-generation
- GIF89a는 gifenc의 RGBA4444 팔레트와 transparent index를 사용해 1-bit 투명 배경으로 인코딩합니다. GIF는 반투명 단계를 지원하지 않으므로 경계는 1-bit로 양자화됩니다. 근거: https://www.w3.org/Graphics/GIF/spec-gif89a.txt

## 구현 검증

- TypeScript strict typecheck: 통과
- Vitest: v1 6개 테스트 통과
- Vite production build: 통과
- 4단 레이어 순서와 Canvas 합성 순서: 동일 배열을 역순으로 합성
- 캔버스 드래그·크기·회전과 숫자 속성: 동일 signal 상태로 양방향 동기화
- 음성 파형: FFT 주파수 bin과 time-domain RMS/peak를 매 프레임 계산
- 카메라: canplay 이후 촬영 활성화, 5초 미입력 시 해제, 촬영 시 5초 MediaRecorder 기록
- 저장: IndexedDB에 project/sticker/character/capture를 분리 보관하고 프로젝트에는 GIF·토큰·행동·프레임·레이어·프레임별 transform·brief를 함께 저장
- 이모티콘 프레임: 총 5프레임 고정, 프레임당 delay는 사용자가 조정하며 GIF export는 5개의 프레임별 캔버스 상태를 그대로 렌더링
- Firebase 연동 경로는 로그인 사용자 UID를 ownerId로 저장할 수 있도록 분리되어 있으나, 현재 v1에서는 로컬/Mock 저장을 기본값으로 유지
- 페이지 단위 dynamic import로 Character/Input/Edit/Library를 분리해 초기 JavaScript에 무거운 편집·분석 코드를 포함하지 않음
- 원본 PNG와 동일한 알파·구도를 유지한 WebP 파생 에셋을 사용해 주요 화면 이미지 전송량을 약 10.55MB에서 약 0.69MB로 축소(93.5%)
- 큰 유리 패널의 blur 값은 정적으로 유지하고, 카드·버튼·탭에만 transform/opacity 기반 마이크로 인터랙션을 적용

## 자격 증명 없이 남은 검증

OpenAI 실호출, Firebase 원격 인증/저장, 실제 카메라·마이크 권한은 자격 증명과 기기 권한이 필요해 Mock/로컬 경로까지만 검증했습니다. 인앱 브라우저의 localhost 자동 캡처는 현재 브라우저 보안 정책이 차단해 정적 좌표·타입·테스트·production build로 검증했습니다.
