# HIKARY 콘텐츠 매니저

서비스 버전 **v1.5.0** · 2026-10-31

현재 개발 구조는 `docs/` 정적 화면 + `backend/` Apps Script + Google Sheets + Gemini입니다.
신규 설정·로컬 실행·배포·변경 이력은 [SETUP.md](SETUP.md)를 참고하세요.

```powershell
node scripts/preview-content.mjs
node --test tests/content-backend.test.mjs tests/content-client.test.mjs tests/travel-extraction.test.mjs tests/image-analysis.test.mjs tests/production.test.mjs tests/reel.test.mjs tests/reference.test.mjs tests/carousel.test.mjs
```

로컬 화면: http://127.0.0.1:4173/ · GitHub Pages 배포 대상: `main /docs`.
이미지와 영상은 로컬에서 관리하고 AI가 만든 초안은 검토 후 등록합니다.
상품 분석 후 18초·4컷 대본/후반 자막/화면 연출을 만들고, 컷별 사진 선택·상세 이미지 영역 자르기·다운로드를 지원합니다. 웹은 제작 파일을 내보내고, `scripts/reel/`의 Windows 도구가 로컬 TTS/녹음과 ffmpeg로 자막 없는 MP4를 생성합니다. 레퍼런스/완성 영상은 프레임 검수 후 사람이 확인합니다. [Windows 실행 안내](SETUP.md#v130-zip-참고-분석-및-windows-영상-파이프라인)
제작안은 기존 대본 셀에 함께 저장하며, 다시 열면 텍스트를 복원합니다. 사진은 로컬에서 다시 추가합니다.
레퍼런스 MP4·WebM(40MB/180초 이내)을 웹에서 선택해 재생하고 주요 화면을 Gemini로 분석할 수 있습니다. 화면·선택 입력 전사의 전송 동의 후 실행되며 사용량/요금이 발생할 수 있습니다. 링크는 원본 확인용이며 SNS 영상을 자동 다운로드하지 않습니다. 음성 자동 청취/전사는 지원하지 않습니다. 분석 초안을 확인하고 연출 패턴을 메모로 반영한 뒤 제작안을 생성하세요.
운영대장에는 콘텐츠 ID·등록일·카테고리·상품명·원본/변환 링크·대본·플랫폼별 게시글/상태·비고를 저장합니다.
Gemini 키·접속 코드는 새 Apps Script 스크립트 속성에서만 설정합니다.
`캐러셀 만들기`: 상품 링크 → 기존 상품 분석 → Gemini 5장 문구 → 1080×1350 PNG 5장. 제목/본문/사진/게시글/하단 고지를 수정하고 PNG·TXT를 내려받습니다. 사진은 실제 상품 사진을 사용하며 AI로 새 이미지를 그리지 않습니다. 초안은 탭 메모리에만 유지되고 기존 쇼츠 등록/시트 저장/자동 게시와 분리됩니다.

이전 Sites 소스는 아래 설명과 `app/`, `worker/`, `db/`에 보존되어 있으며 Pages 배포 대상이 아닙니다.
백업 태그: `legacy-chatgpt-sites-2026-08-11`.

## 이전 Sites 스타터 참고

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
