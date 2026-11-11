// 사진·영상을 한 장에 모아 보는 PNG (2026-11-11). Chrome으로 찍는다 (tools/carousel/render.mjs).
//   node tools/sheet.mjs photos contents/<폴더>
//     → src/sheet-1.png … src/의 사진(tools/trip.mjs가 받은 것)을 36장씩, 노란 번호 + 객실 이름. 사진 고를 때 본다
//   node tools/sheet.mjs pick contents/<폴더> "89:① 훅 컷 1 · 불멍" "51:① 훅 컷 2" …
//     → 사진-초안.png. 고른 사진과 쓸 자리 — 초안과 같이 사용자에게 보낸다
//   node tools/sheet.mjs grid contents/<폴더> 89 51 3 …
//     → src/grid.png. 10% 눈금 — 사진 템플릿 카메라의 가운데 점 f를 읽는다 (--x = −(f × --w − 540))
//   node tools/sheet.mjs frames contents/<폴더>/motion-bgm.mp4 0.6 1.6 3.3 …
//     → 영상 옆 frames.png. 그 초의 장면 (4장씩 한 줄) — 글자 넘침·가림·흐림·사진 속 글자를 본다
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from '../scripts/reel/lib.mjs';

const render = fileURLToPath(new URL('./carousel/render.mjs', import.meta.url));
const href = file => pathToFileURL(path.resolve(file)).href;
const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// One grid page → PNG at `out`. The HTML lives in a temp folder; images are absolute file:// links.
function shoot(out, columns, width, height, items, style = '') {
  const rows = Math.ceil(items.length / columns), gap = 6;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${columns},${width}px);gap:${gap}px;font:bold 26px 'Malgun Gothic',Arial}
figure{margin:0;position:relative;width:${width}px;height:${height}px}img{width:100%;height:100%;object-fit:cover;display:block}
b,i{position:absolute;padding:2px 10px;background:rgba(0,0,0,.7);font-style:normal}b{left:6px;top:6px;color:#ffd84d}i{left:6px;bottom:6px;color:#fff}${style}</style>
<body data-size="${columns * (width + gap)}x${rows * (height + gap)}">${items.join('')}</body>`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikary-sheet-'));
  try {
    fs.writeFileSync(path.join(dir, 'sheet.html'), html);
    run(process.execPath, [render, path.join(dir, 'sheet.html')]);
    fs.copyFileSync(path.join(dir, 'sheet.png'), out); // copy, not rename: the temp folder may sit on another drive
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(out);
}

const indexOf = folder => JSON.parse(fs.readFileSync(path.join(folder, 'src', 'index.json'), 'utf8'));
const photo = (folder, n) => {
  const item = indexOf(folder)[Number(n) - 1];
  if (!item) throw new Error(`src/에 ${n}번 사진이 없어요.`);
  return { ...item, path: path.join(folder, 'src', item.file) };
};

const [mode, target, ...args] = process.argv.slice(2);
if (mode === 'photos' && target) {
  const index = indexOf(target);
  for (let page = 0; page * 36 < index.length; page++) {
    shoot(path.join(target, 'src', `sheet-${page + 1}.png`), 6, 320, 180, index.slice(page * 36, page * 36 + 36).map(item =>
      `<figure><img src="${href(path.join(target, 'src', item.file))}"><b>${parseInt(item.file, 10)}</b><i>${esc(item.room || item.group || '')}</i></figure>`));
  }
} else if (mode === 'pick' && target && args.length) {
  shoot(path.join(target, '사진-초안.png'), 4, 480, 270, args.map(pick => {
    const [n, ...role] = pick.split(':'), item = photo(target, n);
    return `<figure><img src="${href(item.path)}"><b>${n}</b><i>${esc(role.join(':'))}</i></figure>`;
  }));
} else if (mode === 'grid' && target && args.length) {
  const lines = 'repeating-linear-gradient(90deg,rgba(255,255,0,.55) 0 2px,transparent 2px 64px),repeating-linear-gradient(0deg,rgba(255,255,0,.35) 0 1px,transparent 1px 36px)';
  shoot(path.join(target, 'src', 'grid.png'), 3, 640, 360, args.map(n => {
    const item = photo(target, n);
    return `<figure><img src="${href(item.path)}" style="object-fit:fill"><i>${n} · ${item.w}x${item.h}</i></figure>`;
  }), `figure::after{content:'';position:absolute;inset:0;background:${lines}}i{z-index:1}`);
} else if (mode === 'frames' && target && args.length) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikary-frames-'));
  try {
    const items = args.map((t, i) => {
      const file = path.join(dir, `f${i}.jpg`);
      run('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', target, '-frames:v', '1', '-vf', 'scale=432:768', '-q:v', '3', file]);
      return `<figure><img src="${href(file)}"><b style="left:auto;right:6px;color:#0f0">${esc(t)}s</b></figure>`;
    });
    shoot(path.join(path.dirname(target), 'frames.png'), 4, 432, 768, items);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else {
  throw new Error('사용: node tools/sheet.mjs photos|pick|grid|frames … (파일 맨 위 설명)');
}
