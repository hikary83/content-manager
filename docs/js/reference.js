window.HikaryReference = (() => {
  function sampleTimes(duration) {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new Error('180초 이내 영상 파일을 선택해주세요.');
    const times=[];
    for(let i=0;i<12&&i/4<duration;i++) times.push(i/4);
    times.push(...[.2,.4,.6,.8].map(f=>duration*f),Math.max(0,duration-.15));
    return [...new Set(times.map(t=>Math.round(t*1000)/1000))].filter(t=>t<duration).sort((a,b)=>a-b);
  }
  function notes(data) { return ['첫 3초: '+data.hook,'CTA: '+data.cta,'전환: '+data.transitions.map(t=>`${t.at}초 ${t.description}`).join(' / '),'활용할 패턴: '+data.patterns.join(' / ')].join('\n').slice(0,3000); }
  function eventOnce(target,event,trigger) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('영상을 읽는 시간이 초과됐어요. MP4(H.264) 파일로 다시 시도해주세요.')),15000);
      const done=()=>finish();const error=()=>finish(new Error('이 브라우저가 재생할 수 없는 영상이에요. MP4(H.264)를 사용해주세요.'));
      function finish(err){clearTimeout(timer);target.removeEventListener(event,done);target.removeEventListener('error',error);err?reject(err):resolve();}
      target.addEventListener(event,done,{once:true});target.addEventListener('error',error,{once:true});trigger();
    });
  }
  async function capture(url) {
    const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
    try{
      await eventOnce(video,'loadeddata',()=>{video.src=url;video.load();});
      if(video.videoWidth*video.videoHeight>17000000) throw new Error('영상 해상도가 너무 커요. 4K 이하로 변환해주세요.');
      const duration=video.duration;const times=sampleTimes(duration);const canvas=document.createElement('canvas');
      const scale=Math.min(1,480/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('프레임 추출을 지원하지 않는 브라우저예요.');
      const frames=[];
      for(const time of times){
        if(Math.abs(video.currentTime-time)>.001) await eventOnce(video,'seeked',()=>{video.currentTime=time;});
        context.drawImage(video,0,0,canvas.width,canvas.height);
        frames.push({time,data:canvas.toDataURL('image/jpeg',.75).split(',')[1],mimeType:'image/jpeg'});
      }
      return {duration,frames};
    } finally {video.removeAttribute('src');video.load();}
  }
  function create(options) {
    const root=document.getElementById('referenceMount');
    root.innerHTML=`<section class="card"><h2>레퍼런스 영상 분석 <small>선택</small></h2><p class="hint">다른 영상의 문장을 베끼지 않고 훅·CTA·전환 패턴만 참고합니다. 아래 제작안 생성 전에 분석해주세요.</p><label>레퍼런스 링크<input id="referenceUrl" type="url" maxlength="2000" placeholder="https://… SNS 링크는 원본 확인용이며 자동 다운로드하지 않습니다."></label><div class="actions"><button id="referenceOpen" type="button" class="secondary">원본 링크 열기 ↗</button><label class="file-button">영상 파일 선택<input id="referenceFile" type="file" accept="video/mp4,video/webm,.mp4,.webm"></label><button id="referenceClear" type="button" class="secondary">레퍼런스 비우기</button></div><p id="referenceFileState" class="hint">사용 권한이 있는 MP4·WebM · 최대 40MB / 180초. 링크만으로는 분석하지 않습니다.</p><video id="referencePreview" controls playsinline preload="metadata" hidden style="width:100%;max-height:360px"></video><label>대사·음성 전사 (선택)<textarea id="referenceTranscript" maxlength="6000" rows="3" placeholder="음성은 자동으로 듣지 않습니다. 직접 확인한 대사를 붙여넣으면 보완 자료로 사용합니다."></textarea></label><label><input id="referenceConsent" type="checkbox"> 사용 권한을 확인했으며, 추출 화면과 입력 대사를 Google Gemini로 보내는 데 동의합니다.</label><p class="hint">Gemini 사용량/요금이 발생할 수 있어요. 원본 영상·분석 결과는 서버나 시트에 저장하지 않습니다. URL은 Gemini에 전송하지 않습니다.</p><button id="referenceAnalyze" type="button">Gemini로 레퍼런스 분석</button><div id="referenceResults" hidden><h3>분석 초안 · 직접 확인해주세요</h3><pre id="referenceReport" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><p class="hint">샘플 프레임 기반이라 빠른 컷·음성 CTA를 놓칠 수 있어요. 실제 재생/청취 후 활용할 메모를 수정해주세요.</p><button id="referenceApply" type="button" class="secondary">검토한 패턴을 제작안 메모에 반영</button></div></section>`;
    const $=id=>document.getElementById(id);let file=null,url='',result=null;
    $('referenceConsent').style.width='auto';$('referenceConsent').parentElement.style.display='flex';$('referenceConsent').parentElement.style.gap='10px';$('referenceConsent').parentElement.style.alignItems='center';
    function invalidate(){result=null;$('referenceResults').hidden=true;$('referenceReport').textContent='';}
    function clear(){if(url)URL.revokeObjectURL(url);url='';file=null;invalidate();$('referenceFile').value='';$('referenceUrl').value='';$('referenceTranscript').value='';$('referenceConsent').checked=false;$('referencePreview').pause();$('referencePreview').removeAttribute('src');$('referencePreview').load();$('referencePreview').hidden=true;$('referenceFileState').textContent='MP4·WebM · 최대 40MB / 180초. 링크는 원본 확인용입니다.';}
    $('referenceClear').onclick=()=>{clear();options.changed();};
    $('referenceFile').onchange=()=>{
      const next=$('referenceFile').files[0];$('referenceFile').value='';if(!next)return;
      if(!/\.(mp4|webm)$/i.test(next.name)||next.size>40*1024*1024){options.notice('40MB 이하 MP4·WebM 파일을 선택해주세요.',true);return;}
      if(url)URL.revokeObjectURL(url);file=next;url=URL.createObjectURL(file);invalidate();$('referenceConsent').checked=false;
      $('referencePreview').src=url;$('referencePreview').hidden=false;$('referenceFileState').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)}MB · 원본은 로컬에서만 재생`;options.changed();
    };
    $('referenceOpen').onclick=()=>{
      try{const link=new URL($('referenceUrl').value);if(link.protocol!=='https:'||link.username||link.password)throw new Error();window.open(link.href,'_blank','noopener,noreferrer');}
      catch{options.notice('https로 시작하는 원본 링크를 입력해주세요.',true);}
    };
    $('referenceTranscript').oninput=()=>{invalidate();options.changed();};
    $('referenceUrl').oninput=options.changed;
    $('referenceAnalyze').onclick=()=>void options.task(async()=>{
      if(!file)throw new Error('링크는 원본 확인용이에요. 분석할 영상 파일을 선택해주세요.');
      if(!$('referenceConsent').checked)throw new Error('화면·대사 전송 동의를 확인해주세요.');
      invalidate();options.notice('브라우저에서 첫 3초와 주요 화면을 추출하고 있어요…');
      const sampled=await capture(url);
      options.notice(`${sampled.frames.length}개 화면을 Gemini가 분석하고 있어요. 원본 영상과 음성은 전송하지 않아요.`);
      result=await options.request('reference',{...sampled,transcript:$('referenceTranscript').value});
      $('referenceReport').textContent=`관찰 범위: ${result.basis}\n\n${notes(result)}\n\n확인할 점\n${result.warnings.join('\n')}`;
      $('referenceResults').hidden=false;options.changed();options.notice('레퍼런스 분석 초안이 나왔어요. 직접 확인한 뒤 메모에 반영해주세요.');
    });
    $('referenceApply').onclick=()=>{
      if(!result)return;
      const input=$('referenceNotes');if(input.value&&!confirm('기존 연출 메모를 분석 패턴으로 바꿀까요?'))return;
      input.value=notes(result);options.changed();options.notice('연출 메모에 반영했어요. 메모를 검토하고 쇼츠 제작안을 생성해주세요.');
    };
    return {clear};
  }
  return {sampleTimes,notes,capture,create};
})();
