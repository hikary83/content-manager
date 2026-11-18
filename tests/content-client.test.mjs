import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {save,draft,shrinkVideo,defaults,requestAdd,template} from '../tools/register.mjs';
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
  await assert.rejects(()=>env.api.request('publish'),/반영됐는지 확인/); // v2.8.0: a lost publish reply must not invite a second post
  assert.equal(calls,3);assert.equal(env.api.isBusy(),false);
});
test('v2.9.0 로그인하면 세션을 저장해 다음 요청에 붙이고, 세션이 끝났다는 답이면 지우고 알린다',async()=>{
  const store=()=>{const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};};
  const local=store(),session=store(),bodies=[],events=[];let reply={ok:true,data:{token:'t'.repeat(64),days:90}};
  const window={dispatchEvent:event=>events.push(event.type)};
  const context=vm.createContext({window,fetch:async(_,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>reply};},crypto:{randomUUID},performance,AbortSignal,console:{info(){}},localStorage:local,sessionStorage:session,Event:class{constructor(type){this.type=type;}}});
  vm.runInContext(code,context);const api=window.HikaryApi;
  await api.login('hikary','pw',true);assert.equal(bodies[0].token,undefined);assert.equal(bodies[0].payload.password,'pw');assert.equal(local.map.get('hikary-session'),'t'.repeat(64));assert.equal(api.hasSession(),true);
  reply={ok:true,data:{entries:[]}};await api.request('list');assert.equal(bodies[1].token,'t'.repeat(64));
  reply={ok:false,error:'로그인이 필요해요.',auth:true};await assert.rejects(()=>api.request('list'),error=>error.auth===true);
  assert.equal(api.hasSession(),false);assert.deepEqual(events,['hikary-login']);
  reply={ok:true,data:{token:'s'.repeat(64),days:90}};await api.login('hikary','pw',false);assert.equal(session.map.get('hikary-session'),'s'.repeat(64));assert.equal(local.map.size,0,'로그인 유지를 끄면 브라우저를 닫을 때까지만');
  reply={ok:true,data:{loggedOut:true}};await api.logout();assert.equal(bodies.at(-1).action,'logout');assert.equal(api.hasSession(),false);
});
test('HTML 권한 오류를 성공으로 처리하지 않는다',async()=>{
  const env=client(async()=>({ok:true,json:async()=>{throw new Error('not json');}}));
  await assert.rejects(()=>env.api.request('status'),/접근 설정/);
});
test('v3.0.0 화면: 대시보드·콘텐츠·소재 찾기, ✎ 세부정보(기록 합침), 게시, 로그인을 갖는다',()=>{
  const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  for(const id of ['side','menuButton','tabsBar','scrim','dashboardView','contentView','findView','requestCount','latest','todo','upcoming','statContents','statPosted','statWeek','entries','search','filters','refresh','detailDialog','detailTitle','detailMeta','d-productName','d-category','d-sourceUrl','d-affiliateUrl','d-inpockNo','d-inpockTitle','d-inpockImage','d-inpockSave','d-script','d-youtubeTitle','d-youtubeCount','d-youtubeBody','d-instagram','d-kittyKeyword','d-kittyDm','d-tiktok','d-notes','detailDelete','detailCancel','places','sidePublish','sideAffiliate','sidePage','detailVideo','quotaLeft','quotaBar','finderSource','finderLoad','finderSearch','finderKeyword','finderResults','linkForm','linkUrl','linkResult','linkOut','linkHint','linkName','linkPage','linkClaude','linkAsk','publishDialog','publishForm','publishVideo','publishDate','publishTime','publishPlaces','publishCode','publishSubmit','loginView','loginForm','loginId','loginPassword','loginKeep','loginMessage','accountButton','accountMenu','logoutHere','logoutAll','modeList','modeCal','listBox','calendarBox','calPrev','calNext','calRange','calToday','calWeek','calMonth','calSlots','weekGrid','monthWrap','monthGrid','dayPanel','pickDialog','pickTitle','pickList','pickClose','coupangTotals','coupangBars','coupangAxis','coupangNote','coupangRange','ordersRange','clicksRange','clicksHead','monthTotals','monthNote','productClicks','recentOrders','askDraft','askDraftVideo','askDraftAt','d-coverPlay','settingsView','setTabTemplates','setTabGeneral','setTemplates','setGeneral','tplSettings','tplCount','setPublishTime','setIgType','setSaveBar','setDirty','setUndo','setSave','pickHint']) assert.ok(html.includes(`id="${id}"`),id);
  assert.doesNotMatch(html,/id="(uploadDialog|views|ledgerView|finderView|requestBox)"/,'v2 화면은 남기지 않는다');
  for(const site of ['link.inpock.co.kr/inpockhome','kittychat.ai','publish.buffer.com','console.cloudinary.com','partners.coupang.com','www.coupang.com','docs.google.com/spreadsheets']) assert.ok(html.includes(site),site);
  assert.equal((html.match(/class="s" href="https:[^"]+" target="_blank" rel="noopener noreferrer"/g)||[]).length,7,'바로가기 7개는 모두 새 창');
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
    assert.equal(sent.action,'save');assert.equal(sent.payload.format,undefined);assert.ok(entry.id);assert.equal(idOnDisk,entry.id);assert.equal(entry.revision,'rev-1');
    await save(file,async(_,payload)=>{assert.equal(payload.id,entry.id);assert.equal(payload.revision,'rev-1');return {id:payload.id,revision:'rev-2'};});
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).revision,'rev-2');
  }finally{fs.rmSync(dir,{recursive:true});}
});
const ffmpeg=spawnSync('ffmpeg',['-version']).status===0;
test('v2.3.0 등록 도구는 옆의 inpock.png를 45,000자 안의 JPEG 데이터로 보내고 파일 경로는 그대로 둔다',{skip:!ffmpeg&&'ffmpeg가 필요해요'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-inpock-'));const file=path.join(dir,'entry.json');
  try{
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=1080x1080','-frames:v','1',path.join(dir,'inpock.png')]);
    fs.writeFileSync(file,JSON.stringify({productName:'상품',category:'생활',sourceUrl:'https://www.coupang.com/vp/products/1',script:'대본',inpockImage:'inpock.png'}));
    let sent;await save(file,async(_,payload)=>{sent=payload;return {id:payload.id,revision:'rev-1'};});
    assert.match(sent.inpockImage,/^data:image\/jpeg;base64,/);assert.ok(sent.inpockImage.length<=45000);
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).inpockImage,'inpock.png','파일에는 경로를 남긴다');
  }finally{fs.rmSync(dir,{recursive:true});}
});
test('v3.7.0 스터디 결과 파일은 ## 분석·개선 방향·결정을 나눠 보내고, 상태만 줄 수도 있다',async()=>{
  const {studySections,studyWrite}=await import('../tools/register.mjs');
  assert.deepEqual(studySections('## 분석\n숙소 릴스 — 질문 훅\n· 컷 1초\n\n## 개선 방향\n컷을 2초로\r\n## 결정\n262에서 시험\n'),{result:'숙소 릴스 — 질문 훅\n· 컷 1초',direction:'컷을 2초로',decision:'262에서 시험'});
  assert.deepEqual(studySections('## 결정\n보류해요'),{decision:'보류해요'});
  assert.throws(()=>studySections('제목 없이 쓴 글'),/## 분석/);
  const sent=[];const send=async(action,payload)=>{sent.push([action,payload]);return {studies:[]};};
  await studyWrite('S12','반영',undefined,send);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'study-'));const file=path.join(dir,'결정.md');fs.writeFileSync(file,'## 결정\n투어 컷 2초로 가요');
  await studyWrite('S12',file,'반영',send);
  assert.deepEqual(sent,[['studyUpdate',{ids:['S12'],status:'반영'}],['studyUpdate',{ids:['S12'],decision:'투어 컷 2초로 가요',status:'반영'}]]);
  await assert.rejects(()=>studyWrite('S12',file,'의견있음',send),/상태는/);
  // v3.8.0 말머리: a ## 말머리 section (one word), or the word alone for one or several rows; 없음 empties it; anything else is refused.
  assert.deepEqual(studySections('## 말머리\n도구\n\n## 분석\n템플릿 쪽으로 다시 봤어요'),{topic:'도구',result:'템플릿 쪽으로 다시 봤어요'});
  assert.throws(()=>studySections('## 말머리\n개발\n## 분석\n글'),/말머리는/);
  sent.length=0;
  await studyWrite('S1, S2','도구',undefined,send); await studyWrite('S3','없음',undefined,send);
  assert.deepEqual(sent,[['studyUpdate',{ids:['S1','S2'],topic:'도구'}],['studyUpdate',{ids:['S3'],topic:''}]]);
  await assert.rejects(()=>studyWrite('S1','개발',undefined,send),/말머리는/);
  fs.rmSync(dir,{recursive:true});
});
test('v3.7.0 카톡 「나와의 채팅」 내보내기에서 링크·시각·같이 쓴 말을 뽑는다 (PC·휴대폰 모양)',async()=>{
  const {kakaoLinks}=await import('../tools/register.mjs');
  const pc='HIKARY 님과 카카오톡 대화\n저장한 날짜 : 2026-11-14 09:00:00\n\n--------------- 2026년 11월 3일 월요일 ---------------\n[나] [오후 11:02] https://www.instagram.com/reel/AAA/?igsh=x 한옥 컷 구성\n[나] [오후 11:05] 이건 메모만\n[나] [오전 9:10] 둘 https://youtu.be/b1 https://youtu.be/b1\n두 번째 줄 메모\n';
  assert.deepEqual(kakaoLinks(pc),[{url:'https://www.instagram.com/reel/AAA/?igsh=x',memo:'한옥 컷 구성',savedAt:'2026-11-03 23:02'},{url:'https://youtu.be/b1',memo:'둘\n두 번째 줄 메모',savedAt:'2026-11-03 09:10'}]);
  const phone='2026년 11월 4일 화요일\n2026년 11월 4일 오후 12:30, 나 : 자막 좋음 https://www.tiktok.com/@a/video/1).\n2026. 11. 5. 오전 7:05, 나 : https://brunch.co.kr/@b/2\n';
  assert.deepEqual(kakaoLinks(phone),[{url:'https://www.tiktok.com/@a/video/1',memo:'자막 좋음',savedAt:'2026-11-04 12:30'},{url:'https://brunch.co.kr/@b/2',memo:'',savedAt:'2026-11-05 07:05'}]);
});

