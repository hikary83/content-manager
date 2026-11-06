import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const recorder=fileURLToPath(new URL('../tools/motion/record.mjs',import.meta.url));
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
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
