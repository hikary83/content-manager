import type { CoupangCredentials } from "./coupang-store";

export type CoupangProduct = {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  rank?: number;
  isRocket?: boolean;
  isFreeShipping?: boolean;
  source?: string;
  shortsScore?: number;
  shortsReasons?: string[];
  recommendationType?: "opportunity" | "proven";
};

const API_ORIGIN = "https://api-gateway.coupang.com";
const AFFILIATE_API_ROOT = "/v2/providers/affiliate_open_api/apis/openapi";

export class CoupangApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CoupangApiError";
    this.status = status;
  }
}

function signedDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getUTCFullYear()).slice(-2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

async function hmacHex(secretKey: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestCoupang(
  path: string,
  searchParams: URLSearchParams,
  credentials: CoupangCredentials,
) {
  if (credentials.subId) searchParams.set("subId", credentials.subId);
  const query = searchParams.toString();
  const datetime = signedDate();
  const signature = await hmacHex(credentials.secretKey, `${datetime}GET${path}${query}`);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${credentials.accessKey}, signed-date=${datetime}, signature=${signature}`;
  const response = await fetch(`${API_ORIGIN}${path}${query ? `?${query}` : ""}`, {
    headers: {
      authorization,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  let json: Record<string, unknown>;
  try {
    json = await response.json() as Record<string, unknown>;
  } catch {
    throw new CoupangApiError("쿠팡 API 응답을 읽지 못했어요. 잠시 후 다시 시도해주세요.", response.status || 502);
  }

  if (!response.ok || (json.rCode != null && String(json.rCode) !== "0")) {
    const apiMessage = typeof json.rMessage === "string" ? json.rMessage : "";
    if (response.status === 401 || response.status === 403) {
      throw new CoupangApiError("Access Key와 Secret Key를 확인해주세요.", response.status);
    }
    if (response.status === 429) {
      throw new CoupangApiError("쿠팡 API 호출 한도에 도달했어요. 잠시 후 다시 시도해주세요.", 429);
    }
    throw new CoupangApiError(apiMessage || "쿠팡 상품 정보를 가져오지 못했어요.", response.status || 502);
  }
  return json;
}

function productArray(json: Record<string, unknown>) {
  const data = json.data;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.productData)) return record.productData;
  if (Array.isArray(record.products)) return record.products;
  return [];
}

function normalizeProduct(value: unknown, source: string): CoupangProduct | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const productId = String(item.productId ?? item.vendorItemId ?? "");
  const productName = typeof item.productName === "string" ? item.productName.trim() : "";
  const productImage = typeof item.productImage === "string" ? item.productImage : typeof item.image === "string" ? item.image : "";
  const productUrl = typeof item.productUrl === "string" ? item.productUrl : typeof item.url === "string" ? item.url : "";
  const productPrice = Number(item.productPrice ?? item.price ?? 0);
  if (!productId || !productName || !productUrl) return null;
  const product: CoupangProduct = {
    productId,
    productName,
    productPrice: Number.isFinite(productPrice) ? productPrice : 0,
    productImage,
    productUrl,
    rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : undefined,
    isRocket: Boolean(item.isRocket),
    isFreeShipping: Boolean(item.isFreeShipping),
    source,
  };
  return scoreForShorts(product);
}

const demonstrationKeywords = ["자동", "무선", "미니", "휴대", "접이", "원터치", "세척", "청소", "제거", "정리", "수납", "커터", "마사지", "블렌더", "조명", "가습", "충전", "회전", "분사", "다기능"];
const visualKeywords = ["컬러", "LED", "투명", "거품", "광택", "코팅", "클리너", "브러시", "메이커", "필터", "패드", "스프레이", "팩", "세럼", "크림"];
const saturatedKeywords = ["생수", "우유", "라면", "화장지", "물티슈", "기저귀", "탄산음료", "즉석밥", "세제 리필"];

function scoreForShorts(product: CoupangProduct): CoupangProduct {
  const name = product.productName.toLocaleLowerCase("ko-KR");
  let score = 34;
  const reasons: string[] = [];

  const demoMatches = demonstrationKeywords.filter((keyword) => name.includes(keyword)).length;
  const visualMatches = visualKeywords.filter((keyword) => name.includes(keyword)).length;
  if (demoMatches > 0) { score += Math.min(24, demoMatches * 12); reasons.push("시연 장면이 잘 나옴"); }
  if (visualMatches > 0) { score += Math.min(16, visualMatches * 8); reasons.push("화면 변화가 뚜렷함"); }
  if (product.productPrice >= 10_000 && product.productPrice <= 59_000) { score += 14; reasons.push("충동구매 가격대"); }
  else if (product.productPrice > 0 && product.productPrice < 100_000) score += 7;
  if (product.isRocket) { score += 7; reasons.push("로켓배송"); }
  if (product.isFreeShipping) score += 3;
  if (product.productImage) score += 6;
  if (product.rank && product.rank <= 10) { score += Math.max(3, 12 - product.rank); reasons.push("판매 순위 검증"); }
  if (product.source === "골드박스") { score += 7; reasons.push("할인 매력"); }
  if (saturatedKeywords.some((keyword) => name.includes(keyword))) { score -= 20; reasons.push("경쟁 콘텐츠 많음"); }

  const shortsScore = Math.max(35, Math.min(98, score));
  if (reasons.length === 0) reasons.push("상품 인기도 기반");
  return {
    ...product,
    shortsScore,
    shortsReasons: reasons.slice(0, 3),
    recommendationType: shortsScore >= 72 ? "opportunity" : "proven",
  };
}

function productsFromResponse(json: Record<string, unknown>, source: string) {
  return productArray(json)
    .map((item) => normalizeProduct(item, source))
    .filter((item): item is CoupangProduct => Boolean(item));
}

export async function fetchGoldbox(credentials: CoupangCredentials) {
  const path = `${AFFILIATE_API_ROOT}/v1/products/goldbox`;
  const response = await requestCoupang(path, new URLSearchParams(), credentials);
  return productsFromResponse(response, "골드박스");
}

export async function fetchBestCategory(credentials: CoupangCredentials, categoryId: number, label: string) {
  const path = `${AFFILIATE_API_ROOT}/products/bestcategories/${categoryId}`;
  const response = await requestCoupang(path, new URLSearchParams({ limit: "10" }), credentials);
  return productsFromResponse(response, label);
}

export async function fetchPopularProducts(credentials: CoupangCredentials) {
  const requests = await Promise.allSettled([
    fetchGoldbox(credentials),
    fetchBestCategory(credentials, 1010, "뷰티"),
    fetchBestCategory(credentials, 1013, "주방"),
    fetchBestCategory(credentials, 1016, "가전·디지털"),
  ]);
  const products = requests.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (products.length === 0) {
    const rejection = requests.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejection?.reason instanceof Error) throw rejection.reason;
    throw new CoupangApiError("추천 상품을 가져오지 못했어요.", 502);
  }

  const unique = new Map<string, CoupangProduct>();
  for (const product of products) {
    if (!unique.has(product.productId)) unique.set(product.productId, product);
  }
  return [...unique.values()]
    .sort((left, right) => (right.shortsScore ?? 0) - (left.shortsScore ?? 0))
    .slice(0, 40);
}

export async function searchCoupangProducts(credentials: CoupangCredentials, keyword: string) {
  const path = `${AFFILIATE_API_ROOT}/products/search`;
  const response = await requestCoupang(
    path,
    new URLSearchParams({ keyword, limit: "10" }),
    credentials,
  );
  return productsFromResponse(response, `“${keyword}” 검색`);
}
