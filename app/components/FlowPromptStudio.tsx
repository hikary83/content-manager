"use client";

import { useMemo, useState } from "react";

export type ConceptId = "problem" | "review" | "premium" | "demo";

export type StoryboardScene = {
  id: number;
  time: string;
  label: string;
  title: string;
  caption: string;
  narration: string;
  visual: string;
  kind: "hook" | "problem" | "solution" | "cta";
};

export type FlowProject = {
  title: string;
  summary: string;
  scenes: StoryboardScene[];
  firstPrompt: string;
  extendPrompt: string;
  voiceoverText: string;
  srtText: string;
  social: {
    title: string;
    post: string;
    hashtags: string;
    disclosure: string;
  };
  packageText: string;
};

type FlowPromptStudioProps = {
  productName: string;
  productImage: string | null;
  benefit: string;
  price: string;
  hook: string;
  tone: string;
  concept: ConceptId;
  referenceImages: Array<{ name: string; dataUrl: string }>;
  initialProject?: FlowProject | null;
  onGenerated: (project: FlowProject) => void;
};

const conceptCopy: Record<ConceptId, { label: string; direction: string; camera: string }> = {
  problem: {
    label: "문제 해결형",
    direction: "Open with a relatable everyday frustration, then reveal the product as the clear solution.",
    camera: "fast macro push-in, match cuts, tactile demonstration, confident hero finish",
  },
  review: {
    label: "찐후기형",
    direction: "Feel like an honest creator recommendation discovered during a real daily routine.",
    camera: "natural handheld movement, close reaction details, authentic home lighting, casual product reveal",
  },
  premium: {
    label: "감성 광고형",
    direction: "Build desire through refined materials, elegant lighting, and a cinematic luxury mood.",
    camera: "slow macro orbit, soft highlights, shallow depth of field, polished studio hero shot",
  },
  demo: {
    label: "사용 시연형",
    direction: "Make the benefit instantly understandable through a satisfying visual demonstration.",
    camera: "overhead demo, crisp close-ups, smooth speed ramps, clear before-and-after visual rhythm",
  },
};

function short(value: string, max: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max).trim()}…` : normalized;
}

function makeFlowProject(input: FlowPromptStudioProps, variant: number): FlowProject {
  const { productName, benefit, price, hook, tone, concept, referenceImages } = input;
  const conceptInfo = conceptCopy[concept];
  const cleanProduct = short(productName, 70) || "선택한 상품";
  const cleanBenefit = short(benefit, 180) || `${cleanProduct}의 핵심 장점을 직관적으로 보여준다.`;
  const cleanHook = short(hook, 70) || [
    `이거, 왜 이제 알았지?`,
    `${cleanProduct}, 진짜 다른 이유`,
    `15초만 보면 바로 이해돼요`,
  ][variant % 3];
  const offer = price ? `${price} 혜택 확인` : "지금 자세히 보기";

  const scenes: StoryboardScene[] = [
    {
      id: 0,
      time: "0–3초",
      label: "HOOK",
      title: cleanHook,
      caption: cleanHook,
      narration: cleanHook,
      visual: concept === "premium"
        ? "어두운 배경에서 빛이 켜지며 상품 패키지를 초근접으로 공개"
        : "일상 속 불편한 순간을 빠르게 보여준 뒤 상품을 화면 중앙에 등장",
      kind: "hook",
    },
    {
      id: 1,
      time: "3–7초",
      label: "PROBLEM",
      title: "나만 몰랐던 불편의 원인",
      caption: "이런 경험, 한 번쯤 있죠?",
      narration: `매번 반복되는 불편, ${cleanProduct} 하나로 바꿔보세요.`,
      visual: "사용 전의 답답한 상황을 짧고 명확한 행동으로 표현",
      kind: "problem",
    },
    {
      id: 2,
      time: "7–12초",
      label: "SOLUTION",
      title: short(cleanBenefit, 36),
      caption: short(cleanBenefit, 44),
      narration: cleanBenefit,
      visual: "상품의 질감과 사용 동작을 클로즈업하고 핵심 효과가 느껴지는 만족스러운 변화 연출",
      kind: "solution",
    },
    {
      id: 3,
      time: "12–15초",
      label: "CTA",
      title: offer,
      caption: `${offer} · 링크에서 확인`,
      narration: `${cleanProduct}, 지금 링크에서 확인해보세요.`,
      visual: "깨끗한 배경의 안정적인 상품 히어로 샷으로 마무리하고 하단 자막 공간 확보",
      kind: "cta",
    },
  ];

  const referenceDirection = referenceImages.length > 0
    ? `${referenceImages.length} additional visual reference image${referenceImages.length > 1 ? "s are" : " is"} attached. Use them only as references for lighting, color palette, environment, composition, and camera mood. Never copy or replace the real product design from those images.`
    : "No additional mood references are attached. Build a clean commercial environment that supports the selected concept.";

  const firstPrompt = `Create the first 8 seconds of a vertical 9:16 Korean shopping short.

