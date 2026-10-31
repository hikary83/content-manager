import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run,probe,localFile,validate} from './lib.mjs';

const args=process.argv.slice(2);const jobFile=args[0];
if(!jobFile) throw new Error('사용: node scripts/reel/render.mjs <video-job.json> [--tts "Windows 음성명"] [--draft]');
const job=JSON.parse(fs.readFileSync(jobFile,'utf8'));validate(job);
const root=path.dirname(path.resolve(jobFile));
const images=job.scenes.map(s=>localFile(root,s.image));
const audio=job.scenes.map(s=>s.audio?localFile(root,s.audio):null);
const ttsIndex=args.indexOf('--tts'); const voice=ttsIndex>=0?args[ttsIndex+1]:null;
if(ttsIndex>=0&&(!voice||voice.startsWith('--'))) throw new Error('Windows SAPI 음성명을 지정해주세요.');
if(voice&&process.platform!=='win32') throw new Error('이 TTS 어댑터는 Windows 전용입니다.');
if(voice&&audio.some(Boolean)) throw new Error('TTS와 직접 녹음은 한 작업에서 섞지 않습니다.');
if(!voice&&audio.some(Boolean)&&audio.some(a=>!a)) throw new Error('녹음은 4개 컷 모두 지정해주세요.');
run('ffmpeg',['-version']);
// Unique output protects completed films and makes interrupted jobs safe to retry.
const out=fs.mkdtempSync(path.join(root,'render-'));const timing=[];
const [w,h]=args.includes('--draft')?[540,960]:[1080,1920];
let start=0;
for(let i=0;i<4;i++){
  const scene=job.scenes[i];let sound=audio[i];
  if(voice){
    const text=path.join(out,`speech-${i}.txt`);sound=path.join(out,`speech-${i}.wav`);
    fs.writeFileSync(text,scene.voiceover,'utf8');
    const speechCode=fs.readFileSync(fileURLToPath(new URL('./voice.ps1',import.meta.url)),'utf8');
    // Invoke our fixed source as a command; values stay in environment variables, never executable code.
    // Do not modify the user's PowerShell execution policy or request a Bypass flag.
    run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`& { ${speechCode} } -TextFile $env:HIKARY_TEXT -OutFile $env:HIKARY_AUDIO -Voice $env:HIKARY_VOICE`],{env:{...process.env,HIKARY_TEXT:text,HIKARY_AUDIO:sound,HIKARY_VOICE:voice}});
  }
  if(sound){
    const info=probe(sound);const duration=Number(info.format.duration);
    if(!info.streams.some(s=>s.codec_type==='audio')||!Number.isFinite(duration)||duration>scene.duration-.08) throw new Error(`컷 ${i+1} 음성이 할당 시간을 초과하거나 읽을 수 없습니다. 대사를 줄이거나 시간 배분을 수정해주세요. 자동 배속/잘라내기는 하지 않습니다. 작업 폴더: ${out}`);
  }
  const frames=Math.round(scene.duration*30);
  const base=`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0xF8F7F3,setsar=1`;
  const motion=scene.motion==='push-in'?`,zoompan=z='1+0.025*on/${frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${w}x${h}:fps=30`:'';
  run('ffmpeg',['-v','error','-n','-protocol_whitelist','file,pipe','-loop','1','-framerate','30','-i',images[i],...(sound?['-protocol_whitelist','file,pipe','-i',sound]:['-f','lavfi','-i','anullsrc=r=48000:cl=mono']),'-vf',base+motion+',format=yuv420p','-af','apad,aresample=48000','-t',String(frames/30),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-ar','48000','-ac','1','-movflags','+faststart',path.join(out,`cut-${i}.mp4`)]);
  timing.push({scene:i+1,role:scene.role,start,end:start+frames/30,transition:'cut',voiceover:scene.voiceover});start+=frames/30;
  console.log(`컷 ${i+1}/4 완료`);
}
fs.writeFileSync(path.join(out,'concat.txt'),[0,1,2,3].map(i=>`file 'cut-${i}.mp4'`).join('\n'));
run('ffmpeg',['-v','error','-n','-f','concat','-safe','1','-i','concat.txt','-c','copy','-movflags','+faststart','film.mp4'],{cwd:out});
const result=probe(path.join(out,'film.mp4'));const video=result.streams.find(s=>s.codec_type==='video');
if(video?.width!==w||video?.height!==h||Math.abs(Number(result.format.duration)-start)>.15) throw new Error('출력 영상 길이/해상도 검증 실패');
fs.writeFileSync(path.join(out,'timing.json'),JSON.stringify({fps:30,duration:start,captions:false,voice:voice||(audio[0]?'recorded':'silent'),scenes:timing},null,2));
console.log(`완료: ${path.join(out,'film.mp4')} (${start}초). 자동 게시하지 않습니다. 음성·사진·표현 검수 필요.`);
