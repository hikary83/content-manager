// Narration for motion videos: Sohee (Qwen3-TTS, see voice.py) reads narration.md next to the page.
// narration.md is the 나레이션 대본: one table, a row per line — 「| 0.15–3.7 | 화면 | 나레이션 |」. The first cell is
// when the line may sound (seconds), the last cell is what is said. No narration.md → no voice.
// Lines are cached in <folder>/voice/ by text + seed + slot (+ data-voice), so re-recording only reads new or changed lines.
// The voice runs from ~/.hikary-voice (venv + model, CLAUDE.md §7), never from the repo.
// <body data-voice="1.7b 밝고 활기차게">: the model, then how to read (1.7B only — 0.6B takes no instruct).
// No data-voice = 0.6B, as before. The motion templates carry 「1.7b 또렷하고 경쾌하게, 광고 내레이션처럼」 (사람이 골랐다, 2026-11-13),
// so new videos get it and folders made before keep their 0.6B voice when re-recorded.
// sfx.mjs mixes the voice into motion.mp4 and bgm.mjs ducks the music under it. To redo only the sound:
//   node tools/motion/sfx.mjs contents/<folder>/motion.html
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../../scripts/reel/lib.mjs';

const HOME = path.join(os.homedir(), '.hikary-voice');
const PYTHON = path.join(HOME, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const MODELS = { '0.6b': 'Qwen3-TTS-12Hz-0.6B-CustomVoice', '1.7b': 'Qwen3-TTS-12Hz-1.7B-CustomVoice' };
const SCRIPT = fileURLToPath(new URL('./voice.py', import.meta.url));

// <body data-voice="…"> → { size, instruct }, or null when the page does not say (the 0.6B default).
export function voiceOf(html) {
  const value = html.match(/<body[^>]*\sdata-voice="([^"]*)"/)?.[1].trim();
  if (!value) return null;
  const [, size, instruct] = value.match(/^(\S+)\s*(.*)$/);
  if (!MODELS[size.toLowerCase()] || (size.toLowerCase() === '0.6b' && instruct)) {
    throw new Error(`data-voice="${value}"을 읽지 못했어요. 「1.7b 밝고 활기차게」처럼 모델(0.6b·1.7b) 뒤에 말투를 적어요 — 말투는 1.7b만 받아요.`);
  }
  return { size: size.toLowerCase(), instruct };
}

export function parseNarration(md, seconds) {
  const lines = [];
  for (const row of md.split(/\r?\n/)) {
    const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
    const time = cells[0]?.match(/^(\d+(?:\.\d+)?)\s*[–~-]\s*(\d+(?:\.\d+)?)$/);
    if (!time) continue;
    const at = Number(time[1]), end = Number(time[2]), text = cells.length > 1 && cells.at(-1);
    if (!text || end <= at || end > seconds || at < (lines.at(-1)?.end ?? 0)) {
      throw new Error(`나레이션 「${row.trim()}」을 읽지 못했어요. 시간은 「시작–끝」(초)으로, 앞줄과 겹치지 않게, 영상 길이(${seconds}초) 안에 적어요.`);
    }
    lines.push({ at, end, text, seed: 1 + lines.length * 100 }); // seed rule = the take the user picked (2026-11-07)
  }
  return lines;
}

// Returns <folder>/voice/track.wav (every line placed on the video's timeline), or null when there is no narration.md.
export function voiceTrack(page) {
  const script = path.join(path.dirname(page), 'narration.md');
  if (!fs.existsSync(script)) return null;
  const html = fs.readFileSync(page, 'utf8');
  const seconds = Number(html.match(/<body[^>]*\sdata-duration="([^"]*)"/)?.[1]);
  if (!(seconds > 0)) throw new Error('<body data-duration="18">처럼 영상 길이를 적어주세요.');
  const voice = voiceOf(html);
  const model = path.join(HOME, MODELS[voice?.size || '0.6b']);
  const lines = parseNarration(fs.readFileSync(script, 'utf8'), seconds);
  if (!lines.length) throw new Error('narration.md에 「| 0.15–3.7 | 화면 | 나레이션 |」 줄이 없어요.');
  const dir = path.join(path.dirname(page), 'voice');
  fs.mkdirSync(dir, { recursive: true });
  for (const line of lines) {
    // Without data-voice the key is the same as before, so takes made before 2026-11-13 are kept.
    const key = crypto.createHash('sha1').update(JSON.stringify([line.text, line.seed, (line.end - line.at).toFixed(2), ...(voice ? [voice.size, voice.instruct] : [])])).digest('hex');
    line.file = path.join(dir, `${key.slice(0, 12)}.wav`);
  }
  const todo = lines.filter(line => !fs.existsSync(line.file));
  if (todo.length) {
    if (!fs.existsSync(PYTHON) || !fs.existsSync(model)) throw new Error(`음성 도구가 없어요 (${model}). CLAUDE.md 7장대로 설치해요.`);
    const job = path.join(dir, 'job.json');
    fs.writeFileSync(job, JSON.stringify({ model, instruct: voice?.instruct || '', items: todo.map(({ text, at, end, seed, file }) => ({ text, slot: end - at, seed, out: file })) }));
    console.log(`나레이션 ${todo.length}줄을 읽는 중 (한 줄에 30~50초)`);
    const result = spawnSync(PYTHON, ['-I', SCRIPT, job], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', TRANSFORMERS_VERBOSITY: 'error' } });
    fs.rmSync(job, { force: true });
    if (result.status !== 0) throw new Error(`음성 만들기 실패: ${(result.error?.message || result.stderr || '').slice(-1500)}`);
  }
  const keep = new Set(lines.map(line => path.basename(line.file)));
  for (const name of fs.readdirSync(dir)) if (!keep.has(name)) fs.rmSync(path.join(dir, name), { force: true }); // old takes
  const track = path.join(dir, 'track.wav');
  const placed = lines.map((line, i) => `[${i}:a]aresample=44100,adelay=${Math.round(line.at * 1000)}:all=1[n${i}]`);
  const mix = `${lines.map((_, i) => `[n${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${seconds},atrim=0:${seconds},`
    + 'highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-15:TP=-2:LRA=7,aresample=44100[v]';
  run('ffmpeg', ['-v', 'error', '-y', ...lines.flatMap(line => ['-i', line.file]), '-filter_complex', [...placed, mix].join(';'),
    '-map', '[v]', '-ac', '2', track]);
  return track;
}
