import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding:'utf8', timeout:300000, maxBuffer:8*1024*1024, windowsHide:true, shell:false, ...options});
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} 실패: ${result.error?.message || result.stderr?.slice(-1500) || result.status}`);
  return result.stdout;
}
export function probe(file) {
  return JSON.parse(run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file]));
}
export function localFile(root, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name) || /^[a-z]+:/i.test(name)) throw new Error('작업 폴더 내부의 상대 파일 경로만 허용합니다.');
  const base = fs.realpathSync(root); const file = fs.realpathSync(path.resolve(base,name));
  const relative = path.relative(base,file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(file).isFile()) throw new Error('작업 폴더 밖 파일은 사용할 수 없습니다.');
  return file;
}
export function validate(job) {
  if (job.schema !== 'hikary-video/1' || job.captions !== false || job.fps !== 30 || job.scenes?.length !== 4) throw new Error('자막 없는 4컷 hikary-video/1 제작 파일이 필요합니다.');
  let total=0;
  job.scenes.forEach((s,i)=>{
    if (s.role !== ['hook','benefit','evidence','cta'][i] || !Number.isFinite(s.duration) || s.duration < 1 || s.duration > 8 || typeof s.voiceover !== 'string' || !s.voiceover.trim() || s.voiceover.length>500 || !['push-in','still'].includes(s.motion) || s.transition !== 'cut') throw new Error('컷 역할·시간·대사·움직임 설정을 확인해주세요.');
    if (!/\.(jpe?g|png|webp)$/i.test(s.image)) throw new Error('사진은 JPG·PNG·WEBP만 지원합니다.');
    total += s.duration;
  });
  if (total < 15 || total > 20 || job.scenes[0].duration>3) throw new Error('전체 15~20초, 첫 훅 3초 이내로 설정해주세요.');
  return total;
}
export function reviewTimes(duration, cuts=[], fps=30) {
  const shots=[];
  for(let t=0;t<duration;t++) shots.push({kind:'overview',time:t});
  for(let n=0;n<12&&n/4<duration;n++) shots.push({kind:'hook',time:n/4});
  for(const t of cuts) for(const offset of [-1,0,1]) if(t+offset/fps>=0&&t+offset/fps<duration) shots.push({kind:'boundary',time:t+offset/fps});
  return shots;
}
