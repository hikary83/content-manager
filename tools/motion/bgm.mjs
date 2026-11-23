// Background music for motion videos, synthesized here note by note, so the file holds no third-party audio.
// A seed picks key, tempo, chords, instrument and beat: each video gets its own track, and the same seed always
// gives the same track. The seed is the folder name, or <body data-bgm="any text"> to pick another track;
// <body data-bgm="off"> makes no music.
// record.mjs writes motion-bgm.mp4 (sound effects + narration + music) next to motion.mp4; the music ducks
// while the narration speaks. To redo only the music:
//   node tools/motion/bgm.mjs contents/<folder>/motion.html   (rebuilds motion-bgm.mp4 from motion.mp4)
// The photo template cuts its hook on two beats at 108bpm. When the folder-name track has another tempo, find a seed
// that plays at 108 and put it in data-bgm (No.255 「bulmeong40」, No.256 「hanok40」, 2026-11-11):
//   node tools/motion/bgm.mjs --find 108 hanok   → hanok5 → A키 108bpm … (seeds hanok1…hanok60)
// Long videos (60 s or more, 2026-11-19 — 사람: 10분에 같은 8초 코드가 72번 돌아 지루하다) change every 16 bars (30~40 s):
// drums out, another instrument and arpeggio, back to the theme, busier hats with the arpeggio an octave up, and the last part a
// whole tone higher. Key and tempo stay. A second random stream picks the parts, so the first 16 bars are the notes they always
// were, and anything shorter than 60 s (the shorts, data-bgm seeds like bulmeong40·hanok40) is the same track byte for byte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, probe } from '../../scripts/reel/lib.mjs';
import { voiceTrack } from './voice.mjs';

const SR = 44100, VOLUME = 0.32; // music level under the sound effects
const KEYS = { C: 0, D: 2, F: 5, G: 7, A: -3 };
const PROGS = { 'I-V-vi-IV': [[0, 1], [7, 1], [9, 0], [5, 1]], 'vi-IV-I-V': [[9, 0], [5, 1], [0, 1], [7, 1]],
  'I-vi-IV-V': [[0, 1], [9, 0], [5, 1], [7, 1]], 'IV-V-iii-vi': [[5, 1], [7, 1], [4, 0], [9, 0]] }; // [root, major?]
const ARPS = [[0, 2, 1, 2, 3, 2, 1, 2], [0, 1, 2, 3, 2, 1, 0, 1], [0, null, 2, 1, null, 2, 3, null], [3, 2, 1, 0, 1, 2, 3, 2]];
const sin = (f, t) => Math.sin(2 * Math.PI * f * t);
const TONES = {
  marimba: f => t => (sin(f, t) + 0.35 * sin(2 * f, t) * Math.exp(-t * 12) + 0.15 * sin(3 * f, t) * Math.exp(-t * 20)) * Math.exp(-t * 7) * Math.min(1, t / 0.004),
  bell: f => t => (sin(f, t) + 0.4 * sin(2.76 * f, t) * Math.exp(-t * 9)) * Math.exp(-t * 4) * Math.min(1, t / 0.003),
  keys: f => t => (sin(f, t) + 0.2 * sin(2 * f, t) + 0.1 * sin(3 * f, t)) * Math.exp(-t * 5) * Math.min(1, t / 0.01),
  pluck: f => t => [1, 2, 3, 4, 5].reduce((s, k) => s + sin(k * f, t) / k * Math.exp(-t * (4 + k * 6)), 0) * Math.min(1, t / 0.003),
};
const BEATS = { // beat positions in a 4-beat bar
  basic: { kick: [0, 2], snap: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] },
  four: { kick: [0, 1, 2, 3], snap: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] },
  bounce: { kick: [0, 1.5, 2], snap: [1, 3], hat: [0.5, 1, 1.5, 2.5, 3, 3.5] },
};

const LONG = 60, SECTION = 16; // seconds from which a track changes parts · bars in a part

const rng = text => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
};

