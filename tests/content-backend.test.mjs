import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';

const LEGACY_HEADERS = ['콘텐츠 ID','등록일','카테고리','상품명','원본 링크','변환 링크','대본','YouTube 게시글','YouTube 상태','Instagram 게시글','Instagram 상태','TikTok 게시글','TikTok 상태','비고'];
const V17_HEADERS = ['형식','YouTube 업로드일','YouTube 링크','Instagram 업로드일','Instagram 링크','TikTok 업로드일','TikTok 링크'];
const ADDED_HEADERS = [...V17_HEADERS,'Instagram 캐러셀 상태','Instagram 캐러셀 업로드일','Instagram 캐러셀 링크','카드뉴스 문구','인포크 No.','인포크 타이틀','키티챗 키워드','키티챗 DM 문구','인포크 이미지','영상 주소','영상 올린 날','YouTube 예약 ID','Instagram 예약 ID','TikTok 예약 ID','게시 오류','커버 이미지','인스타 형식'];
// v2.7.0: every action needs a session or the tool key. Tests call as the tool unless they send `token` themselves.
const TOOL = 'tool-key-for-tests-0123456789abcdef0123';
function runtime({ legacy = false } = {}) {
  const rows = [legacy ? [...LEGACY_HEADERS] : [...LEGACY_HEADERS, ...ADDED_HEADERS]];
  const props = new Map([['SHEET_ID','test'],['SHEET_NAME','콘텐츠 관리']]);
  let writes = 0; let fetches = 0; const cache = new Map();
  const makeSheet = rows => ({ getLastRow: () => rows.length, getMaxRows: () => 1000, getMaxColumns: () => 26, insertColumnsAfter() {}, getFrozenRows: () => 1, setFrozenRows() {}, insertRowsAfter() {}, deleteRow(row) { writes++; rows.splice(row - 1, 1); },
    getRange(row, col, height = 1, width = 1) { return {
      getValues: () => Array.from({length:height}, (_, y) => Array.from({length:width}, (_, x) => rows[row-1+y]?.[col-1+x] ?? '')),
      getDisplayValues() { return this.getValues(); },
      setValues(values) { writes++; values.forEach((line,y) => { rows[row-1+y] ||= []; line.forEach((value,x) => { rows[row-1+y][col-1+x] = String(value).startsWith("'") ? value.slice(1) : value; }); }); },
      setDataValidation() {}
    }; }
  });
  const sheet = makeSheet(rows);
  // v2.5.0: other tabs (「요청」) live beside the ledger; the ledger tab is the configured SHEET_NAME.
  const tabs = new Map(); const book = { getSheetByName: name => name === '요청' ? tabs.get(name)?.sheet ?? null : sheet, insertSheet(name) { const tab = { rows: [], sheet: null }; tab.sheet = makeSheet(tab.rows); tabs.set(name, tab); return tab.sheet; } };
  const validation = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
  const context = vm.createContext({
    console: { info() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || null, setProperty: (key,value) => props.set(key,value) }) },
    Utilities: { getUuid: randomUUID, DigestAlgorithm: { SHA_256:'sha256', SHA_1:'sha1' }, Charset:{ UTF_8:'utf8' }, computeDigest: (algorithm,value) => [...createHash(algorithm).update(value).digest()], formatDate: (date, zone, format) => format.includes("'T'") ? '261108T012345Z' : format === 'yyyy-MM-dd HH:mm' ? new Date(date).toLocaleString('sv-SE', { timeZone: zone }).slice(0, 16) : '2026-10-28', computeHmacSha256Signature: (value, key) => [...createHmac('sha256', key).update(value).digest()].map(byte => byte > 127 ? byte - 256 : byte), base64Encode: value => Buffer.from(value).toString('base64'), base64Decode: value => [...Buffer.from(value,'base64')] },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => book, newDataValidation: () => validation, flush() {} },
    ContentService: { MimeType:{JSON:'application/json'},createTextOutput: text => ({text,setMimeType() {return this;}}) },
    UrlFetchApp: { fetch() { fetches++; throw new Error('unexpected network'); } },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) ?? null, put: (key, value) => cache.set(key, value) }) }
  });
  for (const name of ['Code','Product','Gemini','Coupang','Requests','Publish','Auth']) vm.runInContext(readFileSync(new URL(`../backend/${name}.js`,import.meta.url),'utf8'),context);
  props.set('TOOL_KEY', TOOL);
  const raw = context.doPost; context.doPost = event => { const body = JSON.parse(event.postData.contents); if (!('token' in body)) body.token = TOOL; return raw({ postData: { contents: JSON.stringify(body) } }); };
  return { context, rows, props, tabs, writes: () => writes, fetches: () => fetches };
}
const sample = () => ({id:randomUUID(),category:'여행',productName:'제주 숙소',sourceUrl:'https://trip.coupang.com/product',affiliateUrl:'',script:'실제 상품정보 기반 대본',youtube:'',instagram:'',tiktok:'',notes:''});

