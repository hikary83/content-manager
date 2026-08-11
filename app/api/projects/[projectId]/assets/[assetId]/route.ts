import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { deleteProjectAsset, getProjectAsset, mediaBucket } from "../../../../../lib/project-store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; assetId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId, assetId } = await context.params;
  const asset = await getProjectAsset(user.userId, projectId, assetId);
  if (!asset) return Response.json({ error: "파일을 찾지 못했어요." }, { status: 404 });
  const object = await mediaBucket().get(asset.objectKey);
  if (!object) return Response.json({ error: "저장된 파일을 찾지 못했어요." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": asset.contentType,
      "content-length": String(asset.size),
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
      "cache-control": "private, max-age=300",
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string; assetId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId, assetId } = await context.params;
  if (!await deleteProjectAsset(user.userId, projectId, assetId)) return Response.json({ error: "파일을 찾지 못했어요." }, { status: 404 });
  return Response.json({ deleted: true });
}
