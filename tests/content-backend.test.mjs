import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

function runtime() {
  const rows = [['콘텐츠 ID','등록일','카테고리','상품명','원본 링크','변환 링크','대본','YouTube 게시글','YouTube 상태','Instagram 게시글','Instagram 상태','TikTok 게시글','TikTok 상태','비고']];
  const props = new Map([['SHEET_ID','test'],['SHEET_NAME','콘텐츠 관리'],['APP_ACCESS_TOKEN','a'.repeat(64)]]);
  let writes = 0; let fetches = 0;
  const sheet = { getLastRow: () => rows.length, getMaxRows: () => 1000,
    getRange(row, col, height = 1, width = 1) { return {
      getValues: () => Array.from({length:height}, (_, y) => Array.from({length:width}, (_, x) => rows[row-1+y]?.[col-1+x] ?? '')),
      getDisplayValues() { return this.getValues(); },
      setValues(values) { writes++; values.forEach((line,y) => { rows[row-1+y] ||= []; line.forEach((value,x) => { rows[row-1+y][col-1+x] = value.startsWith("'") ? value.slice(1) : value; }); }); },
      setDataValidation() {}
    }; }
  };
  const validation = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
  const context = vm.createContext({
    console: { info() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || null, setProperty: (key,value) => props.set(key,value) }) },
    Utilities: { getUuid: randomUUID, DigestAlgorithm: { SHA_256:'sha256' }, Charset:{ UTF_8:'utf8' }, computeDigest: (_,value) => [...createHash('sha256').update(value).digest()], formatDate: () => '2026-10-28', base64Encode: value => Buffer.from(value).toString('base64'), base64Decode: value => [...Buffer.from(value,'base64')] },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({getSheetByName: () => sheet}), newDataValidation: () => validation, flush() {} },
    ContentService: { MimeType:{JSON:'application/json'},createTextOutput: text => ({text,setMimeType() {return this;}}) },
    UrlFetchApp: { fetch() { fetches++; throw new Error('unexpected network'); } }
  });
  for (const name of ['Code','Product','Gemini']) vm.runInContext(readFileSync(new URL(`../backend/${name}.js`,import.meta.url),'utf8'),context);
  return { context, rows, props, writes: () => writes, fetches: () => fetches };
}
const sample = () => ({id:randomUUID(),category:'여행',productName:'제주 숙소',sourceUrl:'https://trip.coupang.com/product',affiliateUrl:'',script:'실제 상품정보 기반 대본',youtube:'',instagram:'',tiktok:'',notes:''});

test('인증 없는 요청은 시트와 AI를 호출하지 않는다', () => {
  const env=runtime();
  for(const action of ['save','generate','analyze','list','image']) {
    const result=JSON.parse(env.context.doPost({postData:{contents:JSON.stringify({action,payload:sample(),token:'wrong'})}}).text);
    assert.equal(result.ok,false); assert.match(result.error,/접속 코드/);
  }
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
test('헤더 불일치·잘못된 업로드 상태를 거부하고 수식을 문자열로 처리한다', () => {
  const env=runtime();assert.throws(()=>env.context.saveEntry_({...sample(),youtubeStatus:'INVALID'}),/업로드 상태/);
  assert.equal(env.context.sheetLiteral_('=IMPORTXML("x")'),"'=IMPORTXML(\"x\")");
  env.rows[0][0]='다른 컬럼';assert.throws(()=>env.context.saveEntry_(sample()),/컬럼/);assert.equal(env.writes(),0);
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
  const expected={summary:'확인된 정보',warnings:['가격 재확인'],script:'내레이션',youtube:'제목',instagram:'본문',tiktok:'짧은 글'};let captured;
  env.context.UrlFetchApp.fetch=(url,options)=>{captured=JSON.parse(options.payload);return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(expected)}]}}]})};};
  const data=env.context.generateContent_({productName:'테스트',description:'실제 설명',images:[{inline:{mimeType:'image/png',data:'aW1hZ2U='}}]});
  assert.equal(data.script,expected.script);assert.equal(captured.contents[0].parts.length,2);assert.equal(captured.generationConfig.responseMimeType,'application/json');assert.equal(env.writes(),0);
});
test('Gemini 오류에서 키·제공자 원문을 노출하지 않는다', () => {
  const env=runtime();env.props.set('GEMINI_API_KEY','secret-example');env.props.set('GEMINI_MODEL','gemini-2.5-flash');
  env.context.UrlFetchApp.fetch=()=>({getResponseCode:()=>403,getContentText:()=>'{"error":"secret-example"}'});
  assert.throws(()=>env.context.generateContent_({productName:'테스트',description:'설명',images:[]}),error=>!error.message.includes('secret-example')&&error.message.includes('403'));
});
