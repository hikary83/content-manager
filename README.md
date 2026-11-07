# HIKARY 콘텐츠 기록

서비스 버전 **v2.1.0** · 2026-11-08

쿠팡 상품으로 쇼츠·캐러셀을 **Claude에서 직접 만들고**, 이 웹에는 등록 이력과 플랫폼별 업로드 기록만 남깁니다.
작업 기준은 [CLAUDE.md](CLAUDE.md)(지시서), 설정·배포·변경 이력은 [SETUP.md](SETUP.md)를 참고하세요.

```powershell
node scripts/preview-mock.mjs        # 가짜 데이터로 화면 확인 → http://127.0.0.1:4175/
node tools/carousel/render.mjs contents/<폴더>/carousel.html
node tools/register.mjs save contents/<폴더>/entry.json   # 「등록해줘」일 때만
node --test tests/content-backend.test.mjs tests/content-client.test.mjs tests/travel-extraction.test.mjs tests/production.test.mjs tests/reel.test.mjs tests/reference.test.mjs tests/carousel.test.mjs tests/motion.test.mjs
```

- 웹(`docs/`, GitHub Pages `main /docs`): 「기록」 탭은 상품별 묶음, 콘텐츠 보기·수정·삭제, 업로드 기록 등록·수정·지우기. 「상품 찾기」 탭은 쿠팡 파트너스 API로 특가·카테고리 베스트·검색을 보여 주고 남은 API 횟수를 표시합니다.
- 서버(`backend/`, Apps Script): `status` · `list` · `save` · `delete` · `products`(쿠팡 상품 찾기, 한 시간 20회·6시간 저장). 접속 코드 없이 공개되어 있어 서버 주소를 아는 누구나 호출할 수 있습니다. Gemini 동작은 웹에서 쓰지 않지만 남아 있습니다(일일 한도로 제한).
- 운영대장(Google Sheets)에는 콘텐츠 ID·등록일·카테고리·상품명·원본/변환 링크·대본·플랫폼별 게시글/상태·비고·형식·업로드일·게시물 링크를 저장합니다. 사진·영상 파일은 저장하지 않습니다.
- 만든 파일은 각 PC의 `contents/`에 둡니다(git 제외).

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
