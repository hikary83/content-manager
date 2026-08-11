"use client";

import { FormEvent, useEffect, useState } from "react";

export type DiscoveryProduct = {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  rank?: number;
  isRocket?: boolean;
  isFreeShipping?: boolean;
  source?: string;
  shortsScore?: number;
  shortsReasons?: string[];
  recommendationType?: "opportunity" | "proven";
};

type SettingsStatus = {
  configured: boolean;
  accessKeyHint: string | null;
  updatedAt: number | null;
};

type ProductDiscoveryProps = {
  onSelect: (product: DiscoveryProduct) => void;
  selectedProductId?: string | null;
};

const INITIAL_COUNT = 10;

export function ProductDiscovery({ onSelect, selectedProductId = null }: ProductDiscoveryProps) {
  const [settings, setSettings] = useState<SettingsStatus>({ configured: false, accessKeyHint: null, updatedAt: null });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [subId, setSubId] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [mode, setMode] = useState<"popular" | "search">("popular");
  const [recommendationMode, setRecommendationMode] = useState<"opportunity" | "proven">("opportunity");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<DiscoveryProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const response = await fetch("/api/settings/coupang", { cache: "no-store" });
        const data = await response.json() as SettingsStatus & { error?: string };
        if (!response.ok) throw new Error(data.error || "API 설정을 확인하지 못했어요.");
        if (cancelled) return;
        setSettings(data);
        if (data.configured) await loadPopular();
        else setShowSettings(true);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "API 설정을 확인하지 못했어요.");
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };

    void initialize();
    return () => { cancelled = true; };
  }, []);

  async function loadPopular() {
    setMode("popular");
    setLoading(true);
    setError("");
    setVisibleCount(INITIAL_COUNT);
    try {
      const response = await fetch("/api/coupang/popular", { cache: "no-store" });
      const data = await response.json() as { products?: DiscoveryProduct[]; refreshedAt?: number; error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "NOT_CONFIGURED") setShowSettings(true);
        throw new Error(data.error || "추천 상품을 불러오지 못했어요.");
      }
      setProducts(data.products ?? []);
      setRefreshedAt(data.refreshedAt ?? Date.now());
    } catch (caught) {
      setProducts([]);
      setError(caught instanceof Error ? caught.message : "추천 상품을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  const searchProducts = async (event?: FormEvent) => {
    event?.preventDefault();
    if (query.trim().length < 2) {
      setError("두 글자 이상 검색해주세요.");
      return;
    }
    setMode("search");
    setLoading(true);
    setError("");
    setVisibleCount(INITIAL_COUNT);
    try {
      const response = await fetch(`/api/coupang/search?query=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const data = await response.json() as { products?: DiscoveryProduct[]; refreshedAt?: number; error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "NOT_CONFIGURED") setShowSettings(true);
        throw new Error(data.error || "상품 검색에 실패했어요.");
      }
      setProducts(data.products ?? []);
      setRefreshedAt(data.refreshedAt ?? Date.now());
    } catch (caught) {
      setProducts([]);
      setError(caught instanceof Error ? caught.message : "상품 검색에 실패했어요.");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const response = await fetch("/api/settings/coupang", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessKey, secretKey, subId }),
      });
      const data = await response.json() as SettingsStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "API 설정을 저장하지 못했어요.");
      setSettings({ configured: true, accessKeyHint: data.accessKeyHint, updatedAt: data.updatedAt });
      setAccessKey("");
      setSecretKey("");
      setSettingsMessage({ kind: "success", text: "쿠팡 API 연결을 확인하고 안전하게 저장했어요." });
      window.setTimeout(() => setShowSettings(false), 700);
      await loadPopular();
    } catch (caught) {
      setSettingsMessage({ kind: "error", text: caught instanceof Error ? caught.message : "API 설정을 저장하지 못했어요." });
    } finally {
      setSavingSettings(false);
    }
  };

  const disconnectSettings = async () => {
    if (!window.confirm("저장된 쿠팡 API 연결을 해제할까요?")) return;
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const response = await fetch("/api/settings/coupang", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "API 연결을 해제하지 못했어요.");
      setSettings({ configured: false, accessKeyHint: null, updatedAt: null });
      setProducts([]);
      setSettingsMessage({ kind: "success", text: "쿠팡 API 연결을 해제했어요." });
    } catch (caught) {
      setSettingsMessage({ kind: "error", text: caught instanceof Error ? caught.message : "API 연결을 해제하지 못했어요." });
    } finally {
      setSavingSettings(false);
    }
  };

  const copyLink = async (product: DiscoveryProduct) => {
    try {
      await navigator.clipboard.writeText(product.productUrl);
      setCopiedId(product.productId);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("링크를 복사하지 못했어요. 바로가기를 열어 주소를 복사해주세요.");
    }
  };

  const selectProduct = (product: DiscoveryProduct) => {
    onSelect(product);
  };

  const rankedProducts = mode === "popular"
    ? [...products].sort((left, right) => recommendationMode === "opportunity"
      ? (right.shortsScore ?? 0) - (left.shortsScore ?? 0)
      : (left.rank ?? 999) - (right.rank ?? 999) || Number(right.source === "골드박스") - Number(left.source === "골드박스"))
    : products;
  const shownProducts = rankedProducts.slice(0, visibleCount);

  return (
    <section className="discovery-section" id="coupang-settings" aria-labelledby="discovery-title">
      <div className="section-heading discovery-heading">
        <div><span>01</span><h2 id="discovery-title">먼저, 팔릴 상품부터 찾아보세요</h2></div>
        <div className={`api-connection ${settings.configured ? "connected" : ""}`}>
          <i />
          <span>{settingsLoading ? "연결 확인 중" : settings.configured ? `쿠팡 API ····${settings.accessKeyHint}` : "쿠팡 API 미연결"}</span>
          <button type="button" onClick={() => { setSettingsMessage(null); setShowSettings(true); }}>설정</button>
        </div>
      </div>

      <div className="discovery-toolbar">
        <div className="discovery-tabs" role="tablist" aria-label="상품 탐색 방식">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "popular"}
            className={mode === "popular" ? "active" : ""}
            onClick={() => void loadPopular()}
          >
            <span>🔥</span> 인기 쇼츠 아이템
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "search"}
            className={mode === "search" ? "active" : ""}
            onClick={() => setMode("search")}
          >
            <span>⌕</span> 쿠팡 상품 검색
          </button>
        </div>

        <form className="coupang-search" onSubmit={(event) => void searchProducts(event)}>
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명 또는 브랜드 검색" aria-label="쿠팡 상품 검색어" />
          <button type="submit" disabled={loading || !settings.configured}>{loading && mode === "search" ? "검색 중" : "검색"}</button>
        </form>
      </div>

      {mode === "popular" && !loading && products.length > 0 && (
        <>
          <div className="opportunity-switch" role="group" aria-label="추천 기준">
            <button type="button" className={recommendationMode === "opportunity" ? "active" : ""} onClick={() => setRecommendationMode("opportunity")}><span>✦</span> 쇼츠 기회형<small>시연성·의외성 우선</small></button>
            <button type="button" className={recommendationMode === "proven" ? "active" : ""} onClick={() => setRecommendationMode("proven")}><span>✓</span> 판매 검증형<small>쿠팡 순위·딜 우선</small></button>
          </div>
          <div className="recommendation-meta">
            <p><strong>{recommendationMode === "opportunity" ? "영상으로 보여줄 장면이 많은 상품" : "이미 수요가 확인된 안정적인 상품"}</strong> {recommendationMode === "opportunity" ? "가격·배송·상품명 속 시연 키워드로 적합도를 계산했어요." : "쿠팡 순위와 골드박스 상품을 먼저 보여줘요."}</p>
            {refreshedAt && <time>{new Date(refreshedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준</time>}
          </div>
        </>
      )}

      {error && <div className="discovery-error" role="alert"><span>!</span>{error}<button type="button" onClick={() => setShowSettings(true)}>API 설정 확인</button></div>}

      {!settingsLoading && !settings.configured && !loading && (
        <div className="api-empty-state">
          <span className="api-empty-icon">⌁</span>
          <div><strong>쿠팡 파트너스 API를 연결해주세요</strong><p>연결하면 실시간 상품 검색과 인기 아이템 추천이 열립니다.</p></div>
          <button type="button" onClick={() => setShowSettings(true)}>API 연결하기 →</button>
        </div>
      )}

      {loading && (
        <div className="product-discovery-grid" aria-label="상품을 불러오는 중">
          {Array.from({ length: 10 }, (_, index) => <div className="product-card-skeleton" key={index}><i /><span /><span /></div>)}
        </div>
      )}

      {!loading && settings.configured && products.length === 0 && !error && (
        <div className="no-products">조건에 맞는 상품을 찾지 못했어요. 다른 검색어로 시도해보세요.</div>
      )}

      {!loading && shownProducts.length > 0 && (
        <>
          <div className="product-discovery-grid">
            {shownProducts.map((product, index) => (
              <article className={`discovery-product-card ${selectedProductId === product.productId ? "selected" : ""}`} key={product.productId}>
                <div className="discovery-product-image">
                  {product.productImage ? <img src={product.productImage} alt="" loading="lazy" /> : <span>NO IMAGE</span>}
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  {product.source && <em>{product.source}</em>}
                </div>
                <div className="discovery-product-body">
                  <p>{product.productName}</p>
                  <div className="product-flags">
                    {product.shortsScore && <span className="shorts-score">쇼츠 {product.shortsScore}점</span>}
                    {product.isRocket && <span className="rocket-flag">로켓</span>}
                    {product.isFreeShipping && <span>무료배송</span>}
                  </div>
                  {product.shortsReasons && <div className="shorts-reasons">{product.shortsReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}
                  <strong>{product.productPrice > 0 ? `${product.productPrice.toLocaleString("ko-KR")}원` : "가격 확인"}</strong>
                  <div className="product-link-actions">
                    <a href={product.productUrl} target="_blank" rel="noopener noreferrer sponsored">바로가기 ↗</a>
                    <button type="button" onClick={() => void copyLink(product)}>{copiedId === product.productId ? "복사됨 ✓" : "링크 복사"}</button>
                  </div>
                  <button className="use-product-button" type="button" onClick={() => selectProduct(product)}>
                    {selectedProductId === product.productId ? "선택 완료 ✓" : "이 상품으로 쇼츠 만들기"}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {visibleCount < products.length && (
            <button className="load-more-products" type="button" onClick={() => setVisibleCount((count) => count + 10)}>
              10개 더보기 <span>＋</span>
            </button>
          )}

          <p className="affiliate-disclosure">이 페이지는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.</p>
        </>
      )}

      {showSettings && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && settings.configured) setShowSettings(false);
        }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-modal-head">
              <div><span>API</span><div><h3 id="settings-title">쿠팡 파트너스 연결</h3><p>발급받은 API 키를 한 번만 등록해주세요.</p></div></div>
              <button type="button" aria-label="설정 닫기" onClick={() => setShowSettings(false)}>×</button>
            </div>

            {settings.configured && (
              <div className="configured-key"><span>✓</span><p><strong>연결됨 · Access Key ····{settings.accessKeyHint}</strong><small>새 키를 입력하면 기존 연결이 안전하게 교체됩니다.</small></p></div>
            )}

            <form onSubmit={(event) => void saveSettings(event)}>
              <label><span>Access Key</span><input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} autoComplete="off" placeholder="Access Key 입력" required /></label>
              <label><span>Secret Key</span><input type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} autoComplete="new-password" placeholder="Secret Key 입력" required /></label>
              <label><span>Sub ID <small>선택</small></span><input value={subId} onChange={(event) => setSubId(event.target.value)} autoComplete="off" placeholder="성과 구분용 Sub ID" /></label>

              <div className="security-note"><span>⌾</span><p><strong>키를 안전하게 보관해요</strong>입력한 키는 서버에서 유효성을 확인한 뒤 암호화해 저장하며, 저장 후에는 다시 화면에 표시하지 않습니다.</p></div>
              {settingsMessage && <div className={`settings-message ${settingsMessage.kind}`} role="status">{settingsMessage.text}</div>}

              <button className="save-api-button" type="submit" disabled={savingSettings}>{savingSettings ? "연결 확인 중..." : settings.configured ? "새 API 키로 교체" : "API 연결하고 상품 불러오기"}</button>
            </form>

            <div className="settings-modal-foot">
              <a href="https://partners.coupang.com/" target="_blank" rel="noopener noreferrer">쿠팡 파트너스에서 키 확인 ↗</a>
              {settings.configured && <button type="button" onClick={() => void disconnectSettings()} disabled={savingSettings}>연결 해제</button>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
