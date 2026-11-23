// Records an animated HTML page to an MP4 next to it (motion.html → motion.mp4 with sound effects and
// the narration in narration.md, and motion-bgm.mp4 with background music too — see sfx.mjs, voice.mjs, bgm.mjs).
//   node tools/motion/record.mjs contents/<folder>/motion.html
// The page sets its length with <body data-duration="18"> (up to 1200 s = 20 min) and its size with
// <body data-size="1920x1080"> (no data-size = 1080×1920, the vertical shorts; same attribute as carousel/render.mjs).
// Every CSS animation is paused and seeked to each frame's time before the screenshot, so the video is identical
// however fast or slow this PC is.
// The video is recorded a minute at a time into <name>.parts/ and joined at the end. If a long recording stops, run the
// same command again: finished minutes are kept and it carries on (the parts are dropped when the page changes).
// 2.5D photos (<img data-depth="in">, depth.mjs) are made into frames first and swapped in before each screenshot.
// Uses the installed Chrome (or Edge, or CHROME=<path>) over a DevTools pipe (no port is opened) and ffmpeg.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { run, probe } from '../../scripts/reel/lib.mjs';
import { parseCues, addSound } from './sfx.mjs';
import { musicSeed, addMusic, describe } from './bgm.mjs';
import { voiceTrack } from './voice.mjs';
import { DEPTH_QUERY, depthScenes, swapFrames } from './depth.mjs';

const FPS = 30, PART = 60 * FPS, MAX_SECONDS = 1200; // a part file per minute of video
const file = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(file)) throw new Error('사용: node tools/motion/record.mjs <motion.html>');
const html = fs.readFileSync(file, 'utf8');
const [W, H] = (html.match(/<body[^>]*\sdata-size="(\d+)x(\d+)"/)?.slice(1) || [1080, 1920]).map(Number);
if (W % 2 || H % 2 || Math.min(W, H) < 240 || Math.max(W, H) > 3840) throw new Error(`data-size="${W}x${H}"는 쓸 수 없어요. 「1920x1080」처럼 짝수로, 240~3840 안에서 적어요.`);
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find(candidate => candidate && fs.existsSync(candidate));
if (!chrome) throw new Error('Chrome 또는 Edge를 찾지 못했어요. CHROME 환경 변수로 경로를 알려주세요.');
run('ffmpeg', ['-version']);
const out = file.replace(/\.html?$/i, '') + '.mp4';
// Narration first: reading new lines takes minutes, and a page left running that long finishes its scenes, which then
// drop out of getAnimations() and record blank. This also stops a bad script or a missing voice tool before Chrome starts.
const voice = voiceTrack(file);

