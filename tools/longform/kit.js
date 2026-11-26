// 롱폼 연출 부품 (모션팀, 2026-11-23~25) — 카메라 · 살아 있는 움직임 · 말풍선 · 아래 자막 · 타이포 · 배경 · 아웃트로. 모양은 kit.css.
// 캐릭터(말랑이·콩이·삐코 그림과 몸 치수·색)는 공개 저장소에 두지 않는다 — cast.js는 contents/longform/_cast/에 있다 (git 밖).
// 롱폼팀이 새 동작·부품이 필요하면 모션팀이 여기에 더한다.
//
// 한 편 = contents/longform/EP01_<YYYYMMDD>_<주제>/ — contents/longform/_check/가 이 자리에서 30초 v3를 다시 녹화한 예시다.
//   motion.html   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Black+Han+Sans&display=block">
//                 <link rel="stylesheet" href="../../../tools/longform/kit.css">
//                 <body data-size="1920x1080" data-duration="30" data-voice="clone 혜경"><div class="stage"></div>
//                 <script src="../_cast/cast.js"></script><script src="captimes.js"></script>
//                 <script src="../../../tools/longform/kit.js"></script><script src="scene.js"></script>
//   scene.js      장면을 쌓고 끝에서 kitDone() — 장면을 넣고 효과음 목록(data-sfx)과 키프레임을 채운다.
//   narration.md  나레이션 대본 (쇼츠와 같은 표). 아래 자막은 대본 글을 capOf(시작, 끝, 글)로 따로 넣는다.
// 만드는 순서: node tools/motion/record.mjs <motion.html> → node tools/longform/captimes.mjs <motion.html> (자막 조각 시각)
//   → record.mjs 한 번 더 (읽은 음성은 voice/에 남아 다시 읽지 않는다) → node tools/longform/finish.mjs <motion.html>
//   (배경음악 끊김 data-music-off · 아웃트로 끝 줄임을 넣어 motion-bgm.mp4를 다시 만든다).
//   장면 분위기마다 음원을 바꿔 깔려면 <body data-bgm-cues="0 밝게, 2.9 끊김, …, 321.2 공연, …" data-bgm-stings="36.2 어이쿠, 86.8 쿵, …">
//   (분위기 낱말 ↔ 곡은 contents/longform/_music/tracks.json, 끊김은 data-music-off 대신 큐로) — tools/longform/music.mjs 맨 위 주석.
// 씨앗: 배경음악 곡과 타이포 수 순서는 폴더 이름으로 정해진다. 다른 것을 원하면 <body data-bgm="아무 글자"> · <body data-typo="아무 글자">.
// 시간: 모두 영상 처음부터의 초. <body data-from="20">이면 20초 지점부터 찍는다 (한 구간만 미리 볼 때 — 시간표는 그대로 둔다).
// 움직임은 CSS 애니메이션만이다 (녹화 도구가 시각을 맞춰 찍는다). 이 파일은 페이지를 열 때 한 번 장면을 만든다.
// cast.js가 주는 것: castSVG · sparkSVG · CAST · CAST_POSES · REF_POSE · BODY(머리 꼭대기·턱·허리) · BC(말풍선 테두리 색) · NAMEC(이름표 색).
//
// ── 부품 (자세한 것은 각 절 위 주석) ──
// 자막    capOf(시작, 끝, 글) — 80px 한 줄, 16자 안쪽 조각으로 끊어 바꿔 보임 (「아래 자막」)
// 타이포  typo(…) 핵심 낱말 · typo.hook(…) 훅 물음 카드 · typo.sound(…) 소리 글자 · typo.compare(…) 비교 칩 (「자막 타이포」 · 「타이포 모양 더」)
// 말      say(who, 시작, 끝, 글, 꼬리 점, 'R'|'L') · nameTag · big · bigAt · explainer(삐코 설명 자리) · tag
// 배경    playground() · room · street   · 움직임 한 줄 track(steps, 축, 안)
// 꼬리표  progressTag([[시작, 끝, '오전 7:00'], …]) — 「상상」 딱지 옆 시계·진행 꼬리표 (「진행 꼬리표」)
// 소품    sketchbook(시작, 끝, x, y, [[시각, 글, 크기], …]) 장 넘기는 스케치북 · cupOf(배우, 'mouth'|'ear', dir) + cord(점, 점, { sag }) 실 전화기
// 캐릭터  자세 sit(앉기 — tilt로 기대기) · lie(이불 속 누운 모습) · 표정 sleep · puff · 종이컵 cup — cast.js 맨 위 주석
// 끝      <body data-outro="60">이면 그 시각부터 12초 아웃트로 (「아웃트로」)
// 로고    오른쪽 위 채널 로고가 저절로 들어간다 (아웃트로에서는 빠짐) — <body data-logo="70">(보이는 높이 px) · data-logo="off" (「채널 로고」)
// 카메라  camera([[t, 샷, 방식], …], 세상)  — 세상(배경·배우·말풍선)을 통째로 당기고 뺀다. 큰 글자·자막은 카메라 밖에 둔다.
//   샷:   shot('wide') 멀리(셋+배경) · shot('medium', 배우) 중간(몸이 화면 반쯤) · shot('close', 배우) 가까이(얼굴이 화면을 채움)
//         배우 = { x(왼쪽), size, up } — actor()에 준 값 그대로. shot(…, 배우, dx, dy)로 가운데를 옮긴다 (말풍선 자리 만들기)
//   방식: 'cut' 바로 · 'punch' 0.2초에 확 당기기 · 숫자 = 그 초 동안 부드럽게 (줌 인·아웃)
// 배우    actor(who, x, size, pose, face, o) — 서 있으면 저절로 숨 쉰다 (아주 작게 커졌다 작아짐)
//         faces(who, x, size, pose, [[시작, 끝, 표정], …], o) — 표정이 놀람·씩으로 바뀌면 머리가 톡 커졌다 돌아온다
// 몸      alive([['jump', t, 공중시간], ['talk', t]], [발 x, 발 y], 배우) — 점프 앞 웅크림 · 뜰 때 길쭉 · 착지 납작 (스쿼시·스트레치),
//         ['land', t] 떨어져 닿을 때만 납작 · 말풍선이 뜰 때 통통 두 번. 점프 높이 움직임은 jump()가 따로 한다 (지난 시범과 같은 물리)
// 반짝    spark(t, x, y, size) — 놀라는 순간 「///」
//
// ── 카메라 · 빛 · 편집 기법 (2026-11-26, 스터디 S76) — 대본 「화면」 칸에 「효과 이름 + 무엇을 + 어떻게」로 이 이름 그대로 쓴다 ──
//   자세한 값은 아래 「카메라 · 빛 · 편집 기법」 절. 시험 영상: contents/_test/longform-camera/ (부품마다 3~4초)
// 크레인        「크레인 — 하늘에서 무대 현수막까지 3.5초에 내려오며 연다」
//               W.push(seg(0, 4, crane(0, 3.5, [[0.15, 하늘], [0.55, 나무·울타리], [1, 무대·배우]], { y: -650 }, { y: 420, z: 1.3 }))); cut(0, WIDE)
//               「크레인 — 관객 머리에서 무대 전체로 솟는다」 crane(a, b, [… , [1.35, 관객]], { y: 880, z: 1.6 }, {})
// 깊이          층 = [[깊이, html], …] — 1 주인공 층(배우·무대 바닥) · 0.1~0.6 뒤(하늘·나무) · 1.2~1.5 앞(관객 머리). 크레인·달리 줌·아크가 쓴다
//   (패럴랙스)   parallax([[t, 시점, ease], …], 층) — 시점을 여러 번 옮길 때. 하늘은 크레인 높이만큼 위로 넉넉히 그린다
// 달리 줌       「달리 줌 — 말랑이는 그대로, 뒤 하늘·울타리만 1.2초에 1.7배로 쑥」 dollyZoom(a, b, [[0.3, 뒤], [1, 앞]], 1.7, { at: 말랑이 얼굴 세상 점 })
// 아크          「아크 — 콩이를 가운데 두고 옆으로 돈다」 arcShot(a, b, 층, 300) — 뒤 층과 앞 층이 반대로 미끄러진다
// 크래시 줌     「크래시 줌 — 0.25초에 말랑이 얼굴로 확, 휙 소리 · 집중선」 S.push(crashZoom(t, shot('close', 배우))) — cut 대신
// 휩 팬         「휩 팬 — 0.3초에 옆으로 휙 흐리며 콩이에게」 S.push(whipPan(t, shot('medium', 배우))) — 장면을 바꾸려면 t + 0.15에 바꾼다
// 슬로 모션     「슬로 모션 — 북 치는 1.8초만 0.25배로」 W.push(slowMotion(장면 시작, 장면 끝, [a, b, 0.25], () => 장면))
// 프리즈 프레임 「프리즈 프레임 + 이름표 — 귀 긁는 순간 1.6초 멈추고 '콩이 · 귀가 가려운 줄 앎'」
//               W.push(freezeFrame(장면 시작, 장면 끝, [a, b], () => 장면)); S.push(freezeTag(a, b, '콩이', '귀가 가려운 줄 앎', { who: 'orange' }))
// 타임랩스      「타임랩스 — 창밖 해와 구름이 휙휙, 시계가 7:00 → 9:40」 W.push(seg(a, b, 방 + timelapse(a, b))) + progressTag 칸 [a, 끝, '오전 9:40', 바늘 도는 초]
// 시간대 색     「시간대 색 — 노을」 W.push(grade(a, b, '노을')) — '아침' · '한낮' · '노을' · '밤'. W 맨 끝에, seg로 감싸지 않는다
// 빛줄기        「빛줄기 — 왼쪽 위 해에서 무대로」 W.push(lightRays(a, b, [x, y], { angle: 35 }))
// 렌즈 플레어   「렌즈 플레어 — 해가 렌즈에 비침」 S.push(lensFlare(a, b, [x, y]))
// 보케          「보케 — 관객 휴대폰 불빛이 앞에서 흐리게」 S.push(bokeh(a, b, { area: [0, 700, 1920, 1080] }))
// 레터박스      「레터박스 — 6시 무대부터 공연 끝까지 위아래 검은 띠」 S.push(letterbox(a, b))
// 아이리스 아웃 「아이리스 아웃 — 말랑이 얼굴로 동그랗게 닫히며 끝」 S.push(irisOut(a, b, [x, y]))
// 스매시 컷     「스매시 컷 — 시끄러운 무대에서 조용한 밤 방으로 뚝」 S.push(smashCut(t)) + 장면을 t에 바꿈 (배경음악은 큐 「끊김」)
const FROM = +document.body.dataset.from || 0;
const GN = 2480, GH = 1240, G = 840; // 평소 중력 · 오늘(절반) 중력 (px/s², 키 380px ≈ 1.5m) · 땅 높이
const OUT = 'cubic-bezier(.33,.67,.67,1)', IN = 'cubic-bezier(.33,0,.67,.33)', EASE = 'cubic-bezier(.4,0,.2,1)', PUNCH = 'cubic-bezier(.15,.85,.3,1.12)';
const H = [], SFX = [], KF = [];
const r3 = n => +n.toFixed(3);
const OUTRO_LEN = 12, OUTRO_AT = document.body.dataset.outro != null ? +document.body.dataset.outro : null;
const T = t => r3(t - FROM);
const sfx = (t, name, v) => { if (t >= FROM) SFX.push(`${+(t - FROM).toFixed(2)} ${name} ${v}`); };