test('v3.9.0 draft는 요청을 확인하고 휴대폰 크기 영상·커버를 hikary/drafts/<요청 id>에 올려 요청 줄에 남긴다',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-draft-test-'));
  fs.writeFileSync(path.join(dir,'motion-bgm.mp4'),'video');fs.writeFileSync(path.join(dir,'cover.png'),'png');
  const puts=[],sent=[];
  const send=async(action,payload)=>{sent.push([action,payload]);if(action==='requests')return {requests:[{id:'req-1',status:'진행'},{id:'req-2',status:'완료'}]};return {request:{id:payload.id,draftUrl:payload.draftUrl,draftAt:'2026-11-17 15:00'}};};
  const put=async(file,kind,publicId)=>{puts.push([path.basename(file),kind,publicId]);return {secure_url:`https://res.cloudinary.com/c/${kind}/upload/v1/${publicId}.${kind==='video'?'mp4':'png'}`,bytes:1,duration:17,width:540,height:960};};
  const shrink=(source,target)=>{assert.equal(path.basename(source),'motion-bgm.mp4');fs.writeFileSync(target,'small');return target;};
  const done=await draft('req-1',dir,{send,put,shrink});
  assert.deepEqual(puts,[['hikary-draft-req-1.mp4','video','hikary/drafts/req-1'],['cover.png','image','hikary/drafts/req-1-cover']]);
  assert.deepEqual(sent.at(-1),['requestUpdate',{id:'req-1',draft:true,draftUrl:'https://res.cloudinary.com/c/video/upload/v1/hikary/drafts/req-1.mp4',draftCover:'https://res.cloudinary.com/c/image/upload/v1/hikary/drafts/req-1-cover.png'}]);
  assert.equal(done.cover,true);assert.equal(fs.existsSync(path.join(os.tmpdir(),'hikary-draft-req-1.mp4')),false,'줄인 영상은 지운다');
  await assert.rejects(()=>draft('req-2',dir,{send,put,shrink}),/등록을 마친/);
  await assert.rejects(()=>draft('nope',dir,{send,put,shrink}),/찾지 못했어요/);
  await assert.rejects(()=>draft('../x',dir,{send,put,shrink}),/요청 id/);
  fs.rmSync(path.join(dir,'motion-bgm.mp4'));await assert.rejects(()=>draft('req-1',dir,{send,put,shrink}),/motion-bgm/);
  assert.equal(puts.length,2,'막힌 경우에는 아무것도 올리지 않는다');
  fs.rmSync(dir,{recursive:true,force:true});
});
test('v3.9.0 초안 영상은 가로 540으로 줄이고 소리를 남긴다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hikary-shrink-test-'));const source=path.join(dir,'in.mp4'),target=path.join(dir,'out.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=1080x1920:rate=30:duration=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
  shrinkVideo(source,target);
  const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height','-of','json',target],{encoding:'utf8'})).streams;
  assert.deepEqual(streams.find(s=>s.codec_type==='video'),{codec_type:'video',width:540,height:960});assert.ok(streams.some(s=>s.codec_type==='audio'));
  fs.rmSync(dir,{recursive:true,force:true});
});

