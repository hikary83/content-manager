import { getChatGPTUser } from "../../chatgpt-auth";
import { createProject, listProjects, type ProjectInput, type ProjectStatus } from "../../lib/project-store";

export const dynamic = "force-dynamic";

const statuses = new Set<ProjectStatus>(["draft", "planning", "producing", "editing", "ready", "published"]);

function projectInput(value: unknown): ProjectInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const productName = typeof body.productName === "string" ? body.productName.trim().slice(0, 200) : "";
  const status = typeof body.status === "string" && statuses.has(body.status as ProjectStatus) ? body.status as ProjectStatus : "draft";
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
  if (!title || !productName) return null;
  return {
    title,
    productName,
    status,
    data,
    coupangUrl: typeof body.coupangUrl === "string" ? body.coupangUrl.slice(0, 2000) : "",
    infoqUrl: typeof body.infoqUrl === "string" ? body.infoqUrl.slice(0, 2000) : "",
    publishUrl: typeof body.publishUrl === "string" ? body.publishUrl.slice(0, 2000) : "",
    publishedAt: typeof body.publishedAt === "number" ? body.publishedAt : null,
  };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  return Response.json({ projects: await listProjects(user.userId) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const input = projectInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "프로젝트 이름과 상품 정보를 확인해주세요." }, { status: 400 });
  return Response.json({ project: await createProject(user.userId, input) }, { status: 201 });
}

export { projectInput };
