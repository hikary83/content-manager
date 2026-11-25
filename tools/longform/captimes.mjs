// 자막 조각 시각 읽기 (모션팀, 2026-11-24): 나레이션 음성(<폴더>/voice/track.wav — 녹화 도구가 영상 시간축에 놓은 것)에서
// 줄마다 말이 실제로 시작·끝나는 때와 줄 안의 쉼(쉼표 자리)을 찾아 <폴더>/captimes.js에 적는다.
// kit.js capOf()가 이걸 읽어, 한 줄을 짧은 조각으로 나눠 보일 때 조각이 바뀌는 때를 쉼에 맞춘다 (없으면 음절 수 비례).
//   node tools/longform/captimes.mjs <motion.html>   — 녹화를 한 번 한 뒤 (track.wav가 있어야 한다)
//   페이지에 <script src="captimes.js"></script>를 kit.js보다 먼저 넣는다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseNarration } from '../motion/voice.mjs';

const page = path.resolve(process.argv[2] || '');
const dir = path.dirname(page), html = fs.readFileSync(page, 'utf8');
const seconds = Number(html.match(/<body[^>]*\sdata-duration="([^"]*)"/)?.[1]);
const lines = parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8'), seconds);
const track = path.join(dir, 'voice', 'track.wav');
if (!fs.existsSync(track)) throw new Error('voice/track.wav가 없어요 — 녹화를 한 번 먼저 해요.');
// 조용한 곳: −35dB 아래가 0.12초 넘게
const r = spawnSync('ffmpeg', ['-v', 'info', '-i', track, '-af', 'silencedetect=noise=-35dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' });
const quiet = [];
for (const m of r.stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) quiet.push([+m[1], +m[2]]);
const sound = []; let t = 0;
for (const [a, b] of quiet) { if (a > t) sound.push([t, a]); t = b; }
if (t < seconds) sound.push([t, seconds]);
const out = {};
lines.forEach((line, i) => {
  const top = Math.min(line.end + 0.4, lines[i + 1]?.at ?? seconds); // 다음 줄이 시작하기 전까지만
  const mine = sound.filter(([a, b]) => b > line.at && a < top).map(([a, b]) => [Math.max(a, line.at), Math.min(b, top)]);
  if (!mine.length) return;
  const r2 = n => +n.toFixed(2);
  out[line.text] = { at: line.at, end: line.end, speech: [r2(mine[0][0]), r2(mine.at(-1)[1])], pauses: mine.slice(1).map((s, i) => [r2(mine[i][1]), r2(s[0])]) };
});
fs.writeFileSync(path.join(dir, 'captimes.js'), `// captimes.mjs가 만든 것 — 나레이션 줄마다 말이 실제로 나는 때 [시작, 끝]과 줄 안의 쉼 [[쉼 시작, 쉼 끝]…] (영상 시각, 초)\nwindow.CAPTIMES = ${JSON.stringify(out, null, 1)};\n`);
console.log(Object.entries(out).map(([k, v]) => `${v.speech[0]}~${v.speech[1]}  쉼 ${v.pauses.map(p => p.join('~')).join(' ') || '-'}  ${k}`).join('\n'));
