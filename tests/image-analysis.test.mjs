import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../docs/js/image-analysis.js',import.meta.url),'utf8');
function runtime(extra={}) {const window={};vm.runInNewContext(code,{window,...extra});return window.HikaryImages;}
test('780×34439 상세 이미지는 누락 없이 겹치는 19구간으로 분할한다',()=>{
  const regions=runtime().tiles(780,34439);assert.equal(regions.length,19);assert.equal(regions[0].y,0);
  assert.equal(regions.at(-1).y+regions.at(-1).height,34439);
  for(let i=0;i<regions.length;i++){assert.equal(regions[i].outputWidth,780);assert.ok(regions[i].outputHeight<=2000);if(i)assert.ok(regions[i].y<regions[i-1].y+regions[i-1].height);}
});
test('작은 상품 사진은 한 구간으로 유지하고 큰 가로 사진은 비율을 유지한다',()=>{
  assert.equal(runtime().tiles(1180,630).length,1);
  const region=runtime().tiles(2400,3000)[0];assert.equal(region.outputWidth,1200);assert.equal(region.outputHeight,1500);
});
test('과도한 크기와 분할 수는 읽기 전에 제한한다',()=>{
  for(const dims of [[0,10],[20000,20000],[780,70000]]) assert.throws(()=>runtime().tiles(...dims));
});
test('캔버스로 각 구간을 인코딩하고 비트맵을 해제한다',async()=>{
  const draws=[];let closed=false;
  const api=runtime({Blob,Uint8Array,btoa,createImageBitmap:async()=>({width:780,height:34439,close:()=>{closed=true;}}),document:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage:(...args)=>draws.push(args)}),toBlob:callback=>callback(new Blob(['test'],{type:'image/jpeg'}))})}});
  const output=await api.prepare(new Blob());assert.equal(output.parts.length,19);assert.equal(draws.length,19);assert.ok(closed);assert.equal(output.parts[0].mimeType,'image/jpeg');
});
