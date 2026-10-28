import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const code = readFileSync(new URL('../docs/js/config.js',import.meta.url),'utf8');
function client(fetch) { const logs=[]; const window={}; const context=vm.createContext({window,fetch,crypto:{randomUUID},performance,AbortSignal,console:{info:(...values)=>logs.push(values)}});vm.runInContext(code,context);return {api:window.HikaryApi,logs}; }
test('API 요청은 키 없이 접속 코드와 요청 ID를 본문으로 보내고 진단 로그에는 남기지 않는다',async()=>{
  let request;const env=client(async(url,options)=>{request=options;return {ok:true,json:async()=>({ok:true,data:{version:'1.0.0'}})};});
  const secret='only-in-memory-'.repeat(4);env.api.configure('https://script.google.com/macros/s/test/exec',secret);
  await env.api.request('status');const body=JSON.parse(request.body);
  assert.equal(body.token,secret);assert.ok(body.requestId);assert.equal(request.credentials,'omit');assert.equal(request.headers['Content-Type'],'text/plain;charset=utf-8');
  assert.ok(!JSON.stringify(env.logs).includes(secret));assert.equal(env.api.isBusy(),false);
});
test('저장 시간초과는 자동 재요청하지 않고 등록 여부 확인을 안내한다',async()=>{
  let calls=0;const env=client(async()=>{calls++;const error=new Error('timeout');error.name='TimeoutError';throw error;});
  env.api.configure('https://script.google.com/macros/s/test/exec','a'.repeat(64));
  await assert.rejects(()=>env.api.request('save'),/등록 여부를 확인/);assert.equal(calls,1);assert.equal(env.api.isBusy(),false);
});
test('HTML 권한 오류를 성공으로 처리하지 않는다',async()=>{
  const env=client(async()=>({ok:true,json:async()=>{throw new Error('not json');}}));env.api.configure('https://script.google.com/macros/s/test/exec','a'.repeat(64));
  await assert.rejects(()=>env.api.request('status'),/접근 설정/);
});
test('폼 필드와 상태 입력이 정적 화면에 포함된다',()=>{
  const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  for(const id of ['sourceUrl','productName','description','affiliateUrl','script','youtube','instagram','tiktok','youtubeStatus','instagramStatus','tiktokStatus','notes','accessToken']) assert.ok(html.includes(`id="${id}"`),id);
  assert.match(html,/formnovalidate/);assert.doesNotMatch(html,/AIza[A-Za-z0-9_-]{20,}/);
});
