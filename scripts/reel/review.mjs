import fs from 'node:fs';
import path from 'node:path';
import {run,probe,reviewTimes} from './lib.mjs';
const [file,mode='review',timingFile]=process.argv.slice(2);
if(!file||!['review','reference'].includes(mode)||!fs.statSync(file).isFile()) throw new Error('사용: node scripts/reel/review.mjs <로컬.mp4> [reference|review] [timing.json]');
const video=path.resolve(file);const info=probe(video);const stream=info.streams.find(s=>s.codec_type==='video');const duration=Number(stream?.duration || info.format.duration);
if(!stream||!Number.isFinite(duration)||duration<=0||duration>180) throw new Error('180초 이내 로컬 영상이 필요합니다.');
let cuts=[];
if(mode==='reference'&&!timingFile){
  const detected=run('ffmpeg',['-v','error','-protocol_whitelist','file,pipe','-i',video,'-vf',"select='gt(scene,0.30)',metadata=print:file=-",'-an','-f','null','-']);
  cuts=[...detected.matchAll(/pts_time:([0-9.]+)/g)].map(m=>Number(m[1])).filter(t=>t>0&&t<duration).slice(0,50);
}
if(timingFile){const timing=JSON.parse(fs.readFileSync(timingFile,'utf8'));cuts=timing.scenes.slice(1).map(s=>s.start);if(cuts.some(t=>!Number.isFinite(t)||t<0||t>=duration)) throw new Error('컷 시간표를 확인해주세요.');}
const fps=Number(stream.avg_frame_rate.split('/')[0])/Number(stream.avg_frame_rate.split('/')[1]);
const out=fs.mkdtempSync(path.join(path.dirname(video),mode+'-'));
const shots=reviewTimes(duration,cuts,Number.isFinite(fps)&&fps>0?fps:30);
for(const [i,shot] of shots.entries()){
  shot.file=`${String(i).padStart(3,'0')}-${shot.kind}.jpg`;
  run('ffmpeg',['-v','error','-n','-protocol_whitelist','file,pipe','-i',video,'-ss',String(shot.time),'-frames:v','1','-vf','scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2','-pix_fmt','yuvj420p','-update','1',path.join(out,shot.file)]);
  if(!fs.existsSync(path.join(out,shot.file))) throw new Error('검수 프레임 추출 실패');
}
fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify({video:path.basename(video),duration,fps,shots},null,2));
for(const kind of ['overview','hook','boundary']){
  const count=shots.filter(s=>s.kind===kind).length;if(!count)continue;
  run('ffmpeg',['-v','error','-n','-framerate','1','-start_number',String(shots.findIndex(s=>s.kind===kind)),'-i',path.join(out,`%03d-${kind}.jpg`),'-vf',`scale=136:240,tile=6x${Math.ceil(count/6)}`,'-frames:v','1','-pix_fmt','yuvj420p','-update','1',path.join(out,kind+'-sheet.jpg')]);
}
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>HIKARY 프레임 검수</title><style>body{font:16px system-ui;background:#f8f7f3;color:#18231d;padding:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,270px);gap:16px}img{width:270px;height:480px}figure{margin:0}h2{margin-top:40px}</style><h1>${mode==='reference'?'레퍼런스 분석 자료':'게시 전 영상 검수'}</h1><p>프레임 추출 결과입니다. 의미·음성·매출 효과를 자동 판정하지 않습니다. 시간은 요청한 샘플 위치입니다.</p>${['hook','overview','boundary'].map(kind=>`<h2>${kind}</h2><div class="grid">${shots.filter(s=>s.kind===kind).map(s=>`<figure><img src="${s.file}"><figcaption>${s.time.toFixed(3)}s</figcaption></figure>`).join('')}</div>`).join('')}</html>`);
const assessment={status:'needs-human-review',duration,hook:{range:[0,Math.min(3,duration)],pattern:null,evidence:null},cta:{start:null,action:null,evidence:null},transitions:{source:timingFile?'supplied-timing':mode==='reference'?'ffmpeg-scene-candidates-threshold-0.30':'unverified',cuts},review:[{range:'0–3',question:'상품/결과가 처음 3초에 보이는가?',decision:null},{range:'전체',question:'컷 전환·상품 동일성·음성/화면 싱크·검은 화면·제휴 고지·가격 근거 확인',decision:null},{range:'끝',question:'실제 상품 링크 안내이며 댓글/DM 보상을 꾸며내지 않는가?',decision:null}],approvedPatterns:''};
fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(assessment,null,2));
console.log(`${out}\n첫 3초 0.25초 간격 + 전체 1초 간격 + 제공된 컷 경계 ±1프레임. 직접 재생/청취 후 analysis.json을 작성하세요.`);
