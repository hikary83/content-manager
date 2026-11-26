// 롱폼 마무리 소리 (모션팀, 2026-11-23~25): 녹화(record.mjs)가 만든 motion.mp4(효과음 + 나레이션)에 배경음악을 다시 섞어
// motion-bgm.mp4를 새로 만든다 (녹화가 만든 motion-bgm.mp4를 덮어쓴다).
//   node tools/longform/finish.mjs <motion.html>
// - 배경음악: tools/motion/bgm.mjs의 곡(폴더 이름 또는 data-bgm 씨앗)을 그대로 쓰되,
//   아웃트로(<body data-outro>)가 있으면 마지막 5초에 걸쳐 줄인다. 나레이션이 나올 때 줄어드는 것은 bgm.mjs와 같다.
// - <body data-music-off="3.4-12">: 그 구간 배경음악을 뚝 끊었다가(0.03초) 끝에서 0.4초에 걸쳐 다시 키운다. 여럿이면 쉼표로
//   (2026-11-24, 30초 시험본 「소리가 사라진다면」 — bgm.mjs·sfx.mjs는 고치지 않고 여기서 한다).
// - 인트로·징글은 2026-11-25 안 쓰기로 해서 뺐다 (예전 것은 contents/_test/longform-kit/finish.mjs).
// - <body data-bgm-cues="0 밝게, 24 장난, …">가 있으면 bgm.mjs 곡 대신 장면 분위기마다 무료 음원을 바꿔 깐다 (2026-11-25 · 사람: "무료 음원 쓰자").
//   음원·목록·스팅은 tools/longform/music.mjs 맨 위 주석. 나레이션 밑에서는 목소리 대역을 4dB 파고 덜 깊고 느리게 줄인다
//   (말할 때 나레이션보다 약 20dB 아래, 쉼에서 7dB쯤 올라옴 — 2026-11-25 시험본 B에서 잰 값). 큐가 없는 페이지는 예전 그대로다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeMusic, musicSeed } from '../motion/bgm.mjs';
import { cueMusic, parseCues, wav16 } from './music.mjs';

const SR = 44100, MUSIC = 0.32; // 음악 크기 — bgm.mjs VOLUME과 같다
const CUE_DUCK = 'sidechaincompress=threshold=0.05:ratio=3:attack=60:release=900', CUE_EQ = 'equalizer=f=2200:t=q:w=1.1:g=-4'; // 큐 곡 (음원)
const ff = args => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };

function finish(page) {
  const html = fs.readFileSync(page, 'utf8'), attr = k => html.match(new RegExp(`<body[^>]*\\sdata-${k}="([^"]*)"`))?.[1];
  const off = (attr('music-off') || '').split(',').filter(Boolean).map(s => s.split('-').map(Number));
  const D = Number(attr('duration')), outro = attr('outro') != null;
  const dir = path.dirname(page), name = path.basename(page).replace(/\.html?$/i, ''), video = path.join(dir, `${name}.mp4`), voice = path.join(dir, 'voice', 'track.wav'), seed = musicSeed(page, html);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hikary-finish-'));
  try {
    const inputs = ['-i', video], parts = [], mix = ['[0:a]'];
    // 크기 줄이기: 아웃트로면 마지막 5초 동안 0으로 · data-music-off 구간은 끊음
    const g = t => {
      let v = 1;
      if (outro) v *= Math.max(0, Math.min(1, (D - t) / 5));
      for (const [a, b] of off) v *= t < a ? 1 : t < a + 0.03 ? (a + 0.03 - t) / 0.03 : t < b ? 0 : Math.min(1, (t - b) / 0.4);
      return v;
    };
    const cues = parseCues(attr('bgm-cues'));
    if (cues.length) { // 장면 분위기마다 무료 음원 (music.mjs)
      const musicDir = path.resolve(dir, attr('bgm-dir') || '../_music');
      const { music: [L, R], stings, log } = cueMusic({ cues, stings: parseCues(attr('bgm-stings')), seconds: D, dir: musicDir });
      for (let i = 0; i < L.length; i++) { const k = g(i / SR); L[i] *= k; R[i] *= k; }
      fs.writeFileSync(path.join(tmp, 'music.wav'), wav16([L, R]));
      fs.writeFileSync(path.join(tmp, 'stings.wav'), wav16(stings));
      inputs.push('-i', path.join(tmp, 'music.wav'));
      const m = inputs.length / 2 - 1;
      if (fs.existsSync(voice)) { inputs.push('-i', voice); parts.push(`[${m}:a]${CUE_EQ}[m0]`, `[m0][${inputs.length / 2 - 1}:a]${CUE_DUCK}[m]`); }
      else parts.push(`[${m}:a]${CUE_EQ}[m]`);
      inputs.push('-i', path.join(tmp, 'stings.wav'));
      parts.push(`[${inputs.length / 2 - 1}:a]anull[s]`);
      mix.push('[m]', '[s]');
      console.log(`배경음악: 음원 ${cues.length}구간${outro ? ' · 끝 5초 줄임' : ''}${off.map(([a, b]) => ` · ${a}~${b}초 끊음`).join('')}\n  ${log.join('\n  ')}`);
    } else if (seed) {
      const { wav: w, picks } = makeMusic(seed, D), n = (w.length - 44) / 4;
      for (let i = 0; i < n; i++) { const k = g(i / SR); for (const o of [44 + i * 4, 46 + i * 4]) w.writeInt16LE(Math.round(w.readInt16LE(o) * k), o); }
      fs.writeFileSync(path.join(tmp, 'music.wav'), w);
      inputs.push('-i', path.join(tmp, 'music.wav'));
      const m = inputs.length / 2 - 1;
      if (fs.existsSync(voice)) { inputs.push('-i', voice); parts.push(`[${m}:a]volume=${MUSIC}[m0]`, `[m0][${inputs.length / 2 - 1}:a]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=400[m]`); }
      else parts.push(`[${m}:a]volume=${MUSIC}[m]`);
      mix.push('[m]');
      console.log(`배경음악: ${seed} (${picks.key}키 ${picks.bpm}bpm)${outro ? ' · 끝 5초 줄임' : ''}${off.map(([a, b]) => ` · ${a}~${b}초 끊음`).join('')}`);
    }
    parts.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95,apad[a]`);
    const out = path.join(dir, `${name}-bgm.mp4`);
    ff([...inputs, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
    console.log(out);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2]) finish(path.resolve(process.argv[2]));
  else throw new Error('사용: node tools/longform/finish.mjs <motion.html>');
}
