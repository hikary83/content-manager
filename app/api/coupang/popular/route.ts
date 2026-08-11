import { getChatGPTUser } from "../../../chatgpt-auth";
import { fetchPopularProducts } from "../../../lib/coupang-api";
import {
  getCoupangCredentials,
  readProductCache,
  writeProductCache,
} from "../../../lib/coupang-store";

export const dynamic = "force-dynamic";

type PopularPayload = {
  products: Awaited<ReturnType<typeof fetchPopularProducts>>;
  refreshedAt: number;
};

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  try {
    const cached = await readProductCache<PopularPayload>(user.userId, "popular:v1");
    if (cached) return Response.json({ ...cached, cached: true });

    const credentials = await getCoupangCredentials(user.userId);
    if (!credentials) {
      return Response.json({ error: "먼저 쿠팡 파트너스 API를 연결해주세요.", code: "NOT_CONFIGURED" }, { status: 409 });
    }

    const payload: PopularPayload = {
      products: await fetchPopularProducts(credentials),
      refreshedAt: Date.now(),
    };
    await writeProductCache(user.userId, "popular:v1", payload, 30 * 60 * 1000);
    return Response.json({ ...payload, cached: false });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "추천 상품을 가져오지 못했어요." },
      { status: 502 },
    );
  }
}
