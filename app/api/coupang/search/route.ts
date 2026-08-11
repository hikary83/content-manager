import { getChatGPTUser } from "../../../chatgpt-auth";
import { searchCoupangProducts } from "../../../lib/coupang-api";
import {
  getCoupangCredentials,
  readProductCache,
  writeProductCache,
} from "../../../lib/coupang-store";

export const dynamic = "force-dynamic";

type SearchPayload = {
  products: Awaited<ReturnType<typeof searchCoupangProducts>>;
  query: string;
  refreshedAt: number;
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 2) return Response.json({ error: "두 글자 이상 검색해주세요." }, { status: 400 });
  if (query.length > 80) return Response.json({ error: "검색어가 너무 길어요." }, { status: 400 });

  try {
    const cacheKey = `search:${query.toLocaleLowerCase("ko-KR")}`;
    const cached = await readProductCache<SearchPayload>(user.userId, cacheKey);
    if (cached) return Response.json({ ...cached, cached: true });

    const credentials = await getCoupangCredentials(user.userId);
    if (!credentials) {
      return Response.json({ error: "먼저 쿠팡 파트너스 API를 연결해주세요.", code: "NOT_CONFIGURED" }, { status: 409 });
    }

    const payload: SearchPayload = {
      products: await searchCoupangProducts(credentials, query),
      query,
      refreshedAt: Date.now(),
    };
    await writeProductCache(user.userId, cacheKey, payload, 30 * 60 * 1000);
    return Response.json({ ...payload, cached: false });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "쿠팡 상품 검색에 실패했어요." },
      { status: 502 },
    );
  }
}
