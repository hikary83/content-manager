"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Scene = {
  id: number;
  time: string;
  label: string;
  headline: string;
  subline: string;
  kind: "hook" | "problem" | "solution" | "cta";
};

const scenes: Scene[] = [
  {
    id: 0,
    time: "0–3초",
    label: "HOOK",
    headline: "요즘 피부,\n왜 이렇게 푸석하지?",
    subline: "단 3초 만에 시선 붙잡기",
    kind: "hook",
  },
  {
    id: 1,
    time: "3–7초",
    label: "PAIN POINT",
    headline: "메이크업이\n자꾸 들뜨는 이유",
    subline: "속건조부터 잡아야 하니까",
    kind: "problem",
  },
  {
    id: 2,
    time: "7–14초",
    label: "SOLUTION",
    headline: "복숭아 한 병으로\n촉촉하게 차오르게",
    subline: "피치 세라마이드 × 히알루론산",
    kind: "solution",
  },
  {
    id: 3,
    time: "14–18초",
    label: "CTA",
    headline: "오늘만\n30% OFF",
    subline: "지금 프로필 링크에서 만나보세요",
    kind: "cta",
  },
];

const platforms = ["Instagram", "YouTube", "TikTok"];
const tones = ["트렌디", "친근한", "전문적인", "유쾌한"];

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "brand-mark small" : "brand-mark"} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("트렌디");
  const [activeScene, setActiveScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("peach-glow-serum.jpg");
  const [caption, setCaption] = useState("피부가 복숭아처럼 촉촉해지는 18초 🍑");

  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      setActiveScene((current) => {
        if (current === scenes.length - 1) {
          setPlaying(false);
          return 0;
        }
        return current + 1;
      });
    }, 1800);

    return () => window.clearInterval(timer);
  }, [playing]);

  const progress = useMemo(() => [17, 39, 78, 100][activeScene], [activeScene]);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadedImage(URL.createObjectURL(file));
    setFileName(file.name);
  };

  const generate = () => {
    if (generating) return;
    setGenerating(true);
    setGenerated(false);
    window.setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
      setActiveScene(0);
    }, 1500);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <a className="logo" href="#" aria-label="후크 홈">
            <BrandMark />
            <span>HOOC</span>
          </a>

          <button className="new-project" type="button">
            <span>＋</span> 새 쇼츠 만들기
          </button>

          <nav className="nav-list" aria-label="메인 메뉴">
            <a className="active" href="#create"><NavIcon>✦</NavIcon>AI 쇼츠 만들기</a>
            <a href="#projects"><NavIcon>▣</NavIcon>내 프로젝트 <b>4</b></a>
            <a href="#media"><NavIcon>▧</NavIcon>미디어 보관함</a>
            <a href="#templates"><NavIcon>◇</NavIcon>템플릿</a>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="credit-card">
            <div className="credit-top"><span>이번 달 크레딧</span><strong>72%</strong></div>
            <div className="credit-track"><i /></div>
            <p>36 / 50개 남음</p>
            <button type="button">플랜 업그레이드 ↗</button>
          </div>
          <a className="settings-link" href="#settings"><NavIcon>⚙</NavIcon>설정</a>
          <div className="profile">
            <span className="avatar">민</span>
            <span><strong>김민지</strong><small>minji@hooc.kr</small></span>
            <button type="button" aria-label="프로필 메뉴">⋯</button>
          </div>
        </div>
      </aside>

      <section className="workspace" id="create">
        <header className="topbar">
          <div>
            <p className="eyebrow"><span>AI SHORTS STUDIO</span> / 새 프로젝트</p>
            <h1>쇼핑 쇼츠 만들기</h1>
          </div>
          <div className="header-actions">
            <button className="ghost-button" type="button">임시 저장</button>
            <button className="help-button" type="button" aria-label="도움말">?</button>
          </div>
        </header>

        <div className="stepper" aria-label="제작 단계">
          {[
            ["01", "상품 정보"],
            ["02", "AI 구성"],
            ["03", "미리보기"],
            ["04", "내보내기"],
          ].map(([number, label], index) => (
            <div className={`step ${index === 0 ? "current" : ""}`} key={number}>
              <span>{number}</span>
              <strong>{label}</strong>
              {index < 3 && <i />}
            </div>
          ))}
        </div>

        <div className="studio-grid">
          <section className="form-panel" aria-label="상품 및 쇼츠 설정">
            <div className="section-heading">
              <div><span>01</span><h2>어디에 올릴까요?</h2></div>
              <p>플랫폼에 맞는 화면 비율과 문법으로 만들어요.</p>
            </div>
            <div className="platform-tabs">
              {platforms.map((item) => (
                <button
                  type="button"
                  className={platform === item ? "selected" : ""}
                  key={item}
                  onClick={() => setPlatform(item)}
                >
                  <span className={`platform-dot ${item.toLowerCase()}`}>{item === "Instagram" ? "◎" : item === "YouTube" ? "▶" : "♪"}</span>
                  {item}
                  <small>{item === "Instagram" ? "Reels" : item === "YouTube" ? "Shorts" : "Video"}</small>
                </button>
              ))}
            </div>

            <div className="divider" />

            <div className="section-heading product-heading">
              <div><span>02</span><h2>상품을 알려주세요</h2></div>
              <p>링크를 붙여 넣거나 직접 상품 정보를 입력하세요.</p>
            </div>

            <label className="field-label" htmlFor="product-url">상품 페이지 URL <small>선택</small></label>
            <div className="url-field">
              <span>↗</span>
              <input id="product-url" defaultValue="https://brand.shop/products/peach-glow" />
              <button type="button">불러오기</button>
            </div>

            <div className="or-line"><span>또는</span></div>

            <div className="product-form-grid">
              <label className="upload-box">
                <input type="file" accept="image/*" onChange={handleImage} />
                <div className="product-thumb">
                  {uploadedImage ? (
                    <img src={uploadedImage} alt="업로드한 상품" />
                  ) : (
                    <div className="serum-bottle mini"><i /><b>PEACH<br />GLOW</b></div>
                  )}
                </div>
                <span className="upload-copy"><strong>{fileName}</strong><small>이미지를 눌러 변경 · JPG, PNG</small></span>
                <span className="replace-photo">↻</span>
              </label>

              <div className="field-stack">
                <label className="field-label" htmlFor="product-name">상품명</label>
                <input className="text-field" id="product-name" defaultValue="피치 글로우 세라마이드 세럼" />
                <div className="two-fields">
                  <label><span className="field-label">정상가</span><span className="price-input"><input defaultValue="32,000" /><i>원</i></span></label>
                  <label><span className="field-label">할인가</span><span className="price-input sale"><input defaultValue="22,400" /><i>원</i></span></label>
                </div>
              </div>
            </div>

            <label className="field-label" htmlFor="benefit">핵심 소구점</label>
            <textarea id="benefit" defaultValue={"피치 세라마이드와 8중 히알루론산으로 속건조를 잡아주고, 메이크업이 잘 먹는 촉촉한 피부로 만들어줘요."} />
            <div className="ai-hint"><span>✦</span> AI가 상품 정보를 읽고 3가지 핵심 포인트를 발견했어요.</div>

            <div className="divider" />

            <div className="section-heading">
              <div><span>03</span><h2>어떤 느낌으로 만들까요?</h2></div>
            </div>
            <div className="tone-row" role="group" aria-label="영상 톤">
              {tones.map((item) => (
                <button type="button" key={item} className={tone === item ? "selected" : ""} onClick={() => setTone(item)}>{item}</button>
              ))}
            </div>

            <div className="caption-field">
              <label className="field-label" htmlFor="caption">AI가 만든 첫 문장</label>
              <div><input id="caption" value={caption} onChange={(event) => setCaption(event.target.value)} /><button type="button" onClick={() => setCaption("요즘 피부가 푸석하다면, 18초만 집중 🍑")}>↻</button></div>
            </div>

            <button className={`generate-button ${generating ? "loading" : ""}`} type="button" onClick={generate}>
              <span>{generating ? "◌" : "✦"}</span>
              {generating ? "AI가 쇼츠를 구성하는 중..." : generated ? "새 버전 다시 만들기" : "AI 쇼츠 구성하기"}
              {!generating && <small>약 30초</small>}
            </button>
            {generated && <p className="success-message">✓ 새로운 대본과 4개 장면 구성이 완성됐어요.</p>}
          </section>

          <aside className="preview-panel" aria-label="쇼츠 미리보기">
            <div className="preview-heading">
              <div><span className="live-dot" /> LIVE PREVIEW</div>
              <button type="button">9:16 <i>⌄</i></button>
            </div>

            <div className="phone-frame">
              <div className="phone-speaker" />
              <div className={`video-canvas scene-${scenes[activeScene].kind}`}>
                <div className="video-topline">
                  <span><BrandMark small /> HOOC</span>
                  <b>{scenes[activeScene].label}</b>
                </div>
                <div className="peach-orb orb-one" />
                <div className="peach-orb orb-two" />
                <div className="spark spark-one">✦</div>
                <div className="spark spark-two">✦</div>

                <div className="preview-product">
                  {uploadedImage ? (
                    <img src={uploadedImage} alt="상품 미리보기" />
                  ) : (
                    <div className="serum-bottle"><i /><b>PEACH<br />GLOW</b><small>SERUM 30ml</small></div>
                  )}
                  {scenes[activeScene].kind === "solution" && <span className="ingredient-chip">8중 히알루론산</span>}
                </div>

                <div className="video-copy">
                  <p>{scenes[activeScene].headline.split("\n").map((line, i) => <span key={i}>{line}</span>)}</p>
                  <small>{scenes[activeScene].subline}</small>
                  {scenes[activeScene].kind === "cta" && <button type="button">지금 구매하기 →</button>}
                </div>
                <div className="video-progress"><i style={{ width: `${progress}%` }} /></div>
              </div>
            </div>

            <div className="player-controls">
              <span>00:{activeScene === 0 ? "03" : activeScene === 1 ? "07" : activeScene === 2 ? "14" : "18"}</span>
              <button type="button" className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "일시 정지" : "재생"}>{playing ? "Ⅱ" : "▶"}</button>
              <span>00:18</span>
            </div>

            <div className="scenes-heading"><strong>장면 구성</strong><span>총 18초 · 4장면</span></div>
            <div className="scene-list">
              {scenes.map((scene) => (
                <button type="button" className={activeScene === scene.id ? "active" : ""} key={scene.id} onClick={() => { setActiveScene(scene.id); setPlaying(false); }}>
                  <span className={`scene-mini ${scene.kind}`}><i>{scene.id + 1}</i><b>{scene.kind === "hook" ? "?" : scene.kind === "problem" ? "!" : scene.kind === "solution" ? "✦" : "%"}</b></span>
                  <span><strong>{scene.label === "PAIN POINT" ? "문제 공감" : scene.label === "SOLUTION" ? "상품 솔루션" : scene.label === "CTA" ? "구매 유도" : "시선 끌기"}</strong><small>{scene.headline.replace("\n", " ")}</small></span>
                  <time>{scene.time}</time>
                </button>
              ))}
            </div>

            <div className="preview-note"><span>i</span><p><strong>미리보기 안내</strong>AI 구성 후 장면별 영상, 자막, 보이스를 세밀하게 편집할 수 있어요.</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
