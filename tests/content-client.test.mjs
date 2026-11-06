import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {save} from '../tools/register.mjs';
// Point the default endpoint at a test address so no test can reach the real server.
const code = fs.readFileSync(new URL('../docs/js/config.js',import.meta.url),'utf8').replace(/apiUrl: '[^']*'/,"apiUrl: 'https://script.google.com/macros/s/test-default/exec'");
function client(fetch) { const logs=[]; const window={}; const context=vm.createContext({window,fetch,crypto:{randomUUID},performance,AbortSignal,console:{info:(...values)=>logs.push(values)}});vm.runInContext(code,context);return {api:window.HikaryApi,logs}; }
test('API 요청은 기본 주소로 키·접속 코드 없이 요청 ID만 본문에 보낸다',async()=>{
  let request,target;const env=client(async(url,options)=>{target=url;request=options;return {ok:true,json:async()=>({ok:true,data:{version:'1.0.0'}})};});
  await env.api.request('status');const body=JSON.parse(request.body);
  assert.equal(target,'https://script.google.com/macros/s/test-default/exec');assert.equal(body.token,undefined);assert.ok(body.requestId);
  assert.equal(request.credentials,'omit');assert.equal(request.headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(env.api.isBusy(),false);
});
test('저장·삭제 시간초과는 자동 재요청하지 않고 반영 여부 확인을 안내한다',async()=>{
  let calls=0;const env=client(async()=>{calls++;const error=new Error('timeout');error.name='TimeoutError';throw error;});
  await assert.rejects(()=>env.api.request('save'),/반영됐는지 확인/);await assert.rejects(()=>env.api.request('delete'),/반영됐는지 확인/);
  assert.equal(calls,2);assert.equal(env.api.isBusy(),false);
});
test('HTML 권한 오류를 성공으로 처리하지 않는다',async()=>{
  const env=client(async()=>({ok:true,json:async()=>{throw new Error('not json');}}));
  await assert.rejects(()=>env.api.request('status'),/접근 설정/);
});
test('화면은 업로드 관리만 남고 보기·수정·삭제와 업로드 기록 입력을 갖는다',()=>{
  const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  for(const id of ['entries','search','filters','detailDialog','d-productName','d-category','d-sourceUrl','d-affiliateUrl','d-script','d-youtube','d-instagram','d-tiktok','d-notes','detailDelete','uploadDialog','uploadPlatforms','uploadStatus','uploadDate','uploadLink','uploadClear']) assert.ok(html.includes(`id="${id}"`),id);
  assert.doesNotMatch(html,/id="(createTab|formatCarousel|analyzeButton|generateButton|carouselMount|referenceDialog)"/);
  assert.doesNotMatch(html,/(production|reference|carousel|image-analysis)\.js/);
  assert.doesNotMatch(html,/accessToken|APP_ACCESS_TOKEN/);assert.doesNotMatch(html,/AIza[A-Za-z0-9_-]{20,}/);
});
test('등록 도구는 보내기 전에 ID를 파일에 남기고 저장 후 revision을 기록한다',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-register-'));const file=path.join(dir,'entry.json');
  try{
    fs.writeFileSync(file,JSON.stringify({productName:'상품',category:'생활',sourceUrl:'https://www.coupang.com/vp/products/1',script:'대본'}));
    let sent,idOnDisk;
    await save(file,async(action,payload)=>{sent={action,payload};idOnDisk=JSON.parse(fs.readFileSync(file,'utf8')).id;return {id:payload.id,revision:'rev-1'};});
    const entry=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(sent.action,'save');assert.equal(sent.payload.format,'쇼츠');assert.ok(entry.id);assert.equal(idOnDisk,entry.id);assert.equal(entry.revision,'rev-1');
    await save(file,async(_,payload)=>{assert.equal(payload.id,entry.id);assert.equal(payload.revision,'rev-1');return {id:payload.id,revision:'rev-2'};});
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).revision,'rev-2');
  }finally{fs.rmSync(dir,{recursive:true});}
});
