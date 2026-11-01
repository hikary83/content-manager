/* Fixed carousel templates. AI only fills text; every layout is drawn here on a 1080×1350 canvas. */
window.HikaryCarouselDesigns=(()=>{
  const W=1080,H=1350,INK='#1C1C1E',SUB='#4D4D4D',YELLOW='#FFE98A',LIME='#8EE57E',CREAM='#FFF3D6';
  const SANS='Pretendard,"Malgun Gothic","Apple SD Gothic Neo",sans-serif',HAND='"Nanum Pen Script",'+SANS,EMOJI='"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  const rgb=hex=>{const n=parseInt(hex.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
  const mix=(hex,t)=>'rgb('+rgb(hex).map(v=>Math.round(255-(255-v)*t)).join(',')+')';
  const alpha=(hex,a)=>`rgba(${rgb(hex).join(',')},${a})`;
  const fontOf=(size,weight,family=SANS)=>`${weight} ${size}px ${family}`;
  const filled=list=>(list||[]).filter(item=>typeof item==='string'?item.trim():Object.values(item).some(v=>String(v).trim()));

  // **굵게** marks emphasis; words wrap at spaces and fall back to characters when one word is too wide.
  function tokens(text){const out=[];String(text||'').split(/(\*\*[^*\n]+\*\*)/).forEach(part=>{const em=/^\*\*[^*]+\*\*$/.test(part);for(const word of (em?part.slice(2,-2):part).split(/(?<= )/))if(word)out.push({text:word,em});});return out;}
  function wrap(c,text,width,font,emFont=font){
    const lines=[];
    for(const paragraph of String(text||'').split('\n')){
      let line=[],used=0;
      const push=()=>{const last=line[line.length-1];if(last&&last.text!==last.text.trimEnd()){c.font=last.em?emFont:font;last.text=last.text.trimEnd();last.w=c.measureText(last.text).width;}lines.push(line);line=[];used=0;};
      for(const token of tokens(paragraph)){
        c.font=token.em?emFont:font;const w=c.measureText(token.text).width;
        if(line.length&&used+c.measureText(token.text.trimEnd()).width>width)push();
        if(!line.length&&!token.text.trim())continue;
        if(w>width){for(const char of token.text){const cw=c.measureText(char).width;if(line.length&&used+cw>width)push();line.push({text:char,em:token.em,w:cw});used+=cw;}continue;}
        line.push({text:token.text,em:token.em,w});used+=w;
      }
      push();
    }
    return lines;
  }
  // Shrinks from size to min; text that still does not fit marks the slide as overflowing (download is blocked).
  function fit(g,text,{width,lines:max=1,size,min=Math.round(size*.6),weight=700,em=800,family=SANS,lh=1.3}){
    let out,s;
    for(s=size;;s-=2){out=wrap(g.c,text,width,fontOf(s,weight,family),fontOf(s,em,family));if(out.length<=max||s-2<min)break;}
    if(out.length>max){g.over=true;out=out.slice(0,max);}
    return {lines:out,size:s,step:s*lh,height:out.length*s*lh,font:fontOf(s,weight,family),emFont:fontOf(s,em,family)};
  }
  const widthOf=line=>line.reduce((sum,seg)=>sum+seg.w,0);
  function put(g,f,x,y,{align='left',color=INK,emColor,mark,markEm,under}={}){
    const c=g.c;c.textBaseline='top';c.textAlign='left';
    f.lines.forEach((line,i)=>{
      const w=widthOf(line),ly=y+i*f.step;let lx=align==='center'?x-w/2:align==='right'?x-w:x;
      if(mark&&w){c.fillStyle=mark;c.fillRect(lx-10,ly+f.size*.1,w+20,f.size*1.02);}
      if(under&&w){c.fillStyle=under;c.fillRect(lx-6,ly+f.size*.72,w+12,f.size*.34);}
      for(const seg of line){
        if(markEm&&seg.em){c.fillStyle=markEm;c.fillRect(lx-3,ly+f.size*.12,seg.w+6,f.size*.98);}
        c.font=seg.em?f.emFont:f.font;c.fillStyle=seg.em&&emColor?emColor:color;c.fillText(seg.text,lx,ly);lx+=seg.w;
      }
    });
    return y+f.height;
  }
  const text=(g,value,x,y,o)=>put(g,fit(g,value,o),x,y,o);
  function label(g,value,x,y,size,weight,color,align='left',spacing=0){const c=g.c;c.save();c.font=fontOf(size,weight);c.fillStyle=color;c.textAlign=align;c.textBaseline='top';if('letterSpacing' in c)c.letterSpacing=spacing+'px';c.fillText(value,x,y);c.restore();}

  function shape(c,x,y,w,h,r){c.beginPath();if(r==='circle')c.arc(x+w/2,y+h/2,Math.min(w,h)/2,0,Math.PI*2);else c.roundRect(x,y,w,h,r||0);}
  function shadow(c,blur=36,a=.18,dy=14){c.shadowColor=`rgba(0,0,0,${a})`;c.shadowBlur=blur;c.shadowOffsetY=dy;}
  function emoji(c,char,x,y,size,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.font=`${size}px ${EMOJI}`;c.textAlign='center';c.textBaseline='middle';c.fillText(char,0,0);c.restore();}
  function drawCover(c,img,x,y,w,h){const s=Math.max(w/img.width,h/img.height),sw=w/s,sh=h/s;c.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h);}
  // No photo: main-colour gradient with the product emoji, as both reference prompts specify.
  function fallback(g,x,y,w,h){const c=g.c,grad=c.createLinearGradient(x,y,x+w,y+h);grad.addColorStop(0,g.s.color);grad.addColorStop(1,mix(g.s.color,.4));c.fillStyle=grad;c.fillRect(x,y,w,h);emoji(c,g.d.emoji||'📷',x+w/2,y+h/2,Math.min(w,h)*.36);}
  function photo(g,slot,x,y,w,h,r){const c=g.c,img=g.photo(slot);c.save();shape(c,x,y,w,h,r);c.clip();if(img)drawCover(c,img,x,y,w,h);else fallback(g,x,y,w,h);c.restore();}
  const blurCache=new WeakMap();
  function blurred(img,radius){
    let byRadius=blurCache.get(img);if(!byRadius)blurCache.set(img,byRadius=new Map());
    if(!byRadius.has(radius)){const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');c.filter=`blur(${radius}px)`;drawCover(c,img,-radius*2,-radius*2,W+radius*4,H+radius*4);byRadius.set(radius,canvas);}
    return byRadius.get(radius);
  }
  function backdrop(g,radius){const img=g.photo('bg');if(!img)return fallback(g,0,0,W,H);if(radius)g.c.drawImage(blurred(img,radius),0,0);else drawCover(g.c,img,0,0,W,H);}
  function fade(g,from,a){const grad=g.c.createLinearGradient(0,from,0,H);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,`rgba(0,0,0,${a})`);g.c.fillStyle=grad;g.c.fillRect(0,from,W,H-from);}
  function star(c,x,y,r,color){c.save();c.fillStyle=color;c.strokeStyle=INK;c.lineWidth=2.5;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,d=i%2?r*.36:r;c.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d);}c.closePath();c.fill();c.stroke();c.restore();}
  function folder(c,x,y,w,h,color){c.save();c.fillStyle=color;c.strokeStyle=INK;c.lineWidth=3;shape(c,x,y,w*.44,h*.34,10);c.fill();c.stroke();shape(c,x,y+h*.16,w,h*.84,14);c.fill();c.stroke();c.restore();}
  function tape(c,x,y,w,h,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.fillRect(-w/2,-h/2,w,h);c.restore();}
  function dotted(c,x1,x2,y,color='rgba(28,28,30,.32)'){c.save();c.strokeStyle=color;c.lineWidth=3;c.setLineDash([3,10]);c.lineCap='round';c.beginPath();c.moveTo(x1,y);c.lineTo(x2,y);c.stroke();c.restore();}
  function disclosure(g,light){text(g,g.s.disclosure||'게시 전 가격·조건·제휴 고지 확인',W/2,1306,{width:936,size:20,min:14,weight:500,align:'center',color:light?'rgba(255,255,255,.82)':'rgba(28,28,30,.55)'});}

  // ---------- 노트형 ----------
  function paper(g){const grad=g.c.createLinearGradient(0,0,0,H);grad.addColorStop(0,mix(g.s.color,.045));grad.addColorStop(1,mix(g.s.color,.22));g.c.fillStyle=grad;g.c.fillRect(0,0,W,H);}
  const channel=(g,color)=>label(g,g.s.channel.toUpperCase(),W-72,52,24,800,color,'right',4);
  const issue=(g,color)=>label(g,`${g.s.month} · ISSUE ${g.s.issue}`,W/2,1250,22,600,color,'center',4);
  function next(g,value){const c=g.c;c.fillStyle='rgba(28,28,30,.22)';c.fillRect(72,1196,936,2);label(g,value,72,1220,26,700,g.s.color);label(g,'› › ›',1008,1220,26,800,INK,'right',2);}
  function noteCover(g){
    const c=g.c,d=g.d.cover;photo(g,'bg',0,0,W,H,0);fade(g,520,.82);channel(g,'#fff');
    const size=Math.min(fit(g,d.hook,{width:936,size:104,min:60,weight:800}).size,fit(g,d.topic,{width:936,size:104,min:60,weight:800}).size);
    const y2=1170-size*1.18,y1=y2-size*1.18;
    if(d.label){c.fillStyle=g.s.color;shape(c,72,y1-88,78,42,21);c.fill();c.fillStyle='#fff';c.beginPath();c.arc(129,y1-67,16,0,Math.PI*2);c.fill();label(g,d.label.toUpperCase(),168,y1-84,28,700,'#fff','left',4);}
    text(g,d.hook,72,y1,{width:936,size,min:size,weight:800,color:'#fff'});
    text(g,d.topic,72,y2,{width:936,size,min:size,weight:800,color:mix(g.s.color,.45)});
    issue(g,'rgba(255,255,255,.88)');disclosure(g,true);
  }
  function noteIntro(g){
    const c=g.c,d=g.d.intro;paper(g);channel(g,INK);
    c.save();shadow(c);c.fillStyle='#fff';shape(c,72,110,420,540,32);c.fill();c.restore();photo(g,'card',72,110,420,540,32);
    const x=556,y=170,w=452,h=440;c.save();shadow(c,40,.14);c.fillStyle='#fff';shape(c,x,y,w,h,36);c.fill();c.restore();
    ['소개','포인트','정보'].forEach((tab,i)=>{c.fillStyle=i?'#F2F2F4':mix(g.s.color,.28);shape(c,x+28+i*112,y+28,100,42,21);c.fill();label(g,tab,x+78+i*112,y+36,22,i?600:800,i?SUB:INK,'center');});
    c.fillStyle=mix(g.s.color,.22);shape(c,x+28,y+90,w-56,96,20);c.fill();text(g,g.d.cover.topic,x+52,y+120,{width:w-104,size:30,min:20,weight:800});
    filled(g.d.points.items).slice(0,3).forEach((item,i)=>{const ry=y+212+i*70;emoji(c,'📍',x+48,ry+20,28);text(g,item.title,x+80,ry+4,{width:w-112,size:28,min:20,weight:600});if(i<2){c.fillStyle='#EFEFF1';c.fillRect(x+28,ry+58,w-56,2);}});
    emoji(c,'🧡',1000,140,88,.2);emoji(c,'💬',540,600,80,-.15);
    const num=`${g.num}. `;c.font=fontOf(52,800);const nw=c.measureText(num).width;label(g,num,72,712,52,800,g.s.color);
    const end=text(g,d.heading,72+nw,712,{width:936-nw,lines:2,size:52,min:38,weight:800});
    text(g,d.body,72,end+34,{width:936,lines:6,size:34,min:26,weight:500,em:700,lh:1.55,color:SUB});
    next(g,filled(d.tags).slice(0,2).join('  '));disclosure(g,false);
  }
  function noteQuestion(g){
    const c=g.c,d=g.d.question;paper(g);channel(g,INK);
    label(g,`${g.num}.`,72,118,46,800,g.s.color);
    const end=text(g,d.heading,72,184,{width:936,lines:2,size:64,min:44,weight:800});
    const bodyEnd=text(g,d.body,72,end+30,{width:936,lines:5,size:34,min:26,weight:500,em:700,lh:1.55,color:SUB});
    const cy=Math.min(960,Math.max(820,bodyEnd+260));
    c.save();c.translate(320,cy);c.rotate(-.07);c.save();shadow(c,30,.16);c.fillStyle='#fff';c.fillRect(-235,-170,470,340);c.restore();
    tape(c,0,-170,170,46,-.06,alpha(g.s.color,.6));
    const note=fit(g,d.note,{width:400,lines:3,size:56,min:36,weight:400,em:400,family:HAND,lh:1.15});put(g,note,0,-20-note.height/2,{align:'center'});
    text(g,'- 에디터 노트 -',0,104,{width:400,size:36,weight:400,em:400,family:HAND,align:'center',color:SUB});c.restore();
    c.save();c.translate(800,cy+5);c.rotate(.08);c.save();shadow(c,30,.18);c.fillStyle='#fff';c.fillRect(-170,-210,340,420);c.restore();photo(g,'polaroid',-150,-190,300,300,0);
    text(g,d.caption,0,124,{width:300,size:42,min:28,weight:400,em:400,family:HAND,align:'center'});c.restore();
    disclosure(g,false);
  }
  function noteList(g){
    const c=g.c,d=g.d.points,items=filled(d.items).slice(0,4);paper(g);channel(g,INK);
    label(g,`${g.num}. POINT LIST`,W/2,108,28,700,g.s.color,'center',4);
    const start=text(g,d.heading,W/2,162,{width:900,lines:2,size:64,min:44,weight:800,align:'center',under:mix(g.s.color,.4)})+60;
    const h=Math.min(230,(1180-start)/Math.max(1,items.length));
    items.forEach((item,i)=>{
      const y=start+i*h;c.fillStyle=INK;c.beginPath();c.arc(104,y+30,32,0,Math.PI*2);c.fill();label(g,String(i+1),104,y+12,32,800,'#fff','center');
      let x=164;if(item.tag){const tag=`[${item.tag}]`;label(g,tag,x,y+8,30,700,g.s.color);c.font=fontOf(30,700);x+=c.measureText(tag).width+12;}
      text(g,item.title,x,y+4,{width:1008-x,size:38,min:28,weight:800});
      text(g,item.text,164,y+62,{width:844,lines:2,size:30,min:24,weight:500,lh:1.45,color:SUB});
      if(i<items.length-1)dotted(c,72,1008,y+h-18);
    });
    disclosure(g,false);
  }
  function noteQuote(g){
    const c=g.c;paper(g);channel(g,INK);
    c.save();c.translate(W/2,640);c.rotate(-.015);c.save();shadow(c,40,.16);c.fillStyle='#fff';c.fillRect(-420,-440,840,880);c.restore();c.restore();
    tape(c,W/2,206,230,58,-.05,alpha(g.s.color,.55));
    const quote=fit(g,g.d.tip.body,{width:680,lines:6,size:58,min:36,weight:500,em:800,lh:1.75});
    const end=put(g,quote,W/2,600-quote.height/2-30,{align:'center',under:mix(g.s.color,.32)});
    label(g,`- ${g.s.channel} 에디터 -`,W/2,end+34,30,600,SUB,'center');
    next(g,'다음 슬라이드에서 계속');disclosure(g,false);
  }
  function avatar(g,x,y,r){const c=g.c;c.fillStyle=g.s.color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();const f=fit(g,g.s.channel,{width:r*1.5,size:Math.round(r*.7),min:16,weight:800});put(g,f,x,y-f.size*.6,{align:'center',color:'#fff'});}
  function noteOutro(g){
    const c=g.c,d=g.d.outro;backdrop(g,40);c.fillStyle='rgba(0,0,0,.28)';c.fillRect(0,0,W,H);channel(g,'#fff');
    c.save();shadow(c,50,.25);c.fillStyle='#fff';shape(c,200,240,680,600,48);c.fill();c.restore();
    avatar(g,W/2,390,92);
    text(g,g.s.channel,W/2,512,{width:600,size:50,min:32,weight:800,align:'center'});
    if(g.s.handle)text(g,'@'+g.s.handle,W/2,584,{width:600,size:32,min:22,weight:500,align:'center',color:SUB});
    c.fillStyle=INK;shape(c,W/2-150,670,300,84,42);c.fill();label(g,'Follow',W/2,692,34,700,'#fff','center');
    text(g,d.line1,W/2,920,{width:936,size:40,min:28,weight:600,align:'center',color:'#fff'});
    text(g,d.line2,W/2,980,{width:936,size:52,min:34,weight:800,align:'center',color:'#fff'});
    issue(g,'rgba(255,255,255,.88)');disclosure(g,true);
  }

  // ---------- 유리카드형 ----------
  function glass(g,x,y,w,h,r=44,a=.66){
    const c=g.c,img=g.photo('bg');c.save();shape(c,x,y,w,h,r);c.clip();if(img)c.drawImage(blurred(img,24),0,0);c.fillStyle=`rgba(255,255,255,${a})`;c.fillRect(x,y,w,h);c.restore();
    c.save();shape(c,x+1.5,y+1.5,w-3,h-3,r);c.setLineDash([14,10]);c.lineWidth=3;c.strokeStyle=INK;c.stroke();c.restore();
  }
  function scene(g,{blur=0,fog=true,dark=0}={}){backdrop(g,blur);if(fog){g.c.fillStyle='rgba(255,255,255,.34)';g.c.fillRect(0,0,W,H);}if(dark){g.c.fillStyle=`rgba(0,0,0,${dark})`;g.c.fillRect(0,0,W,H);}}
  function handle(g){if(!g.s.handle)return;const c=g.c;c.save();c.shadowColor='rgba(0,0,0,.45)';c.shadowBlur=10;label(g,'@'+g.s.handle,W/2,1250,30,700,'#fff','center');c.restore();}
  function header(g,value){const c=g.c;c.fillStyle=CREAM;shape(c,72,88,100,58,29);c.fill();c.lineWidth=3;c.strokeStyle=INK;c.stroke();label(g,g.num,122,100,30,800,INK,'center');text(g,value,196,84,{width:812,size:58,min:38,weight:800});}
  function bars(g,f,x,y){const c=g.c;c.fillStyle=g.s.color;f.lines.forEach((line,i)=>{const ly=y+i*f.step+f.size*.1;if(i===0)c.fillRect(x-28,ly,10,f.size*1.02);if(i===f.lines.length-1&&f.lines.length>1)c.fillRect(x+widthOf(line)+18,ly,10,f.size*1.02);});}
  function glassCover(g){
    const c=g.c,d=g.d.cover;backdrop(g,0);fade(g,520,.8);
    folder(c,72,96,156,124,g.s.color);label(g,`${d.label||'PICK'}.zip`,72,236,26,700,'#fff');
    folder(c,816,470,176,140,CREAM);emoji(c,g.d.emoji||'📷',904,548,60);label(g,'INFO.zip',904,624,26,700,'#fff','center');
    [[330,150,26,g.s.color],[1000,330,20,LIME],[150,560,18,'#fff'],[720,730,24,g.s.color],[990,820,16,'#fff']].forEach(([x,y,r,color])=>star(c,x,y,r,color));
    const sub=fit(g,d.sub,{width:900,lines:2,size:34,min:24,weight:500,lh:1.4});
    const size=Math.min(fit(g,d.hook,{width:936,size:106,min:60,weight:800}).size,fit(g,d.topic,{width:936,size:106,min:60,weight:800}).size);
    const subY=1210-sub.height,y2=subY-30-size*1.15,y1=y2-size*1.15;
    text(g,d.hook,W/2,y1,{width:936,size,min:size,weight:800,align:'center',color:'#fff'});
    text(g,d.topic,W/2,y2,{width:936,size,min:size,weight:800,align:'center',color:YELLOW});
    put(g,sub,W/2,subY,{align:'center',color:'rgba(255,255,255,.94)'});disclosure(g,true);
  }
  function glassChecks(g){
    const c=g.c,d=g.d.checks,items=filled(d.items).slice(0,5);scene(g,{blur:32});
    glass(g,100,110,880,1010,40,.86);
    c.fillStyle=INK;[8,12,16,20].forEach((h,i)=>c.fillRect(830+i*10,158-h,6,h));c.strokeStyle=INK;c.lineWidth=2;c.strokeRect(880,140,40,20);c.fillRect(884,144,26,12);c.fillRect(921,146,4,8);
    text(g,`‹ ${g.s.channel} · ${g.s.today}`,140,186,{width:620,size:30,min:22,weight:600,color:g.s.color});label(g,'Done',940,186,30,700,g.s.color,'right');
    const title=fit(g,d.heading,{width:660,lines:2,size:72,min:48,weight:800,lh:1.28});bars(g,title,170,262);
    const start=put(g,title,170,262,{mark:mix(g.s.color,.4)})+40,h=Math.min(118,(1080-start)/Math.max(1,items.length));
    items.forEach((item,i)=>{
      const y=start+i*h;c.fillStyle=g.s.color;c.beginPath();c.arc(170,y+38,24,0,Math.PI*2);c.fill();
      c.strokeStyle='#fff';c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(159,y+38);c.lineTo(167,y+46);c.lineTo(182,y+30);c.stroke();
      text(g,item.title,214,y+12,{width:680,size:36,min:26,weight:800});text(g,item.text,214,y+60,{width:680,size:28,min:22,weight:500,color:SUB});
      if(i<items.length-1)dotted(c,150,930,y+h-8);
    });
    emoji(c,g.d.emoji||'📷',950,300,92,.15);folder(c,866,1050,124,98,CREAM);
    c.fillStyle='rgba(255,255,255,.62)';shape(c,W/2-270,1146,540,76,38);c.fill();label(g,'슬라이드를 넘겨보세요 →',W/2,1166,30,700,INK,'center');
    handle(g);disclosure(g,true);
  }
  function glassCards(g){
    const c=g.c,d=g.d.points,items=filled(d.items).slice(0,3);scene(g);header(g,d.heading);
    const ch=286,gap=26,total=items.length*ch+(items.length-1)*gap,top=186+(1010-total)/2;
    items.forEach((item,i)=>{
      const y=top+i*(ch+gap);glass(g,72,y,936,ch,44);photo(g,`points.items.${i}`,100,y+33,220,220,'circle');
      let tw=0;if(item.tag){c.font=fontOf(22,700);tw=c.measureText(item.tag).width+32;c.fillStyle=i%2?LIME:mix(g.s.color,.6);shape(c,980-tw,y+26,tw,42,21);c.fill();c.lineWidth=2;c.strokeStyle=INK;c.stroke();label(g,item.tag,980-tw/2,y+34,22,700,INK,'center');}
      text(g,item.title,352,y+44,{width:620-(tw?tw+20:0),size:46,min:32,weight:800,mark:mix(g.s.color,.4)});
      text(g,item.text,352,y+118,{width:624,lines:2,size:28,min:22,weight:500,lh:1.4,color:SUB});
      if(item.tip)text(g,'| '+item.tip,352,y+208,{width:624,size:28,min:22,weight:800,color:g.s.color});
    });
    handle(g);disclosure(g,true);
  }
  function glassTip(g){
    const c=g.c,d=g.d.tip,steps=filled(d.steps).slice(0,3);scene(g);header(g,d.heading);
    glass(g,72,190,936,990,44);
    c.fillStyle=g.s.color;shape(c,868,222,110,50,25);c.fill();label(g,'tip',923,230,28,800,'#fff','center');
    const title=fit(g,d.title,{width:680,size:56,min:40,weight:800});const tx=W/2-widthOf(title.lines[0])/2;bars(g,title,tx,300);
    let y=put(g,title,W/2,300,{align:'center',mark:mix(g.s.color,.4)})+36;
    y=text(g,d.body,W/2,y,{width:800,lines:3,size:36,min:26,weight:500,em:800,lh:1.5,align:'center',markEm:mix(g.s.color,.4)})+30;
    dotted(c,132,948,y);y+=34;
    steps.forEach(step=>{c.fillStyle='#fff';shape(c,140,y,156,56,28);c.fill();c.lineWidth=2.5;c.strokeStyle=INK;c.stroke();text(g,step.label,218,y+12,{width:136,size:26,min:18,weight:700,align:'center'});text(g,step.text,324,y+10,{width:620,size:30,min:22,weight:500});y+=80;});
    if(steps.length){dotted(c,132,948,y+4);y+=38;}
    if(text(g,d.cta,W/2,y,{width:820,lines:2,size:46,min:32,weight:800,lh:1.3,align:'center'})>1160)g.over=true;
    emoji(c,'✏️',62,560,108,-.3);handle(g);disclosure(g,true);
  }
  function glassGrid(g){
    const c=g.c,d=g.d.facts,items=filled(d.items).slice(0,4);scene(g);header(g,d.heading);
    items.forEach((item,i)=>{
      const x=72+(i%2)*504,y=186+Math.floor(i/2)*456;glass(g,x,y,432,430,36);
      text(g,item.title,x+30,y+28,{width:372,size:36,min:26,weight:800,mark:mix(g.s.color,.4)});
      photo(g,`facts.items.${i}`,x+24,y+88,384,150,20);
      text(g,item.text,x+26,y+258,{width:380,lines:2,size:26,min:20,weight:500,lh:1.4,color:SUB});
      text(g,item.caption,x+26,y+350,{width:380,size:26,min:20,weight:800,color:g.s.color});
    });
    if(d.note){const note=fit(g,d.note,{width:840,size:28,min:20,weight:700}),w=widthOf(note.lines[0])+64,y=items.length>2?1110:650;c.fillStyle='rgba(28,28,30,.62)';shape(c,W/2-w/2,y,w,64,32);c.fill();put(g,note,W/2,y+16,{align:'center',color:'#fff'});}
    handle(g);disclosure(g,true);
  }
  function glassOutro(g){
    const c=g.c,d=g.d.outro;scene(g,{fog:false,dark:.3});
    [[120,120,22,g.s.color],[990,560,18,LIME],[90,980,16,'#fff'],[1000,1120,22,g.s.color]].forEach(([x,y,r,color])=>star(c,x,y,r,color));
    glass(g,140,170,800,480,44);avatar(g,W/2,280,78);
    text(g,g.s.handle?'@'+g.s.handle:g.s.channel,W/2,384,{width:700,size:50,min:32,weight:800,align:'center'});
    if(g.s.bio)text(g,g.s.bio,W/2,454,{width:700,size:30,min:22,weight:500,align:'center',color:SUB});
    c.fillStyle=g.s.color;shape(c,W/2-130,528,260,76,38);c.fill();label(g,'팔로우',W/2,548,32,800,'#fff','center');
    glass(g,140,690,800,330,44);
    const title=fit(g,'확인하는 법.zip',{width:600,size:40,min:30,weight:800});put(g,title,W/2,720,{align:'center',mark:mix(g.s.color,.4)});
    [['프로필 링크',CREAM],['상품 확인',g.s.color],['저장해 두기',CREAM]].forEach(([name,color],i)=>{const x=W/2-250+i*190;folder(c,x,800,130,104,color);label(g,name,x+65,926,26,700,INK,'center');});
    emoji(c,g.d.emoji||'📷',930,180,84,.2);
    c.save();c.shadowColor='rgba(0,0,0,.55)';c.shadowBlur=14;
    text(g,'♥ '+d.line1,W/2,1056,{width:936,size:32,min:24,weight:600,align:'center',color:'#fff'});
    text(g,d.line2,W/2,1110,{width:936,size:44,min:30,weight:800,align:'center',color:YELLOW});
    c.restore();handle(g);disclosure(g,true);
  }

  // fields: [content path, label, max length, rows]; lists: repeated rows (photo=true adds a photo per row).
  const empty=path=>d=>!filled(path.split('.').reduce((o,k)=>o[k],d)).length;
  const designs={
    note:{name:'노트형',slides:[
      {title:'표지',paint:noteCover,photos:{bg:'배경 사진'},fields:[['cover.label','라벨 (영문)',20],['cover.hook','1줄 · 질문',24],['cover.topic','2줄 · 주제',24]]},
      {title:'인트로',numbered:true,paint:noteIntro,photos:{card:'사진 카드'},fields:[['intro.heading','제목',30],['intro.body','본문 2문단',160,4]],lists:[{path:'intro.tags',max:2,label:'해시태그'}],hint:'앱 카드 목록은 포인트 목록의 제목 앞 3개를 씁니다.'},
      {title:'질문',numbered:true,paint:noteQuestion,empty:d=>!d.question.heading,photos:{polaroid:'폴라로이드 사진'},fields:[['question.heading','질문 제목',30],['question.body','본문 2문단',160,4],['question.note','메모지 손글씨',50],['question.caption','사진 캡션',24]]},
      {title:'포인트 목록',numbered:true,paint:noteList,empty:empty('points.items'),fields:[['points.heading','제목',30]],lists:[{path:'points.items',max:4,keys:[['tag','분류',10],['title','제목',24],['text','설명',70]]}]},
      {title:'요약 메모',paint:noteQuote,empty:d=>!d.tip.body,fields:[['tip.body','요약 문장 (**굵게**)',140,4]]},
      {title:'마무리',paint:noteOutro,photos:{bg:'흐린 배경 사진'},fields:[['outro.line1','1줄',30],['outro.line2','2줄 (굵게)',40]]}
    ]},
    glass:{name:'유리카드형',slides:[
      {title:'표지',paint:glassCover,photos:{bg:'배경 사진'},fields:[['cover.label','폴더 라벨',20],['cover.hook','1줄 · 후킹',24],['cover.topic','2줄 · 주제 (노랑)',24],['cover.sub','부제 2줄',60,2]]},
      {title:'체크리스트',paint:glassChecks,empty:empty('checks.items'),photos:{bg:'배경 사진 (흐리게)'},fields:[['checks.heading','제목',30]],lists:[{path:'checks.items',max:5,keys:[['title','항목',20],['text','할 것',36]]}]},
      {title:'포인트 카드',numbered:true,paint:glassCards,empty:empty('points.items'),photos:{bg:'배경 사진'},fields:[['points.heading','제목',30]],lists:[{path:'points.items',max:3,photo:true,keys:[['tag','태그',10],['title','제목',24],['text','설명',70],['tip','꿀팁',36]]}]},
      {title:'팁 카드',numbered:true,paint:glassTip,empty:d=>!d.tip.title&&!d.tip.body,photos:{bg:'배경 사진'},fields:[['tip.heading','제목',30],['tip.title','카드 제목',24],['tip.body','본문 (**형광펜**)',140,3],['tip.cta','마무리 2줄',50,2]],lists:[{path:'tip.steps',max:3,keys:[['label','라벨',10],['text','내용',40]]}]},
      {title:'정보 그리드',numbered:true,paint:glassGrid,empty:empty('facts.items'),photos:{bg:'배경 사진'},fields:[['facts.heading','제목',30],['facts.note','하단 안내',50]],lists:[{path:'facts.items',max:4,photo:true,keys:[['title','항목',20],['text','내용',60],['caption','강조',24]]}]},
      {title:'마무리',paint:glassOutro,photos:{bg:'배경 사진'},fields:[['outro.line1','1줄 (♥ 흰 글씨)',30],['outro.line2','2줄 (노랑)',40]]}
    ]}
  };
  // Photo slots in drawing order; unassigned slots take the collected photos in this order, cycling.
  const slots=design=>designs[design].slides.flatMap((slide,i)=>[...Object.keys(slide.photos||{}),...(slide.lists||[]).filter(l=>l.photo).flatMap(l=>Array.from({length:l.max},(_,k)=>`${l.path}.${k}`))].map(slot=>`${i}:${slot}`));
  function paint(canvas,design,index,context){
    canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');if(!c)throw new Error('이미지 생성을 지원하지 않는 브라우저예요.');
    const g={c,...context,over:false};c.save();designs[design].slides[index].paint(g);c.restore();return g.over;
  }
  return {designs,slots,filled,wrap,fit,paint};
})();
