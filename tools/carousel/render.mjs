// Renders every <section class="slide" id="sN"> of a carousel HTML file to slide-NN.png (1080×1350) next to it.
//   node tools/carousel/render.mjs contents/<folder>/carousel.html
// A page without numbered slides (cover.html, inpock.html) is taken whole as one PNG named after the file,
// at the size in <body data-size="1080x1920">:  node tools/carousel/render.mjs contents/<folder>/cover.html → cover.png
// Uses the installed Chrome (or Edge) in headless mode; set CHROME to override the path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from '../../scripts/reel/lib.mjs';

const file = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(file)) throw new Error('사용: node tools/carousel/render.mjs <carousel.html | cover.html>');
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find(candidate => candidate && fs.existsSync(candidate));
if (!chrome) throw new Error('Chrome 또는 Edge를 찾지 못했어요. CHROME 환경 변수로 경로를 알려주세요.');
const html = fs.readFileSync(file, 'utf8');
const ids = [...html.matchAll(/<section[^>]*\bid="(s\d+)"/g)].map(match => match[1]);
const size = html.match(/<body[^>]*\bdata-size="(\d+)x(\d+)"/);
if (!ids.length && !size) throw new Error('id="s1"처럼 번호가 붙은 <section class="slide">나 <body data-size="1080x1920">가 없어요.');
const shots = ids.length
  ? ids.map((id, index) => [`slide-${String(index + 1).padStart(2, '0')}.png`, `#${id}`, '1080,1350'])
  : [[`${path.basename(file, '.html')}.png`, '', `${size[1]},${size[2]}`]];
// A separate profile so a running Chrome window is never touched.
const profile = path.join(os.tmpdir(), 'hikary-carousel-render');
for (const [name, hash, windowSize] of shots) {
  const out = path.join(path.dirname(file), name);
  run(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`, '--force-device-scale-factor=1', `--window-size=${windowSize}`, '--virtual-time-budget=8000', `--screenshot=${out}`, `${pathToFileURL(file).href}${hash}`]);
  console.log(out);
}
