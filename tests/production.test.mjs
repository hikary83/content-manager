import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const window={};vm.runInNewContext(readFileSync(new URL('../docs/js/production.js',import.meta.url),'utf8'),{window});const api=window.HikaryProduction;
const plan=()=>({highlights:['실제 상품 특징','두 번째 매력'],scenes:Array.from({length:4},(_,i)=>({title:`컷 ${i+1}`,voiceover:`대사 ${i+1}\n다음 줄`,caption:'후반 자막',visual:'선택 이미지\n제목: 텍스트도 보존',motion:'느린 줌',imageName:`사진 ${i+1}.jpg`,imageId:'in-memory-only'}))});
test('제작안은 사람이 읽는 대본 텍스트로 저장·복원한다',()=>{
  const original=plan();const text=api.pack('전체 내레이션\n두 번째 줄',original);const restored=api.unpack(text);
  assert.equal(restored.script,'전체 내레이션\n두 번째 줄');assert.equal(restored.plan.scenes.length,4);assert.equal(restored.plan.scenes[1].visual,original.scenes[1].visual);assert.equal(restored.plan.scenes[0].voiceover,original.scenes[0].voiceover);assert.equal(restored.plan.highlights[1],original.highlights[1]);assert.equal(restored.plan.scenes[0].imageName,'사진 1.jpg');assert.ok(!text.includes('in-memory-only'));
});
test('기존 대본·손상된 제작안 텍스트를 삭제하지 않는다',()=>{
  for(const text of ['기존 대본','내레이션\n\n### HIKARY PLAN v1\n잘못된 형식'])assert.equal(api.unpack(text).script,text);
  assert.equal(api.pack('일반 대본',null),'일반 대본');
});
test('이미지 선택 영역은 역방향 드래그와 경계를 처리한다',()=>{
  const rect=api.cropRect({x:800,y:5000},{x:-5,y:1000},780,34439);assert.equal(rect.x,0);assert.equal(rect.width,780);assert.equal(rect.y,1000);assert.equal(rect.height,4000);
  assert.equal(api.cropRect({x:20,y:10},{x:20,y:10},780,34439).width,0);
});
test('Flow 프롬프트에 상품명과 실제 이미지 유지·후반 자막 지시를 포함한다',()=>{
  const prompt=api.flowPrompt('실제 상품',plan().scenes[0]);assert.ok(prompt.includes('실제 상품'));assert.match(prompt,/No on-screen captions/);assert.match(prompt,/Preserve actual appearance/);assert.match(prompt,/post-production/);
});
test('서버는 정확히 4컷만 수용하며 원본 범위를 벗어난 이미지 추천을 배제한다',()=>{
  const server=vm.createContext({});vm.runInContext(readFileSync(new URL('../backend/Gemini.js',import.meta.url),'utf8'),server);
  const input=plan();input.scenes.forEach(scene=>{scene.sourceImage=24;});
  const result=server.validateProduction_(input,3);assert.equal(result.scenes[0].sourceImage,0);
  input.scenes[0].sourceImage=2;assert.equal(server.validateProduction_(input,3).scenes[0].sourceImage,2);
  assert.throws(()=>server.validateProduction_({...input,scenes:input.scenes.slice(1)},3),/four scenes/);
  input.scenes[0].visual='';assert.throws(()=>server.validateProduction_(input,3),/invalid scene/);
});