test('도구 키로 요청을 처리하고 지원하지 않는 요청은 시트·AI 호출 없이 거절한다', () => {
  const env=runtime();const call=body=>JSON.parse(env.context.doPost({postData:{contents:JSON.stringify(body)}}).text);
  assert.equal(call({action:'status'}).ok,true);
  const unknown=call({action:'deleteAll',payload:sample()});assert.equal(unknown.ok,false);
  assert.equal(env.writes(),0); assert.equal(env.fetches(),0);
});
test('저장 응답 유실 후 재시도해도 같은 ID·내용은 한 행만 생성한다', () => {
  const env=runtime();const input=sample();
  const first=env.context.saveEntry_(input);const retry=env.context.saveEntry_(input);
  assert.equal(first.replayed,false);assert.equal(retry.replayed,true);assert.equal(first.revision,retry.revision);
  assert.equal(env.rows.length,2);assert.equal(env.writes(),1);
});
test('revision으로 수동 수정 덮어쓰기를 방지한다', () => {
  const env=runtime();const input=sample();const first=env.context.saveEntry_(input);
  const updated=env.context.saveEntry_({...input,notes:'메모',revision:first.revision});
  assert.notEqual(first.revision,updated.revision);assert.equal(env.rows.length,2);
  env.rows[1][3]='수동 수정';
  assert.throws(()=>env.context.saveEntry_({...input,notes:'덮어쓰기',revision:updated.revision}),/시트 내용이 변경/);
});
test('삭제는 현재 revision이 맞을 때만 그 줄을 지우고 다른 줄은 건드리지 않는다', () => {
  const env=runtime();const keep=sample();const target=sample();env.context.saveEntry_(keep);const saved=env.context.saveEntry_(target);
  const call=payload=>JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action:'delete',payload})}}).text);
  assert.match(call({id:target.id,revision:'old'}).error,/시트 내용이 변경/);assert.match(call({id:target.id}).error,/시트 내용이 변경/);
  assert.equal(call({id:target.id,revision:saved.revision}).ok,true);
  assert.deepEqual(env.rows.slice(1).map(row=>row[0]),[keep.id]);
  assert.match(call({id:target.id,revision:saved.revision}).error,/찾지 못했어요/);
});
test('헤더 불일치·잘못된 업로드 상태를 거부하고 수식을 문자열로 처리한다', () => {
  const env=runtime();assert.throws(()=>env.context.saveEntry_({...sample(),youtubeStatus:'INVALID'}),/업로드 상태/);
  assert.equal(env.context.sheetLiteral_('=IMPORTXML("x")'),"'=IMPORTXML(\"x\")");
  env.rows[0][0]='다른 컬럼';assert.throws(()=>env.context.saveEntry_(sample()),/컬럼/);assert.equal(env.writes(),0);
});
test('기존 14칸 시트는 오른쪽 빈칸에만 새 머리글을 채우고 다른 내용이 있으면 멈춘다', () => {
  const env=runtime({legacy:true});env.rows.push(['old-id','2026-10-01','여행','기존 상품','https://trip.coupang.com/p','','대본','','미업로드','','미업로드','','미업로드','']);
  const entries=env.context.readEntries_();assert.deepEqual(env.rows[0].slice(14),ADDED_HEADERS);assert.equal(entries[0].productName,'기존 상품');assert.equal(entries[0].format,'');
  const blocked=runtime({legacy:true});blocked.rows[0][16]='메모';assert.throws(()=>blocked.context.readEntries_(),/15~38/);assert.equal(blocked.writes(),0);
});
test('v2.2.0 21칸 시트는 22~27번째 빈칸에만 새 머리글을 채우고 기존 줄은 그대로 읽는다', () => {
  const env=runtime({legacy:true});env.rows[0].push(...V17_HEADERS);
  env.rows.push(['old-id','2026-11-09','여행','기존 상품','https://trip.coupang.com/p','','대본','','미업로드','','업로드완료','','미업로드','','쇼츠','','','2026-11-10','https://www.instagram.com/p/a/','','']);
  const [entry]=env.context.readEntries_();
  assert.deepEqual(env.rows[0].slice(14),ADDED_HEADERS);assert.equal(entry.instagramStatus,'업로드완료');assert.equal(entry.carouselStatus,'');assert.equal(entry.inpockNo,'');
  const blocked=runtime({legacy:true});blocked.rows[0].push(...V17_HEADERS,'다른 내용');assert.throws(()=>blocked.context.readEntries_(),/15~38/);assert.equal(blocked.writes(),0);
});
test('v2.4.0 업로드일에 시간을 같이 저장하고, 시간 형식이 틀리면 거절한다', () => {
  const env=runtime();
  env.context.saveEntry_({...sample(),youtubeDate:'2026-11-10 19:30',youtubeLink:'https://youtube.com/shorts/a',carouselDate:'2026-11-11'});
  const saved=env.context.readEntries_()[0];
  assert.equal(saved.youtubeDate,'2026-11-10 19:30');assert.equal(saved.youtubeStatus,'업로드완료');assert.equal(saved.carouselDate,'2026-11-11');
  for(const bad of ['2026-11-10 7:30','2026-11-10 24:00','2026-11-10T19:30']) assert.throws(()=>env.context.saveEntry_({...sample(),tiktokDate:bad}),/YYYY-MM-DD/);
  assert.throws(()=>env.context.saveEntry_({...sample(),tiktokDate:'2026-11-10 19:30:00'}),/길이/,'16자를 넘으면 길이에서 막힌다');
});
test('v2.3.0 키티챗 칸과 인포크 이미지(JPEG·PNG 데이터만)를 저장한다', () => {
  const env=runtime();const image='data:image/jpeg;base64,'+Buffer.from('jpeg').toString('base64');
  env.context.saveEntry_({...sample(),kittyKeyword:'어디',kittyDm:'정답은 …\nhttps://link.coupang.com/a/x',inpockImage:image});
  const saved=env.context.readEntries_()[0];
  assert.equal(saved.kittyKeyword,'어디');assert.match(saved.kittyDm,/정답은/);assert.equal(saved.inpockImage,image);
  for(const bad of ['https://evil.invalid/a.jpg','data:text/html;base64,PHNjcmlwdD4=','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,"onerror="']) assert.throws(()=>env.context.saveEntry_({...sample(),inpockImage:bad}),/인포크 이미지/);
  assert.throws(()=>env.context.saveEntry_({...sample(),inpockImage:'data:image/png;base64,'+'A'.repeat(45000)}),/길이/);
});
test('형식·업로드일·게시물 링크를 검증하고 링크가 있으면 업로드완료로 저장한다', () => {
  const env=runtime();const input={...sample(),format:'캐러셀',instagramDate:'2026-11-01',instagramLink:'https://www.instagram.com/p/abc/'};
  env.context.saveEntry_(input);const saved=env.context.readEntries_()[0];
  assert.equal(saved.format,'캐러셀');assert.equal(saved.instagramStatus,'업로드완료');assert.equal(saved.instagramLink,input.instagramLink);assert.equal(saved.youtubeStatus,'미업로드');
  assert.equal(env.context.saveEntry_(sample()).replayed,false);assert.equal(env.context.readEntries_()[0].format,'');
  assert.throws(()=>env.context.saveEntry_({...sample(),format:'릴스'}),/형식/);
  const product={...sample(),carouselScript:'1장: 표지',inpockNo:'252',inpockTitle:'No.252 상품',carouselDate:'2026-11-10',carouselLink:'https://www.instagram.com/p/c/'};
  env.context.saveEntry_(product);const merged=env.context.readEntries_()[0];
  assert.equal(merged.carouselStatus,'업로드완료');assert.equal(merged.instagramStatus,'미업로드');assert.equal(merged.inpockNo,'252');assert.equal(merged.carouselScript,'1장: 표지');
  assert.throws(()=>env.context.saveEntry_({...sample(),inpockNo:'No.1'}),/숫자/);
  assert.throws(()=>env.context.saveEntry_({...sample(),carouselStatus:'INVALID'}),/업로드 상태/);
  assert.throws(()=>env.context.saveEntry_({...sample(),youtubeDate:'11/01'}),/YYYY-MM-DD/);
  assert.throws(()=>env.context.saveEntry_({...sample(),tiktokLink:'javascript:alert(1)'}),/https/);
});
test('쿠팡이 빈 상품 페이지를 주면 성공으로 넘기지 않고 직접 입력을 안내한다', () => {
  const env=runtime();
  assert.throws(()=>env.context.parseProduct_('<title>null -  | 쿠팡</title><div>쿠팡에서 null 구매하고</div>','https://www.coupang.com/vp/products/1'),/직접 입력/);
  assert.equal(env.context.parseProduct_('<title>삼다수 2L, 6개 - 생수 | 쿠팡</title>','https://www.coupang.com/vp/products/1').name,'삼다수 2L, 6개 - 생수');
});
test('메타·본문·JSON-LD·상세 이미지를 추출한다', () => {
  const env=runtime();
  const result=env.context.parseProduct_('<title>호텔 &amp; 리조트</title><meta property="og:image" content="https://thumbnail.coupangcdn.com/a.jpg"><script type="application/ld+json">{"image":["https://image.coupangcdn.com/detail.jpg"]}</script><script>SECRET</script><div>조식 포함</div><img src="https://image.coupangcdn.com/room.jpg"><img src="https://evil.invalid/x.jpg">','https://trip.coupang.com/product');
  assert.equal(result.name,'호텔 & 리조트');assert.match(result.description,/조식 포함/);assert.doesNotMatch(result.description,/SECRET/);assert.equal(result.images.length,3);
});
test('사설주소·인증주소·위장 도메인을 요청하지 않는다', () => {
  const env=runtime();for(const url of ['http://trip.coupang.com/p','https://127.0.0.1/p','https://2130706433/p','https://[::1]/','https://coupang.com.evil.invalid/p','https://user@coupang.com/p','https://localhost/p']) assert.throws(()=>env.context.safeFetchUrl_(url,'product'));
  assert.equal(env.context.safeFetchUrl_('https://trip.coupang.com/p','product'),'https://trip.coupang.com/p');
});
test('Gemini 이미지·본문 요청은 시트를 수정하지 않는다', () => {
  const env=runtime();env.props.set('GEMINI_API_KEY','test-only');env.props.set('GEMINI_MODEL','gemini-2.5-flash');
  const expected={summary:'확인된 정보',warnings:['가격 재확인'],highlights:['실제 장점'],scenes:Array.from({length:4},(_,i)=>({title:'장면 '+i,voiceover:'내레이션 '+i,caption:'후반 자막',visual:'실제 상품 사진',motion:'느린 줌',sourceImage:1})),script:'내레이션',youtube:'제목',instagram:'본문',tiktok:'짧은 글'};let captured;
  env.context.UrlFetchApp.fetch=(url,options)=>{captured=JSON.parse(options.payload);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(expected)}]}}]})};};
  const data=env.context.generateContent_({productName:'테스트',description:'실제 설명',referenceNotes:'결과 사진 먼저',images:[{inline:{mimeType:'image/png',data:'aW1hZ2U='}}]});
  assert.equal(data.script,expected.scenes.map(scene=>scene.voiceover).join('\n'));assert.equal(data.scenes.length,4);assert.equal(data.scenes[0].sourceImage,0);assert.equal(captured.contents[0].parts.length,3);assert.match(captured.contents[0].parts[1].text,/독립적인 대본/);assert.equal(captured.generationConfig.responseMimeType,'application/json');assert.equal(env.writes(),0);
});
test('Gemini 오류에서 키·제공자 원문을 노출하지 않는다', () => {
  const env=runtime();env.props.set('GEMINI_API_KEY','secret-example');env.props.set('GEMINI_MODEL','gemini-2.5-flash');
  env.context.UrlFetchApp.fetch=()=>({getResponseCode:()=>403,getContentText:()=>'{"error":"secret-example"}'});
  assert.throws(()=>env.context.generateContent_({productName:'테스트',description:'설명',images:[]}),error=>!error.message.includes('secret-example')&&error.message.includes('403'));
});

