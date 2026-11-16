// v3.4.0: the video templates offered by 「루미한테 요청하기」. One line per template, in the order they are numbered.
// id = the file tools/motion/template-<id>.html. preview = a frame of the template's first video on Cloudinary
// (node tools/register.mjs template <id> <frame.png> prints it). `default: true` is picked first (v3.8.2부터 생생).
// A new template is one more line here; the request window grows a card. Cards turn pages (●○○ · ‹ › · swipe, v3.8.2):
// up to 6 a page on a computer (all on one page: no dots), 3 on a phone (2 under 380 px), shared evenly (7 → 4 + 3).
// The window opens on the page with the picked card.
window.HIKARY_TEMPLATES = Object.freeze([
  { id: 'soda', name: '소다', note: '장면마다 색이 바뀌는 배경, 둥근 사진 창', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373135/hikary/templates/soda.png' },
  { id: 'paper', name: '페이퍼', note: '밝은 종이 바탕, 한 단어씩 진해지는 자막', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373138/hikary/templates/paper.png' },
  { id: 'quiz', name: '퀴즈', note: '「어디게?」 이름은 끝까지 숨겨요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373141/hikary/templates/quiz.png' },
  { id: 'photo', name: '사진', note: '실제 사진을 당기고 밀어 영상처럼 · 큰 사진 필요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373144/hikary/templates/photo.png' },
  { id: 'tour', name: '투어', note: '숙소를 한 바퀴 · 방마다 한 컷, 실내는 2.5D', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794466929/hikary/templates/tour.png' },
  // v3.8.2 생생 (2026-11-16): 투어 + 따뜻한 물 첫 컷 · 퀴즈 아닌 첫 한마디 · 사진 속 김·물결·불빛·불꽃 효과. preview는 260 시험본 첫 컷 (첫 실제 상품이 나오면 바꾼다)
  { id: 'vivid', name: '생생', note: '숙소 · 따뜻한 물 먼저 · 김·물결·불빛이 살아 움직여요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794820074/hikary/templates/vivid.png', default: true }
]);