PRODUCT: ${cleanProduct}
KEY BENEFIT: ${cleanBenefit}
CREATIVE CONCEPT: ${conceptInfo.label} / ${tone}
DIRECTION: ${conceptInfo.direction}

Use the uploaded product image as the exact visual reference and starting frame. Preserve the real packaging, logo placement, proportions, and colors. Do not invent or alter any brand text.
${referenceDirection}

SHOT PLAN
0-3s: ${scenes[0].visual}. Communicate the hook idea through action and composition only. Do not display the hook sentence in the video.
3-7s: ${scenes[1].visual}.
7-8s: Begin the solution reveal with the product in active use.

CAMERA: ${conceptInfo.camera}.
STYLE: premium ecommerce commercial, realistic materials and physics, clean vertical composition, strong first-frame impact, smooth continuous motion.
AUDIO: upbeat commercial music and tactile product sound effects only. No spoken dialogue.
TEXT RULE: generate absolutely no captions, subtitles, title cards, prices, call-to-action text, or other readable on-screen text. Do not render any Korean or English words. Keep clear negative space in the lower third so captions can be added separately in post-production.
IMPORTANT: no extra logos and no distorted packaging.`;

  const extendPrompt = `Extend this Veo-generated clip for about 7 more seconds to complete a 15-second vertical shopping short. Continue seamlessly from the final frame with the exact same product, lighting, set, colors, and camera language.

7-12s: ${scenes[2].visual}. Make the product benefit immediately understandable through action only. Do not display the benefit sentence.
12-15s: ${scenes[3].visual}. End with the product centered and held still long enough for a purchase call-to-action.

Keep the existing music and sound design coherent. No spoken dialogue. Generate absolutely no captions, subtitles, title cards, prices, call-to-action text, or other readable on-screen text. Do not render any Korean or English words. No invented logos or packaging distortion. Maintain 9:16 framing and leave clean lower-third space for captions added separately in post-production.`;

  const storyboardText = scenes.map((scene) => [
    `${scene.time} · ${scene.label}`,
    `화면: ${scene.visual}`,
    `내레이션: ${scene.narration}`,
    `후반 작업 자막: ${scene.caption}`,
  ].join("\n")).join("\n\n");

  const voiceoverText = scenes.map((scene) => scene.narration).join(" ");
  const srtText = scenes.map((scene, index) => {
    const ranges = [
      "00:00:00,000 --> 00:00:03,000",
      "00:00:03,000 --> 00:00:07,000",
      "00:00:07,000 --> 00:00:12,000",
      "00:00:12,000 --> 00:00:15,000",
    ];
    return `${index + 1}\n${ranges[index]}\n${scene.caption}`;
  }).join("\n\n");
  const social = {
    title: `${cleanProduct}, 요즘 주목받는 이유｜15초 핵심 리뷰`,
    post: `${cleanHook}\n\n${cleanBenefit}\n\n직접 확인해보고 싶다면 프로필 링크 또는 아래 구매 링크를 참고해주세요.`,
    hashtags: `#${cleanProduct.replace(/\s+/g, "")} #쇼핑추천 #제품리뷰 #쇼핑쇼츠 #신상추천 #HIKARY`,
    disclosure: "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  };

  const packageText = `[HIKARY FLOW 제작 패키지]
상품: ${cleanProduct}
콘셉트: ${conceptInfo.label} / ${tone}
핵심 소구점: ${cleanBenefit}
참고 이미지: 상품 원본 1장 + 무드 참고 ${referenceImages.length}장

[15초 대본·스토리보드]
${storyboardText}

[내레이션 대본]
${voiceoverText}

[후반 자막 SRT]
${srtText}

[FLOW 첫 8초 프롬프트]
${firstPrompt}

[FLOW 이어 만들기 프롬프트]
${extendPrompt}

[SNS 등록 패키지]
제목: ${social.title}

본문:
${social.post}

해시태그: ${social.hashtags}

제휴 고지: ${social.disclosure}

[FLOW 설정]
- 세로 9:16
- 첫 영상 8초
- 상품 이미지를 핵심 Ingredient 또는 시작 프레임으로 추가
- 추가 참고 이미지는 조명·배경·색감·카메라 무드용 Ingredient로 추가
- 첫 8초 영상 생성 후 Veo 3.1 Lite의 Extend에서 두 번째 프롬프트 사용
- Flow 영상에는 자막·가격·CTA 등 어떤 화면 글자도 생성하지 않기
- 아래 스토리보드의 자막 가이드는 영상 완성 후 편집 프로그램에서 별도로 추가`;

  return {
    title: `${cleanProduct} · ${conceptInfo.label} 쇼츠`,
    summary: `세로 9:16 · 15초 ${tone} 쇼츠 · 참고 이미지 ${referenceImages.length + 1}장`,
    scenes,
    firstPrompt,
    extendPrompt,
    voiceoverText,
    srtText,
    social,
    packageText,
  };
}

