import { getChatGPTUser } from "../../../chatgpt-auth";
import { fetchGoldbox } from "../../../lib/coupang-api";
import {
  deleteCoupangCredentials,
  getCoupangSettingsStatus,
  saveCoupangCredentials,
  type CoupangCredentials,
} from "../../../lib/coupang-store";

export const dynamic = "force-dynamic";

async function authenticatedUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  try {
    return Response.json(await getCoupangSettingsStatus(user.userId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "설정 상태를 확인하지 못했어요." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  try {
    const body = await request.json() as Partial<CoupangCredentials>;
    const accessKey = typeof body.accessKey === "string" ? body.accessKey.trim() : "";
    const secretKey = typeof body.secretKey === "string" ? body.secretKey.trim() : "";
    const subId = typeof body.subId === "string" ? body.subId.trim() : "";
    if (accessKey.length < 8 || secretKey.length < 8) {
      return Response.json({ error: "Access Key와 Secret Key를 정확히 입력해주세요." }, { status: 400 });
    }
    if (accessKey.length > 200 || secretKey.length > 300 || subId.length > 100) {
      return Response.json({ error: "입력한 API 값이 너무 길어요." }, { status: 400 });
    }

    const credentials: CoupangCredentials = { accessKey, secretKey, ...(subId ? { subId } : {}) };
    await fetchGoldbox(credentials);
    const saved = await saveCoupangCredentials(user.userId, credentials);
    return Response.json({ configured: true, ...saved });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "쿠팡 API 설정을 저장하지 못했어요." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  try {
    await deleteCoupangCredentials(user.userId);
    return Response.json({ configured: false });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "쿠팡 API 설정을 삭제하지 못했어요." },
      { status: 500 },
    );
  }
}
