// Sound effects for motion videos. Every sound is synthesized here with ffmpeg, so the file holds no third-party audio.
// Cues live on the page: <body data-sfx="0.12 pop .5, 1.9 whoosh .35, …"> — "seconds sound [volume, default .6]".
// record.mjs adds them after recording. To re-mix an existing video without recording again:
//   node tools/motion/sfx.mjs contents/<folder>/motion.html   (rewrites motion.mp4; only its video stream is kept,
//   then rebuilds motion-bgm.mp4 so it gets the new sound effects too). Background music itself is in bgm.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../scripts/reel/lib.mjs';
import { musicSeed, addMusic } from './bgm.mjs';

export const sounds = {
  whoosh: "anoisesrc=d=0.7:c=pink:a=0.9,bandpass=f=900:width_type=h:w=1600,afade=t=in:d=0.35:curve=qsin,afade=t=out:st=0.35:d=0.35:curve=qsin",
  swoosh: "anoisesrc=d=1.0:c=pink:a=0.9,bandpass=f=700:width_type=h:w=1200,afade=t=in:d=0.55:curve=qsin,afade=t=out:st=0.55:d=0.45",
  pop: "aevalsrc='0.8*sin(2*PI*(380+900*exp(-t*45))*t)*exp(-t*28)':d=0.18",
  click: "aevalsrc='0.6*(random(0)*2-1)*exp(-t*260)':d=0.04,highpass=f=1500",
  tick: "aevalsrc='0.5*sin(2*PI*2100*t)*exp(-t*90)':d=0.05",
  thud: "aevalsrc='0.9*sin(2*PI*(55+140*exp(-t*22))*t)*exp(-t*11)':d=0.35",
  ding: "aevalsrc='0.45*sin(2*PI*1320*t)*exp(-t*5)+0.25*sin(2*PI*1980*t)*exp(-t*7)':d=0.9",
  notify: "aevalsrc='0.4*sin(2*PI*988*t)*exp(-t*14)*lt(t,0.14)+0.4*sin(2*PI*1319*(t-0.14))*exp(-(t-0.14)*9)*gte(t,0.14)':d=0.6",
};

export function parseCues(text = '') {
  return text.split(',').map(item => item.trim()).filter(Boolean).map(item => {
    const [time, name, volume = '.6'] = item.split(/\s+/);
    if (!Object.hasOwn(sounds, name) || !(Number(time) >= 0) || !(Number(volume) > 0)) {
      throw new Error(`효과음 「${item}」을 읽지 못했어요. 「초 소리 [크기]」로 적고, 소리는 ${Object.keys(sounds).join(' · ')} 중에서 골라요.`);
    }
    return [Number(time), name, Number(volume)];
  });
}

export function addSound(video, cues) {
  if (!cues.length) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikary-sfx-'));
  try {
    for (const name of new Set(cues.map(([, name]) => name))) {
      run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', sounds[name], '-ar', '44100', '-ac', '1', path.join(dir, `${name}.wav`)]);
    }
    const chains = cues.map(([time, , volume], i) => `[${i + 1}]adelay=${Math.round(time * 1000)}:all=1,volume=${volume}[a${i}]`);
    const mix = `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,alimiter=limit=0.9,apad[aout]`;
    const mixed = path.join(dir, 'mixed.mp4');
    run('ffmpeg', ['-v', 'error', '-y', '-i', video, ...cues.flatMap(([, name]) => ['-i', path.join(dir, `${name}.wav`)]),
      '-filter_complex', [...chains, mix].join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
      '-shortest', '-movflags', '+faststart', mixed]);
    fs.copyFileSync(mixed, video);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const page = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(page)) throw new Error('사용: node tools/motion/sfx.mjs <motion.html>');
  const video = page.replace(/\.html?$/i, '') + '.mp4';
  if (!fs.existsSync(video)) throw new Error(`${path.basename(video)}이 없어요. 먼저 record.mjs로 영상을 만들어요.`);
  const html = fs.readFileSync(page, 'utf8');
  const cues = parseCues(html.match(/<body[^>]*\sdata-sfx="([^"]*)"/)?.[1]);
  if (!cues.length) throw new Error('<body data-sfx="0.12 pop .5, …">처럼 효과음 목록을 적어주세요.');
  addSound(video, cues);
  console.log(`효과음 ${cues.length}개를 넣었어요: ${video}`);
  const seed = musicSeed(page, html);
  if (seed) console.log(`배경음악 버전도 다시 만들었어요: ${addMusic(video, seed).out}`);
}
