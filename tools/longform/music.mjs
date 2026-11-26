// 롱폼 배경음악 — 장면 분위기마다 무료 음원을 바꿔 깐다 (모션팀, 2026-11-25 · 사람: "무료 음원 쓰자").
// finish.mjs가 부른다: <body data-bgm-cues="…">가 있는 페이지만 이 길로 간다. 없으면 예전 그대로 bgm.mjs 곡 (쇼츠·예전 롱폼 시험본).
//
//   <body data-bgm-cues="0 밝게, 24 장난, 90 설명, 219.4 끊김, 225.4 반전, …" data-bgm-stings="159.8 쿵, 187.5 짠, …">
//
// 음원은 저장소 밖 contents/longform/_music/ (남의 음원이라 공개 저장소에 넣지 않는다 — 편 폴더 옆, _cast와 같은 자리).
// 다른 자리면 <body data-bgm-dir="../_music">처럼 페이지 폴더에서 본 자리. 목록은 그 폴더의 tracks.json:
//   { "밝게": [{ "file": "밝게-1.mp3", "title": "곡 이름", "artist": "아티스트", "license": "저작자 표시 필요 없음",
//              "source": "YouTube 오디오 보관함", "from": 0, "key": 60 }], "장난": [ … ], … }
//   - 분위기 이름은 큐에 쓰는 말 그대로 (밝게 · 장난 · 설명 · 긴장 · 반전 · 따뜻하게 · 공연 …). '끊김'은 곡 없이 소리 없음.
//   - from: 곡의 몇 초부터 쓸지 (앞 전주를 건너뛸 때) · key: 으뜸음 MIDI (스팅을 맞춘다, 기본 60 = 다장조)
//   - gain: 그 곡만 TARGET에서 더할 dB (기본 0). 나레이션 없이 음악이 주인공인 구간용 — 공연 +8 (2026-11-25 기획팀, −23.9 → 약 −16 LUFS)
//   - 같은 분위기가 다시 나오면 다음 곡으로 넘어가고, 같은 곡을 다시 쓰면 지난번에 멈춘 데서 이어 간다 (전주를 되풀이하지 않게).
//   - 특정 구간에 특정 곡 (예: 공연 곡): tracks.json에 그 곡 하나만 든 분위기 낱말을 만들고(「공연」) 그 구간 큐에 그 낱말을 쓴다
//     → "321.2 공연, 345.5 따뜻하게". 곡의 어디부터 쓸지는 from. 나레이션이 없는 구간도 곡 크기는 같으니(줄이기만 없다) 크게 들리게 하려면 gain.
//   - 곡이 하나뿐인 분위기를 바로 이어 두 번 적지 않는다 ("20.6 장난, 55.2 장난") — 같은 곡이 1초 어긋나 겹쳐 울린다.
//   - 지금 곡 (2026-11-25 사람 승인 "좋아" · YouTube 오디오 보관함 「저작자 표시 필요 없음」): 밝게 Science Montage · 장난 Snack Time ·
//     설명 Ghibli Station · 긴장 Running · 반전 Taking Flight (from 4 — 앞 4초 전주가 작다) · 따뜻하게 Dusty Road Magic · 공연 We Got This (gain 8).
//     _music/은 git 밖이라 다른 PC에는 폴더째 복사한다.
// 큐를 쓰는 페이지는 data-music-off가 필요 없다 — '끊김' 큐가 한다 (둘 다 있으면 끊김 뒤 0.4초 들어오기가 두 번 걸린다).
// 구간: 그 분위기 곡을 큐 시각에 맞춰 깐다. 구간이 곡보다 길면 처음부터 다시 이어 붙이고(1.5초 겹쳐), 이웃 구간과는 1초 겹쳐 넘긴다.
//   '끊김' 앞은 0.03초에 뚝 끊고(소리 없는 세상), 끊김 뒤 구간은 0.4초에 걸쳐 들어온다.
// 크기: 곡마다 −23 LUFS로 맞춘다 (나레이션 −13보다 10dB 아래 — 시험본 B에서 정한 값). 나레이션 밑 줄이기는 finish.mjs.
// 스팅은 직접 만든 소리 그대로 (효과음은 직접 만든다는 규칙): 쿵 · 짠 · 어이쿠 · 반전 — 그때 곡의 key에 맞춘다. 나레이션에 줄이지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const SR = 44100, TARGET = -23, XF = 1.0, LOOP_XF = 1.5, CUT = 0.03, IN_AFTER_CUT = 0.4;

