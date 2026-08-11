"use client";

import { ChangeEvent, useState } from "react";
import { FlowPromptStudio, type ConceptId } from "./components/FlowPromptStudio";
import { ProductDiscovery, type DiscoveryProduct } from "./components/ProductDiscovery";

const tones = ["트렌디", "친근한", "전문적인", "유쾌한"];
const concepts: Array<{ id: ConceptId; icon: string; name: string; description: string; tag?: string }> = [
  { id: "problem", icon: "!", name: "문제 해결형", description: "불편을 먼저 보여주고 상품으로 해결", tag: "추천" },
  { id: "review", icon: "♡", name: "찐후기형", description: "친한 사람이 알려주는 자연스러운 리뷰" },
  { id: "premium", icon: "✦", name: "감성 광고형", description: "빛·질감·무드로 구매 욕구를 자극" },
  { id: "demo", icon: "▶", name: "사용 시연형", description: "사용법과 효과를 눈앞에서 명확하게" },
];

const wizardSteps = [
  { number: "01", short: "상품 찾기", title: "팔릴 상품 찾기" },
  { number: "02", short: "상품 선택", title: "상품 정보 확인" },
  { number: "03", short: "콘셉트 선택", title: "쇼츠 콘셉트 선택" },
  { number: "04", short: "Flow 제작안", title: "참고 이미지·Flow 제작안" },
];

