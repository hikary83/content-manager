import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getGeminiCredentials, getVideoJob } from "../../../../../lib/gemini-store";
import { downloadGoogleVideo } from "../../../../../lib/veo-api";

export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  const printable = [...value].filter((character) => character.charCodeAt(0) >= 32).join("");
  const cleaned = printable.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
  return cleaned || "hooc-shopping-short";
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { jobId } = await context.params;
  const job = await getVideoJob(user.userId, jobId);
  if (!job || job.status !== "complete" || !job.videoUri) {
    return Response.json({ error: "다운로드할 완성 영상이 없어요." }, { status: 404 });
  }
  if (job.expiresAt && job.expiresAt <= Date.now()) {
    return Response.json({ error: "영상 보관 기간이 끝났어요. 새 영상을 만들어주세요." }, { status: 410 });
  }
  const credentials = await getGeminiCredentials(user.userId);
  if (!credentials) return Response.json({ error: "Google Veo API 연결이 해제됐어요." }, { status: 409 });
  try {
    const video = await downloadGoogleVideo(credentials.apiKey, job.videoUri);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = encodeURIComponent(`${safeFilename(job.productName)}-15s.mp4`);
    return new Response(video.bytes, {
      headers: {
        "content-type": video.mimeType,
        "content-disposition": `${disposition}; filename*=UTF-8''${filename}`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "영상을 다운로드하지 못했어요." }, { status: 502 });
  }
}