export const parseCues = text => (text || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const [t, ...w] = s.split(/\s+/), mood = w.join(' ');
  if (!(Number(t) >= 0) || !mood) throw new Error(`data-bgm-cues 「${s}」를 읽지 못했어요. 「시각 분위기」로 적어요 (예: 24 장난).`);
  return [Number(t), mood];
}).sort((a, b) => a[0] - b[0]);

const loudness = file => {
  const m = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/I:\s*(-?[\d.]+) LUFS/);
  if (!m) throw new Error(`음원 크기를 재지 못했어요: ${file}`);
  return +m[1];
};
const decode = (file, from = 0) => {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); // 복사 — 버퍼 시작이 4바이트 줄에 안 맞을 수 있다
};

// 큐 · 음원 목록 · 길이 → { music: Float32Array 두 줄 (L, R), stings: 같은 꼴, log: [구간 설명] }
export function cueMusic({ cues, stings = [], seconds, dir }) {
  const listFile = path.join(dir, 'tracks.json');
  if (!fs.existsSync(listFile)) throw new Error(`음원 목록이 없어요: ${listFile} (tools/longform/music.mjs 맨 위 주석)`);
  const lib = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const N = Math.floor(seconds * SR), L = new Float32Array(N), R = new Float32Array(N), SL = new Float32Array(N), SRr = new Float32Array(N);
  const cache = {}, cursor = {}, used = {}, log = [];
  const track = t => { // 디코딩 · 크기 맞춤은 곡마다 한 번
    const file = path.join(dir, t.file);
    if (!cache[file]) { if (!fs.existsSync(file)) throw new Error(`음원 파일이 없어요: ${file}`); const pcm = decode(file, t.from || 0), g = 10 ** ((TARGET + (t.gain || 0) - loudness(file)) / 20); for (let i = 0; i < pcm.length; i++) pcm[i] *= g; cache[file] = pcm; }
    return { file, pcm: cache[file] };
  };
  cues.forEach(([t0, mood], i) => {
    const t1 = i + 1 < cues.length ? cues[i + 1][0] : seconds, prev = cues[i - 1]?.[1], next = cues[i + 1]?.[1];
    if (mood === '끊김' || t1 <= t0) return;
    const list = lib[mood];
    if (!list?.length) throw new Error(`tracks.json에 「${mood}」 곡이 없어요.`);
    const k = used[mood] = (used[mood] ?? -1) + 1, meta = list[k % list.length], { file, pcm } = track(meta), len = pcm.length / 2;
    // 들어오는 · 나가는 모양: 이웃이 곡이면 1초 겹침(앞뒤 0.5초씩 넘어감), 끊김이면 0.4초에 들어오고 0.03초에 끊김, 영상 처음은 바로
    const fadeIn = i === 0 && t0 === 0 ? 0 : prev === '끊김' ? IN_AFTER_CUT : XF, startAt = prev === '끊김' || fadeIn === 0 ? t0 : t0 - XF / 2;
    const fadeOut = next === '끊김' ? CUT : next ? XF : 0, endAt = next === '끊김' || !next ? t1 : t1 + XF / 2;
    const s0 = Math.max(0, Math.round(startAt * SR)), s1 = Math.min(N, Math.round(endAt * SR));
    let p = cursor[file] || 0; // 이 곡에서 지난번에 멈춘 자리 (샘플)
    for (let s = s0; s < s1; s++) {
      if (p >= len) p -= len - Math.round(LOOP_XF * SR); // 곡 끝에 닿으면 처음으로 (겹친 길이만큼 앞에서)
      let l = pcm[p * 2], r = pcm[p * 2 + 1];
      const tail = len - p; // 곡 끝 1.5초는 처음과 겹쳐 넘긴다
      if (tail < LOOP_XF * SR && len > LOOP_XF * SR * 2) { const q = Math.round(LOOP_XF * SR) - tail, w = q / (LOOP_XF * SR); l = l * (1 - w) + pcm[q * 2] * w; r = r * (1 - w) + pcm[q * 2 + 1] * w; }
      // 겹쳐 넘길 때는 같은 힘 곡선(사인) — 직선이면 겹친 가운데가 3dB 넘게 꺼진다. 끊김(0.03초)은 직선
      const ep = (x, d) => d === CUT ? x : Math.sin(Math.max(0, Math.min(1, x)) * Math.PI / 2);
      const t = s / SR, gin = fadeIn ? ep((t - startAt) / fadeIn, fadeIn) : 1, gout = fadeOut ? ep((endAt - t) / fadeOut, fadeOut) : 1, g = Math.max(0, Math.min(gin, gout, 1));
      L[s] += l * g; R[s] += r * g; p++;
    }
    cursor[file] = p;
    log.push(`${t0}~${t1}초 ${mood}: ${meta.title || meta.file}${meta.artist ? ` (${meta.artist})` : ''}`);
  });
  // 스팅 — 그때 깔린 곡의 key에 맞춘다
  const keyAt = t => { const c = [...cues].reverse().find(([t0]) => t0 <= t); const list = c && lib[c[1]]; return list?.[0]?.key ?? 60; };
  for (const [t, type] of stings) sting({ SL, SR: SRr, N }, t, type, keyAt(t));
  return { music: [L, R], stings: [SL, SRr], log };
}

