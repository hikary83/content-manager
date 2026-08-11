"use client";

import { FormEvent, useEffect, useState } from "react";

type SettingsStatus = {
  configured: boolean;
  apiKeyHint: string | null;
  updatedAt: number | null;
};

type JobStatus = "idle" | "generating" | "starting_extension" | "extending" | "complete" | "failed";

type JobResponse = {
  jobId?: string;
  status?: JobStatus;
  progress?: number;
  videoUrl?: string | null;
  expiresAt?: number | null;
  error?: string;
  code?: string;
};

type VeoVideoCreatorProps = {
  productName: string;
  productImage: string | null;
  benefit: string;
  price: string;
  hook: string;
  tone: string;
  platform: string;
  onVideoReady: (videoUrl: string | null) => void;
};

const statusCopy: Record<Exclude<JobStatus, "idle" | "failed">, { title: string; detail: string }> = {
  generating: { title: "첫 8초 장면을 만들고 있어요", detail: "상품 이미지를 움직이는 영상으로 바꾸는 중입니다." },
  starting_extension: { title: "다음 장면을 준비하고 있어요", detail: "첫 영상의 움직임과 색감을 이어받고 있습니다." },
  extending: { title: "영상을 15초로 확장하고 있어요", detail: "상품 효과와 구매 유도 장면을 자연스럽게 연결합니다." },
  complete: { title: "15초 AI 영상이 완성됐어요", detail: "오른쪽에서 재생하거나 MP4로 내려받을 수 있어요." },
};

