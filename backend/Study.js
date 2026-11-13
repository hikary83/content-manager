// v2.16.0 「스터디」 (2026-11-14): links to learn from — reels, shorts and posts the owner shares to Slack #스터디 or pastes in the
// web, plus the KakaoTalk links moved once (tools/register.mjs study-import). One row per link in the tab 「스터디」 (made on first use),
// numbered S1, S2, … in save order so it can be named in a talk (「스터디 S12 얘기하자」). A number is never given twice.
// 「검토 요청」 (web) → Lumi (기획팀) lists them (`register.mjs studies`) and writes 분석 · 개선 방향 (`study S12 결과.md`), later the
// 결정 she and the owner reached in the Claude app. Only the link and our own words are kept — never the video or picture
// (CLAUDE.md §3), and the server never opens the linked page.
// Slack: syncPublishing (10 minutes) reads #스터디 first (syncStudy_). The app's only message is one answer under the owner's
// message when the analysis is in (사람: "답변 메세지만 받자", 2026-11-14). The Events API is not used: an Apps Script web app cannot
// read request headers, so Slack's signature could not be checked on a public address.
var STUDY_SHEET = '스터디';
var STUDY_HEADERS = ['스터디 ID', '번호', '저장 시각', '링크', '플랫폼', '메모', '출처', '상태', '검토 요청 시각', '분석', '개선 방향', '결정', '분석 시각', '슬랙 ts'];
var STUDY_KEYS = ['id', 'no', 'savedAt', 'url', 'platform', 'memo', 'from', 'status', 'askedAt', 'result', 'direction', 'decision', 'reviewedAt', 'slackTs'];
var STUDY_STATUSES = ['저장', '검토요청', '검토완료', '적용함', '보류'];
var STUDY_WEB = 'https://hikary83.github.io/content-manager/#study';
var SLACK_ERRORS = {
  not_in_channel: '앱이 #스터디에 없어요. #스터디에서 /invite @HIKARY 해 주세요.',
  channel_not_found: '채널을 찾지 못했어요. 스크립트 속성 SLACK_STUDY_CHANNEL(C…)을 확인해 주세요.',
  invalid_auth: '토큰이 맞지 않아요. 스크립트 속성 SLACK_BOT_TOKEN(xoxb-…)을 확인해 주세요.',
  not_authed: '토큰이 없어요. 스크립트 속성 SLACK_BOT_TOKEN을 넣어 주세요.',
  token_revoked: '토큰이 취소됐어요. 앱을 다시 설치하고 새 토큰을 넣어 주세요.',
  missing_scope: '앱 권한이 모자라요. channels:history · chat:write를 주고 다시 설치해 주세요.',
  ratelimited: '슬랙이 잠시 쉬라고 해요. 다음 읽기에 다시 해요.'
};

function studyProps_() { return PropertiesService.getScriptProperties(); }
function getStudySheet_() {
  var id = studyProps_().getProperty('SHEET_ID');
  if (!id) throw userError_('SHEET_ID를 설정해주세요.');
  var book = SpreadsheetApp.openById(id); var sheet = book.getSheetByName(STUDY_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(STUDY_SHEET);
    sheet.getRange(1, 1, 1, STUDY_HEADERS.length).setValues([STUDY_HEADERS]); sheet.setFrozenRows(1);
    return sheet;
  }
  if (JSON.stringify(sheet.getRange(1, 1, 1, STUDY_HEADERS.length).getDisplayValues()[0]) !== JSON.stringify(STUDY_HEADERS)) throw userError_('「스터디」 탭의 칸이 예상과 달라요. 데이터를 보호하기 위해 작업을 중단했어요.');
  return sheet;
}
function studyRows_(sheet) { return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, STUDY_HEADERS.length).getValues(); }
function studyEntry_(row) { var entry = {}; STUDY_KEYS.forEach(function(key, index) { entry[key] = String(row[index] == null ? '' : row[index]); }); return entry; }
// Every text cell goes in as text (a leading ') so Sheets never turns a time, a Slack ts or 「=…」 into a date, number or formula.
function studyCells_(entry) { return STUDY_KEYS.map(function(key) { var value = String(entry[key] == null ? '' : entry[key]); return key === 'no' ? Number(value) : value ? "'" + value : ''; }); }
function withStudyLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try { return work(getStudySheet_()); } finally { lock.releaseLock(); }
}