// The parts of a long track. Part 0 is `base` (the track as it always was); a short tail (under 8 bars) joins the part before it.
function parts(seed, bars, base) {
  let count = Math.ceil(bars / SECTION);
  if (count > 1 && bars % SECTION && bars % SECTION < 8) count--;
  const r = rng(`${seed}#parts`), other = (list, not) => { const rest = list.filter(x => x !== not); return rest[Math.floor(r() * rest.length)]; };
  const kinds = ['break', 'alt', 'main', 'lift'];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const kind = {
    main: () => base,
    break: () => ({ ...base, drums: false, bass: 0.14 }), // drums out, softer bass
    alt: () => ({ ...base, tone: other(Object.keys(TONES), base.tone), arp: other(ARPS, base.arp) }), // picked anew each time round
    lift: () => ({ ...base, hat: BEATS.bounce.hat, up: 12 }), // busier hats, arpeggio an octave up
  };
  const plan = Array.from({ length: count }, (_, s) => s ? kind[kinds[(s - 1) % kinds.length]]() : base);
  if (count > 1) plan[count - 1] = { ...kind.lift(), shift: 2 };
  return plan;
}

export function musicSeed(page, html) {
  const set = html.match(/<body[^>]*\sdata-bgm="([^"]*)"/)?.[1]?.trim();
  return set === 'off' ? null : set || path.basename(path.dirname(path.resolve(page)));
}

// Returns a 16-bit stereo WAV and what the seed picked.
export function makeMusic(seed, seconds) {
  const rnd = rng(seed);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const key = pick(Object.keys(KEYS)), chords = pick(Object.keys(PROGS)), tone = pick(Object.keys(TONES)),
    beat = pick(Object.keys(BEATS)), arp = pick(ARPS), bpm = 96 + 4 * Math.floor(rnd() * 7);

  const D = seconds, B = 60 / bpm, BAR = B * 4, N = Math.floor(SR * D);
  const L = new Float32Array(N), R = new Float32Array(N);
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const note = (start, len, gen, gain, pan = 0) => {
    const s0 = Math.floor(start * SR), n = Math.floor(len * SR);
    const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n && s0 + i < N; i++) { const v = gen(i / SR); L[s0 + i] += v * gl; R[s0 + i] += v * gr; }
  };
  const hit = decay => { let p = 0; return t => { const r = rnd() * 2 - 1, v = r - p; p = r; return v * Math.exp(-t * decay); }; };
  const pad = (f, len) => t => (sin(f, t) + 0.5 * sin(f * 1.004, t) + 0.2 * sin(2 * f, t)) * Math.min(1, t / 0.4) * Math.min(1, (len - t) / 0.5);
  const bass = f => t => (sin(f, t) + 0.3 * sin(2 * f, t)) * Math.exp(-t * 3) * Math.min(1, t / 0.01);
  const kick = t => Math.sin(2 * Math.PI * (50 * t + 70 / 30 * (1 - Math.exp(-30 * t)))) * Math.exp(-t * 9);

  const bars = Math.ceil(D / BAR), base = { tone, arp, beat, drums: true, bass: 0.22, hat: null, up: 0, shift: 0 };
  const plan = D >= LONG ? parts(seed, bars, base) : [base];
  for (let k = 0; k < bars; k++) {
    const s = Math.min(Math.floor(k / SECTION), plan.length - 1), p = plan[s];
    const t0 = k * BAR, [r, major] = PROGS[chords][k % 4];
    let root = 60 + KEYS[key] + r;
    if (root > 64) root -= 12;
    if (root < 53) root += 12;
    root += p.shift; // after the octave fold, so the last part really goes up
    const chord = [root, root + (major ? 4 : 3), root + 7], tones = [...chord.map(m => m + 12), root + 24];
    chord.forEach(m => note(t0, BAR, pad(hz(m), BAR), 0.05));
    p.arp.forEach((a, i) => a !== null && note(t0 + i * B / 2, 0.8, TONES[p.tone](hz(tones[a] + p.up)), 0.16, i % 2 ? 0.3 : -0.3));
    if (s && k === s * SECTION && p.drums) note(t0, 1.4, hit(4), 0.06); // a soft crash where a new part comes in with drums
    if (k === 0 || k === bars - 1) continue; // first and last bar: melody only
    [0, 2].forEach(b => note(t0 + b * B, B * 1.8, bass(hz(root - 12)), p.bass));
    if (!p.drums) continue;
    BEATS[p.beat].kick.forEach(b => note(t0 + b * B, 0.35, kick, 0.45));
    BEATS[p.beat].snap.forEach(b => note(t0 + b * B, 0.2, hit(22), 0.07));
    (p.hat || BEATS[p.beat].hat).forEach(b => note(t0 + b * B, 0.08, hit(60), 0.05, 0.2));
  }

  // A long track is levelled on its first part, so it opens exactly as loud as the short track; later parts are clamped.
  const levelled = plan.length > 1 ? Math.min(N, Math.floor(SECTION * BAR * SR)) : N;
  let peak = 1e-9;
  for (let i = 0; i < N; i++) {
    const t = i / SR, g = Math.min(1, t / 0.3) * Math.min(1, (D - t) / 2); // fade in 0.3s, out 2s
    L[i] = Math.tanh(L[i] * g); R[i] = Math.tanh(R[i] * g);
    if (i < levelled) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const wav = Buffer.alloc(44 + N * 4), gain = 0.89 / peak, clamp = v => Math.max(-1, Math.min(1, v));
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    wav.writeInt16LE(Math.round(clamp(L[i] * gain) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(clamp(R[i] * gain) * 32767), 46 + i * 4);
  }
  return { wav, picks: { key, bpm, chords, tone, beat, parts: plan.length } };
}