export function FlowPromptStudio(props: FlowPromptStudioProps) {
  const [project, setProject] = useState<FlowProject | null>(props.initialProject ?? null);
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const ready = props.productName.trim().length >= 2 && props.benefit.trim().length >= 5 && Boolean(props.productImage);
  const conceptLabel = useMemo(() => conceptCopy[props.concept].label, [props.concept]);

  const generate = (version = variant) => {
    const next = makeFlowProject(props, version);
    setProject(next);
    props.onGenerated(next);
    window.setTimeout(() => document.getElementById("flow-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const downloadText = (value: string, suffix: string) => {
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `HIKARY-${props.productName.replace(/[^\p{L}\p{N}]+/gu, "-") || "project"}-${suffix}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flow-studio" id="flow-prompts" aria-labelledby="flow-title">
      <div className="section-heading flow-heading">
        <div><span>04</span><h2 id="flow-title">대본·스토리보드·Flow 프롬프트 만들기</h2></div>
        <p>영상 생성비 없이 먼저 제작안을 완성해요.</p>
      </div>

      <div className="flow-plan-strip">
        <div><b>1</b><span><strong>15초 구성</strong><small>4장면 대본·후반 자막</small></span></div>
        <i>→</i>
        <div><b>2</b><span><strong>첫 8초</strong><small>Flow 생성 프롬프트</small></span></div>
        <i>→</i>
        <div><b>3</b><span><strong>이어 만들기</strong><small>Veo 3.1 Lite로 Extend</small></span></div>
      </div>

      <button className="flow-generate-button" type="button" onClick={() => generate()} disabled={!ready}>
        <span>✦</span>
        {project ? "다른 버전으로 다시 만들기" : "제작 패키지 만들기"}
        <small>무료 · API 연결 필요 없음</small>
      </button>
      {!ready && <p className="flow-ready-note">상품명·핵심 소구점·상품 이미지를 먼저 준비해주세요.</p>}

      {project && (
        <div className="flow-result" id="flow-result">
          <div className="flow-result-head">
            <div><span>READY</span><h3>{project.title}</h3><p>{project.summary}</p></div>
            <button type="button" onClick={() => { const next = variant + 1; setVariant(next); generate(next); }}>↻ 새 초안</button>
          </div>

          <div className="storyboard-visual-head"><div><span>CONTI</span><strong>4컷 콘티 스케치</strong></div><p>실제 생성 영상이 아니라 구도와 움직임을 잡는 제작 가이드입니다.</p></div>
          <div className="storyboard-sketch-grid">
            {project.scenes.map((scene, index) => {
              const moodImage = props.referenceImages[index % Math.max(1, props.referenceImages.length)]?.dataUrl;
              return (
                <article className={`storyboard-sketch ${scene.kind}`} key={scene.id}>
                  <div className="sketch-canvas">
                    {moodImage && <img className="sketch-mood" src={moodImage} alt="" />}
                    {props.productImage && <img className="sketch-product" src={props.productImage} alt="" />}
                    <span className="sketch-frame-number">{String(index + 1).padStart(2, "0")}</span>
                    <i className="sketch-motion">{scene.kind === "hook" ? "↗" : scene.kind === "problem" ? "…" : scene.kind === "solution" ? "↻" : "◎"}</i>
                    <b>{scene.label}</b>
                  </div>
                  <div><strong>{scene.time} · {scene.title}</strong><small>{scene.visual}</small></div>
                </article>
              );
            })}
          </div>

          <div className="storyboard-grid">
            {project.scenes.map((scene) => (
              <article key={scene.id}>
                <header><b>{String(scene.id + 1).padStart(2, "0")}</b><span>{scene.time}</span></header>
                <strong>{scene.title}</strong>
                <p><b>화면</b>{scene.visual}</p>
                <p><b>대사</b>{scene.narration}</p>
                <small>후반 자막 가이드 · {scene.caption}</small>
              </article>
            ))}
          </div>

          <div className="flow-prompt-card">
            <header><div><span>CLIP 01</span><strong>첫 8초 생성 프롬프트</strong></div><button type="button" onClick={() => void copy("first", project.firstPrompt)}>{copied === "first" ? "복사됨 ✓" : "프롬프트 복사"}</button></header>
            <pre>{project.firstPrompt}</pre>
          </div>

          <div className="flow-prompt-card extend">
            <header><div><span>EXTEND</span><strong>이어 만들기 프롬프트</strong></div><button type="button" onClick={() => void copy("extend", project.extendPrompt)}>{copied === "extend" ? "복사됨 ✓" : "프롬프트 복사"}</button></header>
            <pre>{project.extendPrompt}</pre>
          </div>

          <div className="flow-howto">
            <div><span>1</span><p><strong>참고 이미지 추가</strong><small>상품은 핵심 Ingredient, 나머지는 무드 참고로 넣기</small></p></div>
            <div><span>2</span><p><strong>세로 9:16 · 8초</strong><small>첫 번째 프롬프트를 붙여 넣고 생성</small></p></div>
            <div><span>3</span><p><strong>Veo 3.1 Lite · Extend</strong><small>두 번째 프롬프트로 약 7초 이어 만들기</small></p></div>
          </div>

          <div className="production-package">
            <header><div><span>POST</span><strong>대본·자막·SNS 등록 패키지</strong></div><small>영상 완성 후 바로 활용하세요.</small></header>
            <div className="production-package-grid">
              <article><div><strong>내레이션 대본</strong><button type="button" onClick={() => void copy("voice", project.voiceoverText)}>{copied === "voice" ? "복사됨 ✓" : "복사"}</button></div><p>{project.voiceoverText}</p></article>
              <article><div><strong>SNS 제목</strong><button type="button" onClick={() => void copy("social-title", project.social.title)}>{copied === "social-title" ? "복사됨 ✓" : "복사"}</button></div><p>{project.social.title}</p></article>
              <article className="wide"><div><strong>SNS 등록 글</strong><button type="button" onClick={() => void copy("social-post", `${project.social.post}\n\n${project.social.hashtags}\n\n${project.social.disclosure}`)}>{copied === "social-post" ? "복사됨 ✓" : "전체 복사"}</button></div><p>{project.social.post}</p><small>{project.social.hashtags}</small><em>{project.social.disclosure}</em></article>
            </div>
            <div className="package-downloads"><button type="button" onClick={() => downloadText(project.srtText, "captions.srt")}>SRT 자막 저장</button><button type="button" onClick={() => void copy("srt", project.srtText)}>{copied === "srt" ? "SRT 복사됨 ✓" : "SRT 복사"}</button></div>
          </div>

          <div className="flow-actions">
            <button type="button" onClick={() => void copy("all", project.packageText)}>{copied === "all" ? "전체 복사됨 ✓" : "전체 제작안 복사"}</button>
            <button type="button" onClick={() => downloadText(project.packageText, "flow-package.txt")}>TXT 저장</button>
            {props.productImage && <a href={props.productImage} target="_blank" rel="noopener noreferrer">상품 이미지 열기</a>}
            <a className="flow-open" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">Google Flow 열기 ↗</a>
          </div>
          <p className="flow-disclaimer">Flow의 모델·크레딧 비용은 생성 전에 Flow 화면에서 확인해주세요. HIKARY에서는 이 단계에서 영상 API를 호출하지 않습니다.</p>
        </div>
      )}

      {!project && <div className="flow-empty"><span>SB</span><p><strong>{conceptLabel} 제작안을 준비할게요</strong><small>상품과 콘셉트를 확인한 뒤 버튼을 누르면 한 번에 생성됩니다.</small></p></div>}
    </section>
  );
}
