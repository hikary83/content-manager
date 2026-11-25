// Narration for motion videos: Sohee (Qwen3-TTS, see voice.py) reads narration.md next to the page.
// narration.md is the 나레이션 대본: one table, a row per line — 「| 0.15–3.7 | 화면 | 나레이션 |」. The first cell is
// when the line may sound (seconds), the last cell is what is said. No narration.md → no voice.
// Lines are cached in <folder>/voice/ by text + seed + slot (+ data-voice), so re-recording only reads new or changed lines.
// The voice runs from ~/.hikary-voice (venv + model, CLAUDE.md §7), never from the repo.
// <body data-voice="1.7b 밝고 활기차게">: the model, then how to read (1.7B only — 0.6B takes no instruct).
// No data-voice = 0.6B, as before. The motion templates carry 「1.7b 또렷하고 경쾌하게, 광고 내레이션처럼」 (사람이 골랐다, 2026-11-13),
// so new videos get it and folders made before keep their 0.6B voice when re-recorded.
// <body data-voice="clone 혜경"> (long-form, 2026-11-24): the voice in ~/.hikary-voice/voices/혜경/ (ref.wav + ref.txt) copied by
// Qwen3-TTS 1.7B Base — voice_clone.py. Lines at most 0.5 s apart are read together in groups of up to 3 (groupLines), so the
// sentences carry on from each other; the narration track is set to -13 LUFS instead of -15. Shorts are untouched.
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
const CLONE_MODEL = 'Qwen3-TTS-12Hz-1.7B-Base', CLONE_SCRIPT = fileURLToPath(new URL('./voice_clone.py', import.meta.url));

// <body data-voice="…"> → { size, instruct } · { clone: name } for "clone 혜경", or null when the page does not say (the 0.6B default).
export function voiceOf(html) {
  const value = html.match(/<body[^>]*\sdata-voice="([^"]*)"/)?.[1].trim();
  if (!value) return null;
  const [, size, instruct] = value.match(/^(\S+)\s*(.*)$/);
  if (size.toLowerCase() === 'clone' && instruct) return { clone: instruct };
  if (!MODELS[size.toLowerCase()] || (size.toLowerCase() === '0.6b' && instruct)) {
    throw new Error(`data-voice="${value}"을 읽지 못했어요. 「1.7b 밝고 활기차게」처럼 모델(0.6b·1.7b) 뒤에 말투를 적거나, 롱폼은 「clone 혜경」처럼 목소리 이름을 적어요 — 말투는 1.7b만 받아요.`);
  }
  return { size: size.toLowerCase(), instruct };
}

// Groups for the cloned voice: lines at most 0.5 s apart stay together (a longer gap — the quiet gap, a scene change — starts a
// new group), up to 3 lines; a longer run is split evenly (4 → 2+2, 5 → 3+2). More lines = more comma pauses to cut at wrongly.
export function groupLines(lines) {
  const runs = [];
  for (const line of lines) {
    const last = runs.at(-1);
    if (last && line.at - last.at(-1).end <= 0.5 + 1e-9) last.push(line); else runs.push([line]);
  }
  return runs.flatMap(run => {
    const count = Math.ceil(run.length / 3), size = run.length / count;
    return Array.from({ length: count }, (_, i) => run.slice(Math.round(i * size), Math.round((i + 1) * size)));
  });
}