function readStudies_() {
  var props = studyProps_();
  return {
    studies: studyRows_(getStudySheet_()).filter(function(row) { return row[0]; }).map(studyEntry_).reverse(),
    slack: !!(props.getProperty('SLACK_BOT_TOKEN') && props.getProperty('SLACK_STUDY_CHANNEL')),
    syncedAt: props.getProperty('STUDY_SYNCED_AT') || '', syncError: props.getProperty('STUDY_SLACK_ERROR') || ''
  };
}

function studyPlatform_(url) {
  var host = ((/^https?:\/\/([^\/?#]+)/i.exec(url) || [])[1] || '').toLowerCase().replace(/:\d+$/, '');
  if (/(^|\.)instagram\.com$/.test(host)) return '인스타';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return '유튜브';
  if (/(^|\.)tiktok\.com$/.test(host)) return '틱톡';
  return '기타';
}
// The same link shared twice is one row: what changes per share (igsh, si, utm_…), www./m. and http/https are left out of the comparison.
function studyKey_(url) {
  var match = /^https?:\/\/([^\/?#]+)([^?#]*)(\?[^#]*)?/i.exec(url) || [];
  var query = (match[3] || '').slice(1).split('&').filter(function(part) { return part && !/^(igsh|igshid|si|feature|utm_[a-z_]+|is_from_webapp|sender_device|share_[a-z_]+|_r|_t)=/i.test(part); }).sort().join('&');
  return (match[1] || '').toLowerCase().replace(/^(www|m)\./, '') + (match[2] || '').replace(/\/+$/, '') + (query ? '?' + query : '');
}
// Slack writes a link as <https://…> or <https://…|label>; the rest of the message is the memo.
function studyLinks_(text) {
  var links = []; var re = /<(https?:\/\/[^>|\s]+)(?:\|[^>]*)?>/gi; var match;
  while ((match = re.exec(text))) { var url = match[1].replace(/&amp;/g, '&'); if (url.length <= 2000 && links.indexOf(url) < 0) links.push(url); }
  return links;
}
function studyMemo_(text) {
  return text.replace(/<https?:\/\/[^>]*>/gi, ' ').replace(/<[@#!][^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim().slice(0, 1000);
}
function studySummary_(text) { return (String(text || '').split('\n').map(function(line) { return line.replace(/^[#>*\-·\s]+/, '').trim(); }).filter(Boolean)[0] || ''); }

function studyItem_(input, from) {
  var url = field_(input.url || '', 2000), memo = field_(input.memo || '', 1000), savedAt = field_(input.savedAt || '', 16);
  if (!/^https?:\/\/[^\s\/?#]+\.[^\s\/?#]+([\/?#]\S*)?$/i.test(url)) throw userError_('http(s)://로 시작하는 링크를 넣어주세요.');
  if (savedAt && !/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(savedAt)) throw userError_('저장 시각은 YYYY-MM-DD HH:mm 형식이어야 해요.');
  return { url: url, memo: memo, from: from, savedAt: savedAt, slackTs: '' };
}
// Call with the script lock held. Adds the links not there yet (in the order given), numbered after the largest number ever given.
function appendStudies_(sheet, items) {
  var props = studyProps_(); var no = Number(props.getProperty('STUDY_LAST_NO')) || 0; var seen = {};
  studyRows_(sheet).filter(function(row) { return row[0]; }).map(studyEntry_).forEach(function(row) {
    seen[studyKey_(row.url)] = true; if (row.slackTs) seen['ts:' + row.slackTs] = true; no = Math.max(no, Number(row.no) || 0);
  });
  var now = kst_(new Date()); var added = [];
  items.forEach(function(item) {
    var key = studyKey_(item.url);
    if (seen[key] || (item.slackTs && seen['ts:' + item.slackTs])) return;
    seen[key] = true; if (item.slackTs) seen['ts:' + item.slackTs] = true;
    added.push({ id: Utilities.getUuid(), no: String(++no), savedAt: item.savedAt || now, url: item.url, platform: studyPlatform_(item.url), memo: item.memo, from: item.from,
      status: '저장', askedAt: '', result: '', direction: '', decision: '', reviewedAt: '', slackTs: item.slackTs || '' });
  });
  if (!added.length) return added;
  var first = Math.max(2, sheet.getLastRow() + 1);
  if (first + added.length - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), added.length + 50);
  sheet.getRange(first, 1, added.length, STUDY_HEADERS.length).setValues(added.map(studyCells_));
  SpreadsheetApp.flush(); props.setProperty('STUDY_LAST_NO', String(no));
  return added;
}

// The web sends one pasted link; the register tool sends the KakaoTalk links in one go (from 「카톡」, with their own time).
// Slack rows come only from syncStudy_.
function addStudies_(input) {
  var items = input.items;
  if (!Array.isArray(items) || !items.length || items.length > 500) throw userError_('저장할 링크를 1~500개로 보내주세요.');
  var from = input.from === '카톡' ? '카톡' : '웹';
  var list = items.map(function(item) { return studyItem_(item || {}, from); });
  return withStudyLock_(function(sheet) { var added = appendStudies_(sheet, list); return { added: added.length, duplicates: list.length - added.length, studies: added }; });
}

// ids: study ids or numbers (「S12」). The web changes the status and the memo, or deletes; 분석 · 개선 방향 · 결정 come only from
// the register tool (Lumi). A new analysis makes the row 검토완료 and is answered under the Slack message it came from.
function updateStudies_(input, who) {
  var refs = Array.isArray(input.ids) ? input.ids : [];
  if (!refs.length || refs.length > 200) throw userError_('고칠 링크를 다시 골라주세요.');
  var text = {};
  ['result', 'direction', 'decision'].forEach(function(key) { if (input[key] !== undefined) text[key] = field_(input[key], 20000); });
  if (Object.keys(text).length && who !== 'tool') throw userError_('분석·결정은 루미가 등록 도구로 써요.');
  if (input.status !== undefined && STUDY_STATUSES.indexOf(input.status) < 0) throw userError_('스터디 상태가 올바르지 않아요.');
  var memo = input.memo === undefined ? undefined : field_(input.memo, 1000);
  var answer = [];
  var result = withStudyLock_(function(sheet) {
    var entries = studyRows_(sheet).map(studyEntry_);
    var indexes = refs.map(function(ref) {
      ref = String(ref).trim(); var no = /^S(\d+)$/i.exec(ref);
      var index = entries.findIndex(function(entry) { return entry.id && (no ? entry.no === no[1] : entry.id === ref); });
      if (index < 0) throw userError_('스터디 ' + ref + '을(를) 찾지 못했어요. 새로고침해주세요.');
      return index;
    });
    if (input.delete) {
      indexes.sort(function(a, b) { return b - a; }).forEach(function(index) {
        if (sheet.getMaxRows() - sheet.getFrozenRows() <= 1) sheet.insertRowsAfter(sheet.getMaxRows(), 1); // Sheets keeps one unfrozen row
        sheet.deleteRow(index + 2);
      });
      SpreadsheetApp.flush();
      return { deleted: indexes.length };
    }
    var now = kst_(new Date());
    var changed = indexes.map(function(index) {
      var entry = entries[index];
      if (memo !== undefined) entry.memo = memo;
      Object.keys(text).forEach(function(key) { entry[key] = text[key]; });
      if (text.result) { entry.reviewedAt = now; if (input.status === undefined) entry.status = '검토완료'; }
      if (input.status !== undefined) {
        if (input.status === '검토요청' && entry.status !== '검토요청') entry.askedAt = now;
        if (input.status === '저장') entry.askedAt = '';
        entry.status = input.status;
      }
      sheet.getRange(index + 2, 1, 1, STUDY_HEADERS.length).setValues([studyCells_(entry)]);
      if (text.result && entry.slackTs) answer.push(entry);
      return entry;
    });
    SpreadsheetApp.flush();
    return { studies: changed };
  });
  // After the lock: Slack can be slow. The analysis is saved either way; the reply says how each answer went.
  if (answer.length) result.slack = answer.map(function(entry) {
    try { studyAnswer_(entry); return 'S' + entry.no + ' 슬랙 댓글을 달았어요'; }
    catch (error) { return 'S' + entry.no + ' 슬랙 댓글 실패: ' + (error && error.userSafe ? error.message : '슬랙에 닿지 못했어요'); }
  });
  return result;
}
// 「✅ S12 루미 분석 도착 · 한 줄 요약 · 개선 방향 · 웹 링크」 under the owner's own Slack message. Nothing else is posted.
function studyAnswer_(entry) {
  var escape = function(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var direction = String(entry.direction || '').trim();
  var text = '✅ S' + entry.no + ' 루미 분석 도착\n' + escape(studySummary_(entry.result))
    + (direction ? '\n개선 방향: ' + escape(direction.length > 600 ? direction.slice(0, 600) + '…' : direction) : '') + '\n' + STUDY_WEB;
  slack_('chat.postMessage', { channel: studyProps_().getProperty('SLACK_STUDY_CHANNEL'), thread_ts: entry.slackTs.split('#')[0], text: text, unfurl_links: false, unfurl_media: false }, true);
}

function slack_(method, params, post) {
  var token = studyProps_().getProperty('SLACK_BOT_TOKEN');
  if (!token) throw userError_(SLACK_ERRORS.not_authed);
  var url = 'https://slack.com/api/' + method;
  var options = { method: post ? 'post' : 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  if (post) { options.contentType = 'application/json; charset=utf-8'; options.payload = JSON.stringify(params); }
  else url += '?' + Object.keys(params).filter(function(key) { return params[key] !== '' && params[key] != null; }).map(function(key) { return key + '=' + encodeURIComponent(params[key]); }).join('&');
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 429) throw userError_(SLACK_ERRORS.ratelimited);
  var body; try { body = JSON.parse(response.getContentText()); } catch (_) { throw userError_('슬랙 응답을 읽지 못했어요 (' + response.getResponseCode() + ').'); }
  if (!body.ok) throw userError_(SLACK_ERRORS[body.error] || '슬랙이 받지 않았어요 (' + String(body.error).slice(0, 60) + ').');
  return body;
}

// From syncPublishing every 10 minutes, and 「슬랙에서 가져오기」. The first read (no STUDY_SLACK_TS yet) takes the whole channel —
// what Slack still shows (90 days on the free plan) — so links shared before the app was connected come in too.
// A failed read is kept in STUDY_SLACK_ERROR for the web and the next run tries again from the same place.
function syncStudy_() {
  var props = studyProps_(); var channel = props.getProperty('SLACK_STUDY_CHANNEL');
  if (!props.getProperty('SLACK_BOT_TOKEN') || !channel) return { added: 0, slack: false };
  var oldest = props.getProperty('STUDY_SLACK_TS') || ''; var messages = []; var cursor = '';
  try {
    do { // ponytail: no page cap — 90 days of one person's shares is a few pages of 200
      var page = slack_('conversations.history', { channel: channel, oldest: oldest, limit: 200, cursor: cursor });
      messages = messages.concat(page.messages || []);
      cursor = page.response_metadata && page.response_metadata.next_cursor || '';
    } while (cursor);
  } catch (error) {
    props.setProperty('STUDY_SLACK_ERROR', kst_(new Date()) + ' ' + (error && error.userSafe ? error.message : '슬랙에 닿지 못했어요'));
    throw error;
  }
  messages.sort(function(a, b) { return Number(a.ts) - Number(b.ts); });
  var items = []; var newest = oldest;
  messages.forEach(function(message) {
    if (oldest && Number(message.ts) <= Number(oldest)) return;
    if (!newest || Number(message.ts) > Number(newest)) newest = message.ts;
    // The owner's messages only: the app's answers (bot_id) and joins or topic changes (subtype) are skipped. Thread replies are not in the history.
    if (message.bot_id || (message.subtype && message.subtype !== 'file_share')) return;
    var memo = studyMemo_(message.text || ''); var savedAt = kst_(new Date(Number(message.ts) * 1000));
    studyLinks_(message.text || '').forEach(function(url, i) { items.push({ url: url, memo: memo, from: '슬랙', savedAt: savedAt, slackTs: message.ts + (i ? '#' + (i + 1) : '') }); });
  });
  var added = items.length ? withStudyLock_(function(sheet) { return appendStudies_(sheet, items); }) : [];
  if (newest) props.setProperty('STUDY_SLACK_TS', newest);
  props.setProperty('STUDY_SYNCED_AT', kst_(new Date())); props.setProperty('STUDY_SLACK_ERROR', '');
  return { added: added.length, slack: true };
}
