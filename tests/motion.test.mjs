import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const recorder=fileURLToPath(new URL('../tools/motion/record.mjs',import.meta.url));
const sfx=fileURLToPath(new URL('../tools/motion/sfx.mjs',import.meta.url));
const bgm=fileURLToPath(new URL('../tools/motion/bgm.mjs',import.meta.url));
const audio=file=>execFileSync('ffprobe',['-v','error','-select_streams','a','-show_entries','stream=codec_type','-of','csv=p=0',file],{encoding:'utf8'}).trim()==='audio';
const chrome=[process.env.CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].some(p=>p&&fs.existsSync(p));
const ffmpeg=spawnSync('ffmpeg',['-version']).status===0;
// Brightness (0–255) of one frame, from a 1×1 downscale.
const luma=(file,frame)=>execFileSync('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${frame}),scale=1:1`,'-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'])[0];
test('모션 녹화는 CSS 애니메이션을 프레임 시각에 맞춰 찍는다',{skip:!(chrome&&ffmpeg)&&'Chrome·ffmpeg가 필요해요'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-motion-'));
  try{
    const page=path.join(dir,'motion.html');
    fs.writeFileSync(page,'<!doctype html><style>body{margin:0;height:100vh;animation:fade 1s linear both}@keyframes fade{from{background:#000}to{background:#fff}}</style><body data-duration="1"></body>');
    execFileSync(process.execPath,[recorder,page],{stdio:'ignore'});
    const video=path.join(dir,'motion.mp4');
    assert.ok(luma(video,0)<30,'첫 프레임은 검정');assert.ok(luma(video,29)>220,'마지막 프레임은 거의 흰색');
    assert.ok(!audio(video),'효과음 목록이 없으면 소리를 넣지 않는다');
    const withMusic=path.join(dir,'motion-bgm.mp4');
    assert.ok(audio(withMusic),'배경음악 버전은 효과음이 없어도 만든다');assert.ok(luma(withMusic,29)>220,'배경음악 버전도 영상은 그대로');
    fs.rmSync(withMusic);
    fs.writeFileSync(page,fs.readFileSync(page,'utf8').replace('data-duration="1"','data-duration="1" data-sfx="0.1 pop, 0.5 whoosh .4"'));
    execFileSync(process.execPath,[sfx,page],{stdio:'ignore'});
    assert.ok(audio(video),'효과음 목록이 있으면 소리가 들어간다');assert.ok(luma(video,29)>220,'영상은 그대로');
    assert.ok(audio(withMusic),'효과음을 다시 넣으면 배경음악 버전도 다시 만든다');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('2.5D 표시(img data-depth)는 만들어 둔 프레임을 프레임마다 끼워 찍는다',{skip:!(chrome&&ffmpeg)&&'Chrome·ffmpeg가 필요해요'},async()=>{
  const {depthJob}=await import(new URL('../tools/motion/depth.mjs',import.meta.url).href);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-depth-'));
  try{
    const page=path.join(dir,'motion.html'),color=(c,file)=>execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=${c}:s=1080x1920`,'-frames:v','1',file]);
    color('gray',path.join(dir,'photo.jpg'));
    fs.writeFileSync(page,'<!doctype html><style>body{margin:0}img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}</style><body data-duration="1"><img src="photo.jpg" data-depth="in" style="--at:0s;--len:1s"></body>');
    const info={src:'photo.jpg',move:'in',strength:'1',position:'50% 50%',at:'0s',len:'1s',width:1080,height:1920};
    const job=depthJob(page,info,30);
    assert.equal(job.frames,30);
    assert.throws(()=>depthJob(page,{...info,move:'zoom'},30),/data-depth/);
    assert.throws(()=>depthJob(page,{...info,position:'10px 0px'},30),/object-position/);
    // Frames made in advance (black, then white) — the depth tool is not needed; the recorder only swaps them in.
    fs.mkdirSync(job.out,{recursive:true});
    color('black',path.join(dir,'black.jpg'));color('white',path.join(dir,'white.jpg'));
    for(let i=0;i<30;i++) fs.copyFileSync(path.join(dir,i<15?'black.jpg':'white.jpg'),path.join(job.out,`${String(i).padStart(4,'0')}.jpg`));
    execFileSync(process.execPath,[recorder,page],{stdio:'ignore'});
    const video=path.join(dir,'motion.mp4');
    assert.ok(luma(video,0)<30,'첫 프레임은 검은 그림');assert.ok(luma(video,29)>220,'마지막 프레임은 흰 그림');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('배경음악은 폴더 이름으로 고르고, 같은 이름이면 같은 곡이다',async()=>{
  const {musicSeed,makeMusic}=await import(pathToFileURL(bgm).href);
  assert.equal(musicSeed('contents/261107_서울랜드/motion.html','<body data-duration="25">'),'261107_서울랜드');
  assert.equal(musicSeed('contents/a/motion.html','<body data-duration="25" data-bgm="다시">'),'다시');
  assert.equal(musicSeed('contents/a/motion.html','<body data-bgm="off">'),null);
  const a=makeMusic('261106_코엑스아쿠아리움',2),b=makeMusic('261107_서울랜드',2);
  assert.ok(a.wav.equals(makeMusic('261106_코엑스아쿠아리움',2).wav),'같은 이름이면 같은 곡');
  assert.notDeepEqual(a.picks,b.picks,'다른 이름이면 다른 곡');
  assert.equal(a.wav.length,44+2*44100*4,'2초 스테레오 WAV');
});
test('--find는 그 빠르기 곡이 나오는 씨앗만 찾는다 (사진 템플릿 훅은 108bpm)',async()=>{
  const {findSeeds,makeMusic}=await import(pathToFileURL(bgm).href);
  const found=findSeeds(108,'hanok');
  assert.ok(found.some(f=>f.seed==='hanok40'),'No.256에 쓴 씨앗');
  for(const {seed} of found) assert.equal(makeMusic(seed,0.05).picks.bpm,108);
});
test('색 대비는 WCAG 계산을 따른다',async()=>{
  const {contrast}=await import(new URL('../tools/colors.mjs',import.meta.url).href);
  assert.equal(Math.round(contrast('#ffffff','#000000')),21);
  assert.equal(contrast('#777777','#ffffff').toFixed(2),'4.48');
  assert.equal(contrast('#e3b04b','#171717'),contrast('#171717','#e3b04b'),'순서와 상관없다');
});
test('효과음 목록은 「초 소리 [크기]」만 받는다',async()=>{
  const {parseCues}=await import(pathToFileURL(sfx).href);
  assert.deepEqual(parseCues('0.12 pop .5, 1.9 whoosh'),[[0.12,'pop',0.5],[1.9,'whoosh',0.6]]);
  assert.deepEqual(parseCues(''),[]);
  assert.throws(()=>parseCues('1 boom'),/효과음/);
  assert.throws(()=>parseCues('-1 pop'),/효과음/);
});
test('나레이션 대본은 「| 시작–끝 | 화면 | 나레이션 |」 줄만 읽는다',async()=>{
  const {parseNarration}=await import(new URL('../tools/motion/voice.mjs',import.meta.url).href);
  const md='# 나레이션 대본\n\n| 시간 | 화면 | 나레이션 |\n| --- | --- | --- |\n| 0.15–3.7 | 훅 | 크리스마스 분위기, 미리 느낄 곳? |\n| 3.85-6.3 | 후기 | 후기, 요약해 봤어요. |\n';
  assert.deepEqual(parseNarration(md,25),[{at:0.15,end:3.7,text:'크리스마스 분위기, 미리 느낄 곳?',seed:1},{at:3.85,end:6.3,text:'후기, 요약해 봤어요.',seed:101}]);
  assert.deepEqual(parseNarration('대본 없음',25),[]);
  assert.throws(()=>parseNarration('| 1–3 | a |\n| 2–4 | b |',25),/나레이션/,'앞줄과 겹치면 안 된다');
  assert.throws(()=>parseNarration('| 20–26 | a |',25),/나레이션/,'영상 길이를 넘으면 안 된다');
  assert.throws(()=>parseNarration('| 3–1 | a |',25),/나레이션/,'끝이 시작보다 늦어야 한다');
  assert.throws(()=>parseNarration('| 1–3 |  |',25),/나레이션/,'읽을 문장이 있어야 한다');
});
