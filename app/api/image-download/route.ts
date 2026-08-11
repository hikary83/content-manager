const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.includes(":")) return true;

  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function safeSource(value: string | null) {
  if (!value) throw new Error("다운로드할 이미지 주소가 없어요.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isBlockedHost(url.hostname)) {
    throw new Error("공개 이미지 주소만 내려받을 수 있어요.");
  }
  return url;
}

function safeName(value: string | null, contentType: string) {
  const extension = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : contentType.includes("gif") ? ".gif" : ".jpg";
  const base = (value || "HIKARY-product-image").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "HIKARY-product-image";
  return /\.(?:jpe?g|png|webp|gif)$/i.test(base) ? base : `${base}${extension}`;
}

async function fetchImage(initialUrl: URL) {
  let current = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("이미지 이동 주소를 확인하지 못했어요.");
      current = safeSource(new URL(location, current).href);
      continue;
    }
    return response;
  }
  throw new Error("상품 이미지를 불러오지 못했어요.");
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const source = safeSource(requestUrl.searchParams.get("url"));
    const response = await fetchImage(source);
    if (!response.ok) throw new Error("상품 이미지를 불러오지 못했어요.");

    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!contentType.startsWith("image/")) throw new Error("이미지 파일이 아닌 주소예요.");
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_IMAGE_BYTES) throw new Error("이미지 파일이 너무 커요.");

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("이미지 파일이 너무 커요.");
    const fileName = safeName(requestUrl.searchParams.get("name"), contentType);

    return new Response(bytes, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "content-length": String(bytes.byteLength),
        "content-type": contentType,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "이미지를 내려받지 못했어요." }, { status: 400 });
  }
}