// A fresh profile each run (2026-11-11): two sessions recording at once used to share one folder, and the second Chrome failed.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hikary-motion-record-'));
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--user-data-dir=${profile}`, '--remote-debugging-pipe', `--window-size=${W},${H}`, '--force-device-scale-factor=1'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const calls = new Map(), listeners = [];
let lastId = 0, buffer = '';
const failAll = error => { for (const call of calls.values()) call.reject(error); calls.clear(); };
browser.on('error', failAll);
browser.on('exit', code => failAll(new Error(`Chrome이 종료됐어요 (${code})`)));
browser.stdio[4].setEncoding('utf8');
browser.stdio[4].on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.method) {
      const index = listeners.findIndex(listener => listener.method === message.method);
      if (index >= 0) listeners.splice(index, 1)[0].resolve(message.params);
      continue;
    }
    const call = calls.get(message.id);
    if (!call) continue;
    calls.delete(message.id);
    clearTimeout(call.timer);
    message.error ? call.reject(new Error(`${call.method}: ${message.error.message}`)) : call.resolve(message.result);
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++lastId;
    const timer = setTimeout(() => { calls.delete(id); reject(new Error(`${method}: Chrome 응답이 없어요`)); }, 30000);
    calls.set(id, { method, resolve, reject, timer });
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
  });
}
const nextEvent = method => new Promise(resolve => listeners.push({ method, resolve }));

let encoder;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  await page('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await page('Page.enable');
  const open = async () => {
    const loaded = nextEvent('Page.loadEventFired');
    await page('Page.navigate', { url: pathToFileURL(file).href });
    await loaded;
    return evaluate('document.fonts.ready.then(() => Number(document.body.dataset.duration))');
  };
  const seconds = await open();
  if (!(seconds >= 1 && seconds <= MAX_SECONDS)) throw new Error(`<body data-duration="18">처럼 1~${MAX_SECONDS}초 길이를 적어주세요.`);
  // 2.5D photos (<img data-depth>, see depth.mjs): frames are made first, then swapped in before each screenshot.
  // Making them takes a while, so the page is opened again afterwards (same reason as the narration note above).
  let depth = [];
  const marked = await evaluate(DEPTH_QUERY);
  if (marked.length) {
    const { jobs, rendered } = depthScenes(file, marked, FPS);
    if (rendered) { await open(); await evaluate(DEPTH_QUERY); }
    depth = jobs;
  }
  const frames = Math.round(seconds * FPS);
  const cues = parseCues(await evaluate('document.body.dataset.sfx || ""')); // checked before the long recording

  // Parts belong to this exact page: another page text, size or length starts over.
  // ponytail: photos swapped under the same file names are not noticed — delete <name>.parts/ by hand after that.
  const parts = out.replace(/\.mp4$/i, '') + '.parts', stamp = path.join(parts, 'page.sha1');
  const key = crypto.createHash('sha1').update(html).update(`${W}x${H}@${FPS}`).digest('hex');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') !== key) fs.rmSync(parts, { recursive: true, force: true });
  fs.mkdirSync(parts, { recursive: true });
  fs.writeFileSync(stamp, key);
  const every = seconds > 60 ? 30 * FPS : FPS, started = Date.now();
  const names = [];
  for (let from = 0; from < frames; from += PART) {
    const name = path.join(parts, `${String(from / PART).padStart(3, '0')}.mp4`);
    names.push(name);
    if (fs.existsSync(name)) { console.log(`${from / FPS}초부터 1분: 지난번에 찍어 둔 것을 써요`); continue; }
    const temp = name.replace(/\.mp4$/, '.tmp.mp4');
    encoder = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', temp], { stdio: ['pipe', 'ignore', 'pipe'] });
    let log = '';
    encoder.stderr.on('data', data => { log += data; });
    encoder.stdin.on('error', () => {}); // a dead encoder is reported by `encoded` below
    const encoded = new Promise((resolve, reject) => encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg 실패: ${log.slice(-1500)}`))));
    for (let i = from; i < Math.min(frames, from + PART); i++) {
      if (depth.length) await evaluate(swapFrames(depth, i, FPS));
      await evaluate(`document.getAnimations().forEach(a => { a.pause(); a.currentTime = ${i * 1000 / FPS}; });
        new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      const { data } = await page('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
      if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await Promise.race([new Promise(r => encoder.stdin.once('drain', r)), encoded]);
      if (i % every === 0) console.log(`${i / FPS} / ${seconds}초${i ? ` (${Math.round((Date.now() - started) / 1000)}초 지남)` : ''}`);
    }
    encoder.stdin.end();
    await encoded;
    fs.renameSync(temp, name); // only a finished minute gets its real name, so a stop never leaves half a part to reuse
  }
  const list = path.join(parts, 'list.txt');
  fs.writeFileSync(list, names.map(name => `file '${name.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  const info = probe(out), video = info.streams.find(s => s.codec_type === 'video');
  if (video?.width !== W || video?.height !== H || Math.abs(Number(info.format.duration) - frames / FPS) > 0.1) throw new Error('출력 영상 길이·해상도 검증 실패');
  fs.rmSync(parts, { recursive: true, force: true });
  addSound(out, cues, voice);
  console.log(`완료: ${out} (${frames / FPS}초, 효과음 ${cues.length}개${voice ? ', 나레이션' : ''})`);
  const seed = musicSeed(file, html);
  if (seed) { const music = addMusic(out, seed, voice); console.log(`배경음악 버전: ${music.out} (${describe(music.picks)})`); }
} finally {
  encoder?.kill();
  browser.kill();
  await new Promise(resolve => { if (browser.exitCode !== null || browser.signalCode) return resolve(); browser.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a leftover temp folder is harmless */ }
}
