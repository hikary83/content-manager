const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;

export type VeoModel = "veo-3.1-fast-generate-preview" | "veo-3.1-generate-preview";

type InlineMedia = {
  mimeType: string;
  data: string;
};

type VeoOperation = {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string; mimeType?: string } }>;
    };
  };
};

function googleError(status: number, body: unknown) {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const error = record?.error && typeof record.error === "object" ? record.error as Record<string, unknown> : null;
  const raw = typeof error?.message === "string" ? error.message : "Google 영상 API 요청에 실패했어요.";
  if (status === 400) return new Error(`영상 요청 내용을 확인해주세요. ${raw}`);
  if (status === 401 || status === 403) return new Error("Gemini API 키, 결제 설정 또는 Veo 사용 권한을 확인해주세요.");
  if (status === 429) return new Error("Veo 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.");
  return new Error(raw);
}

async function googleFetch(apiKey: string, path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw googleError(response.status, body);
  return body;
}

export async function validateGeminiApiKey(apiKey: string) {
  await googleFetch(apiKey, "models/veo-3.1-fast-generate-preview", { method: "GET" });
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":")) return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function safePublicUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isPrivateHost(url.hostname)) {
    throw new Error("공개된 상품 이미지만 영상에 사용할 수 있어요.");
  }
  return url;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function parseDataUrl(value: string): InlineMedia | null {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const estimatedBytes = Math.floor(match[2].length * 0.75);
  if (estimatedBytes > MAX_IMAGE_BYTES) throw new Error("상품 이미지는 8MB 이하로 올려주세요.");
  return { mimeType: match[1], data: match[2] };
}

export async function loadProductImage(image: string): Promise<InlineMedia | null> {
  if (!image.trim()) return null;
  const inline = parseDataUrl(image.trim());
  if (inline) return inline;

  let current = safePublicUrl(image.trim());
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "image/png,image/jpeg,image/webp" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("상품 이미지 주소를 따라갈 수 없어요.");
      current = safePublicUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) throw new Error("상품 이미지를 불러오지 못했어요. 이미지를 직접 올려주세요.");
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      throw new Error("JPG, PNG, WEBP 상품 이미지만 사용할 수 있어요.");
    }
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_IMAGE_BYTES) throw new Error("상품 이미지는 8MB 이하로 올려주세요.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("상품 이미지는 8MB 이하로 올려주세요.");
    return { mimeType, data: bytesToBase64(bytes) };
  }
  throw new Error("상품 이미지의 이동 경로가 너무 길어요.");
}

export async function startVeoVideo(
  apiKey: string,
  model: VeoModel,
  prompt: string,
  image: InlineMedia | null,
) {
  const instance: Record<string, unknown> = { prompt };
  if (image) {
    instance.image = {
      bytesBase64Encoded: image.data,
      mimeType: image.mimeType,
    };
  }
  const operation = await googleFetch(apiKey, `models/${model}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({
      instances: [instance],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: 8,
        resolution: "720p",
        personGeneration: image ? "allow_adult" : "allow_all",
        numberOfVideos: 1,
      },
    }),
  }) as VeoOperation;
  if (!operation.name) throw new Error("영상 생성 작업 번호를 받지 못했어요.");
  return operation.name;
}

export async function getVeoOperation(apiKey: string, operationName: string) {
  if (!/^operations\/[A-Za-z0-9._/-]+$/.test(operationName)) throw new Error("잘못된 영상 작업 번호예요.");
  return googleFetch(apiKey, operationName, { method: "GET" }) as Promise<VeoOperation>;
}

export function operationVideoUri(operation: VeoOperation) {
  if (operation.error) throw new Error(operation.error.message || "Veo가 영상을 생성하지 못했어요.");
  return operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? null;
}

export async function downloadGoogleVideo(apiKey: string, uri: string) {
  const url = new URL(uri);
  if (url.protocol !== "https:" || !url.hostname.endsWith("googleapis.com")) {
    throw new Error("Google 영상 주소가 올바르지 않아요.");
  }
  const response = await fetch(url, {
    headers: { "x-goog-api-key": apiKey },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error("생성된 영상을 가져오지 못했어요.");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_VIDEO_BYTES) throw new Error("생성된 영상 용량이 너무 커요.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("생성된 영상 용량이 너무 커요.");
  return { bytes, mimeType: response.headers.get("content-type") ?? "video/mp4" };
}

export async function startVeoExtension(
  apiKey: string,
  model: VeoModel,
  prompt: string,
  videoUri: string,
) {
  const url = new URL(videoUri);
  if (url.protocol !== "https:" || !url.hostname.endsWith("googleapis.com")) {
    throw new Error("Google 영상 주소가 올바르지 않아요.");
  }
  const operation = await googleFetch(apiKey, `models/${model}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({
      instances: [{
        prompt,
        video: { uri: videoUri },
      }],
      parameters: { numberOfVideos: 1, resolution: "720p" },
    }),
  }) as VeoOperation;
  if (!operation.name) throw new Error("영상 확장 작업 번호를 받지 못했어요.");
  return operation.name;
}