test('v3.10.0 템플릿 순서는 설정을 templates.js 위에 덮는다 — 번호는 줄 그대로, 새 템플릿은 맨 끝에 보이기, 숨긴 건 기본값이 못 된다',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../docs/js/templates.js',import.meta.url),'utf8'),context);
  const order=context.window.HIKARY_TEMPLATE_ORDER;const ids=list=>list.map(t=>`${t.no}${t.id}${t.shown?'':'(숨김)'}${t.isDefault?'*':''}`).join(' ');
  assert.equal(ids(order()),'1soda 2paper 3quiz 4photo 5tour 6vivid*','설정이 없으면 파일 순서와 파일 기본값');
  assert.equal(ids(order({order:['vivid','photo','tour'],hidden:['soda','paper','ghost'],default:'photo'})),'6vivid 4photo* 5tour 1soda(숨김) 2paper(숨김) 3quiz','모르는 id는 건너뛰고 설정에 없는 템플릿은 맨 끝');
  assert.equal(ids(order({order:['vivid','photo'],hidden:['vivid'],default:'vivid'})).split(' ').filter(s=>s.endsWith('*')).join(),'4photo*','숨긴 기본값 대신 보이는 첫 번째');
  assert.equal(ids(order({order:['soda','vivid'],hidden:[],default:'nope'})).split(' ').filter(s=>s.endsWith('*')).join(),'6vivid*','모르는 기본값이면 파일 기본값');
  for(const tpl of order()) assert.equal(typeof tpl.example,'string',`${tpl.id} example 자리`);
});
test('v3.10.0 등록 도구는 설정의 기본값을 읽고, 채팅 상품 요청에 그때의 템플릿·인스타 형식을 적는다',async()=>{
  const sent=[];let values={};const send=async(action,payload)=>{sent.push([action,payload]);return action==='status'?{settings:{values,revision:'r'}}:{request:{id:'new',...payload}};};
  assert.deepEqual(await defaults(send),{template:'vivid',templateName:'템플릿 6 생생',instagramType:'릴스',publishTime:'07:55'},'저장 전에는 templates.js 기본값 · 릴스 · 07:55');
  values={templates:{order:['photo','vivid'],hidden:['vivid'],default:'photo'},instagramType:'캐러셀',publishTime:'08:10'};
  assert.deepEqual(await defaults(send),{template:'photo',templateName:'템플릿 4 사진',instagramType:'캐러셀',publishTime:'08:10'});
  await requestAdd('https://trip.coupang.com/tp/products/1','강릉 펜션',send);
  assert.deepEqual(sent.at(-1),['request',{sourceUrl:'https://trip.coupang.com/tp/products/1',productName:'강릉 펜션',from:'채팅',template:'photo',instagramType:'캐러셀'}]);
  const puts=[];const put=async(...args)=>{puts.push(args);return {};};
  await template('vivid','frame.png',put);await template('vivid','clip.MP4',put);
  assert.deepEqual(puts,[['frame.png','image','hikary/templates/vivid'],['clip.MP4','video','hikary/templates/vivid-example']]);
  await assert.rejects(()=>template('../x','a.mp4',put),/템플릿 id/);
});
