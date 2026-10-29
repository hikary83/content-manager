# HIKARY 콘텐츠 매니저 v1.1.0

2026-10-28 · GitHub Pages + Google Apps Script + Google Sheets + Gemini

## 현재 구조

- `docs/`: 빌드 없는 신규 화면. Pages 설정은 `main` / `/docs`.
- `backend/`: 전용 Apps Script 서버 소스.
- `scripts/preview-content.mjs`: 로컬 서버 (`node scripts/preview-content.mjs` → http://127.0.0.1:4173/).
- `tests/content-backend.test.mjs`, `tests/content-client.test.mjs`: 시트 저장·인증·분석·화면 통신 검증 (`node --test tests/content-backend.test.mjs tests/content-client.test.mjs`).
- `app/`, `worker/`, `db/` 등은 이전 Sites/React 코드입니다. Pages 배포에는 포함하지 않습니다. 백업 태그: `legacy-chatgpt-sites-2026-08-11`.

상품 링크 분석 → 상세 이미지/설명 확인 → Gemini 초안 → 사용자 검토 → Sheets 등록.
분석만으로 시트에 저장하지 않습니다. 이미지·영상·상세 원문은 시트에 보관하지 않습니다.

## 최초 연결

1. 콘텐츠 매니저 전용 **새** Apps Script 프로젝트를 만듭니다. 기존 KIC 프로젝트 설정을 복사하지 않습니다.
2. `.clasp.example.json`을 참고해 로컬 `.clasp.json`에 **새 Script ID**와 `rootDir: backend`를 지정합니다. 해당 파일은 Git에서 제외합니다.
3. 개인 인증은 `clasp --auth .clasprc.hikary-personal.json login`으로 별도 보관합니다. 이후 모든 HIKARY clasp 명령에는 `--auth .clasprc.hikary-personal.json`을 붙입니다. 기본 업무용 인증은 사용하지 않습니다. `status`로 `Code.js`, `Product.js`, `Gemini.js`, `appsscript.json`만 업로드되는지 확인하고 `push`를 실행합니다.
4. 새 프로젝트 편집기에서 `initializeProject`를 한 번 실행하고 권한을 승인합니다. 이 함수는 시트 데이터를 수정하지 않고 스크립트 속성만 초기화합니다.
5. 프로젝트 설정 → 스크립트 속성에서 `GEMINI_API_KEY`를 입력합니다. 생성된 `APP_ACCESS_TOKEN`은 화면 로그인에 사용합니다. 값은 Git·채팅에 붙여넣지 않습니다.
6. 신규 웹앱으로 배포하고 최종 `/exec` 주소를 확인합니다. `clasp push`만으로 운영 웹앱이 갱신되지는 않습니다.
7. 화면의 연결 설정에 새 `/exec` 주소와 접속 코드를 입력합니다. 주소를 고정할 때는 `docs/js/config.js`의 공개 `apiUrl`만 설정하고, 키·접속 코드는 넣지 않습니다.

| 스크립트 속성 | 용도 |
| --- | --- |
| `SHEET_ID` | 이번에 만든 HIKARY 전용 운영대장 ID, 초기화 함수에서 지정 |
| `SHEET_NAME` | `콘텐츠 관리` |
| `APP_ACCESS_TOKEN` | 초기화 함수가 생성하는 64자 개인 접속 코드 |
| `GEMINI_API_KEY` | 사용자의 Google Gemini 키, 직접 입력 |
| `GEMINI_MODEL` | 기본 `gemini-2.5-flash`, 사용 가능한 모델로 변경 가능 |
| `GEMINI_DAILY_LIMIT` | 하루 호출 한도, 기본 40회 (실패 호출 포함) |
| `PRODUCT_ALLOWED_HOSTS` | 추가 상품 수집 허용 도메인, 쉼표 구분. 기본 coupang.com |
| `IMAGE_ALLOWED_HOSTS` | 추가 이미지 CDN 도메인. 기본 coupangcdn.com,coupang.com |

### 접근 제어

개인용 접속 코드 인증입니다. 코드를 아는 사람은 접근 가능하므로 공유하지 않습니다. 코드와 Gemini 키는 별개이며, 접속 코드는 탭 메모리에만 유지되어 새로고침 시 다시 입력합니다. 다중 사용자 운영 시 Google 계정 인증과 사용자별 권한을 추가합니다.

웹앱의 실행 주체는 배포자, 전송 계층 접근은 `ANYONE_ANONYMOUS`입니다. Pages의 교차 출처 요청을 받기 위한 설정이며 **실제 조회·저장·AI 호출은 서버에서 접속 코드를 검증**합니다. 공개 `GET`은 서비스명과 버전만 반환합니다.

## 배포

화면: Git 커밋 → GitHub 푸시 → Pages `main /docs` 배포 → 공개 화면 확인.
서버: `clasp push` → 신규 웹앱 버전 배포 → API 확인. 후속 서버 배포는 **새 HIKARY 배포 ID**에 새 버전을 연결해 주소를 유지합니다.

서비스 버전·Git 커밋·Apps Script 버전은 따로 기록합니다. 화면 버전 변경 시 HTML의 `?v=`도 갱신합니다. 롤백은 화면 Git 커밋과 스크립트 배포 버전을 각각 되돌립니다.

## 검증 및 제한

- 인증 없는 조회/저장/분석 거부, 기본 GET은 버전만 공개.
- 분석·초안 생성은 시트에 쓰지 않음.
- 같은 콘텐츠 ID·같은 내용 재시도는 중복 생성하지 않음. 저장 자동 재시도 없음.
- revision이 다르면 시트 수동 수정 내용을 덮어쓰지 않음. 헤더 불일치 시 작업 중단.
- 수식처럼 시작하는 입력은 문자열 저장. 로그에는 요청 ID·종류·소요시간·성공 여부만 포함.
- 선택 원본 최대 4장, 원본당 12MB. 브라우저에서 가로 최대 1200px·세로 약 2000px 구간으로 분할하며 경계 100px를 겹쳐 읽습니다. AI 전송은 최대 24구간·각 2MB·base64 합계 11MB 이내. 원본은 로컬 보관.
- 허용 도메인 밖 페이지·이미지는 요청하지 않음. 자동 수집 차단·동적 페이지는 설명 붙여넣기와 캡처 업로드로 보완.
- 테스트 데이터 등록은 사용자와 내용을 확인한 뒤 수행.
- Pages에서 실제 교차 출처 응답을 반드시 확인. 접근 설정/브라우저 정책에 따른 오류를 숨기거나 `no-cors`로 성공 처리하지 않음.

## 최초 완료 체크리스트

- [x] 전용 GitHub 저장소와 시트 준비
- [x] 정적 화면·Apps Script 코드 작성
- [x] 사용자가 생성한 개인 계정의 새 Apps Script에 로컬 연결
- [x] 분리된 개인 계정 clasp 로그인·업로드
- [ ] 초기화 함수 실행·Gemini 키 입력
- [ ] 웹앱 배포 및 접속 코드로 연결
- [ ] 테스트 데이터로 등록·조회·수정·AI 분석 검증
- [x] GitHub Pages `main /docs` 설정
- [ ] 공개 화면 확인 및 실제 API 통신 검증

## 변경 이력

v1.0.0: 등록/관리 화면, 상세 이미지 수집, Gemini 이미지 분석과 대본·플랫폼 게시글, 접속 코드 인증, 검토형 시트 저장, 중복 저장 및 동시 수정 방지.

v1.0.1: 개인 계정의 사용자 생성 프로젝트로 이전. 업무용 계정의 API 주소 제거.

v1.0.2: 개인 계정 인증·Apps Script API 활성화 후 서버 코드 업로드 및 개인 웹앱 신규 배포 완료. 화면 API 주소를 개인 프로젝트 배포로 연결. 캐시 버전 갱신.

개인 Apps Script 배포 버전: **v1**, 설명 `HIKARY personal v1.0.1 initial backend` (서버 소스 버전 1.0.1). 초기화 함수 실행·권한 승인·Gemini 키 입력·실제 시트 통신은 별도 확인 필요.

v1.1.0: 쿠팡 트래블 `travel-detail-product-data` 우선 파싱, 상품/상세 이미지 구분, 메뉴·아이콘 제외, 소개·이용·예약·취소 조건 추출. 큰 상세 이미지 다운로드와 브라우저 자동 분할 지원. 기본 모델이나 기존 스크립트 속성은 수정하지 않습니다.

자동 테스트 20개 통과. 사용자 제공 실제 상품(30000011240405)의 HTML에서 실제 상품명·상세 설명 약 1553자·상품 사진 2장·상세 이미지 1장 추출 확인. 780×34439px 원본의 19구간 분할 범위·캔버스 호출을 테스트했습니다. 실제 브라우저 화면/이미지 디코딩과 유료 Gemini 결과는 사용자 사이트에서 추가 검증이 필요합니다. 실제 시트 테스트 데이터 기록과 유료 호출은 수행하지 않았습니다.

공개 화면: https://hikary83.github.io/content-manager/

개인 프로젝트 편집기: https://script.google.com/d/1SOENT-Zs4l_7MDBtFXWxPuh7Fkism_Fx6gLpAcUmIRgZjkp8PHmH2PoC/edit
