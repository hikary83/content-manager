window.HikaryCarousel=(()=>{
  const roles=['표지 · 관심 끌기','핵심 매력','상품 자세히 보기','이용·구매 전 확인','상품 링크 안내'];
  function wrap(context,text,maxWidth){const lines=[];for(const paragraph of text.split('\n')){let line='';for(const char of paragraph){if(line&&context.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}lines.push(line);}return lines;}
  function textBlock(ctx,text,{x,y,width,maxLines,maxSize,minSize,color}){
    let lines,size;for(size=maxSize;size>=minSize;size-=2){ctx.font=`700 ${size}px "Malgun Gothic",sans-serif`;lines=wrap(ctx,text,width);if(lines.length<=maxLines)break;}
    const overflow=lines.length>maxLines;size=Math.max(minSize,size);ctx.font=`700 ${size}px "Malgun Gothic",sans-serif`;ctx.fillStyle=color;
    lines.slice(0,maxLines).forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.25));return overflow;
  }
  function paint(canvas,slide,index,image,disclosure){
    canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');if(!c)throw new Error('이미지 생성을 지원하지 않는 브라우저예요.');
    c.fillStyle='#faf9f4';c.fillRect(0,0,1080,1350);c.fillStyle='#1c3529';c.fillRect(0,0,1080,12);c.font='700 30px "Malgun Gothic",sans-serif';c.fillText('HIKARY / PRODUCT NOTES',72,85);c.textAlign='right';c.fillText(`${index+1} / 5`,1008,85);c.textAlign='left';
    c.fillStyle='#607a4b';c.font='700 26px "Malgun Gothic",sans-serif';c.fillText(roles[index],72,155);
    let overflow=textBlock(c,slide.heading,{x:72,y:250,width:936,maxLines:3,maxSize:84,minSize:40,color:'#1c3529'});
    c.fillStyle='#eaf0e3';c.fillRect(72,510,936,440);
    if(image){const scale=Math.min(936/image.width,440/image.height);c.drawImage(image,72+(936-image.width*scale)/2,510+(440-image.height*scale)/2,image.width*scale,image.height*scale);}
    else {c.fillStyle='#829178';c.font='28px "Malgun Gothic",sans-serif';c.fillText('사진을 선택해주세요',380,740);}
    overflow=textBlock(c,slide.body,{x:72,y:1025,width:936,maxLines:5,maxSize:36,minSize:24,color:'#304a39'})||overflow;
    c.fillStyle='#d4ddcb';c.fillRect(72,1265,936,2);
    overflow=textBlock(c,disclosure||'게시 전 가격·조건·제휴 고지 확인',{x:72,y:1305,width:936,maxLines:1,maxSize:20,minSize:14,color:'#687563'})||overflow;
    return overflow;
  }
  function create(options){
    const root=document.getElementById('carouselMount');
    root.innerHTML=`<section class="card"><h2>상품 링크로 캐러셀 만들기</h2><p class="hint">상품 정보로 표지 → 핵심 매력 → 상세 → 확인사항 → 링크 안내, 총 5장을 만듭니다. PNG 1080×1350(4:5). Gemini 사용량/요금이 발생할 수 있어요.</p><label>상품 링크<input id="carouselUrl" type="url" maxlength="2000" placeholder="https:// 상품 상세 페이지 주소"></label><div class="actions" style="margin-top:16px"><button id="carouselMake" type="button">링크 분석하고 캐러셀 만들기</button><button id="carouselClear" class="secondary" type="button">새로 만들기</button></div><p class="hint">초안은 이 탭에서만 유지되며 시트에 자동 저장하거나 SNS에 게시하지 않습니다. 사진과 문구를 검토 후 내려받으세요.</p></section><section class="card"><details id="carouselInfo"><summary>추출한 상품정보 확인·보완</summary><label>상품명<input id="carouselName" maxlength="200"></label><label>상세 설명<textarea id="carouselDescription" rows="6" maxlength="18000"></textarea></label><p id="carouselEvidence" class="hint"></p><div class="actions"><button id="carouselRegenerate" type="button" class="secondary">수정한 정보로 다시 만들기</button><label class="file-button">사진 추가<input id="carouselPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div><p class="hint">링크를 읽지 못하면 상품명·설명을 직접 넣고 사진을 추가하세요. 자동 수집 사진은 일반 상품 사진만 사용하며 긴 상세 이미지는 제외합니다.</p></details><label>게시글<textarea id="carouselCaption" maxlength="3000" rows="4"></textarea></label><label>하단 고지 문구 (공개 전 직접 확인)<input id="carouselDisclosure" maxlength="100" placeholder="실제 제휴 여부에 맞는 고지 문구를 입력하세요."></label></section><section id="carouselOutput" hidden><div class="actions"><button id="carouselDownload" type="button">PNG 5장 다운로드</button><button id="carouselText" type="button" class="secondary">문구·게시글 TXT 다운로드</button></div><p id="carouselWarnings" class="hint"></p><div id="carouselCards" class="carousel-grid"></div></section>`;
    const $=id=>document.getElementById(id);let slides=null,photos=[],canvases=[],overflow=[];
    function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
    function refresh(){if(!slides)return;overflow=slides.map((slide,i)=>paint(canvases[i],slide,i,photos.find(p=>p.id===slide.photoId)?.image,$('carouselDisclosure').value));}
    function render(){
      $('carouselOutput').hidden=!slides;$('carouselCards').replaceChildren();canvases=[];if(!slides)return;
      slides.forEach((slide,i)=>{
        const article=document.createElement('article');article.className='card';const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${i+1}장 캐러셀 미리보기`);canvases.push(canvas);article.append(canvas);
        for(const [key,label,max] of [['heading','제목',60],['body','설명',160]]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('textarea');input.maxLength=max;input.rows=key==='heading'?2:4;input.value=slide[key];input.oninput=()=>{slide[key]=input.value;options.changed();refresh();};l.append(input);article.append(l);}
        const label=document.createElement('label');label.textContent='사용할 사진';const select=document.createElement('select');select.add(new Option('사진 없음',''));for(const p of photos)select.add(new Option(p.name,p.id));select.value=slide.photoId||'';select.onchange=()=>{slide.photoId=select.value;options.changed();refresh();};label.append(select);article.append(label);$('carouselCards').append(article);
      });refresh();
    }
    async function decode(blob,name){const image=await createImageBitmap(blob);if(image.width*image.height>40000000){image.close();throw new Error('사진 해상도가 너무 커요. 줄인 뒤 추가해주세요.');}return {id:crypto.randomUUID(),name,image};}
    function closePhotos(){photos.forEach(p=>p.image.close());photos=[];}
    async function generate(){
      if(!$('carouselName').value.trim()||!$('carouselDescription').value.trim())throw new Error('상품명과 상세 설명을 먼저 확인해주세요.');
      options.notice('상품 근거로 5장 캐러셀 문구를 만들고 있어요…');
      const result=await options.request('carousel',{productName:$('carouselName').value,description:$('carouselDescription').value});
      if(!Array.isArray(result.slides)||result.slides.length!==5)throw new Error('캐러셀 서버 버전을 확인해주세요.');
      slides=result.slides.map((s,i)=>({...s,photoId:photos.length?photos[i%photos.length].id:''}));$('carouselCaption').value=result.caption||'';$('carouselWarnings').textContent=(result.warnings||[]).join('\n');render();options.changed();options.notice('캐러셀 5장 초안을 만들었어요. 사진·문구·제휴 고지를 검토 후 다운로드해주세요.');
    }
    $('carouselMake').onclick=()=>{
      let url;try{url=new URL($('carouselUrl').value);if(url.protocol!=='https:'||url.username||url.password)throw new Error();}catch{options.notice('https 상품 링크를 입력해주세요.',true);return;}
      if(slides&&!confirm('현재 캐러셀을 새 상품으로 바꿀까요?'))return;
      void options.task(async()=>{
        options.notice('상품 링크에서 이름·설명·사진을 읽고 있어요…');
        const data=await options.request('analyze',{url:url.href});
        $('carouselName').value=data.name||'';$('carouselDescription').value=data.description||'';$('carouselInfo').open=true;$('carouselEvidence').textContent=(data.warnings||[]).join('\n');
        slides=null;closePhotos();$('carouselCaption').value='';render();options.changed();
        let failed=0;for(const asset of (data.imageAssets||(data.images||[]).map(url=>({url,kind:'product'}))).filter(p=>p.kind==='product').slice(0,5)){
          try{const media=await options.request('image',{url:asset.url});const bytes=Uint8Array.from(atob(media.data),c=>c.charCodeAt(0));photos.push(await decode(new Blob([bytes],{type:media.mimeType}),`상품 사진 ${photos.length+1}`));}catch{failed++;}
        }
        if(failed)$('carouselEvidence').textContent+='\n일부 사진을 불러오지 못했어요. 직접 사진을 추가할 수 있습니다.';
        await generate();
      });
    };
    $('carouselRegenerate').onclick=()=>{if(slides&&!confirm('수정한 문구를 AI 초안으로 바꿀까요?'))return;void options.task(generate);};
    $('carouselPhotos').onchange=event=>{const files=[...event.target.files];event.target.value='';void options.task(async()=>{for(const file of files){if(photos.length>=10)throw new Error('사진은 최대 10장까지 추가해주세요.');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('장당 12MB 이하 JPG·PNG·WebP를 추가해주세요.');photos.push(await decode(file,file.name));}render();options.changed();options.notice('사진을 추가했어요. 각 장에서 사용할 사진을 선택해주세요.');});};
    $('carouselDisclosure').oninput=()=>{options.changed();refresh();};for(const id of ['carouselUrl','carouselName','carouselDescription','carouselCaption'])$(id).oninput=options.changed;
    $('carouselDownload').onclick=()=>void options.task(async()=>{
      if(!slides)throw new Error('캐러셀을 먼저 만들어주세요.');refresh();if(overflow.some(Boolean))throw new Error('문구가 영역을 넘어요. 제목·설명·하단 고지를 줄여주세요.');
      if(slides.some(s=>!s.photoId)&&!confirm('사진 없는 장이 있어요. 그대로 내려받을까요?'))return;
      const blobs=await Promise.all(canvases.map(c=>new Promise(resolve=>c.toBlob(resolve,'image/png'))));if(blobs.some(b=>!b))throw new Error('이미지 생성에 실패했어요.');blobs.forEach((b,i)=>download(b,`HIKARY-carousel-${i+1}.png`));options.notice('PNG 5장 다운로드를 요청했어요. 브라우저에서 여러 파일 다운로드를 허용해주세요.');
    });
    $('carouselText').onclick=()=>{if(slides)download(new Blob([$('carouselName').value+'\n원본: '+$('carouselUrl').value+'\n\n'+slides.map((s,i)=>`${i+1}. ${s.heading}\n${s.body}`).join('\n\n')+'\n\n게시글\n'+$('carouselCaption').value+'\n\n고지\n'+$('carouselDisclosure').value],{type:'text/plain;charset=utf-8'}),'HIKARY-carousel.txt');};
    $('carouselClear').onclick=()=>{if(!confirm('현재 캐러셀 내용을 비울까요?'))return;closePhotos();slides=null;for(const id of ['carouselUrl','carouselName','carouselDescription','carouselCaption','carouselDisclosure'])$(id).value='';$('carouselEvidence').textContent='';$('carouselWarnings').textContent='';render();options.onClear?.();};
  }
  return {wrap,textBlock,paint,create};
})();