// ── 지난 시범의 부품 (pilot.js와 같다, 시간만 FROM을 뺀다) ──
const seg = (a, b, inner) => b <= FROM ? '' : `<div class="seg" style="--at:${T(a)}s;--len:${r3(b - a)}s">${inner}</div>`;
function mv(m0, md, from, to, ease, inner, origin, fw) {
  // 값을 모두 적는다 — 안 적으면 바깥 .mv의 --y1 같은 값을 물려받아 움직임이 두 번 더해진다
  const v = (k, o) => Object.entries({ x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 1, ...o }).map(([p, val]) => `--${p}${k}:${val}${p === 'r' ? 'deg' : p === 'x' || p === 'y' ? 'px' : ''}`).join(';');
  return `<div class="mv${fw ? ' fw' : ''}" style="--m0:${T(m0)}s;--md:${r3(md)}s;--ease:${ease};${v(0, from)};${v(1, to)}${origin ? `;--ox:${origin[0]}px;--oy:${origin[1]}px` : ''}">${inner}</div>`;
}
const airtime = (h, g) => 2 * Math.sqrt(2 * h / g);
const jump = (m0, h, g, inner) => { const half = airtime(h, g) / 2; return mv(m0, half, { y: 0 }, { y: -h }, OUT, mv(m0 + half, half, { y: 0 }, { y: h }, IN, inner)); };
const shadow = (cx, w = 160) => `<div class="shadow" style="left:${cx - w / 2}px;top:${G - 11}px;width:${w}px"></div>`;
const shadowJump = (m0, h, g, cx, inner) => { const half = airtime(h, g) / 2, s = Math.max(0.35, 1 - h / 500);
  return mv(m0, half, { sx: 1, sy: 1 }, { sx: s, sy: s }, OUT, mv(m0 + half, half, { sx: 1, sy: 1 }, { sx: 1 / s, sy: 1 / s }, IN, inner, [cx, G]), [cx, G]); };