export function VeoVideoCreator({
  productName,
  productImage,
  benefit,
  price,
  hook,
  tone,
  platform,
  onVideoReady,
}: VeoVideoCreatorProps) {
  const [settings, setSettings] = useState<SettingsStatus>({ configured: false, apiKeyHint: null, updatedAt: null });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [quality, setQuality] = useState<"fast" | "quality">("fast");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/settings/gemini", { cache: "no-store" });
        const data = await response.json() as SettingsStatus & { error?: string };
        if (!response.ok) throw new Error(data.error || "Veo API 설정을 확인하지 못했어요.");
        if (!cancelled) setSettings(data);
      } catch (error) {
        if (!cancelled) setJobMessage(error instanceof Error ? error.message : "Veo API 설정을 확인하지 못했어요.");
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!jobId || !["generating", "starting_extension", "extending"].includes(jobStatus)) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const response = await fetch(`/api/video/jobs/${jobId}`, { cache: "no-store" });
        const data = await response.json() as JobResponse;
        if (!response.ok) throw new Error(data.error || "영상 진행 상태를 확인하지 못했어요.");
        if (cancelled) return;
        const nextStatus = data.status ?? "failed";
        setJobStatus(nextStatus);
        setProgress(data.progress ?? 0);
        if (nextStatus === "complete" && data.videoUrl) {
          setExpiresAt(data.expiresAt ?? null);
          setJobMessage("");
          onVideoReady(`${data.videoUrl}?v=${Date.now()}`);
          return;
        }
        if (nextStatus === "failed") {
          setJobMessage(data.error || "영상 생성에 실패했어요.");
          return;
        }
        timer = window.setTimeout(() => void poll(), 8_000);
      } catch (error) {
        if (cancelled) return;
        setJobMessage(error instanceof Error ? error.message : "영상 진행 상태를 확인하지 못했어요.");
        timer = window.setTimeout(() => void poll(), 12_000);
      }
    };

    timer = window.setTimeout(() => void poll(), 6_000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, jobStatus, onVideoReady]);

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const response = await fetch("/api/settings/gemini", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json() as SettingsStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "Veo API 설정을 저장하지 못했어요.");
      setSettings({ configured: true, apiKeyHint: data.apiKeyHint, updatedAt: data.updatedAt });
      setApiKey("");
      setSettingsMessage({ kind: "success", text: "Google Veo API 연결을 확인하고 안전하게 저장했어요." });
      window.setTimeout(() => setShowSettings(false), 800);
    } catch (error) {
      setSettingsMessage({ kind: "error", text: error instanceof Error ? error.message : "Veo API 설정을 저장하지 못했어요." });
    } finally {
      setSavingSettings(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("저장된 Google Veo API 연결을 해제할까요?")) return;
    setSavingSettings(true);
    try {
      const response = await fetch("/api/settings/gemini", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Veo API 연결을 해제하지 못했어요.");
      setSettings({ configured: false, apiKeyHint: null, updatedAt: null });
      setSettingsMessage({ kind: "success", text: "Veo API 연결을 해제했어요." });
    } catch (error) {
      setSettingsMessage({ kind: "error", text: error instanceof Error ? error.message : "Veo API 연결을 해제하지 못했어요." });
    } finally {
      setSavingSettings(false);
    }
  };

  const startGeneration = async () => {
    if (!settings.configured) {
      setShowSettings(true);
      return;
    }
    if (productName.trim().length < 2) {
      setJobMessage("먼저 상품명을 입력해주세요.");
      return;
    }
    setJobStatus("generating");
    setProgress(8);
    setJobMessage("");
    setExpiresAt(null);
    onVideoReady(null);
    try {
      const response = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productName, productImage, benefit, price, hook, tone, platform, quality }),
      });
      const data = await response.json() as JobResponse;
      if (!response.ok) {
        if (data.code === "NOT_CONFIGURED") setShowSettings(true);
        throw new Error(data.error || "영상 생성을 시작하지 못했어요.");
      }
      if (!data.jobId) throw new Error("영상 작업 번호를 받지 못했어요.");
      setJobId(data.jobId);
      setJobStatus(data.status ?? "generating");
      setProgress(data.progress ?? 12);
    } catch (error) {
      setJobStatus("failed");
      setProgress(0);
      setJobMessage(error instanceof Error ? error.message : "영상 생성을 시작하지 못했어요.");
    }
  };

  const busy = ["generating", "starting_extension", "extending"].includes(jobStatus);
  const activeCopy = jobStatus !== "idle" && jobStatus !== "failed" ? statusCopy[jobStatus] : null;

  return (
    <section className="veo-creator" id="veo-settings" aria-labelledby="veo-title">
      <div className="section-heading veo-heading">
        <div><span>05</span><h2 id="veo-title">사진을 실제 영상으로 만들어요</h2></div>
        <div className={`api-connection ${settings.configured ? "connected" : ""}`}>
          <i />
          <span>{settingsLoading ? "연결 확인 중" : settings.configured ? `Veo API ····${settings.apiKeyHint}` : "Veo API 미연결"}</span>
          <button type="button" onClick={() => { setSettingsMessage(null); setShowSettings(true); }}>설정</button>
        </div>
      </div>

      <div className="veo-recipe">
        <div className="recipe-step">
          <span>01</span><p><strong>첫 장면 생성</strong><small>상품 사진 → 움직이는 8초 영상</small></p><time>8초</time>
        </div>
        <i aria-hidden="true">→</i>
        <div className="recipe-step">
          <span>02</span><p><strong>자연스럽게 확장</strong><small>효과·사용 장면·구매 유도 연결</small></p><time>+7초</time>
        </div>
        <i aria-hidden="true">→</i>
        <div className="recipe-result"><span>▶</span><p><strong>완성 영상</strong><small>세로형 MP4 · 오디오 포함</small></p><time>15초</time></div>
      </div>

      <div className="veo-options">
        <div><strong>생성 품질</strong><small>Veo 3.1 모델을 선택하세요.</small></div>
        <div className="quality-toggle" role="group" aria-label="영상 생성 품질">
          <button type="button" className={quality === "fast" ? "selected" : ""} onClick={() => setQuality("fast")} disabled={busy}>빠른 생성 <small>추천</small></button>
          <button type="button" className={quality === "quality" ? "selected" : ""} onClick={() => setQuality("quality")} disabled={busy}>고품질</button>
        </div>
      </div>

      {activeCopy && (
        <div className={`generation-progress ${jobStatus === "complete" ? "done" : ""}`} role="status" aria-live="polite">
          <div className="progress-copy"><span>{jobStatus === "complete" ? "✓" : "◌"}</span><p><strong>{activeCopy.title}</strong><small>{activeCopy.detail}</small></p><b>{progress}%</b></div>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          {jobStatus === "complete" && expiresAt && <p className="video-expiry">Google 보관 정책에 따라 {new Date(expiresAt).toLocaleDateString("ko-KR")} 전까지 내려받아 주세요.</p>}
        </div>
      )}
      {jobMessage && <div className="veo-error" role="alert"><span>!</span><p>{jobMessage}</p></div>}

      <button className={`generate-button veo-generate ${busy ? "loading" : ""}`} type="button" onClick={() => void startGeneration()} disabled={busy || settingsLoading}>
        <span>{busy ? "◌" : "▶"}</span>
        {busy ? "Veo가 영상을 만드는 중..." : jobStatus === "complete" ? "새로운 15초 영상 다시 만들기" : "Veo로 15초 영상 만들기"}
        {!busy && <small>유료 API 2회 사용 · 수 분 소요</small>}
      </button>

      <p className="veo-footnote">상품 이미지는 시작 장면으로 사용되며, Veo가 8초 영상을 만든 뒤 7초를 이어 붙여 하나의 15초 영상으로 완성합니다.</p>

      {showSettings && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && settings.configured) setShowSettings(false);
        }}>
          <section className="settings-modal veo-settings-modal" role="dialog" aria-modal="true" aria-labelledby="veo-settings-title">
            <div className="settings-modal-head">
              <div><span>VEO</span><div><h3 id="veo-settings-title">Google Veo API 연결</h3><p>Google AI Studio의 Gemini API 키를 등록해주세요.</p></div></div>
              <button type="button" aria-label="설정 닫기" onClick={() => setShowSettings(false)}>×</button>
            </div>

            {settings.configured && (
              <div className="configured-key"><span>✓</span><p><strong>연결됨 · API Key ····{settings.apiKeyHint}</strong><small>새 키를 입력하면 기존 연결을 안전하게 교체합니다.</small></p></div>
            )}

            <form onSubmit={(event) => void saveSettings(event)}>
              <label><span>Gemini API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" placeholder="AIza..." required /></label>
              <div className="security-note"><span>🔒</span><p><strong>키는 암호화해 보관해요</strong>등록한 키는 서버에서만 사용하며 저장 후 화면에 다시 표시하지 않습니다. Veo는 유료 모델이므로 Google Cloud 결제 연결이 필요할 수 있어요.</p></div>
              {settingsMessage && <div className={`settings-message ${settingsMessage.kind}`} role="status">{settingsMessage.text}</div>}
              <button className="save-api-button" type="submit" disabled={savingSettings}>{savingSettings ? "연결 확인 중..." : settings.configured ? "새 API 키로 교체" : "API 연결하고 영상 만들기"}</button>
            </form>

            <div className="settings-modal-foot">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio에서 API 키 확인 ↗</a>
              {settings.configured && <button type="button" onClick={() => void disconnect()} disabled={savingSettings}>연결 해제</button>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
