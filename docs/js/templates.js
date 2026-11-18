// v3.4.0: the video templates offered by 「루미한테 요청하기」. One line per template, in the order they are numbered.
// id = the file tools/motion/template-<id>.html. preview = a frame of the template's first video on Cloudinary
// (node tools/register.mjs template <id> <frame.png> prints it). `default: true` is picked first (v3.8.2부터 생생).
// A new template is one more line here; the request window grows a card. Cards turn pages (●○○ · ‹ › · swipe, v3.8.2):
// up to 6 a page on a computer (all on one page: no dots), 3 on a phone (2 under 380 px), shared evenly (7 → 4 + 3).
// The window opens on the page with the picked card.
// v3.10.0 (server 2.22.0) 「설정 → 템플릿」: this file stays the list and the numbers — 「템플릿 6 생생」 is the sixth line, so lines are
// never reordered and a new template goes at the bottom. The owner's order, hidden ones and default (ledger tab 「설정」) are laid over
// it by HIKARY_TEMPLATE_ORDER below; `default: true` only counts until a default is saved there.
// example = a 3–5 second clip the 「설정」 menu plays on ▶ (모션팀: node tools/register.mjs template <id> <clip.mp4> prints the address).
// Empty shows 「예시 영상 준비 중」.
window.HIKARY_TEMPLATES = Object.freeze([
  { id: 'soda', name: '소다', note: '장면마다 색이 바뀌는 배경, 둥근 사진 창', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373135/hikary/templates/soda.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985471/hikary/templates/soda-example.mp4' },
  { id: 'paper', name: '페이퍼', note: '밝은 종이 바탕, 한 단어씩 진해지는 자막', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373138/hikary/templates/paper.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985324/hikary/templates/paper-example.mp4' },
  { id: 'quiz', name: '퀴즈', note: '「어디게?」 이름은 끝까지 숨겨요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373141/hikary/templates/quiz.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985336/hikary/templates/quiz-example.mp4' },
  { id: 'photo', name: '사진', note: '실제 사진을 당기고 밀어 영상처럼 · 큰 사진 필요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373144/hikary/templates/photo.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985340/hikary/templates/photo-example.mp4' },
  { id: 'tour', name: '투어', note: '숙소를 한 바퀴 · 방마다 한 컷, 실내는 2.5D', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794466929/hikary/templates/tour.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985343/hikary/templates/tour-example.mp4' },
  // v3.8.2 생생 (2026-11-16): 투어 + 따뜻한 물 첫 컷 · 퀴즈 아닌 첫 한마디 · 사진 속 김·물결·불빛·불꽃 효과.
  // 2026-11-18 타이포(작은 주아 + 큰 Black Han Sans 낱말)를 넣었다 — preview는 262 시험본 첫 장면 (typo-seed-a 0.6초)
  { id: 'vivid', name: '생생', note: '숙소 · 따뜻한 물 먼저 · 김·물결·불빛이 살아 움직여요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794985046/hikary/templates/vivid.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985347/hikary/templates/vivid-example.mp4', default: true },
  // 2026-11-18 생생 한 줄 (사람: "이전꺼를 살려서 7번으로 하자"): 타이포를 넣기 전 생생. preview는 그때 생생 그림 (260 시험본 첫 컷)
  { id: 'vivid-line', name: '생생 한 줄', note: '생생 그대로 · 가운데 한 줄 자막, 노란 핵심어', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794985042/hikary/templates/vivid-line.png', example: 'https://res.cloudinary.com/btosslpq/video/upload/v1794985350/hikary/templates/vivid-line-example.mp4' }
]);

// Every template in the owner's order, each with no (its line), shown and isDefault. setting = { order, hidden, default } from the
// server, or nothing. Ids the setting does not list (a new template) go last, shown; ids this file no longer has are skipped.
// The default is the saved one while it is shown, else this file's default, else the first shown. The web and tools/register.mjs share it.
window.HIKARY_TEMPLATE_ORDER = setting => {
  const all = window.HIKARY_TEMPLATES.map((tpl, index) => ({ ...tpl, no: index + 1 }));
  const byId = Object.fromEntries(all.map(tpl => [tpl.id, tpl]));
  const saved = setting && Array.isArray(setting.order) ? setting : null;
  const order = saved ? [...new Set([...saved.order.filter(id => byId[id]), ...all.map(tpl => tpl.id)])] : all.map(tpl => tpl.id);
  const hidden = new Set(saved && Array.isArray(saved.hidden) ? saved.hidden : []);
  const shown = order.filter(id => !hidden.has(id));
  const fileDefault = (all.find(tpl => tpl.default) || all[0] || {}).id;
  const chosen = saved && shown.includes(saved.default) ? saved.default : shown.includes(fileDefault) ? fileDefault : shown[0];
  return order.map(id => ({ ...byId[id], shown: !hidden.has(id), isDefault: id === chosen }));
};
