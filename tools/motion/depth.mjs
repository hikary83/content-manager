// 2.5D scenes for motion videos (2026-11-12). Mark a photo in the page and record.mjs plays pre-made frames in its place:
//   <img class="..." src="photo-2.jpg" data-depth="in" data-strength="1" style="--at:3s;--len:4s;object-position:50% 60%">
//   data-depth   camera move: in (다가가기) · out (물러나기) · left · right (옆으로) · up · down (위아래)
//   data-strength  1 = default, small enough that edges do not visibly stretch; 0.5 softer, up to 2
//   --at / --len   when the move runs (seconds; inherited from the scene like every other element)
//   size           the img's own CSS box (e.g. inset:0 → 1080×1920, or a strip); the photo covers it (object-fit: cover)
//   object-position  which part of the photo stays in view, in % only — the browser preview shows the same framing
// Frames go to <folder>/depth/<photo>-<move>-<key>/ and are reused while photo, move, strength, framing, size and length
// stay the same; each photo's depth map (<folder>/depth/<hash>.png) is kept so the model only reads new photos.
// The depth tool runs from ~/.hikary-depth (CLAUDE.md §7), never from the repo. See depth.py for the method.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = path.join(os.homedir(), '.hikary-depth');
const PYTHON = path.join(HOME, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const SCRIPT = fileURLToPath(new URL('./depth.py', import.meta.url));
const MOVES = ['in', 'out', 'left', 'right', 'up', 'down'];
const VERSION = 1; // bump when depth.py's motion changes, so old frames are not reused

// Read in the page by record.mjs; tags each marked img so frames can be swapped in later.
export const DEPTH_QUERY = `[...document.querySelectorAll('img[data-depth]')].map((img, i) => {
  img.dataset.depthIndex = i; const style = getComputedStyle(img);
  return { src: img.getAttribute('src'), move: img.dataset.depth, strength: img.dataset.strength || '1', position: style.objectPosition,
    at: style.getPropertyValue('--at'), len: style.getPropertyValue('--len'), width: img.offsetWidth, height: img.offsetHeight };
})`;

const seconds = value => {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/);
  return match ? Number(match[1]) / (match[2] === 'ms' ? 1000 : 1) : NaN;
};
const sha1 = data => crypto.createHash('sha1').update(data).digest('hex');

export function depthJob(page, info, fps) {
  const where = `2.5D 사진 「${info.src}」`;
  const photo = path.resolve(path.dirname(page), decodeURI(info.src || ''));
  if (!info.src || /^[a-z]+:/i.test(info.src) || !fs.existsSync(photo)) throw new Error(`${where}: 페이지 옆의 사진 파일이 아니에요.`);
  if (!MOVES.includes(info.move)) throw new Error(`${where}: data-depth는 ${MOVES.join(' · ')} 중 하나예요.`);
  const strength = Number(info.strength);
  if (!(strength > 0 && strength <= 2)) throw new Error(`${where}: data-strength는 0보다 크고 2까지예요.`);
  const focus = String(info.position).trim().split(/\s+/).map(part => part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : NaN);
  if (focus.length !== 2 || focus.some(f => !(f >= 0 && f <= 1))) throw new Error(`${where}: object-position은 「50% 60%」처럼 %로 적어요.`);
  const at = seconds(info.at), len = seconds(info.len);
  if (!(at >= 0) || !(len > 0)) throw new Error(`${where}: --at·--len(초)이 있는 장면 안에 둬요.`);
  if (!(info.width > 0 && info.height > 0)) throw new Error(`${where}: img에 크기를 줘요 (예: position:absolute;inset:0;width:100%;height:100%).`);
  const frames = Math.max(1, Math.round(len * fps));
  const photoKey = sha1(fs.readFileSync(photo)).slice(0, 12);
  const key = sha1(JSON.stringify([VERSION, photoKey, info.move, strength, focus, info.width, info.height, frames])).slice(0, 10);
  const dir = path.join(path.dirname(page), 'depth');
  return { photo, move: info.move, strength, focus, width: info.width, height: info.height, frames, at,
    depthCache: path.join(dir, `${photoKey}.png`), out: path.join(dir, `${path.parse(photo).name}-${info.move}-${key}`) };
}

export const frameUrl = (job, i) => pathToFileURL(path.join(job.out, `${String(i).padStart(4, '0')}.jpg`)).href;

// Makes any missing frames; returns the jobs and whether anything was rendered (the page then needs a reload).
export function depthScenes(page, infos, fps) {
  const jobs = infos.map(info => depthJob(page, info, fps));
  const todo = jobs.filter((job, i) => !fs.existsSync(job.out) && jobs.findIndex(other => other.out === job.out) === i);
  if (todo.length) {
    if (!fs.existsSync(PYTHON)) throw new Error(`2.5D 도구가 없어요 (${HOME}). CLAUDE.md 7장대로 설치해요.`);
    const list = path.join(path.dirname(todo[0].out), 'jobs.json');
    fs.mkdirSync(path.dirname(list), { recursive: true });
    fs.writeFileSync(list, JSON.stringify(todo));
    console.log(`2.5D 장면 ${todo.length}개를 만드는 중 (장면 4초에 약 30~50초, 새 사진은 처음에 모델 불러오기 약 10초)`);
    const result = spawnSync(PYTHON, ['-I', SCRIPT, list], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', windowsHide: true,
      env: { ...process.env, HF_HOME: path.join(HOME, 'hf'), HF_HUB_DISABLE_TELEMETRY: '1', TRANSFORMERS_VERBOSITY: 'error', PYTHONIOENCODING: 'utf-8' } });
    fs.rmSync(list, { force: true });
    if (result.status !== 0) throw new Error(`2.5D 프레임 만들기 실패: ${(result.error?.message || result.stderr || '').slice(-1500)}`);
  }
  return { jobs, rendered: todo.length > 0 };
}

// The page expression record.mjs runs before seeking frame i: put each marked img on its frame for that time.
export function swapFrames(jobs, i, fps) {
  const swaps = jobs.map((job, index) => [index, frameUrl(job, Math.min(job.frames - 1, Math.max(0, Math.round(i - job.at * fps))))]);
  return `Promise.all(${JSON.stringify(swaps)}.map(([index, url]) => {
    const img = document.querySelector('img[data-depth-index="' + index + '"]');
    if (img.src === url) return;
    img.src = url; return img.decode();
  }))`;
}
