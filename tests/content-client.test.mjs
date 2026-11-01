import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
// Point the default endpoint at a test address so no test can reach the real server.
const code = readFileSync(new URL('../docs/js/config.js',import.meta.url),'utf8').replace(/apiUrl: '[^']*'/,"apiUrl: 'https://script.google.com/macros/s/test-default/exec'");
function client(fetch) { const logs=[]; const window={}; const context=vm.createContext({window,fetch,crypto:{randomUUID},performance,AbortSignal,console:{info:(...values)=>logs.push(values)}});vm.runInContext(code,context);return {api:window.HikaryApi,logs}; }
test('API 요청은 설정 없이 기본 주소로 키·접속 코드 없이 요청 ID만 본문에 보낸다',async()=>{
  let request,target;const env=client(async(url,options)=>{target=url;request=options;return {ok:true,json:async()=>({ok:true,data:{version:'1.0.0'}})};});
  await env.api.request('status');const body=JSON.parse(request.body);
  assert.equal(target,'https://script.google.com/macros/s/test-default/exec');assert.equal(body.token,undefined);assert.ok(body.requestId);
  assert.equal(request.credentials,'omit');assert.equal(request.headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(env.api.isBusy(),false);
  assert.throws(()=>env.api.configure('https://example.com/exec'),/Apps Script/);
});
test('저장 시간초과는 자동 재요청하지 않고 등록 여부 확인을 안내한다',async()=>{
  let calls=0;const env=client(async()=>{calls++;const error=new Error('timeout');error.name='TimeoutError';throw error;});
  env.api.configure('https://script.google.com/macros/s/test/exec');
  await assert.rejects(()=>env.api.request('save'),/등록 여부를 확인/);assert.equal(calls,1);assert.equal(env.api.isBusy(),false);
});
test('HTML 권한 오류를 성공으로 처리하지 않는다',async()=>{
  const env=client(async()=>({ok:true,json:async()=>{throw new Error('not json');}}));
  await assert.rejects(()=>env.api.request('status'),/접근 설정/);
});
test('폼 필드와 상태 입력이 정적 화면에 포함된다',()=>{
  const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  for(const id of ['sourceUrl','productName','description','affiliateUrl','script','youtube','instagram','tiktok','youtubeStatus','instagramStatus','tiktokStatus','notes','apiUrl','createTab','managementTab','formatShorts','formatCarousel','uploadDialog','uploadPlatform','uploadStatus','uploadDate','uploadLink']) assert.ok(html.includes(`id="${id}"`),id);
  assert.doesNotMatch(html,/id="(registrationTab|carouselTab|referenceTab)"/);
  assert.doesNotMatch(html,/accessToken|APP_ACCESS_TOKEN/);
  assert.match(html,/formnovalidate/);assert.doesNotMatch(html,/AIza[A-Za-z0-9_-]{20,}/);
});
