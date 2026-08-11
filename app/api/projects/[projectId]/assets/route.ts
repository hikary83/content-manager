import { getChatGPTUser } from "../../../../chatgpt-auth";
import { addProjectAsset, getProject, listProjectAssets, mediaBucket } from "../../../../lib/project-store";

export const dynamic = "force-dynamic";

const kinds = new Set(["product", "reference", "storyboard", "video", "thumbnail"]);
const maxBytes = 100 * 1024 * 1024;

function safeFileName(value: string) {
  return value.replace(/[\r\n"\\/]+/g, "-").slice(0, 180) || "asset";
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId } = await context.params;
  if (!await getProject(user.userId, projectId)) return Response.json({ error: "프로젝트를 찾지 못했어요." }, { status: 404 });
  return Response.json({ assets: await listProjectAssets(user.userId, projectId) });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId } = await context.params;
  if (!await getProject(user.userId, projectId)) return Response.json({ error: "프로젝트를 찾지 못했어요." }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  const requestedKind = String(form.get("kind") ?? "reference");
  const kind = kinds.has(requestedKind) ? requestedKind : "reference";
  if (!(file instanceof File)) return Response.json({ error: "업로드할 파일을 선택해주세요." }, { status: 400 });
  if (file.size <= 0 || file.size > maxBytes) return Response.json({ error: "파일은 100MB 이하로 올려주세요." }, { status: 413 });
  if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) return Response.json({ error: "이미지 또는 영상 파일만 저장할 수 있어요." }, { status: 415 });

  const id = crypto.randomUUID();
  const objectKey = `${user.userId}/${projectId}/${id}-${safeFileName(file.name)}`;
  await mediaBucket().put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { userId: user.userId, projectId, kind },
  });
  const asset = await addProjectAsset(user.userId, projectId, {
    id, kind, fileName: safeFileName(file.name), contentType: file.type || "application/octet-stream", objectKey, size: file.size,
  });
  return Response.json({ asset: { ...asset, url: `/api/projects/${projectId}/assets/${id}` } }, { status: 201 });
}
