import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  deleteGeminiCredentials,
  getGeminiSettingsStatus,
  saveGeminiCredentials,
} from "../../../lib/gemini-store";
import { validateGeminiApiKey } from "../../../lib/veo-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  try {
    return Response.json(await getGeminiSettingsStatus(user.userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Veo 설정을 확인하지 못했어요." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  try {
    const body = await request.json() as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (apiKey.length < 20 || apiKey.length > 300) {
      return Response.json({ error: "Google AI Studio에서 발급받은 API 키를 정확히 입력해주세요." }, { status: 400 });
    }
    await validateGeminiApiKey(apiKey);
    const saved = await saveGeminiCredentials(user.userId, { apiKey });
    return Response.json({ configured: true, ...saved });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Veo API 설정을 저장하지 못했어요." }, { status: 400 });
  }
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  try {
    await deleteGeminiCredentials(user.userId);
    return Response.json({ configured: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Veo API 연결을 해제하지 못했어요." }, { status: 500 });
  }
}
