// Twinkle points for the tour template's <div class="lights"> (2026-11-16): finds lights and stars that are really in a photo —
// small spots brighter than their surroundings — so no light is made up (CLAUDE.md §3). Coordinates are .cam box px (the photo
// stretched to the .cam's --w × --h), for the part of the box that shows on screen (1080 wide from <visibleX0>, = −(--x0 or --x1)).
//   node tools/motion/lights.mjs <photo> <camW> <camH> <visibleX0> [lights=16] [stars=10] [skyBottomY=1000]
//   → prints the <div class="lights">…</div> to paste inside that .cam, and writes lights-<photo>.png beside the photo to check
//     (yellow = light, cyan = star). Stars count only above skyBottomY (box px) and on dark sky; 0 stars when the sky has none.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VW = 1080;
export function findLights(photo, camW, camH, x0, { lights = 16, stars = 10, sky = 1000 } = {}) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', photo, '-vf', `scale=${camW}:${camH},crop=${VW}:${camH}:${x0}:0,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const at = (x, y) => raw[y * VW + x];
  const ring = (x, y) => { let s = 0, n = 0; for (let a = 0; a < 16; a++) { const u = Math.round(x + 11 * Math.cos(a * Math.PI / 8)), v = Math.round(y + 11 * Math.sin(a * Math.PI / 8)); if (u >= 0 && v >= 0 && u < VW && v < camH) { s += at(u, v); n++; } } return s / n; };
  const found = [];
  for (let y = 12; y < camH - 12; y += 2) for (let x = 12; x < VW - 12; x += 2) {
    const g = at(x, y); if (g < 90) continue;
    const around = ring(x, y), contrast = g - around;
    const light = (g >= 200 && contrast >= 55) || (g >= 236 && contrast >= 28); // lamps, bright window corners · LED bulbs on lit trees
    const star = y < sky && g >= 90 && contrast >= 45 && around <= 60;         // a point on dark sky
    if (light || star) found.push({ x: x + x0, y, g, contrast, kind: light ? 'light' : 'star' });
  }
  found.sort((a, b) => b.contrast - a.contrast);
  const kept = [];
  for (const p of found) if (!kept.some(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 46 ** 2)) kept.push(p); // one point per 46 px
  return [...kept.filter(p => p.kind === 'light').slice(0, lights), ...kept.filter(p => p.kind === 'star').slice(0, stars)];
}
// Size from brightness; blink length 1.7–3.5 s and start spread by the golden ratio, so no two points keep the same beat.
export function lightsHtml(points) {
  return '<div class="lights">' + points.map((p, i) => {
    const star = p.kind === 'star', t = (1.7 + ((i * 0.618) % 1) * 1.8).toFixed(2), dl = (-((i * 0.377) % 1) * Number(t)).toFixed(2);
    const size = star ? (p.g > 160 ? 30 : 22) : 34 + Math.min(16, Math.round((p.g - 200) / 4));
    return `<i style="--x:${p.x}px;--y:${p.y}px;--s:${size}px;--t:${t}s;--dl:${dl}s${star ? ';--k:.7' : ''}"></i>`;
  }).join('') + '</div>';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [photo, camW, camH, x0, lights, stars, sky] = process.argv.slice(2);
  if (!photo || !fs.existsSync(photo) || !(Number(camW) > 0) || !(Number(camH) > 0) || !(Number(x0) >= 0)) throw new Error('사용: node tools/motion/lights.mjs <photo> <camW> <camH> <visibleX0> [lights] [stars] [skyBottomY]');
  const points = findLights(photo, Number(camW), Number(camH), Number(x0), { lights: Number(lights ?? 16), stars: Number(stars ?? 10), sky: Number(sky ?? 1000) });
  const check = path.join(path.dirname(photo), `lights-${path.parse(photo).name}.png`);
  const boxes = points.map(p => `drawbox=x=${p.x - Number(x0) - 18}:y=${p.y - 18}:w=36:h=36:color=${p.kind === 'light' ? 'yellow' : 'cyan'}@0.9:t=3`).join(',') || 'null';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', photo, '-vf', `scale=${camW}:${camH},crop=${VW}:${camH}:${x0}:0,${boxes},scale=540:-1`, check]);
  console.log(lightsHtml(points));
  console.error(`불빛 ${points.filter(p => p.kind === 'light').length}개 · 별 ${points.filter(p => p.kind === 'star').length}개 — 확인 그림: ${check}`);
}
