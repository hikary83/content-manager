// Colour candidates for a product: the most vivid colours in each image, and which text colour reads on them.
//   node tools/colors.mjs contents/<folder>/src/detail-1.jpg …
// Pick the point colour from the seller's detail images or the product itself (brand or season colours), not the
// muddy colours of whole photos, then set the :root block at the top of motion.html / carousel.html (CLAUDE.md §4).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const INK = '#171717';
const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// WCAG contrast ratio (1–21). Big captions need 3 or more.
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function vivid(image, count = 6) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', image, '-vf', 'scale=240:-1,palettegen=max_colors=16:reserve_transparent=0:stats_mode=full',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  const colours = new Map();
  for (let i = 0; i + 2 < raw.length; i += 3) {
    const rgb = [raw[i], raw[i + 1], raw[i + 2]], max = Math.max(...rgb), min = Math.min(...rgb);
    colours.set('#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''), max ? (max - min) / max : 0);
  }
  return [...colours].sort((a, b) => b[1] - a[1]).slice(0, count).map(([hex, saturation]) => ({ hex, saturation }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const images = process.argv.slice(2);
  if (!images.length) throw new Error('사용: node tools/colors.mjs <이미지…>');
  for (const image of images) {
    console.log(`\n${image}`);
    for (const { hex, saturation } of vivid(image)) {
      const white = contrast(hex, '#ffffff'), ink = contrast(hex, INK);
      console.log(`  ${hex}  채도 ${saturation.toFixed(2)}  흰 글자 ${white.toFixed(1)} · 검은 글자 ${ink.toFixed(1)} → ${white >= ink ? '흰' : '검은'} 글자${Math.max(white, ink) < 3 ? ' (둘 다 3 미만: 포인트로 쓰지 않기)' : ''}`);
    }
  }
}
