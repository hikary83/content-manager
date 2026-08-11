"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { FlowPromptStudio, type ConceptId, type FlowProject, type StoryboardScene } from "./components/FlowPromptStudio";
import { ProductDiscovery, type DiscoveryProduct } from "./components/ProductDiscovery";

const platforms = ["Instagram", "YouTube", "TikTok"];
const tones = ["트렌디", "친근한", "전문적인", "유쾌한"];
const concepts: Array<{ id: ConceptId; icon: string; name: string; description: string; tag?: string }> = [
  { id: "problem", icon: "!", name: "문제 해결형", description: "불편을 먼저 보여주고 상품으로 해결", tag: "추천" },
  { id: "review", icon: "♡", name: "찐후기형", description: "친한 사람이 알려주는 자연스러운 리뷰" },
  { id: "premium", icon: "✦", name: "감성 광고형", description: "빛·질감·무드로 구매 욕구를 자극" },
  { id: "demo", icon: "▶", name: "사용 시연형", description: "사용법과 효과를 눈앞에서 명확하게" },
];

const starterScenes: StoryboardScene[] = [
  { id: 0, time: "0–3초", label: "HOOK", title: "첫 3초에 시선을 잡아요", caption: "이거, 왜 이제 알았지?", narration: "이거, 왜 이제 알았지?", visual: "상품을 강하게 보여주는 첫 장면", kind: "hook" },
  { id: 1, time: "3–7초", label: "PROBLEM", title: "고객의 불편에 공감", caption: "이런 경험, 한 번쯤 있죠?", narration: "반복되는 불편을 짚어줘요.", visual: "상품이 필요한 상황을 보여주는 장면", kind: "problem" },
  { id: 2, time: "7–12초", label: "SOLUTION", title: "핵심 장점을 시연", caption: "달라지는 순간을 확인", narration: "핵심 소구점을 행동으로 보여줘요.", visual: "상품 사용과 효과를 보여주는 장면", kind: "solution" },
  { id: 3, time: "12–15초", label: "CTA", title: "구매 행동을 유도", caption: "지금 링크에서 확인", narration: "지금 링크에서 확인해보세요.", visual: "깔끔한 상품 히어로 마무리", kind: "cta" },
];

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={small ? "brand-mark small" : "brand-mark"} aria-hidden="true"><i /><i /><i /></span>;
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("트렌디");
  const [concept, setConcept] = useState<ConceptId>("problem");
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flowProject, setFlowProject] = useState<FlowProject | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("peach-glow-serum.jpg");
  const [hook, setHook] = useState("피부가 복숭아처럼 촉촉해지는 15초 🍑");
  const [productUrl, setProductUrl] = useState("");
  const [productName, setProductName] = useState("피치 글로우 세라마이드 세럼");
  const [normalPrice, setNormalPrice] = useState("32,000");
  const [salePrice, setSalePrice] = useState("22,400");
  const [benefit, setBenefit] = useState("피치 세라마이드와 8중 히알루론산으로 속건조를 잡아주고, 메이크업이 잘 먹는 촉촉한 피부로 만들어줘요.");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const displayScenes = flowProject?.scenes ?? starterScenes;
  const active = displayScenes[activeScene] ?? displayScenes[0];
  const progress = [20, 45, 78, 100][activeScene] ?? 20;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveScene((current) => {
        if (current === displayScenes.length - 1) {
          setPlaying(false);
          return 0;
        }
        return current + 1;
      });
    }, 1800);
    return () => window.clearInterval(timer);
  }, [playing, displayScenes.length]);

  const resetProject = () => setFlowProject(null);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setImportStatus({ kind: "error", message: "상품 이미지는 8MB 이하로 올려주세요." });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setUploadedImage(reader.result);
    });
    reader.readAsDataURL(file);
    setFileName(file.name);
    setImportStatus(null);
    resetProject();
  };

  const importProduct = async () => {
    if (!productUrl.trim()) {
      setImportStatus({ kind: "error", message: "상품 페이지 주소를 먼저 입력해주세요." });
      return;
    }
    setImporting(true);
    setImportStatus(null);
    try {
      const response = await fetch("/api/import-product", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const data = await response.json() as { error?: string; name?: string; description?: string; image?: string; price?: string; originalPrice?: string; sourceUrl?: string };
      if (!response.ok) throw new Error(data.error || "상품 정보를 불러오지 못했어요.");

      const imported: string[] = [];
      if (data.name) { setProductName(data.name); imported.push("상품명"); }
      if (data.description) { setBenefit(data.description); imported.push("설명"); }
      if (data.image) { setUploadedImage(data.image); setFileName("상품 페이지 대표 이미지"); imported.push("이미지"); }
      if (data.originalPrice) { setNormalPrice(data.originalPrice); imported.push("정상가"); }
      if (data.price) {
        if (data.originalPrice) setSalePrice(data.price);
        else { setNormalPrice(data.price); setSalePrice(""); }
        imported.push(data.originalPrice ? "할인가" : "가격");
      }
      if (data.sourceUrl) setProductUrl(data.sourceUrl);
      resetProject();
      setImportStatus({ kind: "success", message: `${imported.join(" · ")} 정보를 채웠어요. 핵심 소구점만 확인해주세요.` });
    } catch (error) {
      setImportStatus({ kind: "error", message: error instanceof Error ? error.message : "상품 정보를 불러오지 못했어요." });
    } finally {
      setImporting(false);
    }
  };

  const selectCoupangProduct = (product: DiscoveryProduct) => {
    setProductUrl(product.productUrl);
    setProductName(product.productName);
    setNormalPrice(product.productPrice > 0 ? product.productPrice.toLocaleString("ko-KR") : "");
    setSalePrice("");
    if (product.productImage) {
      setUploadedImage(product.productImage);
      setFileName("쿠팡 상품 대표 이미지");
    }
    setBenefit(`${product.productName}의 핵심 특징과 실제 사용 장면을 15초 안에 직관적으로 보여주세요.`);
    setHook(`${product.productName}, 요즘 인기 있는 이유`);
    setFlowProject(null);
    setActiveScene(0);
    setImportStatus({ kind: "success", message: "상품 선택 완료! 정보 확인 후 콘셉트를 골라주세요." });
    window.setTimeout(() => document.getElementById("product-information")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <a className="logo" href="#create" aria-label="후크 홈"><BrandMark /><span>HOOC</span></a>
          <button className="new-project" type="button" onClick={() => window.location.reload()}><span>＋</span> 새 쇼츠 만들기</button>
          <nav className="nav-list" aria-label="메인 메뉴">
            <a className="active" href="#create"><NavIcon>✦</NavIcon>Flow 쇼츠 기획</a>
            <a href="#product-information"><NavIcon>▣</NavIcon>선택 상품</a>
            <a href="#concept"><NavIcon>◇</NavIcon>콘셉트</a>
            <a href="#flow-prompts"><NavIcon>↗</NavIcon>Flow 프롬프트</a>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="workflow-card"><span>이번 버전</span><strong>기획부터 Flow 프롬프트까지</strong><p>영상 API 결제 없이 1~4단계를 먼저 완성합니다.</p></div>
          <a className="settings-link" href="#coupang-settings"><NavIcon>⚙</NavIcon>쿠팡 API 설정</a>
          <div className="profile"><span className="avatar">민</span><span><strong>김민지</strong><small>Flow 제작 모드</small></span></div>
        </div>
      </aside>

      <section className="workspace" id="create">
        <header className="topbar">
          <div><p className="eyebrow"><span>AI SHORTS PLANNER</span> / GOOGLE FLOW</p><h1>쇼핑 쇼츠 제작안 만들기</h1></div>
          <div className="header-actions"><a className="ghost-button flow-header-link" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">Google Flow 열기 ↗</a></div>
        </header>

        <div className="stepper flow-stepper" aria-label="제작 단계">
          {[["01", "상품 찾기"], ["02", "상품 선택"], ["03", "콘셉트 선택"], ["04", "대본·Flow 프롬프트"]].map(([number, label], index) => (
            <a className={`step ${index === 0 ? "current" : ""}`} key={number} href={index === 0 ? "#coupang-settings" : index === 1 ? "#product-information" : index === 2 ? "#concept" : "#flow-prompts"}>
              <span>{number}</span><strong>{label}</strong>{index < 3 && <i />}
            </a>
          ))}
        </div>

        <div className="studio-grid">
          <section className="form-panel" aria-label="상품 및 쇼츠 설정">
            <ProductDiscovery onSelect={selectCoupangProduct} />

            <div className="divider" />
            <div className="section-heading product-heading" id="product-information">
              <div><span>02</span><h2>선택한 상품을 확인해주세요</h2></div>
              <p>잘못 불러온 정보만 고치면 됩니다.</p>
            </div>

            <label className="field-label" htmlFor="product-url">상품 페이지 URL <small>직접 입력도 가능</small></label>
            <div className="url-field">
              <span>↗</span>
              <input id="product-url" value={productUrl} onChange={(event) => { setProductUrl(event.target.value); resetProject(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void importProduct(); } }} placeholder="쿠팡 또는 쇼핑몰 상품 링크" inputMode="url" />
              <button type="button" onClick={() => void importProduct()} disabled={importing}>{importing ? <><span className="button-spinner" /> 읽는 중</> : "불러오기"}</button>
            </div>
            {importStatus && <div className={`import-status ${importStatus.kind}`} role="status" aria-live="polite"><span>{importStatus.kind === "success" ? "✓" : "!"}</span><p>{importStatus.message}</p></div>}

            <div className="product-form-grid selected-product-form">
              <label className="upload-box">
                <input type="file" accept="image/*" onChange={handleImage} />
                <div className="product-thumb">{uploadedImage ? <img src={uploadedImage} alt="선택한 상품" /> : <div className="serum-bottle mini"><i /><b>PEACH<br />GLOW</b></div>}</div>
                <span className="upload-copy"><strong>{fileName}</strong><small>Flow에 넣을 기준 이미지 · 눌러서 변경</small></span><span className="replace-photo">↻</span>
              </label>
              <div className="field-stack">
                <label className="field-label" htmlFor="product-name">상품명</label>
                <input className="text-field" id="product-name" value={productName} onChange={(event) => { setProductName(event.target.value); resetProject(); }} />
                <div className="two-fields">
                  <label><span className="field-label">정상가</span><span className="price-input"><input value={normalPrice} onChange={(event) => { setNormalPrice(event.target.value); resetProject(); }} inputMode="numeric" /><i>원</i></span></label>
                  <label><span className="field-label">할인가</span><span className="price-input sale"><input value={salePrice} onChange={(event) => { setSalePrice(event.target.value); resetProject(); }} inputMode="numeric" placeholder="선택" /><i>원</i></span></label>
                </div>
              </div>
            </div>
            <label className="field-label" htmlFor="benefit">핵심 소구점</label>
            <textarea id="benefit" value={benefit} onChange={(event) => { setBenefit(event.target.value); resetProject(); }} placeholder="이 상품을 사야 하는 가장 큰 이유를 적어주세요." />
            <div className="ai-hint"><span>TIP</span> 효과를 과장하기보다 실제 사용 장면과 차별점을 구체적으로 적을수록 Flow 결과가 좋아집니다.</div>

            <div className="divider" />
            <section id="concept" className="concept-section" aria-labelledby="concept-title">
              <div className="section-heading"><div><span>03</span><h2 id="concept-title">어떤 느낌의 쇼츠로 만들까요?</h2></div><p>한 가지 콘셉트를 고르면 대본과 화면 구성이 달라져요.</p></div>
              <div className="concept-grid" role="radiogroup" aria-label="쇼츠 콘셉트">
                {concepts.map((item) => <button type="button" role="radio" aria-checked={concept === item.id} className={concept === item.id ? "selected" : ""} key={item.id} onClick={() => { setConcept(item.id); resetProject(); }}><span>{item.icon}</span><p><strong>{item.name}{item.tag && <em>{item.tag}</em>}</strong><small>{item.description}</small></p><i>✓</i></button>)}
              </div>

              <div className="concept-options">
                <div><div className="field-label">업로드 플랫폼</div><div className="platform-tabs">{platforms.map((item) => <button type="button" className={platform === item ? "selected" : ""} key={item} onClick={() => { setPlatform(item); resetProject(); }}><span className={`platform-dot ${item.toLowerCase()}`}>{item === "Instagram" ? "◎" : item === "YouTube" ? "▶" : "♪"}</span>{item}<small>{item === "Instagram" ? "Reels" : item === "YouTube" ? "Shorts" : "Video"}</small></button>)}</div></div>
                <div><div className="field-label">말투와 분위기</div><div className="tone-row" role="group" aria-label="영상 톤">{tones.map((item) => <button type="button" key={item} className={tone === item ? "selected" : ""} onClick={() => { setTone(item); resetProject(); }}>{item}</button>)}</div></div>
              </div>
              <div className="caption-field"><label className="field-label" htmlFor="hook">첫 3초 훅 문장 <small>직접 수정 가능</small></label><div><input id="hook" value={hook} onChange={(event) => { setHook(event.target.value); resetProject(); }} /><button type="button" onClick={() => { setHook(`${productName}, 요즘 인기 있는 이유`); resetProject(); }}>↻</button></div></div>
            </section>

            <div className="divider" />
            <FlowPromptStudio productName={productName} productImage={uploadedImage} benefit={benefit} price={`${salePrice || normalPrice}${salePrice || normalPrice ? "원" : ""}`} hook={hook} tone={tone} platform={platform} concept={concept} onGenerated={(project) => { setFlowProject(project); setActiveScene(0); setPlaying(false); }} />
          </section>

          <aside className="preview-panel storyboard-preview" aria-label="스토리보드 미리보기">
            <div className="preview-heading"><div><span className="live-dot" /> STORYBOARD PREVIEW</div><span className="preview-format">9:16 · 15초</span></div>
            <div className="phone-frame"><div className="phone-speaker" /><div className={`video-canvas scene-${active.kind}`}>
              <div className="video-topline"><span><BrandMark small /> HOOC</span><b>{active.label}</b></div>
              <div className="peach-orb orb-one" /><div className="peach-orb orb-two" /><div className="spark spark-one">✦</div><div className="spark spark-two">✦</div>
              <div className="preview-product">{uploadedImage ? <img src={uploadedImage} alt="상품 미리보기" /> : <div className="serum-bottle"><i /><b>PEACH<br />GLOW</b><small>SERUM 30ml</small></div>}{active.kind === "solution" && <span className="ingredient-chip">KEY BENEFIT</span>}</div>
              <div className="video-copy"><p><span>{active.title}</span></p><small>{active.caption}</small>{active.kind === "cta" && <button type="button">링크에서 확인 →</button>}</div>
              <div className="video-progress"><i style={{ width: `${progress}%` }} /></div>
            </div></div>
            <div className="player-controls"><span>{active.time.split("–")[0]}</span><button type="button" className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "일시 정지" : "스토리보드 재생"}>{playing ? "Ⅱ" : "▶"}</button><span>15초</span></div>

            <div className="scenes-heading"><strong>{flowProject ? "완성된 장면 구성" : "예상 장면 구성"}</strong><span>4장면</span></div>
            <div className="scene-list">{displayScenes.map((scene) => <button type="button" className={activeScene === scene.id ? "active" : ""} key={scene.id} onClick={() => { setActiveScene(scene.id); setPlaying(false); }}><span className={`scene-mini ${scene.kind}`}><i>{scene.id + 1}</i><b>{scene.kind === "hook" ? "?" : scene.kind === "problem" ? "!" : scene.kind === "solution" ? "✦" : "%"}</b></span><span><strong>{scene.title}</strong><small>{scene.caption}</small></span><time>{scene.time}</time></button>)}</div>

            <div className={`preview-note ${flowProject ? "ready" : ""}`}><span>{flowProject ? "✓" : "i"}</span><p><strong>{flowProject ? "Flow 제작안 준비 완료" : "아직 영상은 만들지 않아요"}</strong>{flowProject ? "왼쪽에서 프롬프트를 복사해 Google Flow에 붙여 넣으면 됩니다." : "상품과 콘셉트를 고른 뒤 4단계에서 대본과 Flow 프롬프트를 먼저 완성합니다."}</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