// ── 스팅 (직접 만든 소리) ──
const sin = (f, t) => Math.sin(2 * Math.PI * f * t), hz = m => 440 * 2 ** ((m - 69) / 12);
const INST = {
  marimba: f => t => (sin(f, t) + 0.35 * sin(2 * f, t) * Math.exp(-t * 12)) * Math.exp(-t * 6) * Math.min(1, t / 0.004),
  bell: f => t => (sin(f, t) + 0.4 * sin(2.76 * f, t) * Math.exp(-t * 7) + 0.15 * sin(5.4 * f, t) * Math.exp(-t * 12)) * Math.exp(-t * 3) * Math.min(1, t / 0.003),
  pizz: f => t => [1, 2, 3, 4].reduce((s, k) => s + sin(k * f, t) / (k * k) * Math.exp(-t * (14 + k * 8)), 0) * Math.min(1, t / 0.002),
  lead: f => t => (sin(f, t) + 0.33 * sin(3 * f, t) + 0.12 * sin(5 * f, t)) * Math.min(1, t / 0.02) * Math.exp(-t * 2.2),
};
const tom = t => Math.sin(2 * Math.PI * (90 * t + 60 / 12 * (1 - Math.exp(-12 * t)))) * Math.exp(-t * 7);
const wood = t => (sin(880, t) + 0.6 * sin(1320, t)) * Math.exp(-t * 45);
const kick = t => Math.sin(2 * Math.PI * (48 * t + 70 / 30 * (1 - Math.exp(-30 * t)))) * Math.exp(-t * 9);
const STING_GAIN = 0.5; // 곡(−23 LUFS) 위에 또렷하게
function sting(mix, t, type, key) {
  let seed = Math.round(t * 1000) + 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // 같은 자리면 같은 소리
  const put = (start, len, gen, gain, pan = 0) => { const s0 = Math.floor(start * SR);
    for (let i = Math.max(0, -s0); i < len * SR && s0 + i < mix.N; i++) { const v = gen(i / SR) * gain * STING_GAIN; mix.SL[s0 + i] += v * Math.cos((pan + 1) * Math.PI / 4); mix.SR[s0 + i] += v * Math.sin((pan + 1) * Math.PI / 4); } };
  const k = key + 12;
  if (type === '쿵') { put(t, 0.6, tom, 0.5); put(t + 0.02, 0.3, wood, 0.25, 0.3); put(t + 0.12, 0.4, INST.pizz(hz(k - 5)), 0.3, -0.2); }
  else if (type === '짠') { [k - 5, k - 1].forEach((m, i) => put(t + i * 0.07, 0.3, INST.marimba(hz(m)), 0.3, -0.3)); [0, 4, 7, 12].forEach(x => put(t + 0.16, 1.4, INST.bell(hz(k + x)), 0.22, (x - 6) / 12)); }
  else if (type === '어이쿠') [0, -1, -2, -4].forEach((x, i) => put(t + i * 0.16, i === 3 ? 0.8 : 0.3, INST.lead(hz(k + 7 + x)), 0.22, 0));
  else if (type === '반전') {
    put(t - 0.7, 0.75, s => (rnd() * 2 - 1) * (s / 0.7) ** 2 * 0.6, 0.25); // 쉬익 오르는 소리
    [0, 4, 7, 12, 16].forEach(x => put(t, 1.8, INST.bell(hz(k + 2 + x)), 0.2, (x - 8) / 16)); put(t, 0.4, kick, 0.5);
  } else throw new Error(`스팅 「${type}」은 없어요. 쿵 · 짠 · 어이쿠 · 반전 중에서 골라요.`);
}

// Float32 두 줄 → 16비트 스테레오 WAV (넘치면 자른다)
export function wav16([A, B]) {
  const N = A.length, b = Buffer.alloc(44 + N * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + N * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 4, 40);
  const c = v => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < N; i++) { b.writeInt16LE(c(A[i]), 44 + i * 4); b.writeInt16LE(c(B[i]), 46 + i * 4); }
  return b;
}