function speak(script, job, dir, what) {
  const file = path.join(dir, 'job.json');
  fs.writeFileSync(file, JSON.stringify(job));
  console.log(what);
  const result = spawnSync(PYTHON, ['-I', script, file], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', TRANSFORMERS_VERBOSITY: 'error' } });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(`음성 만들기 실패: ${(result.error?.message || result.stderr || '').slice(-1500)}`);
}

// Cloned voice: one take file per line, keyed by its whole group (texts, slots, seed, reference), so changing one line
// re-reads its group only.
function cloneTakes(lines, name, dir) {
  const ref = path.join(HOME, 'voices', name), model = path.join(HOME, CLONE_MODEL);
  for (const file of ['ref.wav', 'ref.txt']) {
    if (!fs.existsSync(path.join(ref, file))) throw new Error(`목소리 「${name}」의 참조가 없어요 (${path.join(ref, file)}). 사무실 PC의 ~/.hikary-voice/voices/${name} 폴더를 복사해요 (CLAUDE.md 7장).`);
  }
  const refKey = crypto.createHash('sha1').update(fs.readFileSync(path.join(ref, 'ref.wav'))).update(fs.readFileSync(path.join(ref, 'ref.txt'))).digest('hex');
  const groups = groupLines(lines).map(group => {
    const key = crypto.createHash('sha1').update(JSON.stringify(['clone', refKey, group[0].seed, group.map(l => [l.text, (l.end - l.at).toFixed(2)])])).digest('hex');
    group.forEach((line, i) => { line.file = path.join(dir, `${key.slice(0, 12)}-${i + 1}.wav`); });
    return { seed: group[0].seed, lines: group.map(({ text, at, end, file }) => ({ text, slot: end - at, out: file })) };
  });
  const todo = groups.filter(group => group.lines.some(line => !fs.existsSync(line.out)));
  if (!todo.length) return;
  if (!fs.existsSync(PYTHON) || !fs.existsSync(model)) throw new Error(`음성 도구가 없어요 (${model}). CLAUDE.md 7장대로 설치해요.`);
  speak(CLONE_SCRIPT, { model, ref: path.join(ref, 'ref.wav'), refText: fs.readFileSync(path.join(ref, 'ref.txt'), 'utf8').trim(), groups: todo }, dir,
    `나레이션 ${todo.reduce((sum, group) => sum + group.lines.length, 0)}줄(${todo.length}묶음)을 목소리 「${name}」로 읽는 중 (묶음 하나에 1~5분)`);
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
  const lines = parseNarration(fs.readFileSync(script, 'utf8'), seconds);
  if (!lines.length) throw new Error('narration.md에 「| 0.15–3.7 | 화면 | 나레이션 |」 줄이 없어요.');
  const dir = path.join(path.dirname(page), 'voice');
  fs.mkdirSync(dir, { recursive: true });
  if (voice?.clone) cloneTakes(lines, voice.clone, dir);
  else {
    const model = path.join(HOME, MODELS[voice?.size || '0.6b']);
    for (const line of lines) {
      // Without data-voice the key is the same as before, so takes made before 2026-11-13 are kept.
      const key = crypto.createHash('sha1').update(JSON.stringify([line.text, line.seed, (line.end - line.at).toFixed(2), ...(voice ? [voice.size, voice.instruct] : [])])).digest('hex');
      line.file = path.join(dir, `${key.slice(0, 12)}.wav`);
    }
    const todo = lines.filter(line => !fs.existsSync(line.file));
    if (todo.length) {
      if (!fs.existsSync(PYTHON) || !fs.existsSync(model)) throw new Error(`음성 도구가 없어요 (${model}). CLAUDE.md 7장대로 설치해요.`);
      speak(SCRIPT, { model, instruct: voice?.instruct || '', items: todo.map(({ text, at, end, seed, file }) => ({ text, slot: end - at, seed, out: file })) }, dir,
        `나레이션 ${todo.length}줄을 읽는 중 (한 줄에 30~50초)`);
    }
  }
  const keep = new Set(lines.map(line => path.basename(line.file)));
  for (const name of fs.readdirSync(dir)) if (!keep.has(name)) fs.rmSync(path.join(dir, name), { force: true }); // old takes
  const track = path.join(dir, 'track.wav');
  const placed = lines.map((line, i) => `[${i}:a]aresample=44100,adelay=${Math.round(line.at * 1000)}:all=1[n${i}]`);
  const mix = `${lines.map((_, i) => `[n${i}]`).join('')}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${seconds},atrim=0:${seconds},`
    + `highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=${voice?.clone ? 'I=-13:TP=-1.5' : 'I=-15:TP=-2'}:LRA=7,aresample=44100[v]`;
  // -13 for the long-form voice (2026-11-24): YouTube plays at about -14, so the 2 dB above stays as voice over music and effects.
  run('ffmpeg', ['-v', 'error', '-y', ...lines.flatMap(line => ['-i', line.file]), '-filter_complex', [...placed, mix].join(';'),
    '-map', '[v]', '-ac', '2', track]);
  return track;
}