test('레퍼런스 분석은 인증 후 프레임만 Gemini에 전달하고 시트를 쓰지 않는다',()=>{
  const env=runtime();env.props.set('GEMINI_API_KEY','test-only');env.props.set('GEMINI_MODEL','test-model');let captured;
  env.context.UrlFetchApp.fetch=(url,options)=>{captured=JSON.parse(options.payload);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({hook:'결과 사진',cta:'확인 불가',patterns:['결과 우선'],warnings:['음성 미청취'],transitions:[]})}]}}]})};};
  const response=JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action:'reference',payload:{duration:18,frames:[{time:0,mimeType:'image/jpeg',data:'aW1hZ2U='}],url:'https://not-sent.invalid',transcript:''}})}}).text);
  assert.equal(response.ok,true);assert.match(response.data.basis,/음성 미청취/);assert.ok(!JSON.stringify(captured).includes('not-sent.invalid'));assert.equal(env.writes(),0);assert.equal(captured.contents[0].parts.length,3);
});

test('캐러셀 생성은 상품 설명으로 공통 블록 초안을 만들고 저장하지 않는다',()=>{
  const env=runtime();env.props.set('GEMINI_API_KEY','test-only');env.props.set('GEMINI_MODEL','test-model');let captured;
  const fill=spec=>typeof spec==='number'?'확인된 내용':Array.isArray(spec)?[fill(spec[1])]:Object.fromEntries(Object.keys(spec).map(key=>[key,fill(spec[key])]));
  env.context.UrlFetchApp.fetch=(url,options)=>{captured=JSON.parse(options.payload);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({content:fill(env.context.CAROUSEL_SPEC_),caption:'게시글',warnings:['고지 확인']})}]}}]})};};
  const response=JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action:'carousel',payload:{productName:'테스트 상품',description:'확인된 상세 정보'}})}}).text);
  assert.equal(response.ok,true);assert.equal(response.data.content.points.items.length,1);assert.equal(env.writes(),0);
  assert.match(captured.systemInstruction.parts[0].text,/추측하거나 만들어내지/);assert.match(captured.systemInstruction.parts[0].text,/DM 보상/);
  assert.equal(captured.generationConfig.responseSchema.properties.content.properties.facts.properties.items.maxItems,4);
});