type ReferenceImage = {
  id: string;
  name: string;
  dataUrl: string;
};

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function readReferenceFile(file: File): Promise<ReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return reject(new Error("이미지를 읽지 못했어요."));
      resolve({ id: `${file.name}-${file.lastModified}-${Math.random()}`, name: file.name, dataUrl: reader.result });
    });
    reader.addEventListener("error", () => reject(new Error("이미지를 읽지 못했어요.")));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [tone, setTone] = useState("트렌디");
  const [concept, setConcept] = useState<ConceptId>("problem");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("상품 이미지를 올려주세요");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [referenceMessage, setReferenceMessage] = useState("");
  const [projectRevision, setProjectRevision] = useState(0);
  const [hook, setHook] = useState("이거, 왜 이제 알았지?");
  const [productStarted, setProductStarted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productUrl, setProductUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [normalPrice, setNormalPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [benefit, setBenefit] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const productReady = productName.trim().length >= 2 && benefit.trim().length >= 5;
  const resetProject = () => setProjectRevision((value) => value + 1);

  const isStepLocked = (step: number) => {
    if (step > furthestStep + 1) return true;
    if (step >= 1 && !productStarted) return true;
    if (step >= 2 && !productReady) return true;
    return false;
  };

  const goToStep = (nextStep: number) => {
    if (nextStep < 0 || nextStep > 3) return;
    if (isStepLocked(nextStep)) return;
    setCurrentStep(nextStep);
    setFurthestStep((value) => Math.max(value, nextStep));
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const startManualEntry = () => {
    setProductStarted(true);
    setSelectedProductId(null);
    setImportStatus({ kind: "success", message: "상품 링크나 정보를 직접 입력해주세요." });
    setCurrentStep(1);
    setFurthestStep((value) => Math.max(value, 1));
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

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

  const handleReferenceImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const available = 4 - referenceImages.length;
    const accepted = files.filter((file) => file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024).slice(0, available);
    if (accepted.length === 0) {
      setReferenceMessage("JPG·PNG·WEBP 이미지를 장당 8MB 이하로 올려주세요.");
      return;
    }
    try {
      const loaded = await Promise.all(accepted.map(readReferenceFile));
      setReferenceImages((current) => [...current, ...loaded].slice(0, 4));
      setReferenceMessage(`${loaded.length}장의 참고 이미지를 추가했어요.`);
      resetProject();
    } catch (error) {
      setReferenceMessage(error instanceof Error ? error.message : "참고 이미지를 읽지 못했어요.");
    }
  };

  const removeReferenceImage = (id: string) => {
    setReferenceImages((images) => images.filter((image) => image.id !== id));
    setReferenceMessage("참고 이미지를 제거했어요.");
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
      setProductStarted(true);
      resetProject();
      setImportStatus({ kind: "success", message: `${imported.join(" · ")} 정보를 채웠어요. 핵심 소구점만 확인해주세요.` });
    } catch (error) {
      setImportStatus({ kind: "error", message: error instanceof Error ? error.message : "상품 정보를 불러오지 못했어요." });
    } finally {
      setImporting(false);
    }
  };

  const selectCoupangProduct = (product: DiscoveryProduct) => {
    setSelectedProductId(product.productId);
    setProductStarted(true);
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
    resetProject();
    setImportStatus({ kind: "success", message: "상품 선택 완료! 아래 ‘다음’ 버튼을 눌러 정보를 확인해주세요." });
  };

  const resetAll = () => window.location.reload();

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <button className="logo logo-button" type="button" onClick={() => goToStep(0)} aria-label="후크 첫 단계"><BrandMark /><span>HOOC</span></button>
          <button className="new-project" type="button" onClick={resetAll}><span>＋</span> 새 쇼츠 만들기</button>
          <nav className="nav-list wizard-side-nav" aria-label="제작 단계">
            {wizardSteps.map((step, index) => (
              <button type="button" className={currentStep === index ? "active" : ""} key={step.number} onClick={() => goToStep(index)} disabled={isStepLocked(index)}>
                <NavIcon>{index < furthestStep ? "✓" : step.number}</NavIcon>{step.title}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="workflow-card"><span>STEP {currentStep + 1} / 4</span><strong>{wizardSteps[currentStep].title}</strong><p>입력한 내용은 이전 단계로 돌아가도 그대로 유지됩니다.</p></div>
          <button className="settings-link sidebar-settings" type="button" onClick={() => goToStep(0)}><NavIcon>⚙</NavIcon>쿠팡 API 설정</button>
          <div className="profile"><span className="avatar">민</span><span><strong>김민지</strong><small>Flow 제작 모드</small></span></div>
        </div>
      </aside>

      <section className="workspace wizard-workspace">
        <header className="topbar">
          <div><p className="eyebrow"><span>AI SHORTS PLANNER</span> / STEP {currentStep + 1}</p><h1>{wizardSteps[currentStep].title}</h1></div>
          <div className="header-actions"><a className="ghost-button flow-header-link" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">Google Flow 열기 ↗</a></div>
        </header>

        <nav className="stepper wizard-stepper" aria-label="쇼츠 제작 진행 단계">
          {wizardSteps.map((step, index) => {
            const locked = isStepLocked(index);
            return (
              <button type="button" className={`step wizard-step-button ${currentStep === index ? "current" : ""} ${index < furthestStep ? "completed" : ""}`} key={step.number} onClick={() => goToStep(index)} disabled={locked} aria-current={currentStep === index ? "step" : undefined}>
                <span>{index < furthestStep ? "✓" : step.number}</span><strong>{step.short}</strong>{index < 3 && <i />}
              </button>
            );
          })}
        </nav>

        <div className="studio-grid wizard-grid">
          <section className="form-panel wizard-panel" aria-live="polite">
            {currentStep === 0 && (
              <section className="wizard-stage" aria-label="1단계 상품 찾기">
                <ProductDiscovery onSelect={selectCoupangProduct} selectedProductId={selectedProductId} />
                <footer className="wizard-actions">
                  <button className="wizard-secondary" type="button" onClick={startManualEntry}>상품 직접 입력</button>
                  <button className="wizard-next" type="button" onClick={() => goToStep(1)} disabled={!productStarted}>다음 · 상품 정보 확인 <span>→</span></button>
                </footer>
              </section>
            )}

            {currentStep === 1 && (
              <section className="wizard-stage" aria-labelledby="product-title">
                <div className="section-heading product-heading">
                  <div><span>02</span><h2 id="product-title">선택한 상품을 확인해주세요</h2></div>
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
                    <div className="product-thumb">{uploadedImage ? <img src={uploadedImage} alt="선택한 상품" /> : <span className="empty-product-image">IMG</span>}</div>
                    <span className="upload-copy"><strong>{fileName}</strong><small>Flow에 넣을 상품 기준 이미지 · 눌러서 변경</small></span><span className="replace-photo">↻</span>
                  </label>
                  <div className="field-stack">
                    <label className="field-label" htmlFor="product-name">상품명</label>
                    <input className="text-field" id="product-name" value={productName} onChange={(event) => { setProductName(event.target.value); resetProject(); }} placeholder="상품명을 입력해주세요" />
                    <div className="two-fields">
                      <label><span className="field-label">정상가</span><span className="price-input"><input value={normalPrice} onChange={(event) => { setNormalPrice(event.target.value); resetProject(); }} inputMode="numeric" /><i>원</i></span></label>
                      <label><span className="field-label">할인가</span><span className="price-input sale"><input value={salePrice} onChange={(event) => { setSalePrice(event.target.value); resetProject(); }} inputMode="numeric" placeholder="선택" /><i>원</i></span></label>
                    </div>
                  </div>
                </div>
                <label className="field-label" htmlFor="benefit">핵심 소구점</label>
                <textarea id="benefit" value={benefit} onChange={(event) => { setBenefit(event.target.value); resetProject(); }} placeholder="이 상품을 사야 하는 가장 큰 이유를 적어주세요." />
                <div className="ai-hint"><span>TIP</span> 효과를 과장하기보다 실제 사용 장면과 차별점을 구체적으로 적을수록 Flow 결과가 좋아집니다.</div>

                <footer className="wizard-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(0)}>← 이전</button>
                  <button className="wizard-next" type="button" onClick={() => goToStep(2)} disabled={!productReady}>다음 · 콘셉트 선택 <span>→</span></button>
                </footer>
              </section>
            )}

            {currentStep === 2 && (
              <section className="wizard-stage concept-section" aria-labelledby="concept-title">
                <div className="section-heading"><div><span>03</span><h2 id="concept-title">어떤 느낌의 쇼츠로 만들까요?</h2></div><p>한 가지 콘셉트를 고르면 대본과 화면 구성이 달라져요.</p></div>
                <div className="concept-grid" role="radiogroup" aria-label="쇼츠 콘셉트">
                  {concepts.map((item) => <button type="button" role="radio" aria-checked={concept === item.id} className={concept === item.id ? "selected" : ""} key={item.id} onClick={() => { setConcept(item.id); resetProject(); }}><span>{item.icon}</span><p><strong>{item.name}{item.tag && <em>{item.tag}</em>}</strong><small>{item.description}</small></p><i>✓</i></button>)}
                </div>

                <div className="concept-options compact-options">
                  <div><div className="field-label">말투와 분위기</div><div className="tone-row" role="group" aria-label="영상 톤">{tones.map((item) => <button type="button" key={item} className={tone === item ? "selected" : ""} onClick={() => { setTone(item); resetProject(); }}>{item}</button>)}</div></div>
                </div>
                <div className="caption-field"><label className="field-label" htmlFor="hook">첫 3초 훅 문장 <small>후반 자막 가이드로만 사용</small></label><div><input id="hook" value={hook} onChange={(event) => { setHook(event.target.value); resetProject(); }} /><button type="button" onClick={() => { setHook(`${productName}, 요즘 인기 있는 이유`); resetProject(); }}>↻</button></div></div>
                <div className="no-text-note"><span>T</span><p><strong>Flow 영상에는 자막을 넣지 않아요</strong><small>훅 문장은 스토리보드에만 보관하고, 완성된 영상에 후반 작업으로 넣습니다.</small></p></div>

                <footer className="wizard-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(1)}>← 이전</button>
                  <button className="wizard-next" type="button" onClick={() => goToStep(3)}>다음 · Flow 제작안 <span>→</span></button>
                </footer>
              </section>
            )}

            {currentStep === 3 && (
              <section className="wizard-stage" aria-label="4단계 Flow 제작안">
                <section className="reference-section" aria-labelledby="reference-title">
                  <div className="section-heading">
                    <div><span>04</span><h2 id="reference-title">Flow가 참고할 이미지를 준비해주세요</h2></div>
                    <p>상품 원본은 정확성, 추가 이미지는 분위기 참고용입니다.</p>
                  </div>
                  <div className="reference-grid">
                    <label className={`reference-card product-reference ${uploadedImage ? "has-image" : "missing"}`}>
                      <input type="file" accept="image/*" onChange={handleImage} />
                      {uploadedImage ? <img src={uploadedImage} alt="Flow 상품 기준 이미지" /> : <span className="reference-placeholder">＋</span>}
                      <span className="reference-card-copy"><b>상품 원본</b><small>{uploadedImage ? "눌러서 교체" : "필수 · 이미지 추가"}</small></span>
                      <em>MAIN</em>
                    </label>
                    {referenceImages.map((image, index) => (
                      <article className="reference-card has-image" key={image.id}>
                        <img src={image.dataUrl} alt={`Flow 무드 참고 이미지 ${index + 1}`} />
                        <span className="reference-card-copy"><b>무드 참고 {index + 1}</b><small title={image.name}>{image.name}</small></span>
                        <button type="button" onClick={() => removeReferenceImage(image.id)} aria-label={`${image.name} 제거`}>×</button>
                      </article>
                    ))}
                    {referenceImages.length < 4 && (
                      <label className="reference-card add-reference">
                        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void handleReferenceImages(event)} />
                        <span className="reference-placeholder">＋</span>
                        <span className="reference-card-copy"><b>참고 이미지 추가</b><small>최대 {4 - referenceImages.length}장 더</small></span>
                      </label>
                    )}
                  </div>
                  <div className="reference-help"><span>TIP</span><p><strong>배경·조명·색감·카메라 구도가 잘 보이는 이미지를 추천해요.</strong> 상품 원본과 다른 브랜드 제품은 피하고, 참고 이미지는 Flow의 Ingredients에 함께 넣어주세요.</p></div>
                  {referenceMessage && <p className="reference-message" role="status">{referenceMessage}</p>}
                </section>

                <div className="divider" />
                <FlowPromptStudio key={projectRevision} productName={productName} productImage={uploadedImage} benefit={benefit} price={`${salePrice || normalPrice}${salePrice || normalPrice ? "원" : ""}`} hook={hook} tone={tone} concept={concept} referenceImages={referenceImages} onGenerated={() => undefined} />

                <footer className="wizard-actions final-actions">
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(2)}>← 콘셉트 수정</button>
                  <button className="wizard-secondary" type="button" onClick={() => goToStep(1)}>상품 정보 수정</button>
                </footer>
              </section>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
