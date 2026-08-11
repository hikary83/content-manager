import { getChatGPTUser } from "../../../chatgpt-auth";
import { deleteProject, getProject, listProjectAssets, updateProject } from "../../../lib/project-store";
import { projectInput } from "../route";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId } = await context.params;
  const project = await getProject(user.userId, projectId);
  if (!project) return Response.json({ error: "프로젝트를 찾지 못했어요." }, { status: 404 });
  return Response.json({ project, assets: await listProjectAssets(user.userId, projectId) });
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId } = await context.params;
  const input = projectInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "프로젝트 정보를 확인해주세요." }, { status: 400 });
  const project = await updateProject(user.userId, projectId, input);
  if (!project) return Response.json({ error: "프로젝트를 찾지 못했어요." }, { status: 404 });
  return Response.json({ project });
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { projectId } = await context.params;
  if (!await deleteProject(user.userId, projectId)) return Response.json({ error: "프로젝트를 찾지 못했어요." }, { status: 404 });
  return Response.json({ deleted: true });
}
