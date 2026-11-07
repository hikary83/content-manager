// Background music for motion videos, synthesized here note by note, so the file holds no third-party audio.
// A seed picks key, tempo, chords, instrument and beat: each video gets its own track, and the same seed always
// gives the same track. The seed is the folder name, or <body data-bgm="any text"> to pick another track;
// <body data-bgm="off"> makes no music.
// record.mjs writes motion-bgm.mp4 (sound effects + narration + music) next to motion.mp4; the music ducks
// while the narration speaks. To redo only the music:
//   node tools/motion/bgm.mjs contents/<folder>/motion.html   (rebuilds motion-bgm.mp4 from motion.mp4)
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

export function musicSeed(page, html) {
  const set = html.match(/<body[^>]*\sdata-bgm="([^"]*)"/)?.[1]?.trim();
  return set === 'off' ? null : set || path.basename(path.dirname(path.resolve(page)));
}

// Returns a 16-bit stereo WAV and what the seed picked.
export function makeMusic(seed, seconds) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
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

  const bars = Math.ceil(D / BAR);
  for (let k = 0; k < bars; k++) {
    const t0 = k * BAR, [r, major] = PROGS[chords][k % 4];
    let root = 60 + KEYS[key] + r;
    if (root > 64) root -= 12;
    if (root < 53) root += 12;
    const chord = [root, root + (major ? 4 : 3), root + 7], tones = [...chord.map(m => m + 12), root + 24];
    chord.forEach(m => note(t0, BAR, pad(hz(m), BAR), 0.05));
    arp.forEach((a, i) => a !== null && note(t0 + i * B / 2, 0.8, TONES[tone](hz(tones[a])), 0.16, i % 2 ? 0.3 : -0.3));
    if (k === 0 || k === bars - 1) continue; // first and last bar: melody only
    [0, 2].forEach(b => note(t0 + b * B, B * 1.8, bass(hz(root - 12)), 0.22));
    BEATS[beat].kick.forEach(b => note(t0 + b * B, 0.35, kick, 0.45));
    BEATS[beat].snap.forEach(b => note(t0 + b * B, 0.2, hit(22), 0.07));
    BEATS[beat].hat.forEach(b => note(t0 + b * B, 0.08, hit(60), 0.05, 0.2));
  }

  let peak = 1e-9;
  for (let i = 0; i < N; i++) {
    const t = i / SR, g = Math.min(1, t / 0.3) * Math.min(1, (D - t) / 2); // fade in 0.3s, out 2s
    L[i] = Math.tanh(L[i] * g); R[i] = Math.tanh(R[i] * g);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const wav = Buffer.alloc(44 + N * 4), gain = 0.89 / peak;
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    wav.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4);
  }
  return { wav, picks: { key, bpm, chords, tone, beat } };
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
    const audio = info.streams.some(s => s.codec_type === 'audio')
      ? ['-filter_complex', `[1:a]volume=${VOLUME}[m];${duck}[0:a][${voice ? 'd' : 'm'}]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`, '-map', '[a]']
      : ['-map', '1:a'];
    run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-i', music, ...(voice ? ['-i', voice] : []), '-map', '0:v', ...audio,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { out, picks };
}

export const describe = ({ key, bpm, chords, tone, beat }) => `${key}키 ${bpm}bpm ${chords} · ${tone} · ${beat}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const page = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(page)) throw new Error('사용: node tools/motion/bgm.mjs <motion.html>');
  const video = page.replace(/\.html?$/i, '') + '.mp4';
  if (!fs.existsSync(video)) throw new Error(`${path.basename(video)}이 없어요. 먼저 record.mjs로 영상을 만들어요.`);
  const seed = musicSeed(page, fs.readFileSync(page, 'utf8'));
  if (!seed) throw new Error('data-bgm="off"라 배경음악을 넣지 않아요.');
  const { out, picks } = addMusic(video, seed, voiceTrack(page));
  console.log(`배경음악을 넣었어요 (${describe(picks)}): ${out}`);
}
