import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../docs/js/carousel-designs.js',import.meta.url),'utf8'),{window});const api=window.HikaryCarouselDesigns;
const server=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../backend/Gemini.js',import.meta.url),'utf8'),server);
const content=()=>({emoji:'🌊',cover:{label:'TRAVEL PICK',hook:'주말엔 어디로?',topic:'도심 속 바다',sub:'아쿠아리움 정보'},intro:{heading:'왜 지금일까?',body:'공감 문장\n소개 문장',tags:['#여행','#바다']},question:{heading:'어디로 갈까요?',body:'짧은 본문',note:'옵션 먼저 확인',caption:'바다 생물'},checks:{heading:'가기 전 체크',items:[{title:'날짜',text:'옵션 확인'}]},points:{heading:'포인트',items:[{tag:'포함',title:'입장권',text:'설명',tip:'짧은 팁'}]},tip:{heading:'이것만 기억',title:'한 줄 요약',body:'**핵심** 문장',steps:[{label:'예약 전',text:'확인'}],cta:'저장해 두고\n링크 확인'},facts:{heading:'정보',items:[],note:'조건은 상품 페이지에서'},outro:{line1:'저장해 두세요',line2:'링크에서 확인'}});
const sample=()=>({content:content(),caption:'게시 전 확인',warnings:['조건 확인']});
function canvas(){const state={};const c=new Proxy(state,{get(t,p){if(p==='measureText')return s=>({width:String(s).length*Number(/(\d+)px/.exec(t.font||'10px')[1])*.9});if(p==='createLinearGradient')return ()=>({addColorStop(){}});if(p in t)return t[p];return ()=>{};}});return {getContext:()=>c};}
const settings={channel:'HIKARY',handle:'hikary',color:'#FF6B1A',issue:'01',bio:'',disclosure:'',month:'NOVEMBER 2026',today:'11월 1일'};
vm.runInNewContext(fs.readFileSync(new URL('../docs/js/carousel.js',import.meta.url),'utf8'),{window});const editor=window.HikaryCarousel;
test('캐러셀 저장 내용은 표식과 함께 문구·설정만 담고 손상되거나 다른 형식이면 읽지 않는다',()=>{
  const state={design:'glass',content:content(),included:{'glass:4':false},disclosure:'광고 포함'};const text=editor.pack(state);
  assert.ok(text.startsWith('### HIKARY CAROUSEL v1\n'));assert.equal(JSON.stringify(editor.unpack(text)),JSON.stringify(state));
  assert.equal(editor.unpack('대본\n\n### HIKARY PLAN v1\n{}'),null);assert.equal(editor.unpack('### HIKARY CAROUSEL v1\n{broken'),null);assert.equal(editor.unpack('### HIKARY CAROUSEL v1\n{"content":{}}'),null);
});
test('캐러셀은 새 콘텐츠의 형식 선택과 숨김 영역에 연결되고 디자인 엔진과 글꼴을 먼저 불러온다',()=>{const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');assert.match(html,/id="formatCarousel"/);assert.match(html,/id="carouselMount" hidden/);assert.ok(html.indexOf('carousel-designs.js')<html.indexOf('js/carousel.js'));assert.match(html,/pretendard@v[\d.]+\/dist\/web\/static\/pretendard\.css/);assert.match(html,/Nanum\+Pen\+Script/);});
test('AI 응답은 공통 블록 구조·개수·길이를 검증한다',()=>{
  const ok=server.validateCarousel_(sample());assert.equal(ok.content.points.items[0].title,'입장권');
  let data=sample();data.content.checks.items=Array.from({length:6},()=>({title:'a',text:'b'}));assert.throws(()=>server.validateCarousel_(data));
  data=sample();data.content.intro.body='가'.repeat(161);assert.throws(()=>server.validateCarousel_(data));
  data=sample();data.content.cover.topic=' ';assert.throws(()=>server.validateCarousel_(data));
  data=sample();delete data.content.facts;assert.throws(()=>server.validateCarousel_(data));
  data=sample();data.content.facts.items=[];assert.deepEqual(server.validateCarousel_(data).content.facts.items,[]);
  assert.equal(server.carouselSchema_(server.CAROUSEL_SPEC_).properties.checks.properties.items.maxItems,5);
});
test('한글은 띄어쓰기 단위로 줄바꿈하고 긴 단어는 글자 단위로 나눈다',()=>{
  const c={measureText:t=>({width:t.length*10})};const join=lines=>lines.map(l=>l.map(s=>s.text).join('')).join('|');
  assert.equal(join(api.wrap(c,'가나다\n라마',20)),'가나|다|라마');assert.equal(join(api.wrap(c,'가나 다라',35)),'가나|다라');
  assert.equal(api.wrap(c,'**강조** 문장',100)[0][0].em,true);
});
test('두 디자인의 모든 장은 사진 없이도 1080×1350으로 그리고 긴 글은 넘침으로 표시한다',()=>{
  for(const [name,design] of Object.entries(api.designs)){
    assert.equal(design.slides.length,6);
    design.slides.forEach((_,i)=>{const target=canvas();assert.equal(api.paint(target,name,i,{d:content(),s:settings,num:'01',photo:()=>null}),false,`${name} ${i+1}`);assert.equal(target.width,1080);assert.equal(target.height,1350);});
  }
  const long=content();long.cover.hook='가'.repeat(24);assert.equal(api.paint(canvas(),'note',0,{d:long,s:settings,num:'01',photo:()=>null}),true);
});
test('근거가 없는 장은 기본으로 빠지고 사진 칸은 장 순서대로 배정된다',()=>{
  const d=content(),glass=api.designs.glass.slides;
  assert.equal(glass[4].empty(d),true);assert.equal(glass[2].empty(d),false);d.points.items=[{tag:'',title:' ',text:'',tip:''}];assert.equal(glass[2].empty(d),true);
  assert.deepEqual([...api.slots('note')],['0:bg','1:card','2:polaroid','5:bg']);assert.ok(api.slots('glass').includes('2:points.items.0'));
});
