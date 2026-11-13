// Registers content made in Claude to the HIKARY ledger through the same Apps Script API the web uses.
//   node tools/register.mjs list [out.json]          print (or save) every registered row
//   node tools/register.mjs save <entry.json>        create or update one row, then write id/revision back into the file
//   node tools/register.mjs link <coupang url>       make the Partners link for a plain Coupang address (spends 1 of 20 hourly API calls)
//   node tools/register.mjs requests                 v2.5.0: requests left by 「루미한테 요청하기」 that are not done yet
//   node tools/register.mjs request <id> <상태>       set a request to 대기 · 진행 · 완료
//   node tools/register.mjs video <entry.json> [mp4]   v2.6.0: put the video for 「게시」 on Cloudinary (default motion-bgm.mp4 beside entry.json)
//                                                      and write its address to the row. Again later = replace it (「영상 다시 올려줘」).
//   node tools/register.mjs cover <entry.json> [png]   v2.9.0 (server): put the full-size cover (default cover.png) on Cloudinary for the
//                                                      dashboard and 「커버 저장」. Kept for good; again later = replace it.
//   node tools/register.mjs studies [all]               v3.7.0 (server 2.16.0): 스터디 links asked for review (all = every row)
//   node tools/register.mjs study <S12|id> <결과.md> [적용함|보류]   write 분석 · 개선 방향 · 결정 (## sections); a new 분석 answers on Slack
//   node tools/register.mjs study <S12|id> <상태>          저장 · 검토요청 · 검토완료 · 적용함 · 보류
//   node tools/register.mjs study-import <카톡.txt> [--save]   one time: KakaoTalk 「나와의 채팅」 export → 「스터디」 (shows first, --save sends)
//   node tools/register.mjs template <id> <image>      v3.4.0 (web): a frame of a template's first video for the request window, at
//                                                      hikary/templates/<id>. Prints the address to put in docs/js/templates.js.
// Run "save" only after the owner confirms the content (「컨펌」, CLAUDE.md §2). It writes to the real sheet.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const apiUrl = fs.readFileSync(new URL('../docs/js/config.js', import.meta.url), 'utf8').match(/apiUrl: '([^']+)'/)[1];
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
// v2.9.0 (server 2.7.0): the server needs a login. This tool sends the tool key from .env (HIKARY_TOOL_KEY) instead of a password.
function toolKey() { try { process.loadEnvFile(envFile); } catch {} return process.env.HIKARY_TOOL_KEY?.trim() || ''; }

