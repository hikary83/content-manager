// v3.4.0: the video templates offered by 「루미한테 요청하기」. One line per template, in the order they are numbered.
// id = the file tools/motion/template-<id>.html. preview = a frame of the template's first video on Cloudinary
// (node tools/register.mjs template <id> <frame.png> prints it). `default: true` is picked first (CLAUDE.md §4: 사진).
// A new template is one more line here; the request window grows a card, and past four they scroll sideways.
window.HIKARY_TEMPLATES = Object.freeze([
  { id: 'soda', name: '소다', note: '장면마다 색이 바뀌는 배경, 둥근 사진 창', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373135/hikary/templates/soda.png' },
  { id: 'paper', name: '페이퍼', note: '밝은 종이 바탕, 한 단어씩 진해지는 자막', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373138/hikary/templates/paper.png' },
  { id: 'quiz', name: '퀴즈', note: '「어디게?」 이름은 끝까지 숨겨요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373141/hikary/templates/quiz.png' },
  { id: 'photo', name: '사진', note: '실제 사진을 당기고 밀어 영상처럼 · 큰 사진 필요', preview: 'https://res.cloudinary.com/btosslpq/image/upload/v1794373144/hikary/templates/photo.png', default: true }
]);
