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
  return {
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
  return [...unique.values()].slice(0, 40);
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