const bubble = (a, b, text, x, y, side = 'R') => { sfx(a, 'pop', 0.3); return seg(a, b, `<div class="bubble ${side}" style="${side === 'L' ? `right:${1920 - x}px` : `left:${x}px`};top:${y}px">${text}</div>`); };
const big = (a, b, html, top = 96, s = 'tick') => { sfx(a, s, 0.3); return seg(a, b, `<div class="big" style="top:${top}px">${html}</div>`); };
const tag = (x, y, text, extra = '') => `<div class="tag" style="left:${x}px;top:${y}px;${extra}">${text}</div>`;
const ball = (x, y, ghost) => `<div class="ball${ghost ? ' ghost' : ''}" style="left:${x}px;top:${y}px"></div>`;
// 던진 것: 오른쪽(vx>0)·왼쪽으로 날아가 yEnd에 닿는다. 올라가는 데 √(2H/g), 내려오는 데 √(2(H+낙차)/g)
function arc(m0, x0, y0, vx, Hh, yEnd, g, inner) {
  const up = Math.sqrt(2 * Hh / g), down = Math.sqrt(2 * (Hh + yEnd - y0) / g), total = up + down;
  return { total, x1: x0 + vx * total, html: mv(m0, up, { y: 0 }, { y: -Hh }, OUT, mv(m0 + up, down, { y: 0 }, { y: Hh + yEnd - y0 }, IN, mv(m0, total, { x: 0 }, { x: vx * total }, 'linear', inner))) };
}
// ── 아래 자막 (나레이션과 같은 글) — 크기·자리는 kit.css .cap (2026-11-24 v3: 80px 한 줄, 짧게 끊어 바꿔 보이기 — IF 시나리오처럼)
//    한 조각은 CAP_MAX(16)자 안쪽(띄어쓰기 포함). 넘으면 쉼표 뒤에서 먼저 나누고, 그래도 길면 가운데에 가장 가까운 띄어쓰기에서 나눈다.
//    4자 이하로 남는 조각은 옆 조각과 합칠 수 있으면 합친다. 두 줄 자막은 쓰지 않는다.
//    조각이 바뀌는 때: captimes.js(captimes.mjs가 나레이션 음성에서 읽은 실제 말소리 구간·쉼)가 있으면 그 줄이 실제로 읽힌 시간을
//      음절 수에 비례해 나누고, 0.45초 안에 쉼(쉼표 자리)이 있으면 그 쉼 가운데로 맞춘다. 없으면 나레이션 구간을 음절 수에 비례해 나눈다.
//    타이포(typo)가 떠 있는 동안은 숨긴다 (자리를 나눠 같이 둬도 되는 타이포는 keepCap) — 남는 조각이 0.5초보다 짧으면 버린다.
const CAP_MAX = 16;
const TYPO = []; // 자막을 숨길 [시작, 끝]
function capChunks(text) {
  let out = [];
  for (const p of text.length <= CAP_MAX ? [text] : text.split(/(?<=,)\s+/)) {
    if (p.length <= CAP_MAX) { out.push(p); continue; }
    const sp = [...p.matchAll(/ /g)].map(m => m.index), mid = p.length / 2;
    const at = sp.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0];
    out.push(...(at == null ? [p] : [...capChunks(p.slice(0, at)), ...capChunks(p.slice(at + 1))]));
  }
  for (let i = 0; i < out.length; i++) {
    if (out[i].length > 4 || out.length < 2) continue;
    const j = i + 1 < out.length ? i + 1 : i - 1, [x, y] = j > i ? [i, j] : [j, i];
    if (out[x].length + out[y].length + 1 <= CAP_MAX) { out.splice(x, 2, `${out[x]} ${out[y]}`); i = -1; }
  }
  return out;
}
function capOf(a, b, text) {
  const chunks = capChunks(text), cuts = [a];
  if (chunks.length > 1) {
    const ct = typeof window !== 'undefined' && window.CAPTIMES ? window.CAPTIMES[text] : null;
    const syl = s => s.replace(/[\s,.!?~…'"「」]/g, '').length, total = syl(text);
    const [s0, s1] = ct ? ct.speech : [a, b];
    let acc = 0;
    for (const c of chunks.slice(0, -1)) {
      acc += syl(c);
      let t = s0 + (s1 - s0) * acc / total;
      const p = (ct?.pauses || []).map(([x, y]) => (x + y) / 2).sort((x, y) => Math.abs(x - t) - Math.abs(y - t))[0];
      if (p != null && Math.abs(p - t) < 0.45) t = p;
      cuts.push(r3(t));
    }
  }
  cuts.push(b);
  let parts = chunks.map((c, k) => [cuts[k], cuts[k + 1], c]);
  for (const [x, y] of TYPO) parts = parts.flatMap(([p, q, c]) => q <= x || p >= y ? [[p, q, c]] : [[p, x, c], [y, q, c]].filter(([u, v]) => v - u >= 0.5));
  return parts.map(([p, q, c]) => seg(p, q, `<div class="cap">${c}</div>`)).join('');
}

// ── 자막 타이포 (가로판, 2026-11-24) — 템플릿 6 생생의 「작은 말 / 큰 낱말」을 옮겼다. 모양은 kit.css .ty
// typo(시작, 끝, 작은 말, 큰 낱말, o) — 큰 낱말은 '<em>떨림</em>'처럼 형광펜 낱말을 em으로. 힘줄 곳(훅 물음 · 핵심 낱말 · 끝 물음)에만 쓴다.
//   o.move: 'land'(착지 — 훅, 0초 프레임에 다 보임) | 'slam'(쿵) | 'fly'(날아옴 — 세 글자 이하·2초 이상) | 'rise'(솟아오름) | 'through'(뚫고 지나감)
//           적지 않으면 생생처럼 씨앗(<body data-typo> 또는 폴더 이름)으로 쿵·날아옴·솟아오름 중 고른다 — 같은 수를 잇지 않는다.
//   o.x(가운데 x, 기본 960) · o.y(위 끝 y, 기본 40) · o.w(상자 폭, 기본 1100) · o.fs(큰 낱말 크기 — 기본은 글자 수로 2자 210 · 3자 180 · 4자 150 · 5자 이상 130)
//   o.ss(작은 말 크기, 기본 64) · o.point(형광펜 색, 기본 주황 #f2843a) · o.stay(영상 맨 끝 — 나가지 않고 남음)
//   그동안 아래 자막은 숨는다 (capOf보다 먼저 부른다). 효과음은 저절로: 착지·쿵 thud · 솟아오름 swoosh · 뚫고 지나감 pop
let tyH = (() => { const seed = document.body.dataset.typo || (typeof location !== 'undefined' ? decodeURIComponent(location.pathname).split('/').slice(-2)[0] : '');
  let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h; })();
const tyRnd = () => { tyH = Math.imul(tyH ^ (tyH >>> 15), 2246822507); tyH = Math.imul(tyH ^ (tyH >>> 13), 3266489909); return ((tyH ^= tyH >>> 16) >>> 0) / 4294967296; };
let tyOrder = null, tyPrev = '', tyK = 0;
function typo(a, b, small, big, o = {}) {
  if (!tyOrder) { tyRnd(); tyOrder = ['slam', 'fly', 'rise']; for (let i = 2; i > 0; i--) { const j = Math.floor(tyRnd() * (i + 1)); [tyOrder[i], tyOrder[j]] = [tyOrder[j], tyOrder[i]]; } }
  const letters = big.replace(/<[^>]+>/g, '').replace(/\s/g, '').length, len = r3(b - a);
  let move = o.move;
  if (!move) { move = [...tyOrder.slice(tyK % 3), ...tyOrder.slice(0, tyK % 3)].find(m => m !== tyPrev && (m !== 'fly' || (letters <= 3 && len >= 2))); tyK++; }
  tyPrev = move;
  if (move === 'fly') { const base = tyRnd() * 360; let i = 0;
    big = big.replace(/<em>(.*?)<\/em>/, (_, w) => `<em>${[...w].map(c => { if (!c.trim()) return c; const g = (base + i * 120 + (tyRnd() - 0.5) * 50) * Math.PI / 180, r = 650 + tyRnd() * 150;
      return `<span class="c" style="--i:${i++};--fx:${Math.round(Math.cos(g) * r)}px;--fy:${Math.round(Math.sin(g) * r)}px;--fr:${Math.round((tyRnd() < 0.5 ? -1 : 1) * (100 + tyRnd() * 120))}deg">${c}</span>`; }).join('')}</em>`); }
  const fs = o.fs || ({ 2: 210, 3: 180, 4: 150 }[letters] || (letters < 2 ? 230 : 130));
  ({ land: () => sfx(a + 0.18, 'thud', 0.6), slam: () => sfx(a + 0.25, 'thud', 0.65), rise: () => sfx(a + 0.18, 'swoosh', 0.3), through: () => sfx(a + 0.03, 'pop', 0.4) }[move] || (() => {}))();
  TYPO.push([a, b]);
  return seg(a, b, `<div class="ty ${move}${o.stay ? ' stay' : ''}" style="--at:${T(a)}s;--len:${len}s;--cx:${o.x ?? 960}px;--y:${o.y ?? 40}px;--tw:${o.w ?? 1100}px;--fs:${fs}px;--ss:${o.ss ?? 64}px${o.point ? `;--point:${o.point}` : ''}">
    <span class="ty-in"><b class="ty-s">${small}</b><b class="ty-b">${big}</b></span></div>`);
}

// ── 타이포 모양 더 (2026-11-24 v3 · 사람: "타이포가 하난가?") — 쓰임마다 한 모양. 모양은 kit.css .tyq · .tys · .tyc
//   typo(…)          핵심 낱말·개념 — 작은 주아 + 큰 블랙한산스 + 주황 형광펜 (위)
//   typo.hook(…)     훅 물음 — 남색 둥근 카드 + 흰 주아 한 줄 + 노란 큰 물음 + 기울어진 주황 「?」 딱지. 착지로 0초 프레임에 다 보인다
//   typo.sound(…)    소리 글자(의성어) — 기울어진 노란 큰 글자가 툭 튀고 흔들림. mute면 속이 빈 회색 글자에 빨간 줄 (소리가 사라짐)
//   typo.compare(…)  숫자·비교 — 흰 칩 둘(또는 셋)과 화살표: [공기 ✕] → [소리 ✕]. 칩이 차례로 톡
// 쓰는 곳 가르기: 화면 아래 자막과 같은 줄을 크게 보이는 것(훅·핵심 낱말)은 그동안 자막을 숨기고,
//   장면 안 빈자리에 따로 붙는 것(소리 글자·비교)은 자막과 같이 둔다 (keepCap — 기본값이 모양마다 다르다).
// 훅 물음: typo.hook(시작, 끝, 작은 한 줄, 큰 물음, { y, s1, s2, keepCap })
typo.hook = (a, b, line1, line2, o = {}) => {
  sfx(a + 0.18, 'thud', 0.6); sfx(a + 0.3, 'pop', 0.3);
  if (!o.keepCap) TYPO.push([a, b]);
  return seg(a, b, `<div class="ty tyq land" style="--at:${T(a)}s;--len:${r3(b - a)}s;--cx:960px;--tw:1920px;--y:${o.y ?? 34}px;--s1:${o.s1 ?? 56}px;--s2:${o.s2 ?? 128}px">
    <span class="ty-in"><span class="card"><b class="q1">${line1}</b><b class="q2">${line2}</b><i class="badge">?</i></span></span></div>`);
};
// 소리 글자: typo.sound(시각, 글자, { x, y(가운데), r(기울기 도), fs(기본 180), len(기본 .55초), mute, blur, alpha, sfx, vol, keepCap(기본 true) })
//   mute     소리가 사라짐 — 밝은 회색 글자 + 진한 회색 테두리 + 빨간 줄 (2026-11-25: 벽 줄무늬에 묻히지 않게 테두리를 진하게, 그림자를 더했다)
//   blur·alpha  작고 흐린 소리 (EP01 「웅웅」 — 자기 목소리만 조금): 예 { fs: 96, blur: 3, alpha: .75, sfx: false }
//   sfx      글자가 튈 때 효과음 — 기본 pop (mute면 없음), false면 없음, 'ding'·'alarm'·'clap'처럼 이름을 주면 그 소리 (vol 기본 pop .35 · 그 밖 .7)
typo.sound = (t, text, o = {}) => {
  const len = o.len ?? 0.55, s = o.sfx ?? (o.mute ? false : 'pop');
  if (s) sfx(t, s, o.vol ?? (s === 'pop' ? 0.35 : 0.7));
  if (o.keepCap === false) TYPO.push([t, t + len]);
  return seg(t, t + len, `<div class="tys${o.mute ? ' mute' : ''}" style="--at:${T(t)}s;--len:${len}s;--x:${o.x ?? 960}px;--y:${o.y ?? 300}px;--r:${o.r ?? -8}deg;--fs:${o.fs ?? 180}px${o.blur ? `;--bl:${o.blur}px` : ''}${o.alpha != null ? `;--al:${o.alpha}` : ''}"><span class="w">${text}</span></div>`);
};
// 비교: typo.compare(시작, 끝, [['공기', '✕'], ['소리', '✕']], { x, y(가운데), fs, keepCap(기본 true) }) — 표시는 '✕'(빨강) · '✓'(초록) · ''(없음), 칩 사이는 → (o.to로 바꿈)
typo.compare = (a, b, items, o = {}) => {
  items.forEach((_, i) => sfx(a + i * 0.32, 'pop', 0.3));
  if (o.keepCap === false) TYPO.push([a, b]);
  const chip = ([text, mark], i) => `<span class="chip" style="--d:${r3(i * 0.32)}s">${text}${mark ? `<i class="mark" style="--mc:${mark === '✓' ? '#3fbf7f' : '#ef5b5b'}">${mark}</i>` : ''}</span>`;
  return seg(a, b, `<div class="tyc" style="--at:${T(a)}s;--len:${r3(b - a)}s;--x:${o.x ?? 960}px;--y:${o.y ?? 540}px;--fs:${o.fs ?? 68}px">
    ${items.map((it, i) => (i ? `<b class="to" style="--d:${r3(i * 0.32 - 0.12)}s">${o.to ?? '→'}</b>` : '') + chip(it, i)).join('')}</div>`);
};

// ── 진행 꼬리표 (2026-11-25, EP01 「소리」 시계 — 사람 승인 "의견대로 컨펌") ──
// progressTag([[시작, 끝, '오전 7:00'], [시작, 끝, '오전 8:30'], …], o) — 왼쪽 위 「상상」 딱지 바로 옆의 작은 흰 꼬리표 (화면 위, 카메라 밖).
//   글에 「7:00」 같은 시각이 있으면 앞에 작은 시계를 그리고 바늘이 그 시각을 가리킨다 (o.icon: false면 안 그림).
//   앞 꼬리표와 이어지면(끝 = 다음 시작) 꼬리표가 톡 넘어가며 바뀌고, 시곗바늘이 앞 시각에서 새 시각까지 앞으로 빙글 돈다 (밤 9:00 → 다음 날 7:00이면 10바퀴).
//   o.x · o.y (기본 214 · 30 — 「상상」 딱지 오른쪽. 딱지가 없는 장면만 이어지면 x 34) · o.sfx (바뀔 때 효과음 이름, 기본 없음 — 소리 없는 구간을 지킨다)
//   시계가 아닌 글(「1일째」 「① 점프」)도 그대로 쓴다 — 다른 편의 진행 꼬리표.
//   타임랩스 (2026-11-26): 칸 넷째 값 = 바늘이 빙글빙글 도는 초 — 그동안 글은 앞 시각 그대로이고, 다 돌면 새 시각으로 톡 넘어간다.
//     [[25.4, 25.7, '오전 7:00'], [25.7, 29.8, '오전 9:40', 3.6]] → 25.7~29.3초 「오전 7:00」에서 바늘이 돌고, 29.3초에 「오전 9:40」
const clockMin = text => { const m = /(\d{1,2}):(\d{2})/.exec(text); return m ? (+m[1] % 12) * 60 + +m[2] : null; }; // 12시간 시계의 분
function progressTag(list, o = {}) {
  return list.map(([a, b, text, turn], i) => {
    const prev = i && list[i - 1][1] >= a - 0.01 ? list[i - 1] : null, cur = clockMin(text), was = prev && clockMin(prev[2]), lapse = turn != null && prev;
    let icon = '', still = '';
    if (o.icon !== false && cur != null) {
      const spin = was != null ? ((cur - was) % 720 + 720) % 720 : 0, from = cur - spin; // 앞으로만 돈다
      const hand = (cls, deg0, deg1) => `<b class="${cls}" style="--f:${r3(deg0)}deg;--t:${r3(deg1)}deg${spin ? `;animation:pc-turn ${turn ?? '.6'}s cubic-bezier(.3,0,.2,1) ${T(a)}s both` : ''}"></b>`;
      icon = `<i class="pclock">${hand('h', from * 0.5, cur * 0.5)}${hand('m', from * 6, cur * 6)}</i>`;
      still = `<i class="pclock"><b class="h" style="--t:${r3(cur * 0.5)}deg"></b><b class="m" style="--t:${r3(cur * 6)}deg"></b></i>`;
    }
    if (o.sfx && prev) sfx(lapse ? a + turn : a, o.sfx, 0.3);
    const at = `left:${o.x ?? 214}px;top:${o.y ?? 30}px`;
    if (lapse) return seg(a, a + turn, `<div class="ptag" style="--at:${T(a)}s;${at};animation:none">${icon}<span>${prev[2]}</span></div>`)
      + seg(a + turn, b, `<div class="ptag flip" style="--at:${T(a + turn)}s;${at}">${still}<span>${text}</span></div>`);
    return seg(a, b, `<div class="ptag${prev ? ' flip' : ''}" style="--at:${T(a)}s;${at}">${icon}<span>${text}</span></div>`);
  }).join('');
}

// ── 스케치북 (2026-11-25 — 30초 v3에서 넘긴 앞장이 뒤집혀 반쯤 비치던 것을 고쳐 부품으로) ──
// sketchbook(시작, 끝, x, y, [[시각, 글(html), 글자 크기], …], o) — 세상 자리 x·y(왼쪽 위)에 스프링 스케치북. 카메라 안(W)에 넣는다.
//   첫 장은 시작부터 보이고, 둘째 장부터는 그 시각에 앞장이 위로 넘어가며(0.45초) 드러난다. 넘긴 장은 모서리가 보일 때(-90도) 사라진다.
//   o.w · o.h (기본 400 · 236) · o.pad (글 왼쪽 여백 — 손·머리에 가리는 쪽, 기본 0) · o.raise (처음 0.3초 아래에서 올라옴)
//   넘길 때 효과음 swoosh. 손으로 쥐는 자리는 handOf(배우, 자세)로 잡는다 (30초 시험본 C12~C13).
function sketchbook(a, b, x, y, pages, o = {}) {
  const n = pages.length;
  const page = ([, text, size = 72], i) => `<div class="skp" style="z-index:${n - i};padding-left:${o.pad ?? 0}px;font-size:${size}px${i < n - 1 ? `;animation:sk-flip .45s ease-in ${T(pages[i + 1][0])}s both` : ''}">${text}</div>`;
  pages.slice(1).forEach(([t]) => sfx(t, 'swoosh', 0.25));
  const book = `<div class="sk" style="left:${x}px;top:${y}px;width:${o.w ?? 400}px;height:${o.h ?? 236}px">${pages.map(page).join('')}<i class="sk-ring"></i></div>`;
  return seg(a, b, o.raise ? mv(a, 0.3, { y: 120, o: 0 }, {}, OUT, book) : book);
}

// ── 실 전화기 (2026-11-25, EP01) ──
// 배우는 cast.js castSVG({ cup: 'mouth'(입에 꼭 — 말하는 쪽) | 'ear'(귀에 꼭 — 듣는 쪽), dir: 1 | -1(컵이 향하는 쪽) })로 그린다 — act(A, 'stand', 'basic', { cup, dir })
// cupOf(배우, 'mouth'|'ear', dir) — 컵 바닥(실 묶는 곳)의 세상 점 · cord(점, 점, { sag, w, color }) — 두 점을 잇는 실
//   sag: 가운데가 아래로 처지는 px (0 = 팽팽, 늘어진 실은 60~90). Y자는 가운데 매듭 점으로 세 줄을 긋는다. 카메라 안(W)에 넣는다.
const cupOf = (a, at, dir = 1) => wpt(a, ...castCup(a.who, at, dir));
const cord = ([x1, y1], [x2, y2], o = {}) => `<svg class="a" width="1" height="1" style="left:0;top:0;overflow:visible"><path d="M${r3(x1)},${r3(y1)} Q${r3((x1 + x2) / 2)},${r3((y1 + y2) / 2 + 2 * (o.sag || 0))} ${r3(x2)},${r3(y2)}" fill="none" stroke="${o.color ?? '#8a7560'}" stroke-width="${o.w ?? 4}" stroke-linecap="round"/></svg>`;

// ── 배경 (지난 시범의 운동장 · 방 · 동네 길) ──
const fence = `<div class="a" style="left:0;right:0;top:470px;height:300px;background:
  repeating-linear-gradient(90deg,transparent 0 46px,#6fbf7d 46px 52px),repeating-linear-gradient(0deg,transparent 0 46px,#6fbf7d 46px 52px);opacity:.75"></div>
  <div class="a" style="left:0;right:0;top:462px;height:14px;background:#5aa86a;border-top:4px solid #2e2a3a;border-bottom:4px solid #2e2a3a"></div>`;
const goal = `<div class="a" style="left:1480px;top:560px;width:330px;height:220px;border:12px solid #fff;border-bottom:0;outline:4px solid #2e2a3a;background:
  repeating-linear-gradient(90deg,transparent 0 26px,rgba(255,255,255,.7) 26px 29px),repeating-linear-gradient(0deg,transparent 0 26px,rgba(255,255,255,.7) 26px 29px)"></div>`;
const trees = list => list.map(([x, h, w]) => `<div class="tree" style="left:${x}px;top:${770 - h}px;height:${h}px;--w:${w}px"></div>`).join('');
const dirt = `<div class="ground" style="top:760px;background:#ecd3a8;border-top:5px solid #2e2a3a"></div>
  <div class="a" style="left:0;right:0;top:800px;height:8px;background:#fff;opacity:.9"></div><div class="a" style="left:0;right:0;top:900px;height:8px;background:#fff;opacity:.9"></div>`;
const playground = (sky = 'linear-gradient(#bfe6ff,#e9f7ff)') => `<div class="sky" style="background:${sky}"></div>
  <div class="cloud" style="left:200px;top:120px"></div><div class="cloud" style="left:1300px;top:80px;transform:scale(.8)"></div>
  ${trees([[90, 300, 240], [1250, 260, 200]])}${fence}${goal}${dirt}`;
const room = `<div class="sky" style="background:#fff1c7"></div>
  <div class="a" style="left:230px;top:150px;width:440px;height:320px;border:14px solid #fff;outline:5px solid #2e2a3a;background:
    repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 18px,transparent 18px 70px),linear-gradient(#bfe6ff,#e6f6ff)"></div>
  <div class="a" style="left:443px;top:150px;width:14px;height:320px;background:#fff;outline:3px solid #2e2a3a"></div>
  <div class="a" style="left:130px;top:470px;width:740px;height:330px;background:repeating-linear-gradient(135deg,rgba(255,250,200,.55) 0 30px,transparent 30px 90px);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);opacity:.7"></div>
  <div class="ground" style="top:820px;background:repeating-linear-gradient(90deg,#e6c193 0 236px,#d9b07d 236px 242px);border-top:5px solid #2e2a3a"></div>
  <div class="a" style="left:1260px;top:590px;width:560px;height:230px;border-radius:40px;background:#fff;border:6px solid #2e2a3a"></div>
  <div class="a" style="left:1290px;top:560px;width:150px;height:70px;border-radius:30px;background:#fffdf5;border:6px solid #2e2a3a"></div>
  <div class="a" style="left:1420px;top:610px;width:410px;height:170px;border-radius:40px 40px 34px 34px;background:#9be3cf;border:6px solid #2e2a3a"></div>
  <div class="a" style="left:1270px;top:800px;width:24px;height:40px;background:#9b6b43;border:5px solid #2e2a3a"></div><div class="a" style="left:1780px;top:800px;width:24px;height:40px;background:#9b6b43;border:5px solid #2e2a3a"></div>`;
const street = `<div class="sky" style="background:linear-gradient(#a9dcff,#e3f4ff)"></div>
  <div class="cloud" style="left:420px;top:110px"></div><div class="cloud" style="left:1480px;top:150px;transform:scale(.7)"></div>
  <div class="a" style="left:1580px;top:140px;width:30px;height:640px;background:#8f8f99;border:5px solid #2e2a3a"></div>
  <div class="a" style="left:1520px;top:190px;width:150px;height:18px;background:#8f8f99;border:5px solid #2e2a3a"></div>
  <div class="a" style="left:-20px;top:236px;width:1960px;height:140px;border-top:3px solid #2e2a3a;border-radius:50%;clip-path:inset(0 0 60% 0)"></div>
  ${trees([[1200, 330, 230]])}
  <div class="a" style="left:0;right:0;top:600px;height:170px;background:repeating-linear-gradient(0deg,#f0b48f 0 40px,#2e2a3a 40px 44px),#f0b48f;opacity:.9;
    -webkit-mask:repeating-linear-gradient(90deg,#000 0 96px,rgba(0,0,0,.92) 96px 100px)"></div>
  <div class="a" style="left:0;right:0;top:588px;height:20px;background:#d9d2c6;border:4px solid #2e2a3a"></div>
  <div class="ground" style="top:770px;background:repeating-linear-gradient(90deg,#cfd3da 0 160px,#b7bcc6 160px 165px);border-top:5px solid #2e2a3a"></div>`;

// ── 새 부품: 여러 지점을 지나는 움직임 한 줄 ──
// steps = [[t, {x, y, r, sx, sy, o}, ease], …] — ease는 그 지점에서 다음 지점까지. 처음 지점 전·마지막 지점 뒤는 그 모양 그대로
const tf = p => `translate(${p.x || 0}px,${p.y || 0}px) rotate(${p.r || 0}deg) scale(${p.sx ?? 1},${p.sy ?? 1})`;
// 키프레임 자리(%)는 소수 여섯째 자리까지 (2026-11-25): 셋째 자리로 반올림하면 7분 영상에서 0.001% = 4ms라, 컷의 두 점(t · t+0.001초)이
//   같은 %가 되어 뒤 점만 남고 컷이 앞 지점부터의 느린 줌이 됐다 (EP01). 여섯째 자리면 20분 영상에서도 12㎲ 단위다.
const pct = (t, t0, dur) => +((t - t0) / dur * 100).toFixed(6);
function track(steps, origin, inner, cls = '') {
  const t0 = steps[0][0], dur = steps.at(-1)[0] - t0, name = 'k' + KF.length;
  KF.push(`@keyframes ${name}{${steps.map(([t, p, e]) => `${pct(t, t0, dur)}%{transform:${tf(p)}${p.o != null ? `;opacity:${p.o}` : ''}${e ? `;animation-timing-function:${e}` : ''}}`).join('')}}`);
  return `<div class="tk ${cls}" style="animation:${name} ${r3(dur)}s linear ${T(t0)}s both;transform-origin:${origin[0]}px ${origin[1]}px">${inner}</div>`;
}

// ── 카메라 ──
// 샷 크기 (컨텐츠팀 60초 대본의 표, 2026-11-23): 중간 = 머리 꼭대기~허리가 화면 높이의 2/3 (발은 화면 밖) · 가까이 = 얼굴이 3/4
// 말랑이는 가까이에서도 머리 위 한 가닥이 화면 안에 든다 (BODY의 머리 꼭대기가 한 가닥 끝이다)
const SHOT = { medium: 0.74, close: 0.75, headroom: 0.13 }; // 중간은 2/3로 잡으면 머리 큰 셋은 발까지 보여서 0.74 (발이 화면 밖)
// BODY = 그림 속 머리 꼭대기 · 턱 · 허리 (viewBox y) — cast.js에 있다
const clampShot = ({ x, y, z }) => ({ x: Math.min(Math.max(x, 960 / z), 1920 - 960 / z), y: Math.min(Math.max(y, 540 / z), 1080 - 540 / z), z });
// 그림 속 점(viewBox) → 세상 점. 배우 a = box(x, size, up, who)
const wpt = (a, vx, vy) => { const u = a.size / 290; return [a.x + vx * u, G + (a.up || 0) - 274 * u + (vy + 12) * u]; };
function shot(kind, a, dx = 0, dy = 0) {
  if (kind === 'wide') return { x: 960, y: 540, z: 1 };
  const u = a.size / 290, [top, chin, waist] = BODY[a.who || 'white'], [x, yTop] = wpt(a, 100, top), yChin = wpt(a, 100, chin)[1];
  const z = kind === 'medium' ? 1080 * SHOT.medium / ((waist - top) * u) : 1080 * SHOT.close / ((chin - top) * u);
  const y = kind === 'medium' ? yTop + 1080 * (0.5 - SHOT.headroom) / z : (yTop + yChin) / 2;
  return clampShot({ x: x + dx, y: y + dy, z }); // 세상 밖(1920×1080 바깥)이 보이지 않게 가운데를 안쪽으로 당긴다
}
// shots = [[t, 샷, 방식, ease]] — 방식 'cut' · 'punch' · 숫자(초 동안 옮김, ease 기본은 부드럽게)
// 장면을 쌓으며 cut(t, 샷, 방식)으로 적어 두면 onScreen()이 그 컷을 보고 말풍선 자리를 잡는다. 끝에 camera(CAM, 세상)
let CAM = [];
const cut = (t, s, how = 'cut', ease) => CAM.push([t, s, how, ease]);
function camera(shots, inner) {
  CAM = shots;
  const at = s => ({ x: 960 - s.x * s.z, y: 540 - s.y * s.z, sx: s.z, sy: s.z }), steps = [];
  shots.forEach(([t, s, how, ease], i) => {
    if (!i) return steps.push([t, at(s)]);
    // 컷: t−0.001초까지 앞 샷, t초부터 새 샷 — 장면(seg)이 바뀌는 그 프레임에 카메라도 바뀐다 (2026-11-25, 롱폼팀 제안).
    //   그 전에는 t+0.001초에 바뀌어서, 컷 시각이 프레임에 딱 맞으면(0.1초 단위 컷은 다 맞는다) 한 프레임 동안 새 장면을 앞 샷 구도로 보였다.
    //   새 샷 키프레임은 t보다 0.1ms 앞에 둔다: 키프레임 자리(%)가 반올림으로 ㎲만큼 뒤로 밀리면 t 프레임이 0.1%쯤 앞 샷 쪽에 남았다
    //   (EP01 65컷 중 8컷, 많게는 7px). 0.1ms는 한 프레임(33ms)보다 훨씬 짧아 앞 프레임에는 걸리지 않는다.
    //   step-end로 t에 바로 바꾸는 것도 해 봤는데, ㎲ 어긋남에 그 프레임 전체가 앞 샷이 됐다 (EP01 15.2·301.1초).
    //   앞 움직임이 t 바로 앞에 끝나 자리가 없을 때만 예전처럼 t+0.001초.
    if (how === 'cut' && steps.at(-1)[0] < t - 0.0001) { steps.push([Math.max(steps.at(-1)[0], t - 0.001), steps.at(-1)[1], 'linear'], [t - 0.0001, at(s)]); return; }
    const fast = FAST[how]; // 'crash' 크래시 줌 · 'whip' 휩 팬 (2026-11-26) — crashZoom() · whipPan()이 쓴다
    const d = how === 'cut' ? 0.001 : how === 'punch' ? 0.2 : fast ? fast[0] : how, e = how === 'punch' ? PUNCH : how === 'cut' ? 'linear' : fast ? fast[1] : ease || EASE;
    steps.push([t, steps.at(-1)[1], e], [t + d, at(s)]);
    if (how === 'punch') sfx(t, 'swoosh', 0.3);
    if (fast) { sfx(t, 'whoosh', fast[2]); BLUR.push([t, d, how]); }
  });
  const cam = track(steps, [0, 0], inner, 'cam');
  return BLUR.length ? `<div class="a" style="inset:0;${blurAnim()}">${cam}</div>` : cam; // 흐림은 크래시 줌 · 휩 팬이 있을 때만
}
// 크래시 줌 · 휩 팬: [걸리는 초, ease, 휙 크기]. 움직이는 동안 세상이 흐려진다 — 크래시 줌은 고르게, 휩 팬은 가로로만 (SVG 필터 kx-mb1~4)
const FAST = { crash: [0.25, 'cubic-bezier(.8,0,.2,1)', 0.45], whip: [0.3, 'cubic-bezier(.65,0,.35,1)', 0.5] }, BLUR = [];
function blurAnim() {
  const pts = [];
  for (const [t, d, how] of BLUR) {
    if (how === 'crash') pts.push([t, 'none'], [t + d * 0.45, 'blur(6px)'], [t + d, 'none']);
    else [0, 1, 3, 4, 4, 3, 1, 0].forEach((lv, i) => pts.push([t + d * i / 7, lv ? `url(#kx-mb${lv})` : 'none']));
  }
  const t0 = pts[0][0], len = pts.at(-1)[0] - t0, name = 'kxb' + KF.length;
  KF.push(`@keyframes ${name}{${pts.map(([t, f]) => `${pct(t, t0, len)}%{filter:${f}}`).join('')}}`);
  return `animation:${name} ${r3(len)}s linear ${T(t0)}s both`;
}
// 세상 점이 t초에 화면 어디에 보이나 (그때 카메라가 옮기는 중이면 옮긴 뒤 자리) — 말풍선·이름표를 화면에 둘 때
function onScreen(t, [x, y]) {
  const s = [...CAM].reverse().find(c => c[0] <= t + 1e-6)?.[1] || { x: 960, y: 540, z: 1 };
  return [960 + (x - s.x) * s.z, 540 + (y - s.y) * s.z];
}

// ── 배우 ──
const box = (x, size, up = 0, who = 'white') => ({ x, size, up, who });
const foot = a => [a.x + 100 * a.size / 290, G + (a.up || 0)];
const headTop = (a, side = 0) => wpt(a, 100 + side * 60, BODY[a.who || 'white'][0] + 18); // 머리 위 (side -1 왼쪽 · 1 오른쪽)
// 손 자리 (세상 점): 팔 끝 — 공을 쥐거나 던질 때
function handOf(a, pose = 'stand', i = 1) {
  const g = CAST[a.who], p = (pose === 'ref' ? REF_POSE[a.who] : CAST_POSES[pose]), ang = p.arm[i] * Math.PI / 180, L = g.arm[0] + 3;
  let [x, y] = [g.sh[i][0] - L * Math.sin(ang), g.sh[i][1] + L * Math.cos(ang)];
  const tl = p.tilt * Math.PI / 180; [x, y] = [100 + (x - 100) * Math.cos(tl) - (y - 262) * Math.sin(tl), 262 + (x - 100) * Math.sin(tl) + (y - 262) * Math.cos(tl)];
  return wpt(a, x, y);
}
function actor(who, x, size, pose, face, o = {}) {
  const u = size / 290, still = !/walking|running/.test(o.cls || '');
  return `<div class="actor${still ? ' breathe' : ''} ${o.cls || ''}" style="left:${x}px;top:${G + (o.up || 0) - 274 * u}px;--bd:${-r3((x * 7 % 13) / 13 * 1.5)}s">${castSVG({ who, size, pose, face, look: o.look || 0, pop: o.pop != null ? T(o.pop) : null, tilt: o.tilt, cup: o.cup, dir: o.dir, hold: o.hold })}</div>`;
}
const act = (a, pose, face, o = {}) => actor(a.who, a.x, a.size, pose, face, { up: a.up, ...o });
// 표정이 바뀌는 한 자리. 놀람·씩으로 바뀌는 순간 머리가 톡 (맨 처음 표정은 그대로 나온다)
const faces = (who, x, size, pose, list, o = {}) => list.map(([a, b, f], i) =>
  seg(a, b, actor(who, x, size, pose, f, { ...o, pop: i && /surprise|smirk/.test(f) ? a : null }))).join('');
const facesOf = (a, pose, list, o = {}) => faces(a.who, a.x, a.size, pose, list, { up: a.up, ...o });

// ── 말풍선 (화면 위에 둔다 — 카메라가 당겨도 글자 크기는 그대로) ──
// 누가 말하나: 말랑이·콩이 흰 풍선 + 캐릭터 색 테두리 · 삐코 까만 네모 + 흰 글자 (컨텐츠팀 제안, 2026-11-23). 테두리 색 BC는 cast.js에 있다
// 꼬리 끝이 화면 점 [px, py]에 오게 — side 'R'이면 풍선이 그 점의 오른쪽 위, 'L'이면 왼쪽 위. still = 앞 컷에서 이어져 다시 튀지 않음
function say(who, a, b, text, [px, py], side = 'R', still) {
  if (!still) sfx(a, 'pop', 0.3);
  const cls = who === 'robot' ? 'pico' : 'who', top = py - 112;
  return seg(a, b, `<div class="bubble ${cls} ${side}${still ? ' still' : ''}" style="--bc:${BC[who]};${side === 'L' ? `right:${r3(1920 - px - 70)}px` : `left:${r3(px - 70)}px`};top:${r3(top)}px">${text}</div>`);
}
// 이름표: 처음 나올 때 한 번, 캐릭터 색 (NAMEC — cast.js)
const nameTag = (who, a, b, text, [x, y]) => seg(a, b, `<div class="name" style="--at:${T(a)}s;left:${r3(x)}px;top:${r3(y)}px;background:${NAMEC[who]}">${text}</div>`);
// 화면 위 큰 글자를 원하는 자리에 (big()은 위 가운데)
const bigAt = (a, b, html, x, y, w, size = 96) => { sfx(a, 'tick', 0.3); return seg(a, b, `<div class="big" style="left:${x}px;right:auto;width:${w}px;top:${y}px;font-size:${size}px">${html}</div>`); };
// 삐코 설명 자리 (컨텐츠팀 제안): 화면 오른쪽 아래에서 쏙 올라와 허리 위만 보인다. 카메라 밖이라 샷이 바뀌어도 같은 자리.
// list = [[시작, 끝, 표정]] · 말풍선 꼬리는 PICO_TAIL에 — say('robot', a, b, 글, PICO_TAIL, 'L')
const PICO = box(1590, 440, 312, 'robot'), PICO_TAIL = [1650, 800];
function explainer(a, b, pose, list) {
  sfx(a, 'pop', 0.35);
  return seg(a, b, mv(a, 0.35, { y: 420 }, { y: 0 }, PUNCH, alive([['talk', a + 0.35]], foot(PICO), facesOf(PICO, pose, list))));
}

// ── 몸: 스쿼시·스트레치 · 말할 때 통통 ──
function alive(beats, ft, inner) {
  const st = [];
  for (const [k, t, A] of [...beats].sort((p, q) => p[1] - q[1])) {
    if (k === 'jump') st.push([t - 0.14, {}, OUT], [t, { sx: 1.14, sy: 0.84 }, OUT], [t + 0.1, { sx: 0.88, sy: 1.16 }, EASE], [t + A / 2, {}, IN],
      [t + A - 0.08, { sx: 0.92, sy: 1.1 }, 'linear'], [t + A, { sx: 1.24, sy: 0.78 }, OUT], [t + A + 0.13, { sx: 0.95, sy: 1.06 }, EASE], [t + A + 0.28, {}]);
    else if (k === 'land') st.push([t - 0.1, {}, 'linear'], [t - 0.02, { sx: 0.92, sy: 1.1 }, 'linear'], [t, { sx: 1.24, sy: 0.78 }, OUT], [t + 0.13, { sx: 0.95, sy: 1.06 }, EASE], [t + 0.28, {}]);
    else st.push([t, {}, OUT], [t + 0.1, { sx: 0.95, sy: 1.07, y: -16 }, IN], [t + 0.2, { sx: 1.05, sy: 0.95 }, OUT], [t + 0.29, { sx: 0.98, sy: 1.03, y: -7 }, IN], [t + 0.38, {}]);
  }
  return track(st, ft, inner);
}
// b를 주면 그때 사라진다 (안 주면 끝까지 남는다)
const spark = (t, x, y, size = 90, flip, b) => { if (t >= FROM) sfx(t, 'pop', 0.25); const h = `<div class="spk" style="--at:${T(t)}s;left:${x}px;top:${y}px">${sparkSVG({ size, flip })}</div>`; return b ? seg(t, b, h) : h; };

// ── 아웃트로 (2026-11-23 · 사람: "훅 ㅡ인트로 ㅡ 본문 ㅡ 아웃트로 구조 좋네" — 인트로는 2026-11-25 안 쓰기로 해서 뺐다) ──
// 쓰는 법: motion.html의 <body>에 속성만 더한다. kitDone()이 넣는다.
//   data-outro="60"   본편이 끝나는 시각. 거기서 12초 아웃트로 (하늘·구름, 셋이 손 흔들고 통통). 왼쪽 위 글 자리 · 구독 동그라미 · 오른쪽 다음 영상 둘은 비운다.
//   data-duration     = 본편 끝 + 12 (예: 60 → 72)
//   data-outro-text   아웃트로 글 (없으면 자리만 비움 — 사람이 정한다)
//   data-endscreen="guide"  유튜브 최종 화면 자리를 점선으로 그린다 (미리보기용 — 올릴 영상엔 빼요)
// 녹화 뒤 한 번: node tools/longform/finish.mjs <motion.html> → 끝 5초에 배경음악을 줄여 motion-bgm.mp4를 다시 만든다.
const cloudsHTML = list => list.map(([x, y, s]) => `<div class="cl" style="left:${x}px;top:${y}px;--s:${s}"><i></i><i></i><i></i><i></i></div>`).join('');
function outroHTML() {
  const b = OUTRO_AT, F = 960, up = F - G, guide = document.body.dataset.endscreen === 'guide', text = document.body.dataset.outroText || '';
  // 셋은 왼쪽 아래 (발 960) — 오른쪽 다음 영상 둘 · 왼쪽 위 글 · 구독 동그라미 자리를 피한다
  const people = [['orange', 80, 390, 0.15], ['white', 360, 480, 0.3], ['robot', 715, 410, 0.45]].map(([who, x, size, d], i) => {
    const A = box(x, size, up, who), [fx] = foot(A), air = airtime(60, GN), hops = [2.2, 4.0, 5.8, 7.6, 9.4].map(h => b + h + i * 0.3);
    let body = alive([['land', b + d + 0.53], ...hops.map(h => ['jump', h, air])], [fx, F], act(A, 'stand', 'laugh', { cls: 'waving' }));
    for (const h of hops) { body = jump(h, 60, GN, body); sfx(h + air, 'tick', 0.1); }
    sfx(b + d + 0.53, 'thud', 0.25);
    const w = size * 0.42;
    return `<div class="shadow" style="left:${fx - w / 2}px;top:${F - 11}px;width:${w}px"></div><div style="--wd:-${i * 0.14}s">${mv(b + d, 0.53, { y: 720 }, { y: 0 }, OUT, body)}</div>`;
  }).join('');
  const es = (x, y, w, h, label, round) => `<div class="es" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px${round ? ';border-radius:50%' : ';border-radius:18px'}">${label}</div>`;
  const guides = guide ? es(90, 90, 920, 110, '아웃트로 글 자리 (사람이 정해요)') + es(415, 220, 230, 230, '구독<br>버튼', true)
    + es(1110, 105, 720, 405, '다음 영상 1 (16:9)') + es(1110, 570, 720, 405, '다음 영상 2 (16:9)') : '';
  const words = text ? `<div class="ititle" style="--at:${T(b + 0.9)}s;left:90px;right:auto;width:920px;top:100px;font-size:76px;text-align:left">${text}</div>` : '';
  sfx(b + 0.9, 'ding', 0.3);
  return seg(b, b + OUTRO_LEN, `<div class="ioc"><div class="drift" style="--at:${T(b)}s;--len:${OUTRO_LEN}s">${cloudsHTML([[40, 250, 0.75], [760, 300, 0.7], [1500, 990, 0.8], [980, 10, 0.6]])}</div>
    ${words}${people}${guides}</div>`);
}

// ── 채널 로고 (2026-11-25 · 사람: "가로가 좋고 70%가 좋은거 같애.. 사이즈만 살짝 더 줄여볼까?") ──
// 오른쪽 위에 처음부터 아웃트로 전까지(아웃트로가 없으면 끝까지) 내내 얹는다. 맨 위 층이라 장면·타이포가 그 자리에 오면 가린다 — 오른쪽 위는 비워 둔다.
// 그림은 cast.js의 LOGO (_cast/logo/ — 사람이 만든 그림이라 저장소 밖). cast.js가 없거나 LOGO가 없으면 넣지 않는다.
// 크기는 로고의 보이는 높이(px, 투명 여백 뺀 것): <body data-logo="70">처럼 바꾸고, 빼려면 data-logo="off". 기본 LOGO_H.
// 투명도 70% · 여백은 왼쪽 위 「상상」 딱지와 같게 오른쪽 34px · 위 30px.
const LOGO_H = 80, LOGO_ALPHA = 0.7;
function logoHTML() {
  const v = document.body.dataset.logo;
  if (v === 'off' || typeof LOGO === 'undefined') return '';
  const h = +v || LOGO_H, [x0, x1, y0, y1] = LOGO.box, k = h / (y1 - y0 + 1), end = OUTRO_AT ?? +document.body.dataset.duration;
  return seg(0, end, `<img class="logo" src="${LOGO.src}" alt="" style="left:${r3(1920 - 34 - (x1 + 1) * k)}px;top:${r3(30 - y0 * k)}px;width:${r3(LOGO.w * k)}px;height:${r3(LOGO.h * k)}px;opacity:${LOGO_ALPHA}">`);
}

// ── 카메라 · 빛 · 편집 기법 (2026-11-26, 스터디 S76 · 사람: "쫌 다듬어보자... 첫편인데 멋지게 만들어봐얒.") ──
// 기법 이름과 쓰임만 참고했다 (코드깎는노인 「영상 기법 효과 프롬프트 50개」 — 장면은 베끼지 않음). 그림체는 그대로 두고 카메라 · 빛 · 편집 박자 · 깊이만 더한다.
// 한 줄 쓰는 법은 맨 위. 모양은 kit.css 「카메라 · 빛 · 편집 기법」. 이 절의 부품을 안 쓰는 페이지는 예전과 똑같이 나온다.

// 보였다 사라지기 (빛 · 색 효과): 섞기(mix-blend)를 쓰는 효과는 seg로 감싸면 안 된다 — seg의 투명도 움직임이 따로 묶어 아래 그림과 안 섞인다
const fxEnv = (a, b, fi = 0.5, fo = fi, max = 1) => {
  const len = b - a, i = Math.min(Math.max(fi, 0.001), len / 2), o = Math.min(Math.max(fo, 0.001), len / 2), name = 'kxe' + KF.length;
  KF.push(`@keyframes ${name}{0%{opacity:0}${pct(a + i, a, len)}%,${pct(b - o, a, len)}%{opacity:${max}}100%{opacity:0}}`);
  return `animation:${name} ${r3(len)}s linear ${T(a)}s both`;
};

// 깊이 (패럴랙스): 배경을 층으로 나눠, 시점이 움직일 때 층마다 다른 빠르기로 움직인다 — 크레인 · 달리 줌 · 아크가 쓴다.
//   층 = [[깊이 k, html], …] — 1 = 주인공 층 (배우 · 무대 · 바닥. 보통 카메라와 똑같이 움직인다) · 0.1~0.6 = 뒤 (하늘 · 먼 나무 · 울타리 — 덜 움직인다)
//     · 1.2~1.5 = 앞 (관객 머리 · 나뭇잎 — 더 움직인다) · 0 = 꼼짝 않는 먼 하늘. 층끼리 걸친 것(실 · 그림자)은 한 층에 같이 둔다.
//     playground() 대신 조각을 층마다 나눠 넣는다 — 뒤: 하늘 · cloud · trees · fence / 주인공: dirt · 무대 · 배우. 하늘은 크레인 높이만큼 위로 넉넉히 그린다.
//   시점 {x, y, z} = camera 샷과 같은 뜻 (주인공 층 기준, 기본 960 · 540 · 1) · v = 달리 줌 배율 (뒤 층만 커지고 앞 층은 작아진다, 주인공 층은 그대로)
//     · f = [x, y] 달리 줌이 커지는 가운데 (세상 점, 기본 가운데) · o = 아크 양 (주인공 층은 그대로, 뒤 층과 앞 층이 서로 반대로 미끄러진다, px)
//   층은 세상(W)에 넣는다. 시점이 카메라 노릇을 하니 크레인 · 아크 동안 카메라는 WIDE로 둔다 (달리 줌은 어느 샷이든 된다).
//   모든 배경을 나눌 필요는 없다 — 크레인 · 달리 줌 · 아크를 쓰는 컷만.
const layerAt = ({ x = 960, y = 540, z = 1, v = 1, o = 0, f = [960, 540] }, k) => {
  const z1 = Math.max(0.05, 1 + k * (z - 1)), s = v ** (1 - k), cx = 960 + k * (x - 960) + (1 - k) * o, cy = 540 + k * (y - 540), zk = +(s * z1).toFixed(5);
  return { x: r3(f[0] * (1 - s) + s * (960 - cx * z1)), y: r3(f[1] * (1 - s) + s * (540 - cy * z1)), sx: zk, sy: zk };
};
// parallax([[t, 시점, ease], …], 층) — 시점을 둘 넘게 이어 옮길 때 (ease는 그 시점에서 다음 시점까지, 기본 부드럽게)
const parallax = (views, layers) => layers.map(([k, html]) => track(views.map(([t, s, e], i) => [t, layerAt(s, k), i < views.length - 1 ? e || EASE : undefined]), [0, 0], html)).join('');
// 크레인: crane(a, b, 층, 처음 시점, 끝 시점, ease) — 위에서 내려오며 열기 (하늘 { y: -650 } → 현수막 { y: 420, z: 1.3 }) · 아래에서 솟기 (관객 { y: 880, z: 1.6 } → 무대 전체 {})
const crane = (a, b, layers, from, to, ease = EASE) => parallax([[a, from, ease], [b, to]], layers);
// 달리 줌: dollyZoom(a, b, 층, 배율, { at: [x, y] 세상 점, view: 시점, ease }) — 주인공 층 크기는 그대로, 뒤 층만 배율까지 쑥 다가온다 (깜짝 · 깨달음).
//   at은 보통 주인공 얼굴. 카메라가 그 사람을 잡고 있어도 된다 (WIDE가 아니어도). 효과음은 따로 (쿵 · whoosh)
const dollyZoom = (a, b, layers, amount = 1.6, o = {}) => parallax([[a, { ...o.view, f: o.at, v: 1 }, o.ease || 'cubic-bezier(.5,0,.3,1)'], [b, { ...o.view, f: o.at, v: amount }]], layers);
// 아크: arcShot(a, b, 층, 양, { view, ease }) — 주인공을 가운데 두고 옆으로 도는 느낌. 양 +면 왼쪽에서 오른쪽으로 (뒤 층이 오른쪽→왼쪽으로 미끄러진다)
const arcShot = (a, b, layers, amount = 260, o = {}) => parallax([[a, { ...o.view, o: -amount }, o.ease || EASE], [b, { ...o.view, o: amount }]], layers);

// 크래시 줌: S.push(crashZoom(t, shot('close', 배우))) — 0.25초에 확 당긴다 (빨라졌다가 딱 멈춤). 그동안 세상이 흐리고 휙 소리, 화면에 집중선이 0.38초 번쩍.
//   cut(t, 샷) 대신 쓴다 (그 자리에 카메라 컷을 넣는다). { lines: false }면 집중선 없이
function crashZoom(t, s, o = {}) {
  cut(t, s, 'crash');
  return o.lines === false ? '' : `<div class="kx-lines" style="animation:kx-lines .38s ease-out ${T(t)}s both"></div>`;
}
// 휩 팬: S.push(whipPan(t, 다음 샷)) — 0.3초에 옆으로 휙 (가로로 흐림 · 바람 줄 · 휙 소리). 같은 세상 안 두 사람 사이를 넘길 때 좋다.
//   다른 장면으로 넘기려면 장면(seg)을 t + 0.15(가장 흐릴 때)에 바꾼다. cut(t, 샷) 대신 쓴다
function whipPan(t, s) {
  cut(t, s, 'whip');
  return `<div class="kx-streak" style="animation:kx-streak .32s linear ${T(t)}s both"></div>`;
}

// 슬로 모션 · 프리즈 프레임: 장면 하나를 통째로 받아 그 안의 시간을 늦추거나 멈춘다 (배우 · 숨 · 북채 · 장면 안 seg까지 모든 움직임).
//   W.push(slowMotion(230.6, 238.9, [233.0, 234.8, 0.25], () => 장면 html)) — 233.0~234.8초 동안 0.25배로, 그 뒤는 늦어진 만큼 이어서
//   W.push(freezeFrame(69.9, 76.4, [72.6, 74.2], () => 장면 html)) — 72.6초 모습으로 1.6초 멈췄다가 이어서
//   장면은 함수로 준다 — 그 안에서 낸 효과음(sfx · typo.sound 등)도 같은 시간표로 옮겨진다. 장면 끝(컷)은 그대로, 안의 움직임만 그만큼 밀린다.
//   카메라와 S 쪽(말풍선 · 타이포)은 그대로 흐른다 — S도 늦추려면 같은 꼴로 감싼다: S.push(slowMotion(…, () => typo.sound(…)))
//   (kitDone이 감싼 사본 안 애니메이션의 시작 · 길이를 τ = 시작 + 빠르기 × (t − 시작)에 맞게 고친다)
const WARP = [];
const retime = (a, b, at, rate, html) => seg(a, b, `<div class="a kx-warp" style="inset:0" data-w="${WARP.push([a, at, rate]) - 1}">${html}</div>`);
function slowMotion(a, b, [s0, s1, rate], build) {
  const n0 = SFX.length, html = typeof build === 'function' ? build() : build, slowEnd = s0 + rate * (s1 - s0), lag = s1 - slowEnd;
  for (let i = n0; i < SFX.length; i++) { // 장면 안 효과음: 늦춘 구간은 늘이고, 그 뒤는 밀린 만큼 미룬다
    const [t, ...rest] = SFX[i].split(' '), u = +t + FROM, v = u < s0 ? u : u < slowEnd ? s0 + (u - s0) / rate : u + lag;
    SFX[i] = [+(v - FROM).toFixed(2), ...rest].join(' ');
  }
  return seg(a, s0, html) + retime(s0, s1, s0, rate, html) + retime(s1, b, slowEnd, 1, html);
}
const freezeFrame = (a, b, [s0, s1], build) => slowMotion(a, b, [s0, s1, 1e-4], build);
// 프리즈 프레임 이름표: S.push(freezeTag(a, b, '콩이', '귀가 가려운 줄 앎', { who, x, y, r })) — 멈춘 순간 하얗게 번쩍 · 찰칵, 기울어진 이름표가 탁 붙는다 (웃음 박자)
//   who 'orange'처럼 주면 이름표 띠가 그 캐릭터 색 (기본 노랑) · x · y 이름표 왼쪽 위 (기본 110 · 610) · r 기울기 (기본 -6도)
function freezeTag(a, b, name, line = '', o = {}) {
  sfx(a, 'click', 0.5); sfx(a + 0.1, 'thud', 0.35);
  return seg(a, b, `<div class="a" style="inset:0;background:#fff;animation:kx-flash .22s ease-out ${T(a)}s both"></div>
    <div class="kx-ftag" style="left:${o.x ?? 110}px;top:${o.y ?? 610}px;--r:${o.r ?? -6}deg;--c:${o.who ? NAMEC[o.who] : '#ffd23f'};animation:kx-ftag .3s cubic-bezier(.2,1.4,.4,1) ${T(a + 0.06)}s both"><b>${name}</b>${line ? `<span>${line}</span>` : ''}</div>`);
}

// 타임랩스: W.push(seg(a, b, room + timelapse(a, b))) — 창밖에 해가 비스듬히 떠오르고 구름이 휙휙 흘러가며, 바닥 햇빛 자국이 기울며 미끄러진다 (몇 시간이 몇 초에).
//   시계가 건너뛰는 것은 progressTag의 그 칸 넷째 값(바늘이 도는 초)으로: [a, b, '오전 9:40', b - a]. 째깍 소리가 빠르게 난다 ({ ticks: false }면 없음)
//   o.win [x, y, w, h] 창 안쪽 (기본 kit room 창 ROOM_WIN) · o.light [x, y, w, h] 바닥 햇빛 자리 (기본 room 햇빛 ROOM_LIGHT, false면 없음)
//   o.sky [처음, 끝] 창밖 하늘 색 (기본 새벽 살구 → 한낮 파랑). 방 위에 얹으니 장면 html 안에서 방 뒤에 넣는다
const ROOM_WIN = [244, 164, 412, 292], ROOM_LIGHT = [130, 470, 740, 330];
function timelapse(a, b, o = {}) {
  const [x, y, w, h] = o.win || ROOM_WIN, len = r3(b - a), [c0, c1] = o.sky || ['#ffc79a', '#9fd3f7'];
  if (o.ticks !== false) for (let t = a + 0.05; t < b - 0.05; t += 0.18) sfx(t, 'tick', 0.12);
  // 해: 창 왼쪽 아래 밖에서 떠올라 오른쪽 위 안쪽까지 (끝까지 창 안에 보인다)
  const sun = track(Array.from({ length: 9 }, (_, i) => { const u = i / 8; return [a + len * u, { x: r3(w * (-0.06 + 0.92 * u)), y: r3(h * (1.08 - 0.86 * Math.sin(u * Math.PI / 2))) }, 'linear']; }), [0, 0], '<i class="kx-sun"></i>');
  const clouds = [[0.1, 0.8, 0, 1], [0.34, 1.1, 0.45, 0.8], [0.62, 0.95, 0.7, 0.65]].map(([fy, per, off, sc]) => `<i class="kx-cloud" style="top:${r3(h * fy)}px;--x0:${w + 30}px;--x1:-200px;--s:${sc};animation-duration:${per}s;animation-delay:${r3(T(a) - off * per)}s"></i>`).join('');
  const [lx, ly, lw, lh] = o.light || ROOM_LIGHT;
  const light = o.light === false ? '' : `<div class="kx-sunlight" style="left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px;animation-duration:${len}s;animation-delay:${T(a)}s"></div>`;
  // 하늘: 아래 새벽빛 → 가운데 밝은 노랑 → 위 한낮 파랑으로 칠한 긴 판을 아래로 내린다 (두 색을 겹쳐 바꾸면 가운데가 잿빛이 된다)
  return `<div class="a" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${c1}">
    <div class="a" style="left:0;top:0;width:100%;height:${h * 3}px;background:linear-gradient(0deg,${c0} 0 22%,#ffe9b4 48%,${c1} 78%);--y0:${-h * 2}px;animation:kx-skypan ${len}s cubic-bezier(.3,0,.6,1) ${T(a)}s both"></div>${sun}${clouds}</div>${light}`;
}

// 시간대 색: W.push(grade(a, b, '노을', { fade })) — 세상(W) 맨 위에 그 시간 빛을 입힌다 (자막 · 타이포 · 딱지 · 로고는 그대로). W 맨 끝에 넣고 seg로 감싸지 않는다.
//   '아침' 살구빛 · '한낮' 맑게 · '노을' 주황 분홍 + 위쪽 빛 번짐 · '밤' 남색으로 어둡게 + 가장자리 어둡게.
//   o.fade 들고 나는 초 (기본 .8) — 앞뒤 grade를 fade만큼 겹쳐 두면 아침 → 노을 → 밤으로 바뀌는 것처럼 보인다
const GRADES = {
  // 후보를 같은 무대에 얹어 골랐다 (contents/_test/longform-camera/grades.png, 2026-11-26) — 노을은 곱하기만 하면 파란 하늘이 잿빛 분홍이 돼서 color 섞기
  아침: [['soft-light', 'linear-gradient(#ffc27a,#fff0d6)', 1], ['multiply', '#fff1dc', 0.6], ['screen', 'radial-gradient(circle at 14% 4%,rgba(255,226,170,.7),transparent 55%)', 1]],
  한낮: [['soft-light', 'linear-gradient(#fffbe8,#fff)', 0.5]],
  노을: [['color', 'linear-gradient(#ff7a3a,#ffa860)', 0.45], ['multiply', 'linear-gradient(#ffd2a8,#ffc09a)', 0.75], ['screen', 'radial-gradient(ellipse at 50% 0%,rgba(255,160,80,.45),transparent 62%)', 1]],
  밤: [['multiply', 'linear-gradient(#34448f,#252e66)', 0.78], ['normal', 'radial-gradient(ellipse at 50% 46%,transparent 52%,rgba(6,8,28,.5))', 1]],
};
const grade = (a, b, kind, o = {}) => {
  if (!GRADES[kind]) throw new Error(`grade 「${kind}」는 없어요. 아침 · 한낮 · 노을 · 밤 중에서 골라요.`);
  return GRADES[kind].map(([mode, bg, max]) => `<div class="kx-grade" style="mix-blend-mode:${mode};background:${bg};${fxEnv(a, b, o.fade ?? 0.8, o.fade ?? 0.8, max)}"></div>`).join('');
};

// 빛줄기: W.push(lightRays(a, b, [x, y], { angle, spread, n, len, color })) — 빛이 들어오는 점(세상 점)에서 부채꼴로 퍼지는 빛, 천천히 일렁인다. 카메라를 따라 움직인다.
//   angle 가운데 방향 (도, 0 = 오른쪽 · 90 = 아래, 기본 100) · spread 퍼짐 (기본 50) · n 줄 수 (기본 6) · len 길이 (기본 1500) · color 'r,g,b' (기본 따뜻한 흰빛) · fade (기본 .6)
//   W 맨 끝 쪽에 넣고 seg로 감싸지 않는다 (밑그림과 섞여 밝아진다)
function lightRays(a, b, [x, y], o = {}) {
  const n = o.n ?? 6, sp = o.spread ?? 50, ang = o.angle ?? 100, L = o.len ?? 1500, col = o.color ?? '255,238,196';
  const rays = Array.from({ length: n }, (_, i) => { const d = ang - sp / 2 + sp * (i + 0.5) / n, w = 110 + ((i * 3) % 5) * 45;
    return `<i class="kx-ray" style="width:${L}px;height:${w}px;top:${-w / 2}px;--r:${r3(d)}deg;--sw:${i % 2 ? 2.2 : -2.2}deg;background:linear-gradient(90deg,rgba(${col},.55),rgba(${col},.18) 55%,rgba(${col},0));animation-duration:${3 + (i % 3) * 0.7}s;animation-delay:${r3(T(a) - i * 0.6)}s"></i>`; }).join('');
  return `<div class="kx-fx" style="left:${x}px;top:${y}px;mix-blend-mode:screen;${fxEnv(a, b, o.fade ?? 0.6)}">${rays}</div>`;
}

// 렌즈 플레어: S.push(lensFlare(a, b, [x, y], { to, size })) — 해 · 조명이 렌즈에 비친 빛: 빛 점 + 가로 빛줄 + 화면 가운데를 지나는 빛 동그라미들 (화면 점).
//   to [x, y] 주면 빛 점이 b까지 그 자리로 옮겨 가고 동그라미들도 따라간다 (카메라가 움직일 때) · size 배율 (기본 1) · fade (기본 .5)
function lensFlare(a, b, src, o = {}) {
  const k = o.size ?? 1, to = o.to || src, at = ([sx, sy], f) => [sx + (960 - sx) * f, sy + (540 - sy) * f];
  const items = [[0, 560, 'radial-gradient(circle,rgba(255,252,236,.95),rgba(255,222,160,.4) 22%,transparent 64%)', 'kx-glint'],
    ...[[0.3, 70, '255,200,120', 0.32], [0.62, 160, '120,200,255', 0.16], [1.16, 48, '255,150,200', 0.38], [1.48, 230, '160,255,190', 0.12], [1.9, 96, '255,220,140', 0.26]]
      .map(([f, s, c, al]) => [f, s, `radial-gradient(circle,rgba(${c},${al}) 0 52%,rgba(${c},${r3(al * 1.7)}) 60%,rgba(${c},0) 68%)`, ''])];
  const move = (f, s, inner) => { const [x0, y0] = at(src, f), [x1, y1] = at(to, f), sz = s * k;
    return track([[a, { x: r3(x0 - sz / 2), y: r3(y0 - sz / 2) }, 'linear'], [b, { x: r3(x1 - sz / 2), y: r3(y1 - sz / 2) }]], [0, 0], inner(sz)); };
  const ghosts = items.map(([f, s, bg, cls]) => move(f, s, sz => `<i class="kx-ghost ${cls}" style="width:${r3(sz)}px;height:${r3(sz)}px;background:${bg}"></i>`)).join('');
  const streak = move(0, 0, () => `<i class="kx-flare-h" style="left:${-760 * k}px;width:${1520 * k}px"></i>`);
  return `<div class="kx-fx" style="inset:0;mix-blend-mode:screen;${fxEnv(a, b, o.fade ?? 0.5)}">${ghosts}${streak}</div>`;
}

// 보케 (흐린 불빛): S.push(bokeh(a, b, { area, n, size, colors, seed })) — 초점 밖 동글동글 흐린 빛 (관객 휴대폰 불빛 · 무대 조명). 천천히 떠다니며 반짝인다 (화면 자리).
//   area [x0, y0, x1, y1] (기본 화면 아래쪽) · n 개수 (기본 16) · size [작게, 크게] (기본 50 · 150) · colors ['r,g,b', …] (기본 따뜻한 흰빛 · 노랑 · 분홍) · seed (다른 배치, 기본 7)
function bokeh(a, b, o = {}) {
  let h = (o.seed ?? 7) * 2654435761 >>> 0;
  const rnd = () => (h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296;
  const [x0, y0, x1, y1] = o.area || [0, 620, 1920, 1080], [s0, s1] = o.size || [50, 150], cols = o.colors || ['255,246,214', '255,214,120', '255,176,196', '255,232,170'];
  const dots = Array.from({ length: o.n ?? 16 }, (_, i) => { const s = s0 + (s1 - s0) * rnd(), c = cols[i % cols.length];
    return `<i class="kx-bk" style="left:${r3(x0 + (x1 - x0) * rnd() - s / 2)}px;top:${r3(y0 + (y1 - y0) * rnd() - s / 2)}px;width:${r3(s)}px;height:${r3(s)}px;background:radial-gradient(circle,rgba(${c},.5) 0 48%,rgba(${c},.85) 60%,rgba(${c},0) 70%);--dy:${r3(-20 - 40 * rnd())}px;--o0:${r3(0.35 + 0.3 * rnd())};--o1:${r3(0.75 + 0.25 * rnd())};animation-duration:${r3(2.4 + 2 * rnd())}s;animation-delay:${r3(T(a) - 3 * rnd())}s"></i>`; }).join('');
  return `<div class="kx-fx" style="inset:0;mix-blend-mode:screen;${fxEnv(a, b, o.fade ?? 0.6)}">${dots}</div>`;
}

// 레터박스: S.push(letterbox(a, b, { h, len })) — 위아래 검은 띠가 a부터 len초(기본 .6)에 들어오고, b까지 다 빠진다 (절정 · 무대처럼 영화 같은 순간).
//   h 띠 높이 (기본 132 = 2.35:1). 아래 자막은 띠 위에 그대로 보인다 (띠를 S 쪽에 넣으니 자막 · 딱지 · 로고보다 아래)
function letterbox(a, b, o = {}) {
  const h = o.h ?? 132, d = o.len ?? 0.6;
  sfx(a, 'swoosh', 0.2);
  const bar = top => track([[a, { y: top ? -h : h }, EASE], [a + d, {}, 'linear'], [b - d, {}, EASE], [b, { y: top ? -h : h }]], [0, 0], `<i class="kx-bar" style="${top ? 'top' : 'bottom'}:0;height:${h}px"></i>`);
  return seg(a, b, bar(true) + bar(false));
}

// 아이리스 아웃: S.push(irisOut(a, b, [x, y], { len, hold })) — 화면이 [x, y](화면 점, 보통 얼굴)를 가운데로 동그랗게 닫힌다.
//   작은 동그라미에서 잠깐 멈췄다가(hold 반지름, 기본 170 · 0이면 안 멈춤) 깜깜해지고 b까지 검다. len 닫히는 초 (기본 1.6). 아웃트로 바로 앞에
function irisOut(a, b, [x, y], o = {}) {
  const len = o.len ?? 1.6, hold = o.hold ?? 170, name = 'kxi' + KF.length;
  KF.push(`@keyframes ${name}{0%{--ir:2300px;animation-timing-function:cubic-bezier(.45,0,.25,1)}${hold ? `62%{--ir:${hold}px;animation-timing-function:linear}82%{--ir:${hold}px;animation-timing-function:cubic-bezier(.6,0,.9,.5)}` : ''}100%{--ir:0px}}`);
  sfx(a, 'swoosh', 0.25); if (hold) sfx(a + len * 0.82, 'pop', 0.3);
  return seg(a, b, `<div class="kx-iris" style="--ix:${x}px;--iy:${y}px;animation:${name} ${len}s linear ${T(a)}s both"></div>`);
}

// 스매시 컷: S.push(smashCut(t, { color, sfx })) — 시끄러운 장면에서 조용한 장면으로(또는 거꾸로) 뚝 끊는 컷: 0.12초 번쩍 + 쿵. 장면 바꿈(seg)도 t에.
//   color 번쩍 색 (기본 흰색) · sfx 소리 이름 (기본 thud, false면 없음). 배경음악을 같이 끊으려면 data-bgm-cues에 t 「끊김」
function smashCut(t, o = {}) {
  if (o.sfx !== false) sfx(t, o.sfx || 'thud', 0.7);
  return seg(t, t + 0.12, `<div class="a" style="inset:0;background:${o.color ?? '#fff'};animation:kx-flash .12s linear ${T(t)}s both"></div>`);
}

// 장면을 다 쌓은 뒤 한 번: (아웃트로) · 로고 · 키프레임 · 장면 · 효과음 목록 · 글꼴
function kitDone() {
  if (OUTRO_AT != null) H.push(outroHTML());
  H.push(logoHTML());
  if (BLUR.some(([, , how]) => how === 'whip')) H.push(`<svg width="0" height="0" style="position:absolute">${[6, 14, 26, 40].map((s, i) => `<filter id="kx-mb${i + 1}" x="-10%" width="120%"><feGaussianBlur stdDeviation="${s} 0"/></filter>`).join('')}</svg>`); // 휩 팬 가로 흐림
  const st = document.createElement('style'); st.textContent = KF.join('\n'); document.head.append(st);
  const stage = document.querySelector('.stage');
  stage.innerHTML = H.join('');
  // 슬로 모션 · 프리즈 프레임: 감싼 사본 안 애니메이션을 τ = at + rate·(t − a)에 맞춘다 — 시작(delay)과 길이(duration)를 고친다
  stage.querySelectorAll('.kx-warp').forEach(el => {
    const [a, at, rate] = WARP[+el.dataset.w], A = (a - FROM) * 1000, AT = (at - FROM) * 1000;
    el.getAnimations({ subtree: true }).forEach(an => { const tm = an.effect.getTiming(); an.effect.updateTiming({ delay: A + (tm.delay - AT) / rate, duration: tm.duration / rate }); });
  });
  document.body.dataset.sfx = SFX.join(', ');
  document.fonts.load("96px 'Black Han Sans'", stage.textContent);
  document.fonts.load('46px Jua', stage.textContent);
  // data-from으로 중간부터 찍을 때: 애니메이션을 만들자마자 0초에 멈춰 둔다 (녹화가 프레임마다 시각을 맞춘다) — 2026-11-25.
  //   멈추지 않으면 페이지를 여는 동안 실제 시간이 흘러, 찍기 시작 시각 바로 뒤에 끝나는 장면(남은 길이가 로딩 시간보다 짧은 것)이
  //   먼저 끝나 버리고 녹화가 잡는 목록에서 빠졌다 (EP01 158초 콩이가 첫 프레임들에 안 나옴). 처음부터 찍을 때는 그대로 둔다 (브라우저로 볼 때 움직이게).
  if (FROM > 0) document.getAnimations().forEach(a => a.pause());
}
