// Use the existing Git credential manager. Credentials stay in memory only.
import { spawnSync } from 'node:child_process';
const owner = 'hikary83';
const repository = 'content-manager';
const credential = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
if (credential.status !== 0) { console.error('GitHub 인증을 확인할 수 없습니다. 저장소 Settings → Pages에서 main /docs를 설정해주세요.'); process.exit(1); }
const fields = Object.fromEntries(credential.stdout.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
if (!fields.password) { console.error('GitHub 인증이 없습니다.'); process.exit(1); }
const headers = { Authorization: `Bearer ${fields.password}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
const endpoint = `https://api.github.com/repos/${owner}/${repository}/pages`;
try {
  const current = await fetch(endpoint, { headers });
  if (![200,404].includes(current.status)) throw new Error(`Pages 조회 HTTP ${current.status}`);
  const exists = current.status === 200;
  const config = exists ? await current.json() : null;
  if (config && config.source?.branch === 'main' && config.source?.path === '/docs' && config.build_type === 'legacy') {
    console.log(JSON.stringify({ configured: true, url: config.html_url, status: config.status }));
  } else {
    const response = await fetch(endpoint, { method: exists ? 'PUT' : 'POST', headers, body: JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/docs' } }) });
    if (![201,204].includes(response.status)) throw new Error(`Pages 설정 HTTP ${response.status}`);
    console.log(JSON.stringify({ configured: true, source: 'main /docs', publishStatus: 'pending' }));
  }
} catch (error) { console.error(error.message); process.exit(1); }
