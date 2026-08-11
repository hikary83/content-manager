import { getChatGPTUser } from "../../../chatgpt-auth";
import { createVideoJob, getGeminiCredentials } from "../../../lib/gemini-store";
import { loadProductImage, startVeoVideo, type VeoModel } from "../../../lib/veo-api";

export const dynamic = "force-dynamic";

type GenerateBody = {
  productName?: unknown;
  benefit?: unknown;
  productImage?: unknown;
  price?: unknown;
  hook?: unknown;
  tone?: unknown;
  platform?: unknown;
  quality?: unknown;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function buildPrompts(body: GenerateBody) {
  const productName = clean(body.productName, 140);
  const benefit = clean(body.benefit, 700);
  const price = clean(body.price, 60);
  const hook = clean(body.hook, 160);
  const tone = clean(body.tone, 40) || "트렌디";
  const platform = clean(body.platform, 30) || "Instagram";

  const firstPrompt = `Create the opening 8 seconds of a premium vertical Korean shopping short for ${platform}.
Product: ${productName}.
Key benefit: ${benefit}.
Creative tone: ${tone}.
Start with a striking macro hero shot that preserves the exact product packaging and colors from the supplied image. In seconds 0-3, use a fast camera push-in and an instantly understandable visual hook inspired by: ${hook || productName}. In seconds 3-5, show the everyday problem the product solves using elegant visual storytelling. In seconds 5-8, reveal the product as the solution with tactile motion, realistic lighting, and a premium ecommerce commercial look. Vertical 9:16, clean composition, realistic physics, smooth continuous motion, no visible captions, no invented brand names, no distorted labels, no spoken dialogue. Use polished product sound design and upbeat background music. Leave clear space in the lower third for Korean captions.`;

  const extensionPrompt = `Continue the same vertical shopping commercial seamlessly for 7 more seconds, preserving the product, lighting, color palette, and camera language. Show the key benefit in action, then finish on a stable premium hero shot of ${productName}. ${price ? `The offer to communicate later with captions is ${price}.` : "Leave room for a price caption."} End with the product centered and clean negative space for a Korean purchase call-to-action. No visible captions, no invented text, no distorted packaging, no spoken dialogue. Keep the existing music and sound design coherent through the ending.`;

  return { productName, firstPrompt, extensionPrompt };
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  try {
    const credentials = await getGeminiCredentials(user.userId);
    if (!credentials) {
      return Response.json({ error: "먼저 Google Veo API를 연결해주세요.", code: "NOT_CONFIGURED" }, { status: 409 });
    }
    const body = await request.json() as GenerateBody;
    const prompts = buildPrompts(body);
    if (prompts.productName.length < 2) return Response.json({ error: "상품명을 입력해주세요." }, { status: 400 });

    const imageValue = clean(body.productImage, 12_000_000);
    const image = imageValue ? await loadProductImage(imageValue) : null;
    const model: VeoModel = body.quality === "quality"
      ? "veo-3.1-generate-preview"
      : "veo-3.1-fast-generate-preview";
    const operationName = await startVeoVideo(credentials.apiKey, model, prompts.firstPrompt, image);
    const now = Date.now();
    const jobId = crypto.randomUUID();
    await createVideoJob({
      id: jobId,
      userId: user.userId,
      status: "generating",
      operationName,
      model,
      productName: prompts.productName,
      firstPrompt: prompts.firstPrompt,
      extensionPrompt: prompts.extensionPrompt,
      createdAt: now,
      updatedAt: now,
    });
    return Response.json({ jobId, status: "generating", progress: 12 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "영상 생성을 시작하지 못했어요." }, { status: 400 });
  }
}
