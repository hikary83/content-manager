// Records an animated HTML page to a 1080×1920 MP4 next to it (motion.html → motion.mp4 with sound effects,
// and motion-bgm.mp4 with background music too — see sfx.mjs and bgm.mjs).
//   node tools/motion/record.mjs contents/<folder>/motion.html
// The page sets its length with <body data-duration="18">. Every CSS animation is paused and seeked to each
// frame's time before the screenshot, so the video is identical however fast or slow this PC is.
// Uses the installed Chrome (or Edge, or CHROME=<path>) over a DevTools pipe (no port is opened) and ffmpeg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { run, probe } from '../../scripts/reel/lib.mjs';
import { parseCues, addSound } from './sfx.mjs';
import { musicSeed, addMusic, describe } from './bgm.mjs';

const W = 1080, H = 1920, FPS = 30;
const file = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(file)) throw new Error('사용: node tools/motion/record.mjs <motion.html>');
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find(candidate => candidate && fs.existsSync(candidate));
if (!chrome) throw new Error('Chrome 또는 Edge를 찾지 못했어요. CHROME 환경 변수로 경로를 알려주세요.');
run('ffmpeg', ['-version']);
const out = file.replace(/\.html?$/i, '') + '.mp4';

const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  `--user-data-dir=${path.join(os.tmpdir(), 'hikary-motion-record')}`, '--remote-debugging-pipe', `--window-size=${W},${H}`, '--force-device-scale-factor=1'],
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
  const loaded = nextEvent('Page.loadEventFired');
  await page('Page.navigate', { url: pathToFileURL(file).href });
  await loaded;
  const seconds = await evaluate('document.fonts.ready.then(() => Number(document.body.dataset.duration))');
  if (!(seconds >= 1 && seconds <= 60)) throw new Error('<body data-duration="18">처럼 1~60초 길이를 적어주세요.');
  const frames = Math.round(seconds * FPS);
  const cues = parseCues(await evaluate('document.body.dataset.sfx || ""')); // checked before the long recording

  encoder = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
  let log = '';
  encoder.stderr.on('data', data => { log += data; });
  encoder.stdin.on('error', () => {}); // a dead encoder is reported by `encoded` below
  const encoded = new Promise((resolve, reject) => encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg 실패: ${log.slice(-1500)}`))));

  for (let i = 0; i < frames; i++) {
    await evaluate(`document.getAnimations().forEach(a => { a.pause(); a.currentTime = ${i * 1000 / FPS}; });
      new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const { data } = await page('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
    if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await Promise.race([new Promise(r => encoder.stdin.once('drain', r)), encoded]);
    if (i % FPS === 0) console.log(`${i / FPS} / ${seconds}초`);
  }
  encoder.stdin.end();
  await encoded;
  const info = probe(out), video = info.streams.find(s => s.codec_type === 'video');
  if (video?.width !== W || video?.height !== H || Math.abs(Number(info.format.duration) - frames / FPS) > 0.1) throw new Error('출력 영상 길이·해상도 검증 실패');
  addSound(out, cues);
  console.log(`완료: ${out} (${frames / FPS}초, 효과음 ${cues.length}개)`);
  const seed = musicSeed(file, fs.readFileSync(file, 'utf8'));
  if (seed) { const music = addMusic(out, seed); console.log(`배경음악 버전: ${music.out} (${describe(music.picks)})`); }
} finally {
  encoder?.kill();
  browser.kill();
}
