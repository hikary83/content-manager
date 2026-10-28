"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import "./content-registration.css";

type ImageItem = { id: string; url: string; selected: boolean; name: string };
type Draft = { productName: string; category: string; sourceUrl: string; affiliateUrl: string; description: string; script: string; youtube: string; instagram: string; tiktok: string; notes: string };
type Entry = Draft & { id: string; createdAt: string; youtubeStatus: string; instagramStatus: string; tiktokStatus: string };
const blank: Draft = { productName: "", category: "여행", sourceUrl: "", affiliateUrl: "", description: "", script: "", youtube: "", instagram: "", tiktok: "", notes: "" };
const storageKey = "hikary-content-entries-v1";

function publicUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

export default function ContentRegistration() {
  const [draft, setDraft] = useState<Draft>(blank);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"register" | "entries">("register");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const objectUrls = useRef<string[]>([]);
  const update = (key: keyof Draft, value: string) => setDraft(current => ({ ...current, [key]: value }));

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(value) || value.some(row => !row || typeof row.id !== "string" || typeof row.productName !== "string")) throw new Error();
      setEntries(value);
      setLoaded(true);
    } catch { setError("임시저장 데이터를 읽지 못했어요. 기존 데이터를 보호하기 위해 저장을 중단했어요."); }
    return () => objectUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  function makeScript(name: string, description: string) {
    const detail = description.replace(/<[^>]*>/g, "").trim().slice(0, 200);
    return `${name}, 이런 곳을 찾고 있었다면 확인해보세요.\n${detail || "[이 상품의 실제 장점과 보여줄 장면을 입력해주세요.]"}\n자세한 옵션과 현재 가격은 상품 링크에서 확인해주세요.`;
  }

  async function analyze() {
    if (!publicUrl(draft.sourceUrl)) { setError("http 또는 https로 시작하는 상품 링크를 입력해주세요."); return; }
    if ((draft.productName || draft.script || images.length) && !window.confirm("분석 결과로 상품명·설명·대본·이미지를 바꿀까요?")) return;
    const run = ++generation.current;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/import-product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: draft.sourceUrl }), signal: AbortSignal.timeout(35_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "상품을 분석하지 못했어요.");
      if (run !== generation.current) return;
      const name = typeof data.name === "string" ? data.name : "";
      const description = typeof data.description === "string" ? data.description : "";
      const urls = [...new Set<string>([...(Array.isArray(data.images) ? data.images : []), data.image].filter((url): url is string => typeof url === "string" && publicUrl(url)))].slice(0, 5);
      setDraft(current => ({ ...current, productName: name, description, script: name ? makeScript(name, description) : "" }));
      setImages(urls.map((url, index) => ({ id: crypto.randomUUID(), url, selected: true, name: `상품 이미지 ${index + 1}` })));
      setMessage(`상품정보와 이미지 ${urls.length}장을 불러왔어요. 기본 대본 초안을 확인하고 수정해주세요.`);
    } catch (cause) { if (run === generation.current) setError(cause instanceof Error ? cause.message : "분석하지 못했어요. 상품정보와 이미지를 직접 추가할 수 있어요."); }
    finally { if (run === generation.current) setBusy(false); }
  }

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.target.value = "";
    const valid = files.filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 12 * 1024 * 1024);
    const accepted = valid.slice(0, Math.max(0, 10 - images.length));
    const items = accepted.map(file => { const url = URL.createObjectURL(file); objectUrls.current.push(url); return { id: crypto.randomUUID(), url, name: file.name, selected: true }; });
    setImages(current => [...current, ...items]);
    if (accepted.length !== files.length) setError("이미지는 JPG·PNG·WEBP, 장당 12MB 이하, 최대 10장까지 추가할 수 있어요.");
  }

  async function download(image: ImageItem) {
    setError("");
    try {
      const url = image.url.startsWith("blob:") ? image.url : `/api/image-download?url=${encodeURIComponent(image.url)}&name=${encodeURIComponent(image.name)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("이미지를 내려받지 못했어요.");
      const blob = await response.blob(); const local = URL.createObjectURL(blob);
      const extension = blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
      const anchor = document.createElement("a"); anchor.href = local; anchor.download = `${image.name.replace(/\.(jpg|jpeg|png|webp)$/i, "")}.${extension}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(local), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "다운로드에 실패했어요."); }
  }

  function save(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!loaded) return;
    if (!draft.productName.trim() || !publicUrl(draft.sourceUrl) || !draft.script.trim()) { setError("상품명·원본 링크·대본을 확인해주세요."); return; }
    if (draft.affiliateUrl && !publicUrl(draft.affiliateUrl)) { setError("변환 링크 주소를 확인해주세요."); return; }
    const existing = entries.find(item => item.id === activeId);
    const entry: Entry = { ...draft, id: activeId || `CNT-${crypto.randomUUID()}`, createdAt: existing?.createdAt || new Date().toISOString(), youtubeStatus: existing?.youtubeStatus || "미업로드", instagramStatus: existing?.instagramStatus || "미업로드", tiktokStatus: existing?.tiktokStatus || "미업로드" };
    const next = existing ? entries.map(item => item.id === activeId ? entry : item) : [entry, ...entries];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setEntries(next); setActiveId(entry.id); setMessage("이 브라우저에 임시 등록했어요. Google Sheets에는 아직 저장되지 않습니다. 이미지는 별도로 내려받아 보관해주세요."); }
    catch { setError("브라우저 저장 공간이 부족하거나 저장이 차단되어 있어요. 입력 내용은 화면에 유지됩니다."); }
  }

  function reset() {
    if ((draft.productName || draft.script) && !window.confirm("새 등록을 시작할까요? 저장하지 않은 입력 내용은 사라져요.")) return;
    generation.current++; setBusy(false); setDraft(blank); setImages([]); setActiveId(null); setMessage(""); setError(""); setView("register");
  }

  return <main className="cm-app">
    <aside className="cm-sidebar"><a className="cm-brand" href="/register"><span>▥</span> HIKARY</a><p>CONTENT MANAGER</p><nav aria-label="주 메뉴"><button className={view === "register" ? "active" : ""} onClick={() => setView("register")}>＋ 콘텐츠 등록</button><button className={view === "entries" ? "active" : ""} onClick={() => setView("entries")}>▤ 임시 등록 내역 <small>{entries.length}</small></button></nav><div className="cm-storage"><b>로컬 개발 버전</b><span>이 브라우저에 임시저장됩니다.<br />Google Sheets 연결 예정</span></div></aside>
    <div className="cm-main"><header className="cm-top"><div><span>WORKSPACE / {view === "register" ? "NEW CONTENT" : "CONTENTS"}</span><h1>{view === "register" ? "콘텐츠 등록" : "임시 등록 내역"}</h1><p>좋은 상품을 발견했다면, 링크 하나로 시작하세요.</p></div><a href="https://docs.google.com/spreadsheets/d/1ZSB7FBZTWdT_eLlo3kpom-u2yM5UwHitG059Zci6TUc/edit" target="_blank" rel="noreferrer">운영대장 열기 ↗</a></header>
    {error && <div className="cm-alert error" role="alert">{error}</div>}{message && <div className="cm-alert" role="status">{message}</div>}
    {view === "entries" ? <section className="cm-card"><h2>이 브라우저에 저장한 콘텐츠</h2><p className="cm-muted">이미지와 영상은 저장되지 않습니다. 다른 PC와 동기화되지 않습니다.</p>{entries.length === 0 ? <div className="cm-empty">아직 등록한 콘텐츠가 없어요.</div> : entries.map(item => <button className="cm-entry" key={item.id} onClick={() => { setDraft({ ...blank, ...item }); setActiveId(item.id); setImages([]); setView("register"); setMessage(""); setError(""); }}><span><small>{item.category} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}</small><strong>{item.productName}</strong></span><span>수정하기 →</span></button>)}</section> : <form onSubmit={save}>
      <section className="cm-card cm-source"><div className="cm-heading"><span>01</span><div><h2>상품 링크를 넣어주세요</h2><p>쿠팡 트래블부터 일반 쇼핑몰까지. 읽지 못한 정보는 직접 입력할 수 있어요.</p></div></div><label htmlFor="cm-source">원본 링크 <em>필수</em></label><div className="cm-url"><input id="cm-source" value={draft.sourceUrl} disabled={busy} onChange={e => update("sourceUrl", e.target.value)} placeholder="https:// 상품 상세 페이지 주소" type="url" required/><button type="button" disabled={busy} onClick={() => void analyze()}>{busy ? "분석 중…" : "링크 분석하기 ↗"}</button></div><p className="cm-hint">상품정보·이미지 추출 후 기본 대본 초안을 준비해요. 실제 상품과 일치하는지 확인해주세요.</p></section>
      <div className="cm-grid"><div><section className="cm-card"><div className="cm-heading"><span>02</span><div><h2>상품정보 확인</h2><p>자동으로 읽은 내용을 확인하고 필요한 부분을 수정하세요.</p></div></div><div className="cm-fields"><label>카테고리<select value={draft.category} onChange={e => update("category", e.target.value)}>{["여행", "생활", "가전·디지털", "뷰티", "식품", "체험·문화", "기타"].map(item => <option key={item}>{item}</option>)}</select></label><label>상품명 <em>필수</em><input required value={draft.productName} onChange={e => update("productName", e.target.value)} placeholder="예: 제주 오션뷰 리조트"/></label></div><label>상품 설명 / 핵심 포인트<textarea rows={4} value={draft.description} onChange={e => update("description", e.target.value)} placeholder="실제 매력과 영상에서 보여주고 싶은 장면을 적어주세요."/></label><label>변환 링크 <small>선택</small><input type="url" value={draft.affiliateUrl} onChange={e => update("affiliateUrl", e.target.value)} placeholder="쿠팡 파트너스 또는 인포크 링크"/></label></section>
      <section className="cm-card"><div className="cm-heading"><span>03</span><div><h2>영상 제작용 이미지</h2><p>필요한 이미지를 골라 로컬에 내려받으세요.</p></div></div><div className="cm-image-actions"><label className="cm-file">＋ 이미지 직접 추가<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addImages}/></label><button type="button" disabled={!images.some(image => image.selected)} onClick={async () => { for (const image of images.filter(image => image.selected)) await download(image); }}>선택 이미지 다운로드</button></div>{images.length ? <div className="cm-images">{images.map(image => <article key={image.id}><img src={image.url} alt={image.name} onError={e => { e.currentTarget.alt = "이미지를 읽지 못했어요. 직접 이미지를 추가해주세요."; }}/><label><input type="checkbox" checked={image.selected} onChange={() => setImages(current => current.map(item => item.id === image.id ? { ...item, selected: !item.selected } : item))}/>{image.name}</label><button type="button" onClick={() => setImages(current => current.filter(item => item.id !== image.id))}>제거</button></article>)}</div> : <div className="cm-empty">링크를 분석하거나 이미지를 직접 추가해주세요.<small>이미지는 운영대장에 저장하지 않아요.</small></div>}</section></div>
      <section className="cm-card cm-script"><div className="cm-heading"><span>04</span><div><h2>대본 작성</h2><p>기본 초안을 직접 다듬어 제작용 대본으로 완성하세요.</p></div></div><button className="cm-outline" type="button" disabled={!draft.productName.trim() || busy} onClick={() => { if (draft.script && !window.confirm("작성 중인 대본을 기본 초안으로 바꿀까요?")) return; update("script", makeScript(draft.productName, draft.description)); }}>↻ 상품정보로 기본 초안 작성</button><label>대본 <em>필수</em><textarea rows={12} required value={draft.script} onChange={e => update("script", e.target.value)} placeholder="훅 → 상품의 매력 → 링크 안내 순서로 작성해보세요."/></label><div className="cm-count">{draft.script.length.toLocaleString()}자 · 직접 수정 가능</div><details><summary>플랫폼별 게시글 <small>선택 · 나중에 작성 가능</small></summary>{([ ["youtube", "YouTube"], ["instagram", "Instagram"], ["tiktok", "TikTok"] ] as const).map(([key, name]) => <label key={key}>{name} 게시글<textarea rows={4} value={draft[key]} onChange={e => update(key, e.target.value)} placeholder={`${name}에 올릴 게시글과 해시태그`}/></label>)}</details><label>비고 <small>선택</small><textarea rows={2} value={draft.notes} onChange={e => update("notes", e.target.value)} placeholder="추가로 기억할 내용을 남겨주세요."/></label></section></div>
      <footer className="cm-footer"><span><b>저장 위치: 이 브라우저</b><small>Sheets 연결 전 임시저장 · 이미지 별도 보관</small></span><div><button type="button" className="cm-outline" onClick={reset} disabled={busy}>새로 작성</button><button type="submit" disabled={busy || !loaded}>{activeId ? "수정 내용 임시저장" : "콘텐츠 임시 등록"} →</button></div></footer>
    </form>}</div>
  </main>;
}