// v2.1.0 product finder. Coupang stops a key for 24 hours at 30 calls an hour and the server is public, so the budget is the safety net.
function coupangEnv(products = [{ productId: 101, productName: '롯데월드 아쿠아리움 입장권', productPrice: 29000, productImage: 'https://thumbnail.coupangcdn.com/a.jpg', productUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF1', isRocket: false }]) {
  const env = runtime(); env.props.set('COUPANG_ACCESS_KEY', 'access-example'); env.props.set('COUPANG_SECRET_KEY', 'secret-example');
  const sent = []; env.context.UrlFetchApp.fetch = (url, options) => { sent.push({ url, options }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ rCode: '0', data: products }) }; };
  const call = payload => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify({ action: 'products', payload }) } }).text);
  return { env, sent, call };
}
test('쿠팡 키가 없으면 쿠팡을 부르지 않고 횟수도 쓰지 않는다', () => {
  const env = runtime(); const call = body => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const status = call({ action: 'status' }).data.coupang;
  assert.equal(status.configured, false); assert.equal(status.usage.remaining, 20); assert.deepEqual(status.categories[0], [1025, '국내여행']);
  assert.match(call({ action: 'products', payload: { source: 'goldbox' } }).error, /COUPANG_ACCESS_KEY/);
  assert.equal(env.fetches(), 0); assert.equal(env.props.get('COUPANG_CALLS'), undefined);
});
test('쿠팡 요청은 HMAC 서명을 달고, https 링크만 남긴 상품과 남은 횟수를 돌려준다', () => {
  const { sent, call } = coupangEnv([{ productId: 101, productName: ' 입장권 ', productPrice: 29000, productImage: 'javascript:alert(1)', productUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF1', isRocket: true }, { productId: 102, productName: '링크 없음', productUrl: 'http://link.coupang.com/x' }]);
  const result = call({ source: 'search', keyword: ' 아쿠아리움  입장권 ' });
  assert.equal(result.ok, true); assert.equal(sent.length, 1);
  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search'; const query = 'keyword=' + encodeURIComponent('아쿠아리움 입장권') + '&limit=10';
  assert.equal(sent[0].url, 'https://api-gateway.coupang.com' + path + '?' + query);
  const signature = createHmac('sha256', 'secret-example').update('261108T012345Z' + 'GET' + path + query).digest('hex');
  assert.equal(sent[0].options.headers.Authorization, 'CEA algorithm=HmacSHA256, access-key=access-example, signed-date=261108T012345Z, signature=' + signature);
  assert.deepEqual(result.data.products.map(item => [item.productId, item.productName, item.productImage, item.isRocket]), [['101', '입장권', '', true]]);
  assert.equal(result.data.usage.remaining, 19); assert.equal(result.data.fromCache, false); assert.equal(result.data.label, '「아쿠아리움 입장권」 검색');
});
test('같은 목록은 6시간 저장해 둔 결과를 다시 써서 횟수를 쓰지 않는다', () => {
  const { sent, call } = coupangEnv();
  const first = call({ source: 'best', categoryId: 1025 }); const again = call({ source: 'best', categoryId: 1025 });
  assert.match(sent[0].url, /bestcategories\/1025\?limit=50$/); assert.equal(sent.length, 1);
  assert.equal(again.data.fromCache, true); assert.equal(again.data.usage.remaining, 19); assert.deepEqual(again.data.products, first.data.products);
});
test('지난 한 시간에 20번 불렀으면 21번째는 쿠팡에 보내지 않고, 한 시간이 지난 횟수는 돌아온다', () => {
  const { env, sent, call } = coupangEnv(); const now = Date.now();
  env.props.set('COUPANG_CALLS', JSON.stringify(Array.from({ length: 20 }, (_, i) => now - 60000 * i)));
  assert.match(call({ source: 'goldbox' }).error, /20회/); assert.equal(sent.length, 0);
  env.props.set('COUPANG_CALLS', JSON.stringify([...Array.from({ length: 19 }, () => now - 3700000), now - 1000]));
  const ok = call({ source: 'goldbox' }); assert.equal(ok.ok, true); assert.equal(sent.length, 1); assert.equal(ok.data.usage.remaining, 18);
});
test('쿠팡이 거절한 요청도 횟수에 들어가고, 키 오류는 키를 확인하라고 알린다', () => {
  const { env, call } = coupangEnv(); env.context.UrlFetchApp.fetch = () => ({ getResponseCode: () => 401, getContentText: () => '{"message":"Specified key is not registered."}' });
  assert.match(call({ source: 'goldbox' }).error, /API 키를 받지 않았어요/); assert.equal(JSON.parse(env.props.get('COUPANG_CALLS')).length, 1);
});
test('v2.2.0 쿠팡 주소를 POST 서명으로 파트너스 링크로 바꾸고, 같은 주소는 저장된 답을 쓴다', () => {
  const env = runtime(); env.props.set('COUPANG_ACCESS_KEY', 'access-example'); env.props.set('COUPANG_SECRET_KEY', 'secret-example');
  const sent = []; env.context.UrlFetchApp.fetch = (url, options) => { sent.push({ url, options }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ rCode: '0', data: [{ originalUrl: 'x', shortenUrl: 'https://link.coupang.com/a/abc', landingUrl: 'https://link.coupang.com/re/AFFTDP?lptag=AF1' }] }) }; };
  const call = url => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify({ action: 'link', payload: { url } }) } }).text);
  for (const bad of ['http://www.coupang.com/vp/products/1', 'https://link.coupang.com/a/abc', 'https://coupang.com.evil.invalid/x', 'https://evil.invalid/?https://www.coupang.com/']) assert.equal(call(bad).ok, false);
  assert.equal(sent.length, 0);
  const url = 'https://trip.coupang.com/tp/products/10000011531802';
  const made = call(url); assert.equal(made.data.shortenUrl, 'https://link.coupang.com/a/abc'); assert.equal(made.data.usage.remaining, 19);
  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  assert.equal(sent[0].url, 'https://api-gateway.coupang.com' + path); assert.equal(sent[0].options.method, 'post');
  assert.deepEqual(JSON.parse(sent[0].options.payload), { coupangUrls: [url] });
  const signature = createHmac('sha256', 'secret-example').update('261108T012345Z' + 'POST' + path).digest('hex');
  assert.equal(sent[0].options.headers.Authorization, 'CEA algorithm=HmacSHA256, access-key=access-example, signed-date=261108T012345Z, signature=' + signature);
  const again = call(url); assert.equal(again.data.fromCache, true); assert.equal(again.data.usage.remaining, 19); assert.equal(sent.length, 1);
});
test('없는 카테고리·짧은 검색어·모르는 방법은 쿠팡을 부르지 않는다', () => {
  const { sent, call } = coupangEnv();
  assert.match(call({ source: 'best', categoryId: 9999 }).error, /카테고리/); assert.match(call({ source: 'search', keyword: 'a' }).error, /2~50자/);
  assert.match(call({ source: 'search', keyword: 'x'.repeat(51) }).error, /2~50자/); assert.match(call({ source: 'reco' }).error, /찾는 방법/);
  assert.equal(sent.length, 0);
});

