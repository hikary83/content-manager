import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validate,localFile,reviewTimes,run} from '../scripts/reel/lib.mjs';
// The job file Claude writes next to the photos (the shape the retired web editor used to export).
const job=()=>({schema:'hikary-video/1',productName:'실제 상품',captions:false,fps:30,scenes:['hook','benefit','evidence','cta'].map((role,i)=>({role,duration:[3,4,5,6][i],image:`${i+1}.jpg`,voiceover:'상품을 확인해보세요.',visual:'실제 사진',motion:'push-in',transition:'cut'}))});
test('자막 없는 4컷 영상 작업은 18초로 검증된다',()=>{const j=job();assert.equal(validate(j),18);assert.equal(j.scenes[0].role,'hook');assert.equal(j.scenes[3].role,'cta');});
test('길이·자막·실행할 수 없는 움직임·원격 이미지 입력을 거부한다',()=>{for(const mutate of [j=>j.captions=true,j=>j.scenes[0].duration=4,j=>j.scenes[0].motion='exec',j=>j.scenes.pop()]){const j=job();mutate(j);assert.throws(()=>validate(j));}assert.throws(()=>localFile('.', 'https://example.com/image.jpg'));});
test('경로 이탈을 막고 한글·공백 파일명은 보존한다',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'reel-test-'));try{fs.writeFileSync(path.join(root,'상품 사진.jpg'),'test');assert.equal(localFile(root,'상품 사진.jpg'),fs.realpathSync(path.join(root,'상품 사진.jpg')));assert.throws(()=>localFile(root,'../outside.jpg'));}finally{fs.rmSync(root,{recursive:true});}});
test('첫 3초 12장·전체 1초·컷 전후 1프레임을 모두 생성한다',()=>{const s=reviewTimes(18,[3,7,12],30);assert.equal(s.filter(x=>x.kind==='hook').length,12);assert.equal(s.filter(x=>x.kind==='overview').length,18);assert.equal(s.filter(x=>x.kind==='boundary').length,9);assert.ok(s.some(x=>Math.abs(x.time-(3-1/30))<.000001));});
test('실행 실패는 성공 처리하지 않는다',()=>assert.throws(()=>run(process.execPath,['-e','process.exit(2)']),/실패/));
