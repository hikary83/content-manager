type ProductData = {
  name?: string;
  description?: string;
  image?: string;
  price?: string;
  originalPrice?: string;
  currency?: string;
  sourceUrl: string;
};

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":")
  ) {
    return true;
  }

  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function validateUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("올바른 상품 페이지 주소를 입력해주세요.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("http 또는 https로 시작하는 공개 상품 주소만 사용할 수 있어요.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error("공개 쇼핑몰의 상품 주소만 사용할 수 있어요.");
  }
  return url;
}

function readAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : "";
}

function metaContent(html: string, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const key = (readAttribute(tag, "property") || readAttribute(tag, "name") || readAttribute(tag, "itemprop")).toLowerCase();
    if (wanted.has(key)) return readAttribute(tag, "content");
  }
  return "";
}

function formatPrice(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const normalized = String(value).replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0];
  if (!normalized) return "";
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return "";
  return Math.round(amount).toLocaleString("ko-KR");
}

function findProductJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findProductJson(item);
      if (match) return match;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (
    (typeof type === "string" && type.toLowerCase() === "product") ||
    (Array.isArray(type) && type.some((item) => String(item).toLowerCase() === "product"))
  ) {
    return record;
  }

  for (const child of Object.values(record)) {
    const match = findProductJson(child);
    if (match) return match;
  }
  return null;
}

function getJsonLdProduct(html: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeHtml(script[1]).replace(/^<!--|-->$/g, ""));
      const product = findProductJson(parsed);
      if (product) return product;
    } catch {
      // Some shops publish malformed JSON-LD. Open Graph data is used instead.
    }
  }
  return null;
}

function firstOffer(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value.find((item) => item && typeof item === "object") as Record<string, unknown>) ?? null;
  return typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function imageFromProduct(value: unknown) {
  const image = Array.isArray(value) ? value[0] : value;
  if (typeof image === "string") return image;
  if (image && typeof image === "object") {
    const record = image as Record<string, unknown>;
    return typeof record.url === "string" ? record.url : typeof record.contentUrl === "string" ? record.contentUrl : "";
  }
  return "";
}

function absoluteUrl(value: string, base: URL) {
  if (!value) return "";
  try {
    const resolved = new URL(value, base);
    return ["http:", "https:"].includes(resolved.protocol) && !isBlockedHost(resolved.hostname) ? resolved.href : "";
  } catch {
    return "";
  }
}

async function fetchPage(initialUrl: URL) {
  let current = initialUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(9_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; HIKARYProductImporter/1.0)",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("상품 페이지의 이동 경로가 너무 길어요.");
      current = validateUrl(new URL(location, current).href);
      continue;
    }

    if (!response.ok) {
      throw new Error(response.status === 403 || response.status === 429
        ? "이 쇼핑몰이 자동 상품 정보 수집을 허용하지 않아요. 아래 항목을 직접 입력해주세요."
        : `상품 페이지를 불러오지 못했어요. (응답 ${response.status})`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("상품 상세 페이지 주소인지 확인해주세요.");
    }

    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_HTML_BYTES) throw new Error("상품 페이지가 너무 커서 자동으로 읽을 수 없어요.");

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
      throw new Error("상품 페이지가 너무 커서 자동으로 읽을 수 없어요.");
    }
    return { html, finalUrl: current };
  }

  throw new Error("상품 페이지를 불러오지 못했어요.");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return Response.json({ error: "상품 페이지 주소를 입력해주세요." }, { status: 400 });
    }

    const requestedUrl = validateUrl(body.url.trim());
    const { html, finalUrl } = await fetchPage(requestedUrl);
    const product = getJsonLdProduct(html);
    const offer = firstOffer(product?.offers);

    const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const name = decodeHtml(
      metaContent(html, ["og:title", "twitter:title"]) ||
      (typeof product?.name === "string" ? product.name : "") ||
      titleTag,
    );
    const description = decodeHtml(
      metaContent(html, ["og:description", "twitter:description", "description"]) ||
      (typeof product?.description === "string" ? product.description : ""),
    ).slice(0, 500);
    const rawImage = metaContent(html, ["og:image:secure_url", "og:image", "twitter:image"]) || imageFromProduct(product?.image);
    const price = formatPrice(
      offer?.price ??
      offer?.lowPrice ??
      metaContent(html, ["product:sale_price:amount", "product:price:amount", "og:price:amount"]),
    );
    const originalPrice = formatPrice(
      offer?.highPrice ?? metaContent(html, ["product:original_price:amount", "product:regular_price:amount"]),
    );
    const currency = String(
      offer?.priceCurrency ?? metaContent(html, ["product:price:currency", "og:price:currency"]) ?? "KRW",
    );

    const data: ProductData = {
      name: name.slice(0, 150),
      description,
      image: absoluteUrl(rawImage, finalUrl),
      price,
      originalPrice,
      currency,
      sourceUrl: finalUrl.href,
    };
    const found = [data.name, data.description, data.image, data.price].filter(Boolean).length;
    if (found === 0) {
      return Response.json(
        { error: "페이지는 열렸지만 상품 정보를 찾지 못했어요. 아래 항목을 직접 입력해주세요." },
        { status: 422 },
      );
    }

    return Response.json(data);
  } catch (error) {
    let message = "상품 페이지에 연결하지 못했어요. 주소를 확인하거나 아래 항목을 직접 입력해주세요.";
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
        message = "상품 페이지 응답이 늦어 불러오기를 중단했어요. 잠시 후 다시 시도해주세요.";
      } else if (error.name !== "TypeError" && error.message !== "fetch failed") {
        message = error.message;
      }
    }
    return Response.json({ error: message }, { status: 400 });
  }
}
