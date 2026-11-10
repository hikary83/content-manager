/* HIKARY only. v2.6.0 (2026-11-10) 「게시」:
 * the web's 「게시」 schedules the product video on YouTube Shorts, Instagram Reels and TikTok through the Buffer API,
 * syncPublishing (a 10-minute time trigger the owner adds in the Apps Script editor) records the results,
 * and the video on Cloudinary is deleted once every place has posted (or after 30 days). The Instagram carousel stays manual.
 * Script properties: BUFFER_API_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, PUBLISH_CODE.
 * Claude puts the video on Cloudinary at registration (tools/register.mjs video); the server only deletes it. */
var PUBLISH_PLATFORMS = ['youtube', 'instagram', 'tiktok']; // Buffer channel `service` names are the same words
var PUBLISH_LABELS = { youtube: 'YouTube', instagram: '인스타 릴스', tiktok: 'TikTok' };
var VIDEO_KEEP_DAYS = 30;
var COVER_OFFSET_MS = 3000; // Instagram and TikTok take a frame for the cover; Buffer cannot send cover.png as a video cover

function publishProps_() { return PropertiesService.getScriptProperties(); }
function publishStatus_() {
  var props = publishProps_();
  return { buffer: !!props.getProperty('BUFFER_API_KEY'), video: !!cloudinary_(), code: !!props.getProperty('PUBLISH_CODE') };
}
function q_(value) { return JSON.stringify(String(value)); } // a JSON string is a valid GraphQL string literal
function kst_(date) { return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }

// The server address is public (docs/js/config.js), so posting needs the owner's code. Five wrong codes block it for an hour.
function checkPublishCode_(code) {
  var expected = publishProps_().getProperty('PUBLISH_CODE');
  if (!expected) throw userError_('스크립트 속성에 PUBLISH_CODE(게시 비밀번호)를 넣어주세요.');
  var cache = CacheService.getScriptCache(); var fails = Number(cache.get('PUBLISH_FAILS') || 0);
  if (fails >= 5) throw userError_('비밀번호를 5번 틀려서 1시간 동안 게시를 막았어요.');
  if (typeof code !== 'string' || hash_(code) !== hash_(expected)) {
    cache.put('PUBLISH_FAILS', String(fails + 1), 3600);
    throw userError_('게시 비밀번호가 맞지 않아요.');
  }
}