// v2.5.0 「루미한테 요청하기」
test('요청은 「요청」 탭을 처음 쓸 때 만들고, 같은 주소가 대기 중이면 두 번 쌓지 않으며 쿠팡 API를 부르지 않는다', () => {
  const env=runtime();const call=(action,payload)=>JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action,payload})}}).text);
  assert.deepEqual(call('requests',{}).data.requests,[]);
  const first=call('request',{productName:'서울랜드',sourceUrl:'https://trip.coupang.com/tp/products/30000001063207',affiliateUrl:'https://link.coupang.com/a/abc',from:'주소로 만들기'});
  assert.equal(first.ok,true);assert.equal(first.data.duplicate,false);assert.equal(first.data.request.status,'대기');
  assert.deepEqual(env.tabs.get('요청').rows[0],['요청 ID','요청 시각','상태','상품명','쿠팡 주소','파트너스 링크','메모','어디서','템플릿','인스타 형식']);
  assert.deepEqual([first.data.request.template,first.data.request.instagramType],['','릴스'],'고르지 않으면 템플릿은 비우고 인스타는 릴스');
  const again=call('request',{sourceUrl:'https://trip.coupang.com/tp/products/30000001063207'});
  assert.equal(again.data.duplicate,true);assert.equal(again.data.request.id,first.data.request.id);
  assert.equal(call('requests',{}).data.requests.length,1);assert.equal(env.fetches(),0);
  assert.equal(env.rows.length,1); // the ledger tab is untouched
});
test('요청은 쿠팡 주소·파트너스 링크 모양을 확인하고, 상태 바꾸기·지우기는 그 줄만 건드린다', () => {
  const env=runtime();const call=(action,payload)=>JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action,payload})}}).text);
  assert.match(call('request',{sourceUrl:'https://example.com/x'}).error,/쿠팡 상품 주소/);
  assert.match(call('request',{sourceUrl:'https://www.coupang.com/vp/products/1',affiliateUrl:'https://example.com/a'}).error,/link\.coupang\.com/);
  const a=call('request',{sourceUrl:'https://www.coupang.com/vp/products/1'}).data.request;const b=call('request',{sourceUrl:'https://www.coupang.com/vp/products/2',productName:'=SUM(1)'}).data.request;
  assert.equal(env.tabs.get('요청').rows[2][3],'=SUM(1)'); // round trip only; addRequest_ writes it through sheetLiteral_ like the ledger
  assert.match(call('requestUpdate',{id:a.id,status:'끝'}).error,/상태/);
  assert.equal(call('requestUpdate',{id:a.id,status:'완료'}).data.request.status,'완료');
  assert.equal(call('request',{sourceUrl:'https://www.coupang.com/vp/products/1'}).data.duplicate,false); // done → the same product may be asked again
  assert.equal(call('requestUpdate',{id:b.id,delete:true}).data.deleted,true);
  const left=call('requests',{}).data.requests;assert.deepEqual(left.map(r=>r.sourceUrl),['https://www.coupang.com/vp/products/1','https://www.coupang.com/vp/products/1']);
  assert.deepEqual(left.map(r=>r.status),['대기','완료']);
});

