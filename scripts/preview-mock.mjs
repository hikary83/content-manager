// Local preview of docs/ with an in-memory ledger instead of the real Apps Script. Never touches the real sheet.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
const root = resolve('docs');
let revision = 0;
const row = (fields) => ({ id: randomUUID(), category: '생활', sourceUrl: 'https://www.coupang.com/vp/products/1', affiliateUrl: '', script: '대본', youtube: '', instagram: '', tiktok: '', notes: '', format: '쇼츠', youtubeStatus: '미업로드', instagramStatus: '미업로드', tiktokStatus: '미업로드', youtubeDate: '', youtubeLink: '', instagramDate: '', instagramLink: '', tiktokDate: '', tiktokLink: '', createdAt: '2026-11-05', revision: 'r' + (++revision), ...fields });
const rows = [
  row({ productName: '접이식 실리콘 밀폐용기 4종 세트', format: '캐러셀', createdAt: '2026-11-05', script: '1장 표지: 냉장고 정리, 이거 하나로\n2장: 접으면 1/3 두께\n3장: 전자레인지 가능 여부는 상품 페이지 확인', instagram: '냉장고 정리 고민이라면 👀\n\n#냉장고정리 #밀폐용기\n\n이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.', instagramStatus: '업로드완료', instagramDate: '2026-11-05', instagramLink: 'https://www.instagram.com/p/example' }),
  row({ productName: '접이식 실리콘 밀폐용기 4종 세트', createdAt: '2026-11-04', script: '훅: 냉장고 문 열 때마다 쏟아지죠?\n장점: 접으면 얇아져요', youtube: '냉장고 정리 꿀템 #shorts', youtubeStatus: '업로드완료', youtubeDate: '2026-11-04', youtubeLink: 'https://youtube.com/shorts/example', tiktokStatus: '보류' }),
  row({ productName: '제주 오션뷰 호텔 1박 패키지', category: '여행', sourceUrl: 'https://trip.coupang.com/tp/products/2', createdAt: '2026-11-03', script: '제주 바다가 보이는 객실' }),
  row({ productName: '무선 미니 청소기', category: '가전·디지털', sourceUrl: 'https://www.coupang.com/vp/products/3', format: '캐러셀', createdAt: '2026-11-02', script: '책상 위 먼지, 손바닥 청소기로' })
];
// Fake product finder: same rolling 20-calls-an-hour budget and 6-hour reuse as backend/Coupang.js, no real Coupang call.
const CATEGORIES = [[1025, '국내여행'], [1026, '해외여행'], [1012, '식품'], [1014, '생활용품'], [1016, '가전디지털']];
const calls = []; const saved = new Map();
const usage = () => { const now = Date.now(); while (calls.length && calls[0] <= now - 3600000) calls.shift(); return { limit: 20, used: calls.length, remaining: 20 - calls.length, ...(calls.length ? { nextAt: new Date(calls[0] + 3600000).toISOString() } : {}) }; };
const swatch = (hue) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${hue} 70% 82%)"/><circle cx="5" cy="5" r="3" fill="hsl(${hue} 60% 55%)"/></svg>`);
function products({ source, categoryId, keyword }) {
  const name = source === 'goldbox' ? '오늘의 특가 (골드박스)' : source === 'search' ? `「${keyword}」 검색` : `${(CATEGORIES.find(([id]) => id === categoryId) || [0, '?'])[1]} 베스트`;
  if (source === 'search' && !(keyword?.length >= 2)) throw new Error('검색어는 2~50자로 입력해주세요.');
  const key = JSON.stringify([source, categoryId, keyword]);
  if (saved.has(key)) return { ...saved.get(key), fromCache: true, usage: usage() };
  if (usage().remaining <= 0) throw new Error('한 시간 쿠팡 API 횟수(20회)를 다 썼어요. 저장된 결과는 계속 볼 수 있어요.');
  calls.push(Date.now());
  const count = source === 'search' ? 10 : 12;
  const result = { label: name, fetchedAt: new Date().toISOString(), products: Array.from({ length: count }, (_, i) => ({ productId: String(9000000 + i), productName: `${name.replace(/ 베스트| \(골드박스\)/, '')} 예시 상품 ${i + 1}${i % 3 ? '' : ' — 상품명이 길면 두 줄까지만 보이고 나머지는 말줄임으로 잘립니다'}`, productPrice: (i + 1) * 7900, productImage: i === 4 ? '' : swatch(i * 37), productUrl: 'https://link.coupang.com/re/AFFSDP?example=' + i, categoryName: name, isRocket: i % 2 === 0, isFreeShipping: true })) };
  saved.set(key, result); return { ...result, fromCache: false, usage: usage() };
}
function act({ action, payload }) {
  if (action === 'status') return { version: '2.1.0 (mock)', aiConfigured: false, coupang: { configured: true, usage: usage(), categories: CATEGORIES } };
  if (action === 'products') return products(payload);
  if (action === 'list') return { entries: rows };
  const index = rows.findIndex(item => item.id === payload.id);
  if (action === 'save') {
    if (index < 0 || rows[index].revision !== payload.revision) throw new Error('시트 내용이 변경됐어요. 새로고침한 뒤 다시 열어 수정해주세요.');
    const next = { ...rows[index], ...payload, revision: 'r' + (++revision) };
    for (const p of ['youtube', 'instagram', 'tiktok']) if (next[p + 'Link']) next[p + 'Status'] = '업로드완료';
    rows[index] = next; return { id: next.id, revision: next.revision, replayed: false };
  }
  if (action === 'delete') {
    if (index < 0) throw new Error('이미 지워졌거나 찾지 못했어요. 목록을 새로고침해주세요.');
    if (rows[index].revision !== payload.revision) throw new Error('시트 내용이 변경됐어요. 목록을 새로고침한 뒤 다시 지워주세요.');
    rows.splice(index, 1); return { id: payload.id, deleted: true };
  }
  throw new Error('지원하지 않는 요청입니다.');
}
createServer(async (request, response) => {
  try {
    if (request.url === '/mock-api') {
      let text = ''; for await (const part of request) text += part;
      let result; try { result = { ok: true, data: act(JSON.parse(text)) }; } catch (error) { result = { ok: false, error: error.message }; }
      await new Promise(r => setTimeout(r, 250));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result)); return;
    }
    const name = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let bytes = await readFile(file);
    if (name === '/') bytes = Buffer.from(bytes.toString().replace('<script src="js/config.js', '<script>const nativeFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith("https://script.google.com/")?nativeFetch("/mock-api",options):nativeFetch(url,options);</script><script src="js/config.js'));
    response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(4175, '127.0.0.1', () => console.log('HIKARY mock: http://127.0.0.1:4175/'));
