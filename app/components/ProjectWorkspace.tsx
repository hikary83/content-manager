"use client";

import { ChangeEvent } from "react";

export type SavedAsset = {
  id: string;
  projectId: string;
  kind: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: number;
  url?: string;
};

export type SavedProject = {
  id: string;
  title: string;
  productName: string;
  status: string;
  data: Record<string, unknown>;
  coupangUrl: string;
  infoqUrl: string;
  publishUrl: string;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  assetCount: number;
};

const statusOptions = [
  ["draft", "기획 중"],
  ["planning", "Flow 제작안 완료"],
  ["producing", "영상 제작 중"],
  ["editing", "편집 중"],
  ["ready", "게시 준비"],
  ["published", "게시 완료"],
];

export function statusLabel(status: string) {
  return statusOptions.find(([value]) => value === status)?.[1] ?? "기획 중";
}

type PublishingManagerProps = {
  projectId: string | null;
  status: string;
  affiliateUrl: string;
  infoqUrl: string;
  publishUrl: string;
  publishedDate: string;
  notes: string;
  assets: SavedAsset[];
  pendingVideo: File | null;
  saving: boolean;
  message: { kind: "success" | "error"; text: string } | null;
  onStatus: (value: string) => void;
  onAffiliateUrl: (value: string) => void;
  onInfoqUrl: (value: string) => void;
  onPublishUrl: (value: string) => void;
  onPublishedDate: (value: string) => void;
  onNotes: (value: string) => void;
  onVideo: (file: File | null) => void;
  onSave: () => void;
  onDeleteAsset: (asset: SavedAsset) => void;
  onOpenLibrary: () => void;
};

export function PublishingManager(props: PublishingManagerProps) {
  const videoAssets = props.assets.filter((asset) => asset.kind === "video");
  const imageAssets = props.assets.filter((asset) => asset.kind !== "video");
  const handleVideo = (event: ChangeEvent<HTMLInputElement>) => props.onVideo(event.target.files?.[0] ?? null);

  return (
    <section className="publishing-manager" aria-labelledby="publishing-title">
      <header className="publishing-manager-head">
        <div><span>SAVE</span><div><h3 id="publishing-title">프로젝트 저장·게시 관리</h3><p>영상과 링크, 게시 상태를 한곳에 기록해요.</p></div></div>
        <button type="button" onClick={props.onOpenLibrary}>저장된 프로젝트 보기</button>
      </header>

      <div className="publishing-grid">
        <label><span>작업 상태</span><select value={props.status} onChange={(event) => props.onStatus(event.target.value)}>{statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>게시일</span><input type="date" value={props.publishedDate} onChange={(event) => props.onPublishedDate(event.target.value)} /></label>
        <label className="wide"><span>쿠팡 파트너스 링크</span><input value={props.affiliateUrl} onChange={(event) => props.onAffiliateUrl(event.target.value)} placeholder="https://link.coupang.com/..." inputMode="url" /></label>
        <label className="wide"><span>인포크 링크</span><input value={props.infoqUrl} onChange={(event) => props.onInfoqUrl(event.target.value)} placeholder="https://link.inpock.co.kr/..." inputMode="url" /></label>
        <label className="wide"><span>게시된 SNS 주소</span><input value={props.publishUrl} onChange={(event) => props.onPublishUrl(event.target.value)} placeholder="유튜브·인스타그램·틱톡 게시물 주소" inputMode="url" /></label>
        <label className="wide"><span>운영 메모</span><textarea value={props.notes} onChange={(event) => props.onNotes(event.target.value)} placeholder="수정할 내용, 게시 일정, 성과 메모 등을 남겨주세요." /></label>
      </div>

      <div className="video-upload-row">
        <label><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideo} /><span>＋</span><p><strong>완성 영상 첨부</strong><small>{props.pendingVideo ? props.pendingVideo.name : "MP4·WEBM·MOV · 최대 100MB"}</small></p></label>
        {videoAssets.map((asset) => <div className="saved-asset" key={asset.id}><span>▶</span><p><strong>{asset.fileName}</strong><small>{(asset.size / 1024 / 1024).toFixed(1)}MB · 저장됨</small></p><a href={asset.url ?? `/api/projects/${asset.projectId}/assets/${asset.id}`} target="_blank" rel="noopener noreferrer">열기</a><button type="button" onClick={() => props.onDeleteAsset(asset)}>×</button></div>)}
      </div>

      {imageAssets.length > 0 && <p className="asset-count">상품·참고 이미지 {imageAssets.length}장도 프로젝트에 안전하게 저장되어 있어요.</p>}
      {props.message && <div className={`project-save-message ${props.message.kind}`} role="status">{props.message.text}</div>}
      <button className="save-project-button" type="button" onClick={props.onSave} disabled={props.saving}>{props.saving ? "저장하는 중..." : props.projectId ? "변경 내용 저장" : "새 프로젝트로 저장"}<small>{props.projectId ? "기존 프로젝트 업데이트" : "다음 접속에서도 이어서 작업"}</small></button>
    </section>
  );
}

type ProjectLibraryProps = {
  projects: SavedProject[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpen: (project: SavedProject) => void;
  onDelete: (project: SavedProject) => void;
};

export function ProjectLibrary(props: ProjectLibraryProps) {
  return (
    <section className="project-library" aria-labelledby="library-title">
      <header><div><span>LIBRARY</span><h2 id="library-title">내 쇼츠 프로젝트</h2><p>저장한 기획안과 게시 상태를 다시 열어 이어서 작업할 수 있어요.</p></div><button type="button" onClick={props.onClose}>새 프로젝트로 돌아가기</button></header>
      {props.loading && <div className="library-empty">프로젝트를 불러오는 중...</div>}
      {props.error && <div className="library-error">{props.error}</div>}
      {!props.loading && !props.error && props.projects.length === 0 && <div className="library-empty"><span>＋</span><strong>아직 저장된 프로젝트가 없어요</strong><p>쇼츠 제작안을 만든 뒤 4단계에서 프로젝트로 저장해주세요.</p></div>}
      <div className="project-library-grid">
        {props.projects.map((project) => (
          <article key={project.id}>
            <div className="project-card-top"><span className={`project-status ${project.status}`}>{statusLabel(project.status)}</span><time>{new Date(project.updatedAt).toLocaleDateString("ko-KR")}</time></div>
            <h3>{project.title}</h3><p>{project.productName}</p>
            <div className="project-card-meta"><span>첨부 {project.assetCount}개</span>{project.coupangUrl && <span>쿠파스 ✓</span>}{project.infoqUrl && <span>인포크 ✓</span>}</div>
            <div className="project-card-actions"><button type="button" onClick={() => props.onOpen(project)}>프로젝트 열기</button>{project.publishUrl && <a href={project.publishUrl} target="_blank" rel="noopener noreferrer">게시물 ↗</a>}<button className="delete" type="button" onClick={() => props.onDelete(project)}>삭제</button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
