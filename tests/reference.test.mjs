import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
// v2.0.0 retired the web reference popup; the server-side reference action is kept for now, so its checks stay.
const server=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../backend/Gemini.js',import.meta.url),'utf8'),server);
const sample=()=>({hook:'결과 사진부터 등장',cta:'링크 확인 안내',transitions:[{at:3,description:'사진 변경 관찰'}],patterns:['결과 먼저 보여주기'],warnings:['음성 미청취']});
test('서버는 모델 응답 범위·내용을 검증하고 음성 미청취를 명시한다',()=>{assert.match(server.validateReferenceResult_(sample(),18,false).basis,/화면만/);assert.match(server.validateReferenceResult_(sample(),18,true).basis,/미검증/);const bad=sample();bad.transitions[0].at=20;assert.throws(()=>server.validateReferenceResult_(bad,18,false));bad.transitions=[];bad.patterns=[];assert.throws(()=>server.validateReferenceResult_(bad,18,false));});
test('프레임 용량·개수·시간 검증은 AI 호출 전에 시행한다',()=>{server.field_=(v)=>v;server.userError_=m=>new Error(m);for(const payload of [{duration:181,frames:[]},{duration:18,frames:[{time:20,data:'aA==',mimeType:'image/jpeg'}]},{duration:18,frames:[{time:0,data:'a'.repeat(300001),mimeType:'image/jpeg'}]}])assert.throws(()=>server.analyzeReference_(payload));});
