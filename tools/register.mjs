// Registers content made in Claude to the HIKARY ledger through the same Apps Script API the web uses.
//   node tools/register.mjs list [out.json]          print (or save) every registered row
//   node tools/register.mjs save <entry.json>        create or update one row, then write id/revision back into the file
// Run "save" only after the owner confirms the content (「컨펌」, CLAUDE.md §2). It writes to the real sheet.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const apiUrl = fs.readFileSync(new URL('../docs/js/config.js', import.meta.url), 'utf8').match(/apiUrl: '([^']+)'/)[1];

export async function request(action, payload = {}) {
  // Apps Script answers POST with a redirect to a GET result page; fetch follows it like the browser does.
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload, requestId: randomUUID() }) });
  let result;
  try { result = await response.json(); } catch { throw new Error(`서버 응답을 읽지 못했어요 (${response.status}).`); }
  if (!result.ok) throw new Error(result.error || '처리에 실패했어요.');
  return result.data;
}

export async function save(file, send = request) {
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
  entry.id ||= randomUUID();
  // Persist the id before sending: if the reply is lost, a retry with the same id cannot create a second row.
  fs.writeFileSync(file, JSON.stringify(entry, null, 2) + '\n');
  const saved = await send('save', { format: '쇼츠', ...entry });
  fs.writeFileSync(file, JSON.stringify({ ...entry, revision: saved.revision }, null, 2) + '\n');
  return saved;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  if (command === 'list') {
    const text = JSON.stringify((await request('list')).entries, null, 2);
    if (file) { fs.writeFileSync(file, text + '\n'); console.log(`saved ${file}`); } else console.log(text);
  } else if (command === 'save' && file) {
    const saved = await save(file);
    console.log(saved.replayed ? `already saved: ${saved.id}` : `saved: ${saved.id}`);
  } else {
    console.log('usage: node tools/register.mjs list [out.json] | save <entry.json>');
    process.exitCode = 1;
  }
}