// v2.6.0 「게시」 (Publish.js): Buffer schedules, a time trigger records the results, the Cloudinary video goes once all is up.
const VIDEO = 'https://res.cloudinary.com/mycloud/video/upload/v17/hikary/abc.mp4';
const CODE = 'open-sesame';
function publishEnv({ fail = {} } = {}) {
  const env = runtime();
  for (const [key, value] of Object.entries({ BUFFER_API_KEY: 'buffer-example', CLOUDINARY_CLOUD_NAME: 'mycloud', CLOUDINARY_API_KEY: '123', CLOUDINARY_API_SECRET: 'cloud-secret', PUBLISH_CODE: CODE })) env.props.set(key, value);
  const sent = []; const posts = new Map(); let next = 0;
  const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  env.context.UrlFetchApp.fetch = (url, options) => {
    sent.push({ url, options });
    if (url.startsWith('https://api.cloudinary.com/')) return reply(200, { result: 'ok' });
    assert.equal(url, 'https://api.buffer.com');
    const query = JSON.parse(options.payload).query;
    if (query.includes('account {')) return reply(200, { data: { account: { organizations: [{ id: 'org1' }] } } });
    if (query.includes('channels(')) return reply(200, { data: { channels: [{ id: 'yt1', service: 'youtube', isDisconnected: false }, { id: 'ig1', service: 'instagram', isDisconnected: false }, { id: 'tt1', service: 'tiktok', isDisconnected: false }, { id: 'li1', service: 'linkedin', isDisconnected: false }] } });
    if (query.startsWith('mutation')) {
      const channel = /channelId: "([^"]+)"/.exec(query)[1];
      if (fail[channel]) return reply(200, { data: { createPost: { message: fail[channel] } } });
      const id = 'post' + (++next); posts.set(id, { status: 'scheduled', dueAt: /dueAt: "([^"]+)"/.exec(query)[1] });
      return reply(200, { data: { createPost: { post: { id } } } });
    }
    const id = /post\(input: \{ id: "([^"]+)"/.exec(query)[1];
    return posts.has(id) ? reply(200, { data: { post: posts.get(id) } }) : reply(200, { errors: [{ message: 'Post not found' }] });
  };
  const input = { ...sample(), youtube: '제목: 여기 어디게? #여행\n\n설명 본문', instagram: '인스타 글', tiktok: '틱톡 글', videoUrl: VIDEO, videoDate: '2026-11-10 17:00' };
  env.context.saveEntry_(input);
  const entry = () => env.context.readEntries_()[0];
  const dueAt = new Date(Date.now() + 3600e3).toISOString();
  const call = payload => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify({ action: 'publish', payload: { id: input.id, revision: entry().revision, dueAt, code: CODE, ...payload } }) } }).text);
  const mutations = () => sent.filter(item => item.url === 'https://api.buffer.com' && JSON.parse(item.options.payload).query.startsWith('mutation')).map(item => JSON.parse(item.options.payload).query);
  return { env, sent, posts, call, entry, input, dueAt, mutations };
}
test('v2.6.0 게시는 비밀번호가 맞아야 하고, 5번 틀리면 1시간 막으며 그동안 Buffer를 부르지 않는다', () => {
  const { env, sent, call } = publishEnv();
  assert.match(call({ platforms: ['youtube'], code: undefined }).error, /맞지 않아요/);
  for (let i = 0; i < 4; i++) assert.match(call({ platforms: ['youtube'], code: 'wrong' }).error, /맞지 않아요/);
  assert.match(call({ platforms: ['youtube'] }).error, /5번 틀려서/, '맞는 비밀번호도 1시간 동안은 막는다');
  assert.equal(sent.length, 0);
  const fresh = publishEnv(); fresh.env.props.delete('PUBLISH_CODE');
  assert.match(fresh.call({ platforms: ['youtube'] }).error, /PUBLISH_CODE/); assert.equal(fresh.sent.length, 0);
});
test('v2.6.0 게시는 고른 곳마다 Buffer 예약을 걸고 예약됨·예약 ID·시간을 남기며, 다시 걸지 않는다', () => {
  const { sent, call, entry, dueAt, mutations } = publishEnv();
  const result = call({ platforms: ['youtube', 'instagram', 'tiktok'] });
  assert.equal(result.ok, true); assert.deepEqual(Object.values(result.data.results).map(item => item.ok), [true, true, true]);
  const [youtube, instagram, tiktok] = mutations(); assert.equal(mutations().length, 3);
  assert.match(youtube, /channelId: "yt1"/); assert.match(youtube, /title: "여기 어디게\? #여행"/); assert.match(youtube, /text: "설명 본문"/);
  assert.match(youtube, /categoryId: "19", privacy: public, madeForKids: false/); assert.doesNotMatch(youtube, /thumbnailOffset/);
  assert.match(instagram, /channelId: "ig1"/); assert.match(instagram, /text: "인스타 글"/); assert.match(instagram, /instagram: \{ type: reel, shouldShareToFeed: true \}/); assert.match(instagram, /thumbnailOffset: 3000/);
  assert.match(tiktok, /channelId: "tt1"/); assert.match(tiktok, /text: "틱톡 글"/);
  for (const query of mutations()) { assert.match(query, /schedulingType: automatic, mode: customScheduled/); assert.ok(query.includes(`dueAt: "${dueAt}"`)); assert.ok(query.includes(`url: "${VIDEO}"`)); }
  assert.equal(sent[0].options.headers.Authorization, 'Bearer buffer-example');
  const saved = entry();
  assert.deepEqual([saved.youtubeStatus, saved.instagramStatus, saved.tiktokStatus, saved.carouselStatus], ['예약됨', '예약됨', '예약됨', '미업로드']);
  assert.deepEqual([saved.youtubePostId, saved.instagramPostId, saved.tiktokPostId], ['post1', 'post2', 'post3']);
  assert.equal(saved.youtubeDate, new Date(dueAt).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16));
  assert.match(call({ platforms: ['tiktok'] }).error, /이미 예약됨/); assert.equal(mutations().length, 3);
});
test('v2.6.0 한 곳이 실패해도 나머지는 예약하고, 우리 Cloudinary 영상·시간·revision이 맞지 않으면 Buffer를 부르지 않는다', () => {
  const { env, call, entry, input, mutations, sent } = publishEnv({ fail: { tt1: 'Video is too short' } });
  const result = call({ platforms: ['youtube', 'tiktok'] }).data.results;
  assert.equal(result.youtube.ok, true); assert.equal(result.tiktok.ok, false); assert.match(result.tiktok.error, /Video is too short/);
  const saved = entry(); assert.equal(saved.youtubeStatus, '예약됨'); assert.equal(saved.tiktokStatus, '오류'); assert.match(saved.publishError, /^TikTok: .*Video is too short$/m);
  const before = sent.length;
  assert.match(call({ platforms: ['instagram'], revision: 'old' }).error, /시트 내용이 변경/);
  assert.match(call({ platforms: ['instagram'], dueAt: new Date(Date.now() + 60e3).toISOString() }).error, /2분 뒤/);
  assert.match(call({ platforms: ['instagram', 'instagram'] }).error, /올릴 곳/); assert.match(call({ platforms: ['carousel'] }).error, /올릴 곳/);
  for (const url of ['https://evil.invalid/v.mp4', 'https://res.cloudinary.com/othercloud/video/upload/v1/hikary/abc.mp4']) {
    env.context.saveEntry_({ ...entry(), videoUrl: url });
    assert.match(call({ platforms: ['instagram'] }).error, /게시할 영상이 없어요/);
  }
  assert.equal(sent.length, before); assert.equal(mutations().length, 2); assert.equal(input.id, entry().id);
});
test('v2.6.0 결과 받기: 게시됨은 업로드완료·링크·시간, 실패는 오류, 모두 올라가거나 보류면 Cloudinary 영상을 지운다', () => {
  const { env, sent, posts, call, entry } = publishEnv();
  call({ platforms: ['youtube', 'instagram', 'tiktok'] });
  posts.set('post1', { status: 'sent', sentAt: '2026-11-12T09:00:00.000Z', externalLink: 'https://www.youtube.com/watch?v=abc' });
  posts.set('post2', { status: 'error', error: { message: 'Instagram rejected the video' } });
  env.context.syncPublishing();
  let saved = entry();
  assert.deepEqual([saved.youtubeStatus, saved.youtubeDate, saved.youtubeLink], ['업로드완료', '2026-11-12 18:00', 'https://www.youtube.com/watch?v=abc']);
  assert.equal(saved.instagramStatus, '오류'); assert.match(saved.publishError, /^인스타 릴스: Buffer 게시 실패 — Instagram rejected the video$/m);
  assert.equal(saved.tiktokStatus, '예약됨'); assert.equal(saved.videoUrl, VIDEO, '예약이 남아 있으면 영상을 지우지 않는다');
  assert.ok(!sent.some(item => item.url.startsWith('https://api.cloudinary.com/')));
  posts.set('post3', { status: 'sent', sentAt: '2026-11-12T09:01:00.000Z', externalLink: 'https://www.tiktok.com/@hikary.vibe/video/1' });
  env.context.saveEntry_({ ...entry(), instagramStatus: '보류' });
  env.context.syncPublishing();
  saved = entry(); assert.equal(saved.tiktokStatus, '업로드완료'); assert.equal(saved.videoUrl, ''); assert.equal(saved.videoDate, '');
  const destroy = sent.find(item => item.url.startsWith('https://api.cloudinary.com/'));
  assert.equal(destroy.url, 'https://api.cloudinary.com/v1_1/mycloud/video/destroy');
  const { public_id, timestamp, signature, api_key, invalidate } = destroy.options.payload;
  assert.deepEqual([public_id, api_key, invalidate], ['hikary/abc', '123', 'true']);
  assert.equal(signature, createHash('sha1').update(`invalidate=true&public_id=hikary/abc&timestamp=${timestamp}cloud-secret`).digest('hex'));
  const count = sent.length; env.context.syncPublishing(); assert.equal(sent.length, count, '기다리는 예약이 없으면 아무도 부르지 않는다');
});
test('v2.6.0 손으로 지운 기록이어도 Buffer에 예약이 남아 있으면 두 번 걸지 않고, Buffer에서 지운 예약은 오류로 남긴다', () => {
  const { env, posts, call, entry, mutations } = publishEnv();
  call({ platforms: ['youtube'] });
  env.context.saveEntry_({ ...entry(), youtubeStatus: '미업로드', youtubeDate: '' });
  const again = call({ platforms: ['youtube'] }).data.results.youtube;
  assert.equal(again.ok, false); assert.match(again.error, /이미 Buffer에 예약돼/); assert.equal(mutations().length, 1); assert.equal(entry().youtubeStatus, '예약됨');
  posts.delete('post1'); env.context.syncPublishing();
  assert.equal(entry().youtubeStatus, '오류'); assert.match(entry().publishError, /^YouTube: Buffer에서 예약을 찾지 못했어요/m);
  call({ platforms: ['youtube'] }); assert.equal(mutations().length, 2, '오류였던 곳은 다시 걸 수 있다'); assert.equal(entry().youtubePostId, 'post2');
});
test('v2.6.0 등록 도구의 저장은 영상·예약 칸을 비워 보내도 시트 값을 지키고, 30일 지난 영상은 남은 곳이 있어도 정리한다', () => {
  const { env, sent, entry, input } = publishEnv();
  env.context.saveEntry_({ ...input, notes: '메모', revision: entry().revision, videoUrl: undefined, videoDate: undefined });
  assert.equal(entry().videoUrl, VIDEO); assert.equal(entry().notes, '메모');
  assert.throws(() => env.context.saveEntry_({ ...sample(), videoUrl: 'javascript:alert(1)' }), /https/);
  assert.throws(() => env.context.saveEntry_({ ...sample(), youtubePostId: 'a"b' }), /예약 ID/);
  env.context.syncPublishing(); assert.equal(entry().videoUrl, VIDEO, '30일 전이면 그대로');
  env.context.saveEntry_({ ...entry(), videoDate: '2026-01-01 09:00' });
  env.context.syncPublishing(); assert.equal(entry().videoUrl, ''); assert.equal(sent.filter(item => item.url.startsWith('https://api.cloudinary.com/')).length, 1);
});

