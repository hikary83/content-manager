import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// v2.0.0 retired the web shorts editor; the server-side Gemini shorts action is kept for now, so its check stays.
const plan=()=>({highlights:['실제 상품 특징','두 번째 매력'],scenes:Array.from({length:4},(_,i)=>({title:`컷 ${i+1}`,voiceover:`대사 ${i+1}\n다음 줄`,caption:'후반 자막',visual:'선택 이미지\n제목: 텍스트도 보존',motion:'느린 줌'}))});
test('서버는 정확히 4컷만 수용하며 원본 범위를 벗어난 이미지 추천을 배제한다',()=>{
  const server=vm.createContext({});vm.runInContext(readFileSync(new URL('../backend/Gemini.js',import.meta.url),'utf8'),server);
  const input=plan();input.scenes.forEach(scene=>{scene.sourceImage=24;});
  const result=server.validateProduction_(input,3);assert.equal(result.scenes[0].sourceImage,0);
  input.scenes[0].sourceImage=2;assert.equal(server.validateProduction_(input,3).scenes[0].sourceImage,2);
  assert.throws(()=>server.validateProduction_({...input,scenes:input.scenes.slice(1)},3),/four scenes/);
  input.scenes[0].visual='';assert.throws(()=>server.validateProduction_(input,3),/invalid scene/);
});