function buffer_(query) {
  var key = publishProps_().getProperty('BUFFER_API_KEY');
  if (!key) throw userError_('스크립트 속성에 BUFFER_API_KEY를 넣어주세요.');
  var response;
  try { response = UrlFetchApp.fetch('https://api.buffer.com', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify({ query: query }), muteHttpExceptions: true }); }
  catch (_) { throw userError_('Buffer에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
  var code = response.getResponseCode(); var body = null;
  try { body = JSON.parse(response.getContentText()); } catch (_) {}
  if (code === 401 || code === 403) throw userError_('Buffer가 API 키를 받지 않았어요. BUFFER_API_KEY와 키 권한을 확인해주세요.');
  if (code === 429) throw userError_('Buffer 요청 한도에 걸렸어요. 잠시 후 다시 시도해주세요.');
  if (body && body.errors && body.errors.length) {
    var error = userError_('Buffer 요청 오류: ' + String(body.errors[0].message || '').slice(0, 200));
    error.graphql = true; throw error;
  }
  if (code !== 200 || !body || !body.data) throw userError_('Buffer 서버가 응답하지 않았어요 (' + code + '). 잠시 후 다시 시도해주세요.');
  return body.data;
}

// The three channels connected in Buffer, looked up by service and kept 6 hours once all three are found.
function bufferChannels_() {
  var cache = CacheService.getScriptCache(); var hit = cache.get('BUFFER_CHANNELS');
  if (hit) return JSON.parse(hit);
  var found = {};
  buffer_('query { account { organizations { id } } }').account.organizations.forEach(function(org) {
    buffer_('query { channels(input: { organizationId: ' + q_(org.id) + ' }) { id service isDisconnected } }').channels.forEach(function(channel) {
      if (PUBLISH_PLATFORMS.indexOf(channel.service) < 0 || channel.isDisconnected) return;
      found[channel.service] = found[channel.service] ? 'many' : channel.id;
    });
  });
  if (PUBLISH_PLATFORMS.every(function(p) { return found[p] && found[p] !== 'many'; })) cache.put('BUFFER_CHANNELS', JSON.stringify(found), 21600);
  return found;
}

// A Buffer post, or null when Buffer no longer has it (deleted in Buffer). Network trouble throws.
function bufferPost_(id) {
  try { return buffer_('query { post(input: { id: ' + q_(id) + ' }) { status dueAt sentAt externalLink error { message } } }').post || null; }
  catch (error) { if (error.graphql) return null; throw error; }
}

// One line per place in 「게시 오류」: 「TikTok: …」. An empty message removes that place's line.
function setPublishError_(entry, platform, message) {
  var prefix = PUBLISH_LABELS[platform] + ': ';
  var lines = String(entry.publishError || '').split('\n').filter(function(line) { return line && line.indexOf(prefix) !== 0; });
  if (message) lines.push(prefix + message.replace(/\s+/g, ' '));
  entry.publishError = lines.join('\n');
}

function applyPost_(entry, platform, post) {
  if (post.status === 'sent') {
    entry[platform + 'Status'] = '업로드완료';
    if (post.sentAt) entry[platform + 'Date'] = kst_(new Date(post.sentAt));
    entry[platform + 'Link'] = /^https:\/\/\S+$/.test(post.externalLink || '') ? post.externalLink : '';
    setPublishError_(entry, platform, '');
  } else if (post.status === 'error') {
    entry[platform + 'Status'] = '오류';
    setPublishError_(entry, platform, 'Buffer 게시 실패 — ' + String(post.error && post.error.message || '이유를 받지 못했어요').slice(0, 300));
  } else {
    entry[platform + 'Status'] = '예약됨';
    if (post.dueAt) entry[platform + 'Date'] = kst_(new Date(post.dueAt));
  }
}

function cloudinary_() {
  var props = publishProps_();
  var config = { cloud: props.getProperty('CLOUDINARY_CLOUD_NAME'), key: props.getProperty('CLOUDINARY_API_KEY'), secret: props.getProperty('CLOUDINARY_API_SECRET') };
  return config.cloud && config.key && config.secret ? config : null;
}
// Only an mp4 on our own Cloudinary may be posted: anyone can call `save`, so an address alone proves nothing.
function videoPublicId_(url) {
  var config = cloudinary_(); var match = String(url || '').match(/^https:\/\/res\.cloudinary\.com\/([a-z0-9_-]+)\/video\/upload\/(?:v\d+\/)?([A-Za-z0-9_\/-]+)\.mp4$/);
  return config && match && match[1] === config.cloud ? match[2] : '';
}
// true when the video is gone (or was never ours); false keeps the address for the next run.
function deleteVideo_(url) {
  var config = cloudinary_(); if (!config) return false;
  var id = videoPublicId_(url); if (!id) return true;
  var timestamp = String(Math.floor(Date.now() / 1000));
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, 'invalidate=true&public_id=' + id + '&timestamp=' + timestamp + config.secret, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  try {
    var response = UrlFetchApp.fetch('https://api.cloudinary.com/v1_1/' + config.cloud + '/video/destroy', { method: 'post', payload: { invalidate: 'true', public_id: id, timestamp: timestamp, api_key: config.key, signature: signature }, muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return false;
    var result = JSON.parse(response.getContentText()).result;
    return result === 'ok' || result === 'not found';
  } catch (_) { return false; }
}
// Delete once nothing is waiting and every place is up or skipped — or 30 days after the upload, whatever is left.
function videoDone_(entry) {
  if (PUBLISH_PLATFORMS.some(function(p) { return entry[p + 'Status'] === '예약됨'; })) return false;
  if (PUBLISH_PLATFORMS.every(function(p) { return ['업로드완료', '보류'].indexOf(entry[p + 'Status']) >= 0; })) return true;
  var uploaded = new Date(String(entry.videoDate || '').replace(' ', 'T') + ':00+09:00');
  return !isNaN(uploaded.getTime()) && Date.now() - uploaded.getTime() > VIDEO_KEEP_DAYS * 864e5;
}

function createBufferPost_(entry, platform, channelId, dueAt) {
  var label = PUBLISH_LABELS[platform];
  if (!channelId) throw userError_('Buffer에 연결된 ' + label + ' 채널이 없어요. Buffer에서 채널을 다시 연결해 주세요.');
  if (channelId === 'many') throw userError_('Buffer에 ' + label + ' 채널이 둘 이상이에요. 하나만 남겨 주세요.');
  var text, metadata = '', cover = ', metadata: { thumbnailOffset: ' + COVER_OFFSET_MS + ' }';
  if (platform === 'youtube') {
    // Same split as the web: first line 「제목: …」, a blank line, then the description.
    var match = /^제목:[ \t]*(.*)(?:\r?\n([\s\S]*))?$/.exec(entry.youtube || '');
    var title = match ? match[1].trim() : ''; text = match ? String(match[2] || '').trim() : '';
    if (!title) throw userError_('유튜브 제목이 없어요. 「보기·수정」에서 제목을 넣어주세요.');
    if (title.length > 100) throw userError_('유튜브 제목이 100자를 넘어요.');
    text = text || title; cover = '';
    metadata = ', metadata: { youtube: { title: ' + q_(title) + ', categoryId: ' + q_(/여행|체험/.test(entry.category) ? '19' : '22') + ', privacy: public, madeForKids: false, notifySubscribers: true } }';
  } else if (platform === 'instagram') {
    text = entry.instagram.trim();
    metadata = ', metadata: { instagram: { type: reel, shouldShareToFeed: true } }';
  } else text = entry.tiktok.trim();
  if (!text) throw userError_(label + ' 게시글이 비어 있어요. 「보기·수정」에서 넣어주세요.');
  var result = buffer_('mutation { createPost(input: { text: ' + q_(text) + ', channelId: ' + q_(channelId) + ', schedulingType: automatic, mode: customScheduled, dueAt: ' + q_(dueAt)
    + ', assets: [{ video: { url: ' + q_(entry.videoUrl) + cover + ' } }]' + metadata + ' }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }').createPost;
  if (!result || !result.post || !result.post.id) throw userError_('Buffer가 예약을 받지 않았어요' + (result && result.message ? ': ' + String(result.message).slice(0, 200) : '.'));
  return result.post.id;
}

function publish_(input) {
  checkPublishCode_(input.code);
  var platforms = Array.isArray(input.platforms) ? input.platforms : [];
  if (!platforms.length || platforms.some(function(p, i) { return PUBLISH_PLATFORMS.indexOf(p) < 0 || platforms.indexOf(p) !== i; })) throw userError_('올릴 곳을 골라주세요.');
  var due = new Date(String(input.dueAt || ''));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(input.dueAt || '')) || isNaN(due.getTime())) throw userError_('예약 날짜와 시간을 확인해주세요.');
  if (due.getTime() < Date.now() + 2 * 60000) throw userError_('예약 시간은 지금부터 2분 뒤 이후로 골라주세요.');
  if (due.getTime() > Date.now() + 60 * 864e5) throw userError_('예약은 60일 안으로만 걸 수 있어요.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sheet = getContentSheet_(); var rows = readSheetRows_(sheet);
    var index = rows.findIndex(function(row) { return row[0] && String(row[0]) === String(input.id || ''); });
    if (index < 0) throw userError_('콘텐츠를 찾지 못했어요. 목록을 새로고침해주세요.');
    var entry = rowEntry_(rows[index]);
    if (!input.revision || input.revision !== entry.revision) throw userError_('시트 내용이 변경됐어요. 새로고침한 뒤 다시 게시해주세요.');
    if (!videoPublicId_(entry.videoUrl)) throw userError_('게시할 영상이 없어요. 루미에게 「No.' + (entry.inpockNo || '○○○') + ' 영상 올려줘」라고 해 주세요.');
    platforms.forEach(function(p) { if (['업로드완료', '예약됨'].indexOf(entry[p + 'Status']) >= 0) throw userError_(PUBLISH_LABELS[p] + '은(는) 이미 ' + entry[p + 'Status'] + '이에요.'); });
    var channels = bufferChannels_(); var results = {};
    // Each place on its own: a failure is recorded as 「오류」 and the others still go ahead.
    platforms.forEach(function(p) {
      try {
        // The record says not posted, but Buffer may still hold an earlier post (record cleared by hand): never post twice.
        var earlier = entry[p + 'PostId'] ? bufferPost_(entry[p + 'PostId']) : null;
        if (earlier && earlier.status !== 'error') { applyPost_(entry, p, earlier); results[p] = { ok: false, error: '이미 Buffer에 ' + (earlier.status === 'sent' ? '게시돼' : '예약돼') + ' 있어서 다시 걸지 않았어요.' }; return; }
        entry[p + 'PostId'] = createBufferPost_(entry, p, channels[p], due.toISOString());
        entry[p + 'Status'] = '예약됨'; entry[p + 'Date'] = kst_(due); entry[p + 'Link'] = '';
        setPublishError_(entry, p, ''); results[p] = { ok: true };
      } catch (error) {
        var message = error && error.userSafe ? error.message : 'Buffer 예약 중 오류가 났어요.';
        entry[p + 'Status'] = '오류'; setPublishError_(entry, p, message); results[p] = { ok: false, error: message };
      }
    });
    var saved = writeEntry_(sheet, index + 2, entry);
    return { id: entry.id, revision: saved.revision, results: results };
  } finally { lock.releaseLock(); }
}

// Time trigger, every 10 minutes (Apps Script editor → 트리거 → syncPublishing). Rows with nothing scheduled cost no Buffer call.
function syncPublishing() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // a save is running; the next run catches up
  try {
    var sheet = getContentSheet_();
    readSheetRows_(sheet).forEach(function(row, index) {
      if (!row[0]) return;
      var entry = rowEntry_(row); var before = JSON.stringify(entry);
      PUBLISH_PLATFORMS.forEach(function(p) {
        if (entry[p + 'Status'] !== '예약됨' || !entry[p + 'PostId']) return;
        var post;
        try { post = bufferPost_(entry[p + 'PostId']); } catch (_) { return; } // Buffer unreachable or busy: next run
        if (post) applyPost_(entry, p, post);
        else { entry[p + 'Status'] = '오류'; setPublishError_(entry, p, 'Buffer에서 예약을 찾지 못했어요. Buffer에서 지웠다면 다시 게시해 주세요.'); }
      });
      if (entry.videoUrl && videoDone_(entry) && deleteVideo_(entry.videoUrl)) { entry.videoUrl = ''; entry.videoDate = ''; }
      if (JSON.stringify(entry) !== before) writeEntry_(sheet, index + 2, entry);
    });
  } finally { lock.releaseLock(); }
}
