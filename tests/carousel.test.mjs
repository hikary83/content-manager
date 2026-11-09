import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// v2.0.0 retired the web carousel editor; the server-side Gemini carousel action is kept for now, so its checks stay.
const server=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../backend/Gemini.js',import.meta.url),'utf8'),server);
const content=()=>({emoji:'🌊',cover:{label:'TRAVEL PICK',hook:'주말엔 어디로?',topic:'도심 속 바다',sub:'아쿠아리움 정보'},intro:{heading:'왜 지금일까?',body:'공감 문장\n소개 문장',tags:['#여행','#바다']},question:{heading:'어디로 갈까요?',body:'짧은 본문',note:'옵션 먼저 확인',caption:'바다 생물'},checks:{heading:'가기 전 체크',items:[{title:'날짜',text:'옵션 확인'}]},points:{heading:'포인트',items:[{tag:'포함',title:'입장권',text:'설명',tip:'짧은 팁'}]},tip:{heading:'이것만 기억',title:'한 줄 요약',body:'**핵심** 문장',steps:[{label:'예약 전',text:'확인'}],cta:'저장해 두고\n링크 확인'},facts:{heading:'정보',items:[],note:'조건은 상품 페이지에서'},outro:{line1:'저장해 두세요',line2:'링크에서 확인'}});
const sample=()=>({content:content(),caption:'게시 전 확인',warnings:['조건 확인']});
test('AI 응답은 공통 블록 구조·개수·길이를 검증한다',()=>{
  const ok=server.validateCarousel_(sample());assert.equal(ok.content.points.items[0].title,'입장권');
  let data=sample();data.content.checks.items=Array.from({length:6},()=>({title:'a',text:'b'}));assert.throws(()=>server.validateCarousel_(data));
  data=sample();data.content.intro.body='가'.repeat(161);assert.throws(()=>server.validateCarousel_(data));
  data=sample();data.content.cover.topic=' ';assert.throws(()=>server.validateCarousel_(data));
  data=sample();delete data.content.facts;assert.throws(()=>server.validateCarousel_(data));
  data=sample();data.content.facts.items=[];assert.deepEqual(server.validateCarousel_(data).content.facts.items,[]);
  assert.equal(server.carouselSchema_(server.CAROUSEL_SPEC_).properties.checks.properties.items.maxItems,5);
});
// v2.4.x: a page without numbered slides (cover.html, inpock.html) is one PNG at <body data-size>.
import {execFileSync,spawnSync} from 'node:child_process';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const render=fileURLToPath(new URL('../tools/carousel/render.mjs',import.meta.url));
const canShoot=[process.env.CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].some(p=>p&&fs.existsSync(p))&&spawnSync('ffprobe',['-version']).status===0;
test('장이 없는 HTML은 data-size 크기로 한 장(파일 이름.png)을 찍는다',{skip:!canShoot&&'Chrome·ffprobe가 필요해요'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-cover-'));
  try{
    const page=path.join(dir,'cover.html');
    fs.writeFileSync(page,'<!doctype html><body data-size="1080x1920" style="margin:0;background:#f00"></body>');
    execFileSync(process.execPath,[render,page],{stdio:'ignore'});
    assert.equal(execFileSync('ffprobe',['-v','error','-show_entries','stream=width,height','-of','csv=p=0',path.join(dir,'cover.png')],{encoding:'utf8'}).trim(),'1080,1920');
    fs.writeFileSync(page,'<!doctype html><body></body>');
    assert.throws(()=>execFileSync(process.execPath,[render,page],{stdio:'pipe'}),/data-size/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