// v2.7.0 login (Auth.js)
function authEnv() {
  const env = runtime(); env.props.set('LOGIN_ID', 'hikary'); env.props.set('LOGIN_PASSWORD', 'pass-word-123');
  const call = (action, payload = {}, token = null) => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } }).text);
  const login = () => call('login', { id: 'hikary', password: 'pass-word-123' }).data.token;
  return { env, call, login };
}
test('v2.7.0 로그인 없이는 목록·저장·상품 찾기·게시를 모두 거절하고 시트·외부 호출을 하지 않는다', () => {
  const { env, call } = authEnv();
  for (const action of ['status', 'list', 'save', 'delete', 'products', 'link', 'request', 'requests', 'requestUpdate', 'publish', 'logout', 'analyze', 'unknown']) {
    const result = call(action, sample()); assert.equal(result.ok, false, action); assert.equal(result.auth, true, action); assert.match(result.error, /로그인이 필요/);
  }
  assert.equal(call('list', {}, 'x'.repeat(64)).auth, true, '모르는 토큰');
  assert.equal(env.writes(), 0); assert.equal(env.fetches(), 0);
});
test('v2.7.0 로그인하면 세션 토큰으로 쓰고(토큰은 해시로만 저장), 5번 틀리면 맞아도 1시간 막는다', () => {
  const { env, call } = authEnv();
  const ok = call('login', { id: ' hikary ', password: 'pass-word-123' });
  assert.equal(ok.ok, true); assert.match(ok.data.token, /^[a-f0-9]{64}$/); assert.equal(ok.data.days, 90);
  assert.equal(call('list', {}, ok.data.token).ok, true);
  assert.ok(!env.props.get('SESSIONS').includes(ok.data.token));
  const bad = authEnv();
  assert.match(bad.call('login', { id: 'hikary', password: 'wrong' }).error, /남은 기회 4번/);
  for (let i = 0; i < 3; i++) bad.call('login', { id: 'hikary', password: 'wrong' });
  assert.match(bad.call('login', { id: 'hikary', password: 'wrong' }).error, /5번 틀려서/);
  assert.match(bad.call('login', { id: 'hikary', password: 'pass-word-123' }).error, /5번 틀려서/);
  const unset = runtime(); assert.match(JSON.parse(unset.context.doPost({ postData: { contents: JSON.stringify({ action: 'login', payload: { id: 'a', password: 'b' } }) } }).text).error, /LOGIN_ID/);
});
test('v2.7.0 로그아웃은 그 세션만, 모든 기기 로그아웃은 전부 끝내고, 90일 안 쓴 세션은 끝난다', () => {
  const { env, call, login } = authEnv();
  const a = login(), b = login();
  assert.equal(call('logout', {}, a).ok, true); assert.equal(call('list', {}, a).auth, true); assert.equal(call('list', {}, b).ok, true);
  assert.equal(call('logout', { all: true }, login()).data.all, true); assert.equal(call('list', {}, b).auth, true);
  const d = login(); const sessions = JSON.parse(env.props.get('SESSIONS'));
  for (const key of Object.keys(sessions)) sessions[key].used = Date.now() - 91 * 864e5;
  env.props.set('SESSIONS', JSON.stringify(sessions)); assert.equal(call('list', {}, d).auth, true);
  assert.match(call('logout', {}, TOOL).error, /브라우저/, '도구 키로는 로그아웃할 수 없다');
});

// v2.8.0 Partners reports for the dashboard (Coupang.js)
test('v2.8.0 쿠팡 리포트는 클릭·주문·수익을 서명해 부르고, 하나가 실패해도 나머지를 주며, 6시간 저장해 다시 쓴다', () => {
  const env = runtime(); env.props.set('COUPANG_ACCESS_KEY', 'access-example'); env.props.set('COUPANG_SECRET_KEY', 'secret-example');
  const sent = [];
  env.context.UrlFetchApp.fetch = (url, options) => {
    sent.push({ url, options });
    if (url.includes('/reports/orders')) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ rCode: '1', rMessage: 'no permission' }) };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ rCode: '0', data: [{ date: '20261111', click: 3 }] }) };
  };
  const call = payload => JSON.parse(env.context.doPost({ postData: { contents: JSON.stringify({ action: 'report', payload }) } }).text);
  const first = call({ days: 30 });
  assert.equal(first.ok, true); assert.equal(sent.length, 3);
  assert.deepEqual(sent.map(item => item.url.split('?')[0].split('/').pop()), ['clicks', 'orders', 'commission']);
  for (const item of sent) { assert.match(item.url, /\/reports\/\w+\?startDate=[\d-]+&endDate=[\d-]+$/); assert.match(item.options.headers.Authorization, /^CEA algorithm=HmacSHA256, access-key=access-example/); assert.equal(item.options.method, 'get'); }
  assert.deepEqual(first.data.reports.clicks, [{ date: '20261111', click: 3 }]); assert.equal(first.data.reports.orders, undefined);
  assert.match(first.data.errors.orders, /요청을 받지 않았어요/); assert.equal(first.data.usage.remaining, 17);
  const again = call({ days: 30 }); assert.equal(again.data.fromCache, true); assert.equal(sent.length, 3, '6시간 안에는 다시 부르지 않는다');
  assert.equal(JSON.parse(runtime().context.doPost({ postData: { contents: JSON.stringify({ action: 'report', payload: {} }) } }).text).ok, false, '키가 없으면 거절');
});

