// Registers content made in Claude to the HIKARY ledger through the same Apps Script API the web uses.
//   node tools/register.mjs list [out.json]          print (or save) every registered row
//   node tools/register.mjs save <entry.json>        create or update one row, then write id/revision back into the file
//   node tools/register.mjs link <coupang url>       make the Partners link for a plain Coupang address (spends 1 of 20 hourly API calls)
//   node tools/register.mjs requests                 v2.5.0: requests left by 「루미한테 요청하기」 that are not done yet
//   node tools/register.mjs request <id> <상태>       set a request to 대기 · 진행 · 완료
//   node tools/register.mjs video <entry.json> [mp4]   v2.6.0: put the video for 「게시」 on Cloudinary (default motion-bgm.mp4 beside entry.json)
//                                                      and write its address to the row. Again later = replace it (「영상 다시 올려줘」).
// Run "save" only after the owner confirms the content (「컨펌」, CLAUDE.md §2). It writes to the real sheet.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const apiUrl = fs.readFileSync(new URL('../docs/js/config.js', import.meta.url), 'utf8').match(/apiUrl: '([^']+)'/)[1];

export async function request(action, payload = {}) {
  // Apps Script answers POST with a redirect to a GET result page; fetch follows it like the browser does.
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload, requestId: randomUUID() }) });
  let result;
  try { result = await response.json(); } catch { throw new Error(`서버 응답을 읽지 못했어요 (${response.status}).`); }
  if (!result.ok) throw new Error(result.error || '처리에 실패했어요.');
  return result.data;
}

// v2.3.0: "inpockImage": "inpock.png" (a file next to entry.json) goes to the ledger as a ≤400px JPEG data URL,
// because a sheet cell holds at most 50,000 characters. Lower quality steps until it fits.
export function thumbnail(file) {
  for (const quality of [4, 7, 10, 14, 20]) {
    const jpeg = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=400:400:force_original_aspect_ratio=decrease', '-q:v', String(quality), '-frames:v', '1', '-f', 'mjpeg', '-'], { maxBuffer: 1 << 24 });
    const url = 'data:image/jpeg;base64,' + jpeg.toString('base64');
    if (url.length <= 45000) return url;
  }
  throw new Error('인포크 이미지를 45,000자 안으로 줄이지 못했어요.');
}

export async function save(file, send = request) {
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
  entry.id ||= randomUUID();
  // Persist the id before sending: if the reply is lost, a retry with the same id cannot create a second row.
  fs.writeFileSync(file, JSON.stringify(entry, null, 2) + '\n');
  const payload = { ...entry }; // v2.2.0: one row per product, no format
  if (entry.inpockImage && !entry.inpockImage.startsWith('data:')) payload.inpockImage = thumbnail(path.resolve(path.dirname(file), entry.inpockImage));
  const saved = await send('save', payload);
  fs.writeFileSync(file, JSON.stringify({ ...entry, revision: saved.revision }, null, 2) + '\n');
  return saved;
}

// v2.6.0: the server (backend/Publish.js) posts only an mp4 on this Cloudinary account and deletes it after posting.
// Keys come from .env at the repository root (git-ignored): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
export async function video(file, mp4 = 'motion-bgm.mp4', send = request) {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  const [cloud, key, secret] = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map(name => process.env[name]?.trim());
  if (!cloud || !key || !secret) throw new Error('.env에 CLOUDINARY_CLOUD_NAME·CLOUDINARY_API_KEY·CLOUDINARY_API_SECRET이 필요해요.');
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!entry.id) throw new Error('먼저 save로 등록해주세요.');
  const row = (await send('list')).entries.find(item => item.id === entry.id);
  if (!row) throw new Error('운영대장에서 이 상품을 찾지 못했어요.');
  // One file per product (the row id), so uploading again replaces it.
  const params = { public_id: `hikary/${entry.id}`, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  for (const [name, value] of Object.entries(params)) form.append(name, value);
  form.append('api_key', key);
  form.append('signature', createHash('sha1').update(Object.keys(params).sort().map(name => `${name}=${params[name]}`).join('&') + secret).digest('hex'));
  form.append('file', new Blob([fs.readFileSync(path.resolve(path.dirname(file), mp4))], { type: 'video/mp4' }), 'video.mp4');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/video/upload`, { method: 'POST', body: form });
  const uploaded = await response.json().catch(() => ({}));
  if (!response.ok || !uploaded.secure_url) throw new Error(`Cloudinary 업로드 실패: ${uploaded.error?.message || response.status}`);
  const head = await fetch(uploaded.secure_url, { method: 'HEAD', redirect: 'manual' });
  if (head.status !== 200) throw new Error(`올린 영상 주소가 열리지 않아요 (${head.status}).`);
  const videoDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
  const saved = await send('save', { ...row, videoUrl: uploaded.secure_url, videoDate });
  fs.writeFileSync(file, JSON.stringify({ ...entry, revision: saved.revision }, null, 2) + '\n');
  return { url: uploaded.secure_url, bytes: uploaded.bytes, duration: uploaded.duration, width: uploaded.width, height: uploaded.height, videoDate };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  if (command === 'list') {
    const text = JSON.stringify((await request('list')).entries, null, 2);
    if (file) { fs.writeFileSync(file, text + '\n'); console.log(`saved ${file}`); } else console.log(text);
  } else if (command === 'save' && file) {
    const saved = await save(file);
    console.log(saved.replayed ? `already saved: ${saved.id}` : `saved: ${saved.id}`);
  } else if (command === 'link' && file) {
    const made = await request('link', { url: file });
    console.log(`${made.shortenUrl}\n(${made.fromCache ? 'saved answer, no call spent' : 'new call'} · ${made.usage.remaining}/${made.usage.limit} left this hour)`);
  } else if (command === 'requests') {
    const open = (await request('requests')).requests.filter(item => item.status !== '완료');
    console.log(open.length ? JSON.stringify(open, null, 2) : '대기 중인 요청이 없어요.');
  } else if (command === 'request' && file && process.argv[4]) {
    const { request: updated } = await request('requestUpdate', { id: file, status: process.argv[4] });
    console.log(`${updated.status}: ${updated.productName || updated.sourceUrl}`);
  } else if (command === 'video' && file) {
    const up = await video(file, process.argv[4]);
    console.log(`video: ${up.url}\n${(up.bytes / 1e6).toFixed(1)}MB · ${up.width}x${up.height} · ${Math.round(up.duration)}s · ${up.videoDate}`);
  } else {
    console.log('usage: node tools/register.mjs list [out.json] | save <entry.json> | link <coupang url> | requests | request <id> <대기|진행|완료> | video <entry.json> [mp4]');
    process.exitCode = 1;
  }
}