// motion.mp4 → motion-bgm.mp4 with the music under whatever sound the video already has.
// voice: the narration track (voice.mjs) — the music ducks while it speaks. The video already has the voice in it.
export function addMusic(video, seed, voice) {
  const info = probe(video), out = video.replace(/\.mp4$/i, '') + '-bgm.mp4';
  const { wav, picks } = makeMusic(seed, Number(info.format.duration));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikary-bgm-'));
  try {
    const music = path.join(dir, 'music.wav');
    fs.writeFileSync(music, wav);
    const duck = voice ? '[m][2:a]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=400[d];' : '';
    // apad: the sound runs on in silence, so -shortest ends with the video's last frame. Without it the mix (a few
    // hundredths of a second shorter than the video) cut 1~4 last frames: No.265 525 → 521, 10 minutes 18000 → 17996 (2026-11-19).
    const audio = info.streams.some(s => s.codec_type === 'audio')
      ? `[1:a]volume=${VOLUME}[m];${duck}[0:a][${voice ? 'd' : 'm'}]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95,apad[a]`
      : '[1:a]apad[a]';
    run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-i', music, ...(voice ? ['-i', voice] : []), '-map', '0:v', '-filter_complex', audio, '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { out, picks };
}

export const describe = ({ key, bpm, chords, tone, beat, parts = 1 }) => `${key}키 ${bpm}bpm ${chords} · ${tone} · ${beat}${parts > 1 ? ` · ${parts}구간` : ''}`;

// Seeds prefix1…prefixN whose track plays at `bpm` (a 50 ms render is enough to read what the seed picks).
export const findSeeds = (bpm, prefix, count = 60) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`)
  .map(seed => ({ seed, picks: makeMusic(seed, 0.05).picks })).filter(({ picks }) => picks.bpm === bpm);

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--find') {
  const bpm = Number(process.argv[3]), prefix = process.argv[4] || 'bgm';
  if (!bpm) throw new Error('사용: node tools/motion/bgm.mjs --find 108 <아무 단어>');
  const found = findSeeds(bpm, prefix);
  console.log(found.length ? found.map(({ seed, picks }) => `${seed} → ${describe(picks)}`).join('\n') : `${bpm}bpm 씨앗이 없어요. 다른 단어로 찾아 보세요.`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const page = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(page)) throw new Error('사용: node tools/motion/bgm.mjs <motion.html>');
  const video = page.replace(/\.html?$/i, '') + '.mp4';
  if (!fs.existsSync(video)) throw new Error(`${path.basename(video)}이 없어요. 먼저 record.mjs로 영상을 만들어요.`);
  const seed = musicSeed(page, fs.readFileSync(page, 'utf8'));
  if (!seed) throw new Error('data-bgm="off"라 배경음악을 넣지 않아요.');
  const { out, picks } = addMusic(video, seed, voiceTrack(page));
  console.log(`배경음악을 넣었어요 (${describe(picks)}): ${out}`);
}
