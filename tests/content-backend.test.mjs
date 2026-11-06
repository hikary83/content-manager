import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const LEGACY_HEADERS = ['콘텐츠 ID','등록일','카테고리','상품명','원본 링크','변환 링크','대본','YouTube 게시글','YouTube 상태','Instagram 게시글','Instagram 상태','TikTok 게시글','TikTok 상태','비고'];
const ADDED_HEADERS = ['형식','YouTube 업로드일','YouTube 링크','Instagram 업로드일','Instagram 링크','TikTok 업로드일','TikTok 링크'];
function runtime({ legacy = false } = {}) {
  const rows = [legacy ? [...LEGACY_HEADERS] : [...LEGACY_HEADERS, ...ADDED_HEADERS]];
  const props = new Map([['SHEET_ID','test'],['SHEET_NAME','콘텐츠 관리']]);
  let writes = 0; let fetches = 0;
  const sheet = { getLastRow: () => rows.length, getMaxRows: () => 1000, getMaxColumns: () => 26, insertColumnsAfter() {}, getFrozenRows: () => 1, insertRowsAfter() {}, deleteRow(row) { writes++; rows.splice(row - 1, 1); },
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

test('접속 코드 없이 요청을 처리하고 지원하지 않는 요청은 시트·AI 호출 없이 거절한다', () => {
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
  const blocked=runtime({legacy:true});blocked.rows[0][16]='메모';assert.throws(()=>blocked.context.readEntries_(),/15~21/);assert.equal(blocked.writes(),0);
});
test('형식·업로드일·게시물 링크를 검증하고 링크가 있으면 업로드완료로 저장한다', () => {
  const env=runtime();const input={...sample(),format:'캐러셀',instagramDate:'2026-11-01',instagramLink:'https://www.instagram.com/p/abc/'};
  env.context.saveEntry_(input);const saved=env.context.readEntries_()[0];
  assert.equal(saved.format,'캐러셀');assert.equal(saved.instagramStatus,'업로드완료');assert.equal(saved.instagramLink,input.instagramLink);assert.equal(saved.youtubeStatus,'미업로드');
  assert.equal(env.context.saveEntry_(sample()).replayed,false);assert.equal(env.context.readEntries_()[0].format,'쇼츠');
  assert.throws(()=>env.context.saveEntry_({...sample(),format:'릴스'}),/형식/);
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