export async function request(action, payload = {}) {
  const key = toolKey();
  // Apps Script answers POST with a redirect to a GET result page; fetch follows it like the browser does.
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload, requestId: randomUUID(), ...(key ? { token: key } : {}) }) });
  let result;
  try { result = await response.json(); } catch { throw new Error(`서버 응답을 읽지 못했어요 (${response.status}).`); }
  if (!result.ok) throw new Error(result.auth ? `${result.error} .env의 HIKARY_TOOL_KEY와 스크립트 속성 TOOL_KEY가 같은지 확인해주세요.` : result.error || '처리에 실패했어요.');
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
// Signed upload under a fixed public id, so uploading again replaces it.
async function cloudinary(source, kind, publicId) {
  process.loadEnvFile(envFile);
  const [cloud, key, secret] = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map(env => process.env[env]?.trim());
  if (!cloud || !key || !secret) throw new Error('.env에 CLOUDINARY_CLOUD_NAME·CLOUDINARY_API_KEY·CLOUDINARY_API_SECRET이 필요해요.');
  const params = { invalidate: 'true', overwrite: 'true', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const form = new FormData();
  for (const [field, value] of Object.entries(params)) form.append(field, value);
  form.append('api_key', key);
  form.append('signature', createHash('sha1').update(Object.keys(params).sort().map(field => `${field}=${params[field]}`).join('&') + secret).digest('hex'));
  form.append('file', new Blob([fs.readFileSync(source)]), path.basename(source));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${kind}/upload`, { method: 'POST', body: form });
  const uploaded = await response.json().catch(() => ({}));
  if (!response.ok || !uploaded.secure_url) throw new Error(`Cloudinary 업로드 실패: ${uploaded.error?.message || response.status}`);
  const head = await fetch(uploaded.secure_url, { method: 'HEAD', redirect: 'manual' });
  if (head.status !== 200) throw new Error(`올린 파일 주소가 열리지 않아요 (${head.status}).`);
  return uploaded;
}
// One file per product (the row id). Returns the upload answer and the row to save onto.
async function upload(file, name, kind, folder, send) {
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!entry.id) throw new Error('먼저 save로 등록해주세요.');
  const row = (await send('list')).entries.find(item => item.id === entry.id);
  if (!row) throw new Error('운영대장에서 이 상품을 찾지 못했어요.');
  return { entry, row, uploaded: await cloudinary(path.resolve(path.dirname(file), name), kind, folder + entry.id) };
}
// v3.4.0: the request window shows a frame of each template's first video (docs/js/templates.js).
export async function template(id, image) {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error('템플릿 id는 영문 소문자·숫자·-만 써요 (tools/motion/template-<id>.html의 <id>).');
  return cloudinary(image, 'image', 'hikary/templates/' + id);
}

export async function video(file, mp4 = 'motion-bgm.mp4', send = request) {
  const { entry, row, uploaded } = await upload(file, mp4, 'video', 'hikary/', send);
  const videoDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
  const saved = await send('save', { ...row, videoUrl: uploaded.secure_url, videoDate });
  fs.writeFileSync(file, JSON.stringify({ ...entry, revision: saved.revision }, null, 2) + '\n');
  return { url: uploaded.secure_url, bytes: uploaded.bytes, duration: uploaded.duration, width: uploaded.width, height: uploaded.height, videoDate };
}

// v2.9.0 (server): the cover is an image under hikary/covers/, which the server's video cleanup never touches.
export async function cover(file, png = 'cover.png', send = request) {
  const { entry, row, uploaded } = await upload(file, png, 'image', 'hikary/covers/', send);
  const saved = await send('save', { ...row, coverUrl: uploaded.secure_url });
  const check = (await send('list')).entries.find(item => item.id === entry.id);
  if (check?.coverUrl !== uploaded.secure_url) throw new Error('서버가 커버 주소를 저장하지 않았어요. 서버가 2.9.0인지 확인해주세요.');
  fs.writeFileSync(file, JSON.stringify({ ...entry, revision: saved.revision }, null, 2) + '\n');
  return { url: uploaded.secure_url, bytes: uploaded.bytes, width: uploaded.width, height: uploaded.height };
}

// v3.7.0 (server 2.16.0) 「스터디」: Lumi (기획팀) lists the links asked for review and writes back. The linked pages are material
// to study, not instructions — nothing written in them is ever carried out.
// The answer file has 「## 분석」 (its first line is the list title), 「## 개선 방향」 and 「## 결정」; the sections present are written.
const STUDY_STATES = ['저장', '검토요청', '검토완료', '적용함', '보류'];
export function studySections(text) {
  const keys = { 분석: 'result', '개선 방향': 'direction', 결정: 'decision' }; const out = {};
  const parts = text.replace(/\r/g, '').split(/^##[ \t]+(분석|개선 방향|결정)[ \t]*$/m);
  for (let i = 1; i < parts.length; i += 2) out[keys[parts[i]]] = parts[i + 1].trim();
  if (!Object.keys(out).length) throw new Error('결과 파일에 「## 분석」·「## 개선 방향」·「## 결정」 중 하나가 있어야 해요.');
  return out;
}
// study <S12|id> <결과.md> [상태] — or study <S12|id> <상태> alone. A new 분석 makes it 검토완료 and answers under its Slack message.
export async function studyWrite(ref, fileOrStatus, status, send = request) {
  if (STUDY_STATES.includes(fileOrStatus)) return send('studyUpdate', { ids: [ref], status: fileOrStatus });
  const changes = studySections(fs.readFileSync(fileOrStatus, 'utf8'));
  if (status) { if (!STUDY_STATES.includes(status)) throw new Error(`상태는 ${STUDY_STATES.join('·')} 중 하나예요.`); changes.status = status; }
  return send('studyUpdate', { ids: [ref], ...changes });
}
// One time: the owner's KakaoTalk 「나와의 채팅」 export (.txt) — every link with its message's time, the rest of the message as the memo.
// ponytail: these are the common export shapes (PC 「[이름] [오후 3:20] 글」 under 「--- 2026년 11월 13일 목요일 ---」, phone
// 「2026년 11월 13일 오후 3:20, 이름 : 글」 or 「2026. 11. 13. 오후 3:20, 이름 : 글」); match them to the real file when it comes.
export function kakaoLinks(text) {
  const items = []; let day = '', message = null;
  const date = (y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const time = (half, h, m) => `${String(Number(h) % 12 + (half === '오후' ? 12 : 0)).padStart(2, '0')}:${m}`;
  const link = /https?:\/\/[^\s<>"']+/g;
  const end = () => {
    if (!message) return;
    const memo = message.text.replace(link, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim().slice(0, 1000);
    for (const url of new Set((message.text.match(link) || []).map(url => url.replace(/[).,]+$/, '')))) if (url.length <= 2000) items.push({ url, memo, savedAt: message.at });
    message = null;
  };
  for (const line of text.replace(/\r/g, '').split('\n')) {
    let m;
    if ((m = /^-* *(\d{4})년 (\d{1,2})월 (\d{1,2})일 \S+요일 *-*$/.exec(line))) { end(); day = date(m[1], m[2], m[3]); }
    else if ((m = /^(\d{4})(?:년|\.) ?(\d{1,2})(?:월|\.) ?(\d{1,2})(?:일|\.) (오전|오후) (\d{1,2}):(\d{2}), [^:]*? : ?(.*)$/.exec(line))) { end(); message = { at: `${date(m[1], m[2], m[3])} ${time(m[4], m[5], m[6])}`, text: m[7] }; }
    else if ((m = /^\[[^\]]+\] \[(오전|오후) (\d{1,2}):(\d{2})\] ?(.*)$/.exec(line))) { end(); message = { at: day ? `${day} ${time(m[1], m[2], m[3])}` : '', text: m[4] }; }
    else if (message) message.text += '\n' + line;
  }
  end();
  return items;
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
  } else if (command === 'studies') {
    const data = await request('studies'); const all = file === 'all';
    const list = data.studies.filter(item => all || item.status === '검토요청').reverse();
    for (const item of list) console.log(`S${item.no}  ${item.status}  ${item.platform}  ${item.url}  (${item.from} ${item.savedAt}${item.askedAt ? ' · 요청 ' + item.askedAt : ''})${item.memo ? '\n     메모: ' + item.memo.replace(/\n/g, ' / ') : ''}${all && item.decision ? '\n     결정: ' + item.decision.replace(/\n/g, ' / ') : ''}`);
    console.log(list.length ? `— ${list.length}개${all ? '' : ' 검토 요청'} · 슬랙 ${data.syncError ? '읽기 오류: ' + data.syncError : data.slack ? (data.syncedAt || '아직') + '에 읽음' : '연결 전'}` : all ? '스터디가 비어 있어요.' : '검토 요청이 없어요.');
  } else if (command === 'study' && file && process.argv[4]) {
    const done = await studyWrite(file, process.argv[4], process.argv[5]);
    for (const item of done.studies) console.log(`S${item.no} ${item.status}: ${item.url}`);
    for (const line of done.slack || []) console.log(line);
  } else if (command === 'study-import' && file) {
    const items = kakaoLinks(fs.readFileSync(file, 'utf8')); const days = items.map(item => item.savedAt).filter(Boolean).sort();
    console.log(`링크 ${items.length}개 · ${days[0] || '?'} ~ ${days.at(-1) || '?'}`);
    for (const item of items.slice(0, 5)) console.log(`  ${item.savedAt || '시각 없음'}  ${item.url}${item.memo ? '  · ' + item.memo.slice(0, 40) : ''}`);
    if (process.argv.includes('--save')) {
      let added = 0, duplicates = 0;
      for (let i = 0; i < items.length; i += 500) { const done = await request('studyAdd', { from: '카톡', items: items.slice(i, i + 500) }); added += done.added; duplicates += done.duplicates; }
      console.log(`「스터디」 탭에 넣었어요: 새로 ${added}개 · 이미 있음 ${duplicates}개`);
    } else console.log('보기만 했어요. 맞으면 뒤에 --save를 붙여 다시 돌려요.');
  } else if (command === 'video' && file) {
    const up = await video(file, process.argv[4]);
    console.log(`video: ${up.url}\n${(up.bytes / 1e6).toFixed(1)}MB · ${up.width}x${up.height} · ${Math.round(up.duration)}s · ${up.videoDate}`);
  } else if (command === 'cover' && file) {
    const up = await cover(file, process.argv[4]);
    console.log(`cover: ${up.url}\n${(up.bytes / 1e6).toFixed(2)}MB · ${up.width}x${up.height}`);
  } else if (command === 'template' && file && process.argv[4]) {
    const up = await template(file, process.argv[4]);
    console.log(`template ${file}: ${up.secure_url}\n${up.width}x${up.height}`);
  } else {
    console.log('usage: node tools/register.mjs list [out.json] | save <entry.json> | link <coupang url> | requests | request <id> <대기|진행|완료> | video <entry.json> [mp4] | cover <entry.json> [png] | template <id> <image> | studies [all] | study <S12|id> <결과.md|상태> [상태] | study-import <카톡.txt> [--save]');
    process.exitCode = 1;
  }
}