test('v2.9.0 커버 이미지는 Cloudinary 이미지 주소만 받고, 비워 보내면 시트 값을 지킨다', () => {
  const env = runtime(); const input = sample(); const cover = 'https://res.cloudinary.com/mycloud/image/upload/v17/hikary/covers/abc.png';
  env.context.saveEntry_({ ...input, coverUrl: cover });
  const saved = env.context.readEntries_()[0]; assert.equal(saved.coverUrl, cover);
  env.context.saveEntry_({ ...input, notes: '메모', revision: saved.revision });
  assert.equal(env.context.readEntries_()[0].coverUrl, cover, '등록 도구가 칸 없이 저장해도 그대로');
  for (const bad of ['https://evil.invalid/cover.png', 'https://res.cloudinary.com/mycloud/video/upload/v1/x.mp4', 'javascript:alert(1)']) assert.throws(() => env.context.saveEntry_({ ...sample(), coverUrl: bad }), /커버 이미지|https/);
});

test('v2.10.0 요청은 템플릿·인스타 형식·한마디를 남기고, v2.5.0 탭은 빈 칸에만 새 머리글을 채운다', () => {
  const env=runtime();const call=(action,payload)=>JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action,payload})}}).text);
  env.context.SpreadsheetApp.openById().insertSheet('요청'); const tab=env.tabs.get('요청');
  tab.rows.push(['요청 ID','요청 시각','상태','상품명','쿠팡 주소','파트너스 링크','메모','어디서'],['old-1','2026-11-10 14:05','완료','서울랜드','https://trip.coupang.com/tp/products/1','','','소재 찾기']);
  const made=call('request',{sourceUrl:'https://www.coupang.com/vp/products/9',template:'photo',instagramType:'캐러셀',note:'사우나 장면 꼭'}).data.request;
  assert.deepEqual(tab.rows[0].slice(8),['템플릿','인스타 형식']); assert.deepEqual(tab.rows[1].slice(0,3),['old-1','2026-11-10 14:05','완료'],'예전 줄은 그대로');
  assert.deepEqual([made.template,made.instagramType,made.note],['photo','캐러셀','사우나 장면 꼭']);
  const listed=call('requests',{}).data.requests; assert.equal(listed[0].template,'photo'); assert.equal(listed[1].instagramType,'');
  assert.match(call('request',{sourceUrl:'https://www.coupang.com/vp/products/8',instagramType:'스토리'}).error,/릴스나 캐러셀/);
  assert.match(call('request',{sourceUrl:'https://www.coupang.com/vp/products/8',template:'../soda'}).error,/템플릿/);
  const other=runtime(); other.context.SpreadsheetApp.openById().insertSheet('요청'); other.tabs.get('요청').rows.push(['요청 ID','요청 시각','상태','상품명','쿠팡 주소','파트너스 링크','메모','어디서','누군가 쓴 칸']);
  assert.match(JSON.parse(other.context.doPost({postData:{contents:JSON.stringify({action:'requests',payload:{}})}}).text).error,/칸이 예상과 달라요/);
});
test('v2.10.0 인스타 형식은 릴스·캐러셀만 받고, 등록 도구가 칸 없이 저장해도 지킨다', () => {
  const env = runtime(); const input = sample();
  env.context.saveEntry_({ ...input, instagramType: '캐러셀' });
  const saved = env.context.readEntries_()[0]; assert.equal(saved.instagramType, '캐러셀');
  env.context.saveEntry_({ ...input, notes: '메모', revision: saved.revision });
  assert.equal(env.context.readEntries_()[0].instagramType, '캐러셀');
  assert.throws(() => env.context.saveEntry_({ ...sample(), instagramType: '스토리' }), /릴스나 캐러셀/);
});
test('v2.10.0 캐러셀 상품은 릴스로 예약하지 않고, 게시에서 형식을 바꾸며, 인스타 없이 두 곳이 올라가면 영상을 지운다', () => {
  const { env, sent, posts, call, entry, mutations } = publishEnv();
  env.context.saveEntry_({ ...entry(), instagramType: '캐러셀' });
  assert.match(call({ platforms: ['instagram'] }).error, /캐러셀이라 릴스로 예약하지 않아요/); assert.equal(mutations().length, 0);
  // Back to 릴스 inside the same 「게시」: the format is saved with the schedule.
  assert.equal(call({ platforms: ['instagram'], instagramType: '릴스' }).ok, true);
  assert.deepEqual([entry().instagramType, entry().instagramStatus], ['릴스', '예약됨']);
  assert.match(call({ platforms: ['youtube'], instagramType: '캐러셀' }).error, /형식을 바꿀 수 없어요/, '인스타가 예약된 뒤에는 못 바꾼다');
  assert.match(call({ platforms: ['youtube'], instagramType: '스토리' }).error, /릴스나 캐러셀|형식을 바꿀 수 없어요/);
  // A carousel product: YouTube and TikTok up → the video goes, though the reel place stays 미업로드.
  const two = publishEnv(); two.env.context.saveEntry_({ ...two.entry(), instagramType: '캐러셀' });
  assert.equal(two.call({ platforms: ['youtube', 'tiktok'] }).ok, true);
  two.posts.set('post1', { status: 'sent', sentAt: '2026-11-12T09:00:00.000Z', externalLink: 'https://www.youtube.com/watch?v=a' });
  two.posts.set('post2', { status: 'sent', sentAt: '2026-11-12T09:00:00.000Z', externalLink: 'https://www.tiktok.com/@a/video/1' });
  two.env.context.syncPublishing();
  assert.deepEqual([two.entry().instagramStatus, two.entry().videoUrl], ['미업로드', '']);
  assert.ok(two.sent.some(item => item.url.endsWith('/video/destroy')));
  assert.equal(sent.filter(item => item.url.endsWith('/video/destroy')).length, 0); assert.ok(posts);
});
