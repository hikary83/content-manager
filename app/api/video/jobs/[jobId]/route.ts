import { getChatGPTUser } from "../../../../chatgpt-auth";
import {
  claimVideoExtension,
  completeVideoJob,
  failVideoJob,
  getGeminiCredentials,
  getVideoJob,
  setVideoJobExtending,
  type VideoJob,
} from "../../../../lib/gemini-store";
import { downloadGoogleVideo, getVeoOperation, operationVideoUri, startVeoExtension, type VeoModel } from "../../../../lib/veo-api";

export const dynamic = "force-dynamic";

function publicJob(job: VideoJob) {
  const progress = job.status === "generating" ? 32
    : job.status === "starting_extension" ? 56
      : job.status === "extending" ? 78
        : job.status === "complete" ? 100
          : 0;
  return {
    jobId: job.id,
    status: job.status,
    progress,
    error: job.errorMessage,
    expiresAt: job.expiresAt,
    videoUrl: job.status === "complete" ? `/api/video/jobs/${job.id}/download` : null,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { jobId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "영상 작업 번호가 올바르지 않아요." }, { status: 400 });

  let job = await getVideoJob(user.userId, jobId);
  if (!job) return Response.json({ error: "영상 작업을 찾지 못했어요." }, { status: 404 });
  if (job.status === "complete" || job.status === "failed") {
    return Response.json(publicJob(job));
  }
  if (job.status === "starting_extension" && Date.now() - job.updatedAt < 90_000) return Response.json(publicJob(job));

  const credentials = await getGeminiCredentials(user.userId);
  if (!credentials) return Response.json({ error: "Google Veo API 연결이 해제됐어요." }, { status: 409 });

  try {
    if (job.status === "starting_extension") {
      if (!job.baseVideoUri) throw new Error("첫 장면 영상 주소를 찾지 못했어요.");
      const baseVideo = await downloadGoogleVideo(credentials.apiKey, job.baseVideoUri);
      const extensionOperation = await startVeoExtension(
        credentials.apiKey,
        job.model as VeoModel,
        job.extensionPrompt,
        baseVideo.bytes,
      );
      await setVideoJobExtending(user.userId, job.id, extensionOperation);
      job = await getVideoJob(user.userId, job.id) ?? { ...job, status: "extending", operationName: extensionOperation };
      return Response.json(publicJob(job));
    }

    const operation = await getVeoOperation(credentials.apiKey, job.operationName);
    if (!operation.done) return Response.json(publicJob(job));
    const videoUri = operationVideoUri(operation);
    if (!videoUri) throw new Error("완성된 영상 주소를 받지 못했어요.");

    if (job.status === "generating") {
      const claimed = await claimVideoExtension(user.userId, job.id, videoUri);
      if (!claimed) {
        job = await getVideoJob(user.userId, job.id) ?? job;
        return Response.json(publicJob(job));
      }
      const baseVideo = await downloadGoogleVideo(credentials.apiKey, videoUri);
      const extensionOperation = await startVeoExtension(
        credentials.apiKey,
        job.model as VeoModel,
        job.extensionPrompt,
        baseVideo.bytes,
      );
      await setVideoJobExtending(user.userId, job.id, extensionOperation);
      job = await getVideoJob(user.userId, job.id) ?? { ...job, status: "extending", operationName: extensionOperation };
      return Response.json(publicJob(job));
    }

    await completeVideoJob(user.userId, job.id, videoUri);
    job = await getVideoJob(user.userId, job.id) ?? { ...job, status: "complete", videoUri };
    return Response.json(publicJob(job));
  } catch (error) {
    const message = error instanceof Error ? error.message : "영상 생성 상태를 확인하지 못했어요.";
    await failVideoJob(user.userId, job.id, message);
    return Response.json({ ...publicJob({ ...job, status: "failed", errorMessage: message }), error: message });
  }
}
