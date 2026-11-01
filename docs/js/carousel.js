window.HikaryCarousel=(()=>{
  const D=window.HikaryCarouselDesigns;
  const SETTINGS_KEY='hikary.carousel.settings',DEFAULTS={design:'note',channel:'HIKARY',handle:'',color:'#FF6B1A',issue:1,bio:''};
  const MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  // Channel settings are not sensitive, so they persist in this browser; drafts stay in tab memory only.
  function loadSettings(){try{const s={...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};if(!D.designs[s.design])s.design=DEFAULTS.design;if(!/^#[0-9a-f]{6}$/i.test(s.color))s.color=DEFAULTS.color;return s;}catch{return {...DEFAULTS};}}
  function create(options){
    const root=document.getElementById('carouselMount');
    root.innerHTML=`<section class="card"><h2>상품 링크로 캐러셀 만들기</h2><p class="hint">상품 정보로 문구를 한 번 만들고, 노트형·유리카드형 디자인에 맞춰 최대 6장을 그립니다. PNG 1080×1350(4:5). Gemini 사용량/요금이 발생할 수 있어요.</p><label>상품 링크<input id="carouselUrl" type="url" maxlength="2000" placeholder="https:// 상품 상세 페이지 주소"></label><div class="actions" style="margin-top:16px"><button id="carouselMake" type="button">링크 분석하고 캐러셀 만들기</button><button id="carouselClear" class="secondary" type="button">새로 만들기</button></div><p class="hint">초안은 이 탭에서만 유지되며 시트에 자동 저장하거나 SNS에 게시하지 않습니다. 사진과 문구를 검토 후 내려받으세요.</p></section><section class="card"><h2>디자인 · 채널 설정</h2><div class="carousel-design" role="radiogroup" aria-label="디자인"><label><input type="radio" name="carouselDesign" value="note"> 노트형</label><label><input type="radio" name="carouselDesign" value="glass"> 유리카드형</label></div><div class="carousel-settings"><label>채널명<input id="carouselChannel" maxlength="20"></label><label>아이디<input id="carouselHandle" maxlength="30" placeholder="instagram 아이디"></label><label>메인 색<input id="carouselColor" type="color"></label><label>호수 (ISSUE)<input id="carouselIssue" type="number" min="1" max="999"></label><label>채널 소개 (유리카드형 마지막 장)<input id="carouselBio" maxlength="30"></label></div><p class="hint">설정은 이 브라우저에 기억합니다. 디자인을 바꿔도 AI를 다시 부르지 않으며 고친 문구가 그대로 유지됩니다.</p></section><section class="card"><details id="carouselInfo"><summary>추출한 상품정보 확인·보완</summary><label>상품명<input id="carouselName" maxlength="200"></label><label>상세 설명<textarea id="carouselDescription" rows="6" maxlength="18000"></textarea></label><p id="carouselEvidence" class="hint"></p><div class="actions"><button id="carouselRegenerate" type="button" class="secondary">수정한 정보로 다시 만들기</button><label class="file-button">사진 추가<input id="carouselPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div><p class="hint">링크를 읽지 못하면 상품명·설명을 직접 넣고 사진을 추가하세요. 자동 수집 사진은 일반 상품 사진만 사용하며 긴 상세 이미지는 제외합니다.</p></details><label>게시글<textarea id="carouselCaption" maxlength="3000" rows="4"></textarea></label><label>하단 고지 문구 (공개 전 직접 확인)<input id="carouselDisclosure" maxlength="100" placeholder="실제 제휴 여부에 맞는 고지 문구를 입력하세요."></label></section><section id="carouselOutput" hidden><div class="actions"><button id="carouselDownload" type="button">PNG 다운로드</button><button id="carouselText" type="button" class="secondary">문구·게시글 TXT 다운로드</button></div><p class="hint">근거가 부족한 장은 빼 두었어요. 각 장의 체크로 넣고 뺄 수 있고, 빈 항목 칸은 그리지 않습니다.</p><p id="carouselWarnings" class="hint"></p><p id="carouselFont" class="hint"></p><div id="carouselCards" class="carousel-grid"></div></section>`;
    const $=id=>document.getElementById(id);
    let content=null,photos=[],canvases=[],articles=[],overflow=[],choices={},included={},frame=0,fontsReady=null;
    const settings=loadSettings(),seenFaces=new Set();
    const saveSettings=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}};
    const slides=()=>D.designs[settings.design].slides;
    const get=path=>path.split('.').reduce((o,k)=>o?.[k],content);
    function set(path,value){const keys=path.split('.'),last=keys.pop();keys.reduce((o,k)=>o[k],content)[last]=value;}
    function on(i){const key=`${settings.design}:${i}`;if(!(key in included))included[key]=!slides()[i].empty?.(content);return included[key];}
    function photoFor(i,slot){
      const key=`${settings.design}:${i}:${slot}`;
      if(key in choices)return photos.find(p=>p.id===choices[key]);
      return photos.length?photos[D.slots(settings.design).indexOf(`${i}:${slot}`)%photos.length]:undefined;
    }
    function loadFonts(){
      fontsReady??=Promise.all([500,700,800].map(w=>document.fonts.load(`${w} 40px Pretendard`,'가A'))).catch(()=>{}).then(()=>{
        $('carouselFont').textContent=[...document.fonts].some(f=>f.family.replace(/["']/g,'')==='Pretendard'&&f.status==='loaded')?'':'Pretendard 글꼴을 불러오지 못해 시스템 고딕으로 그렸어요.';refresh();
      });
      return fontsReady;
    }
    // Nanum Pen Script is split by character range, so load the ranges the current handwriting needs.
    function loadHandwriting(){
      if(settings.design!=='note')return;
      document.fonts.load('40px "Nanum Pen Script"',`${content.question.note}${content.question.caption}- 에디터 노트 -`).then(faces=>{const fresh=faces.filter(f=>!seenFaces.has(f));fresh.forEach(f=>seenFaces.add(f));if(fresh.length)refresh();}).catch(()=>{});
    }
    function context(){
      const now=new Date();
      return {channel:settings.channel.trim()||DEFAULTS.channel,handle:settings.handle.trim().replace(/^@/,''),color:settings.color,issue:String(Math.max(1,Math.floor(Number(settings.issue))||1)).padStart(2,'0'),bio:settings.bio.trim(),disclosure:$('carouselDisclosure').value.trim(),month:`${MONTHS[now.getMonth()]} ${now.getFullYear()}`,today:`${now.getMonth()+1}월 ${now.getDate()}일`};
    }
    function paintAll(){
      if(!content)return;const s=context();let num=0;
      overflow=slides().map((slide,i)=>{
        const active=on(i);if(active&&slide.numbered)num++;
        const over=D.paint(canvases[i],settings.design,i,{d:content,s,num:String(num).padStart(2,'0'),photo:slot=>photoFor(i,slot)?.image||null});
        articles[i].classList.toggle('off',!active);articles[i].querySelector('.slide-over').hidden=!over;return active&&over;
      });
      $('carouselDownload').textContent=`PNG ${slides().filter((_,i)=>on(i)).length}장 다운로드`;loadHandwriting();
    }
    function refresh(){cancelAnimationFrame(frame);frame=requestAnimationFrame(paintAll);}
    function edited(){options.changed();refresh();}
    function field(label,max,rows,value,write){const l=document.createElement('label');l.textContent=label;const input=document.createElement(rows?'textarea':'input');input.maxLength=max;if(rows)input.rows=rows;input.value=value||'';input.oninput=()=>{write(input.value);edited();};l.append(input);return l;}
    function photoSelect(i,slot,label){
      const select=document.createElement('select');select.add(new Option('사진 없음',''));for(const p of photos)select.add(new Option(p.name,p.id));
      select.value=photoFor(i,slot)?.id||'';select.onchange=()=>{choices[`${settings.design}:${i}:${slot}`]=select.value;edited();};
      if(!label){select.setAttribute('aria-label','항목 사진');return select;}
      const l=document.createElement('label');l.textContent=label;l.append(select);return l;
    }
    function listEditor(i,{path,max,keys,label,photo}){
      const box=document.createElement('div');box.className='item-list';const title=document.createElement('p');title.className='hint';title.textContent=`${label||'항목'} (최대 ${max}개, 빈 줄은 그리지 않아요)`;box.append(title);
      const list=get(path);
      for(let k=0;k<max;k++){
        const row=document.createElement('div');row.className='item-row';
        for(const [key,name,limit] of keys||[[null,label,16]]){
          const input=document.createElement('input');input.placeholder=`${k+1}. ${name}`;input.setAttribute('aria-label',`${k+1}번 ${name}`);input.maxLength=limit;input.value=(key?list[k]?.[key]:list[k])||'';
          input.oninput=()=>{while(list.length<=k)list.push(key?Object.fromEntries(keys.map(([x])=>[x,''])):'');if(key)list[k][key]=input.value;else list[k]=input.value;edited();};row.append(input);
        }
        if(photo)row.append(photoSelect(i,`${path}.${k}`));box.append(row);
      }
      return box;
    }
    function render(){
      $('carouselOutput').hidden=!content;$('carouselCards').replaceChildren();canvases=[];articles=[];if(!content)return;
      slides().forEach((slide,i)=>{
        const article=document.createElement('article');article.className='card';const head=document.createElement('div');head.className='slide-head';
        const toggle=document.createElement('label');const box=document.createElement('input');box.type='checkbox';box.checked=on(i);box.onchange=()=>{included[`${settings.design}:${i}`]=box.checked;edited();};toggle.append(box,` ${slide.title}`);
        const over=document.createElement('span');over.className='slide-over';over.textContent='글이 넘쳐요';over.hidden=true;head.append(toggle,over);
        const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${slide.title} 미리보기`);canvases.push(canvas);articles.push(article);article.append(head,canvas);
        for(const [slot,label] of Object.entries(slide.photos||{}))article.append(photoSelect(i,slot,label));
        for(const [path,label,max,rows] of slide.fields||[])article.append(field(label,max,rows,get(path),value=>set(path,value)));
        for(const list of slide.lists||[])article.append(listEditor(i,list));
        if(slide.hint){const p=document.createElement('p');p.className='hint';p.textContent=slide.hint;article.append(p);}
        $('carouselCards').append(article);
      });
      void loadFonts();refresh();
    }
    async function decode(blob,name){const image=await createImageBitmap(blob);if(image.width*image.height>40000000){image.close();throw new Error('사진 해상도가 너무 커요. 줄인 뒤 추가해주세요.');}return {id:crypto.randomUUID(),name,image};}
    function closePhotos(){photos.forEach(p=>p.image.close());photos=[];}
    function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
    async function generate(){
      if(!$('carouselName').value.trim()||!$('carouselDescription').value.trim())throw new Error('상품명과 상세 설명을 먼저 확인해주세요.');
      options.notice('상품 근거로 캐러셀 문구를 만들고 있어요…');
      const result=await options.request('carousel',{productName:$('carouselName').value,description:$('carouselDescription').value});
      if(!result.content?.cover)throw new Error('캐러셀 서버 버전을 확인해주세요.');
      content=result.content;included={};choices={};$('carouselCaption').value=result.caption||'';$('carouselWarnings').textContent=(result.warnings||[]).join('\n');render();options.changed();
      options.notice('캐러셀 초안을 만들었어요. 사진·문구·제휴 고지를 검토 후 다운로드해주세요.');
    }
    for(const radio of document.getElementsByName('carouselDesign')){radio.checked=radio.value===settings.design;radio.onchange=()=>{settings.design=radio.value;saveSettings();render();};}
    for(const [id,key] of [['carouselChannel','channel'],['carouselHandle','handle'],['carouselColor','color'],['carouselIssue','issue'],['carouselBio','bio']]){$(id).value=settings[key];$(id).oninput=()=>{settings[key]=$(id).value;saveSettings();refresh();};}
    $('carouselMake').onclick=()=>{
      let url;try{url=new URL($('carouselUrl').value);if(url.protocol!=='https:'||url.username||url.password)throw new Error();}catch{options.notice('https 상품 링크를 입력해주세요.',true);return;}
      if(content&&!confirm('현재 캐러셀을 새 상품으로 바꿀까요?'))return;
      void options.task(async()=>{
        options.notice('상품 링크에서 이름·설명·사진을 읽고 있어요…');
        const data=await options.request('analyze',{url:url.href});
        $('carouselName').value=data.name||'';$('carouselDescription').value=data.description||'';$('carouselInfo').open=true;$('carouselEvidence').textContent=(data.warnings||[]).join('\n');
        content=null;closePhotos();$('carouselCaption').value='';render();options.changed();
        let failed=0;for(const asset of (data.imageAssets||(data.images||[]).map(url=>({url,kind:'product'}))).filter(p=>p.kind==='product').slice(0,5)){
          try{const media=await options.request('image',{url:asset.url});const bytes=Uint8Array.from(atob(media.data),c=>c.charCodeAt(0));photos.push(await decode(new Blob([bytes],{type:media.mimeType}),`상품 사진 ${photos.length+1}`));}catch{failed++;}
        }
        if(failed)$('carouselEvidence').textContent+='\n일부 사진을 불러오지 못했어요. 직접 사진을 추가할 수 있습니다.';
        await generate();
      });
    };
    $('carouselRegenerate').onclick=()=>{if(content&&!confirm('수정한 문구를 AI 초안으로 바꿀까요?'))return;void options.task(generate);};
    $('carouselPhotos').onchange=event=>{const files=[...event.target.files];event.target.value='';void options.task(async()=>{for(const file of files){if(photos.length>=10)throw new Error('사진은 최대 10장까지 추가해주세요.');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('장당 12MB 이하 JPG·PNG·WebP를 추가해주세요.');photos.push(await decode(file,file.name));}render();options.changed();options.notice('사진을 추가했어요. 각 장에서 사용할 사진을 선택해주세요.');});};
    $('carouselDisclosure').oninput=edited;for(const id of ['carouselUrl','carouselName','carouselDescription','carouselCaption'])$(id).oninput=options.changed;
    $('carouselDownload').onclick=()=>void options.task(async()=>{
      if(!content)throw new Error('캐러셀을 먼저 만들어주세요.');await loadFonts();paintAll();
      const active=slides().map((_,i)=>i).filter(on);if(!active.length)throw new Error('넣을 장을 하나 이상 선택해주세요.');
      const over=active.filter(i=>overflow[i]);if(over.length)throw new Error(`${over.map(i=>slides()[i].title).join(', ')} 장의 문구가 영역을 넘어요. 해당 장의 글을 줄여주세요.`);
      if(active.some(i=>Object.keys(slides()[i].photos||{}).some(slot=>!photoFor(i,slot)))&&!confirm('사진 없이 그린 장이 있어요. 그대로 내려받을까요?'))return;
      const blobs=await Promise.all(active.map(i=>new Promise(resolve=>canvases[i].toBlob(resolve,'image/png'))));if(blobs.some(b=>!b))throw new Error('이미지 생성에 실패했어요.');
      blobs.forEach((b,n)=>download(b,`HIKARY-carousel-${String(n+1).padStart(2,'0')}.png`));options.notice(`PNG ${blobs.length}장 다운로드를 요청했어요. 브라우저에서 여러 파일 다운로드를 허용해주세요.`);
    });
    $('carouselText').onclick=()=>{
      if(!content)return;const lines=[];let n=0;
      slides().forEach((slide,i)=>{
        if(!on(i))return;lines.push(`${++n}. ${slide.title}`);
        for(const [path,label] of slide.fields||[])if(get(path))lines.push(`${label}: ${get(path)}`);
        for(const {path,keys} of slide.lists||[])for(const item of D.filled(get(path)))lines.push('- '+(keys?keys.map(([k])=>item[k]).filter(Boolean).join(' / '):item));
        lines.push('');
      });
      download(new Blob([`${$('carouselName').value}\n원본: ${$('carouselUrl').value}\n디자인: ${D.designs[settings.design].name}\n\n${lines.join('\n')}\n게시글\n${$('carouselCaption').value}\n\n고지\n${$('carouselDisclosure').value}`],{type:'text/plain;charset=utf-8'}),'HIKARY-carousel.txt');
    };
    $('carouselClear').onclick=()=>{if(!confirm('현재 캐러셀 내용을 비울까요?'))return;closePhotos();content=null;included={};choices={};for(const id of ['carouselUrl','carouselName','carouselDescription','carouselCaption','carouselDisclosure'])$(id).value='';$('carouselEvidence').textContent='';$('carouselWarnings').textContent='';render();options.onClear?.();};
  }
  return {create};
})();
