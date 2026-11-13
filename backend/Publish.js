/* HIKARY only. v2.6.0 (2026-11-10) 「게시」:
 * the web's 「게시」 schedules the product video on YouTube Shorts, Instagram Reels and TikTok through the Buffer API,
 * syncPublishing (a 10-minute time trigger the owner adds in the Apps Script editor) records the results,
 * and the video on Cloudinary is deleted once every place has posted (or after 30 days). The Instagram carousel stays manual.
 * v2.10.0: a product goes to Instagram as a reel or as a carousel (「인스타 형식」). A carousel product never sends the reel,
 * and 「게시」 may change the format while nothing has gone to Instagram yet.
 * Script properties: BUFFER_API_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, PUBLISH_CODE.
 * Claude puts the video on Cloudinary at registration (tools/register.mjs video); the server only deletes it.
 * v2.15.0: once a day (after METRICS_HOUR) the same trigger reads every posted place's numbers in one call (「지표」), every
 * Buffer answer's RateLimit header is kept for the web (BUFFER_QUOTA), and 「too many」 rests as long as Buffer's Retry-After says. */
var PUBLISH_PLATFORMS = ['youtube', 'instagram', 'tiktok']; // Buffer channel `service` names are the same words
var PUBLISH_LABELS = { youtube: 'YouTube', instagram: '인스타 릴스', tiktok: 'TikTok' };
var VIDEO_KEEP_DAYS = 30;
var COVER_OFFSET_MS = 3000; // Instagram and TikTok take a frame for the cover; Buffer cannot send cover.png as a video cover
function carouselProduct_(entry) { return entry.instagramType === '캐러셀'; }
// The places the video still waits for: Instagram only when the product goes there as a reel.
function videoPlaces_(entry) { return PUBLISH_PLATFORMS.filter(function(p) { return p !== 'instagram' || !carouselProduct_(entry); }); }

function publishProps_() { return PropertiesService.getScriptProperties(); }
function publishStatus_() {
  var props = publishProps_();
  var quota = null; try { quota = JSON.parse(props.getProperty('BUFFER_QUOTA') || 'null'); } catch (_) {}
  return { buffer: !!props.getProperty('BUFFER_API_KEY'), video: !!cloudinary_(), code: !!props.getProperty('PUBLISH_CODE'), limitedAt: bufferLimitedAt_() || '', limitedUntil: CacheService.getScriptCache().get('BUFFER_LIMITED_UNTIL') || '', quota: quota };
}
// v2.14.0: after 「too many」 the server rests — every call in between would be refused — and 「status」 says since when.
// v2.15.0: as long as Buffer's Retry-After says (an hour when it says nothing; the cache keeps 6 hours at most, then one call
// asks again). Free plan, Buffer docs 2026-11: 150 calls / 15 min · 600 / 24 h · 1,000 a channel / 30 days.
var BUFFER_REST_SECONDS = 3600;
function bufferLimitedAt_() { return CacheService.getScriptCache().get('BUFFER_LIMITED'); }
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

// partial: return the data even when some parts failed (a batch of posts where one was deleted in Buffer).
function buffer_(query, partial) {
  var key = publishProps_().getProperty('BUFFER_API_KEY');
  if (!key) throw userError_('스크립트 속성에 BUFFER_API_KEY를 넣어주세요.');
  var limited = bufferLimitedAt_();
  if (limited) throw userError_('Buffer 호출 한도에 걸려 ' + limited.slice(11) + '부터 쉬는 중이에요 (' + (CacheService.getScriptCache().get('BUFFER_LIMITED_UNTIL') || '').slice(11) + '까지). 잠시 후 다시 시도해주세요.');
  var response;
  try { response = UrlFetchApp.fetch('https://api.buffer.com', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify({ query: query }), muteHttpExceptions: true }); }
  catch (_) { throw userError_('Buffer에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'); }
  var code = response.getResponseCode(); var body = null; var headers = responseHeaders_(response);
  try { body = JSON.parse(response.getContentText()); } catch (_) {}
  var quota = rateLimit_(headers.ratelimit, headers['ratelimit-policy']);
  if (quota.length) publishProps_().setProperty('BUFFER_QUOTA', JSON.stringify({ at: kst_(new Date()), windows: quota }));
  if (code === 401 || code === 403) throw userError_('Buffer가 API 키를 받지 않았어요. BUFFER_API_KEY와 키 권한을 확인해주세요.');
  var errors = body && body.errors || [];
  if (code === 429 || errors.some(function(item) { return item && item.extensions && item.extensions.code === 'RATE_LIMIT_EXCEEDED'; })) {
    var rest = Math.min(Math.max(Math.round(Number(headers['retry-after'])) || BUFFER_REST_SECONDS, 60), 21600);
    var cache = CacheService.getScriptCache(); cache.put('BUFFER_LIMITED', kst_(new Date()), rest); cache.put('BUFFER_LIMITED_UNTIL', kst_(new Date(Date.now() + rest * 1000)), rest);
    throw userError_('Buffer 호출 한도에 걸렸어요. ' + kst_(new Date(Date.now() + rest * 1000)).slice(11) + ' 뒤에 다시 시도해주세요.');
  }
  if (errors.length && !(partial && body.data)) {
    var error = userError_('Buffer 요청 오류: ' + String(body.errors[0].message || '').slice(0, 200));
    error.graphql = true; throw error;
  }
  if (code !== 200 || !body || !body.data) throw userError_('Buffer 서버가 응답하지 않았어요 (' + code + '). 잠시 후 다시 시도해주세요.');
  return body.data;
}

// Header names in lower case (Apps Script keeps the server's spelling).
function responseHeaders_(response) {
  var all = response.getAllHeaders ? response.getAllHeaders() : {}; var out = {};
  Object.keys(all || {}).forEach(function(name) { out[name.toLowerCase()] = String(all[name]); });
  return out;
}
// 「"15m"; r=149; t=900, "24h"; r=590; t=80431, …」 + 「"15m"; q=150; w=900, …」 → [{ name: '15m', r: 149, q: 150, t: 900 }, …]
function rateLimit_(limit, policy) {
  var parse = function(text) {
    var windows = {};
    String(text || '').split(',').forEach(function(part) {
      var bits = part.split(';'); var name = bits.shift().trim().replace(/"/g, ''); if (!name) return;
      windows[name] = {}; bits.forEach(function(bit) { var pair = bit.trim().split('='); windows[name][pair[0]] = Number(pair[1]); });
    });
    return windows;
  };
  var left = parse(limit), size = parse(policy);
  return Object.keys(left).filter(function(name) { return size[name] && isFinite(left[name].r) && size[name].q > 0; })
    .map(function(name) { return { name: name, r: left[name].r, q: size[name].q, t: left[name].t || 0 }; });
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
var POST_FIELDS = ' { status dueAt sentAt externalLink error { message } }';
function bufferPost_(id) {
  try { return buffer_('query { post(input: { id: ' + q_(id) + ' })' + POST_FIELDS + ' }').post || null; }
  catch (error) { if (error.graphql) return null; throw error; }
}
// v2.14.0: several posts in one call (GraphQL aliases p0, p1, …) → { id: post or null }.
function bufferPosts_(ids) {
  var data = buffer_('query { ' + ids.map(function(id, i) { return 'p' + i + ': post(input: { id: ' + q_(id) + ' })' + POST_FIELDS; }).join(' ') + ' }', true);
  var posts = {}; ids.forEach(function(id, i) { posts[id] = data['p' + i] || null; }); return posts;
}
// 「2026-11-12 08:45」 (Seoul) → ms; a missing time counts as due.
function kstTime_(value) {
  var match = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/.exec(String(value || ''));
  return match ? new Date(match[1] + 'T' + (match[2] || '00:00') + ':00+09:00').getTime() : 0;
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
  if (videoPlaces_(entry).every(function(p) { return ['업로드완료', '보류'].indexOf(entry[p + 'Status']) >= 0; })) return true;
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
    if (input.instagramType !== undefined && input.instagramType !== (entry.instagramType || '릴스')) {
      if (INSTAGRAM_TYPES.indexOf(input.instagramType) < 0) throw userError_('인스타 형식은 릴스나 캐러셀이에요.');
      if (['instagram', 'carousel'].some(function(p) { return ['업로드완료', '예약됨'].indexOf(entry[p + 'Status']) >= 0; })) throw userError_('인스타에 이미 올렸거나 예약해서 형식을 바꿀 수 없어요.');
      entry.instagramType = input.instagramType;
    }
    if (platforms.indexOf('instagram') >= 0 && carouselProduct_(entry)) throw userError_('이 상품은 인스타 캐러셀이라 릴스로 예약하지 않아요. 캐러셀은 직접 올려요.');
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

// Time trigger, every 10 minutes (Apps Script editor → 트리거 → syncPublishing).
// v2.14.0: only places whose scheduled time has passed are asked about, all in one Buffer call. Before, every 예약됨 place
// was asked about every run, one call each — three products scheduled days ahead used up the free plan's daily calls on
// 2026-11-11, and the refusals were swallowed, so the ledger silently stopped filling.
function syncPublishing() {
  if (bufferLimitedAt_()) return; // resting after Buffer's 「too many」; the first run after the hour catches up
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // a save is running; the next run catches up
  try {
    var sheet = getContentSheet_(); var now = Date.now();
    var entries = readSheetRows_(sheet).map(function(row) { return row[0] ? rowEntry_(row) : null; });
    var before = entries.map(function(entry) { return JSON.stringify(entry); });
    var waiting = function(entry, p) { return entry[p + 'Status'] === '예약됨' && entry[p + 'PostId']; };
    var due = [];
    entries.forEach(function(entry) { if (entry) PUBLISH_PLATFORMS.forEach(function(p) { if (waiting(entry, p) && kstTime_(entry[p + 'Date']) <= now) due.push(entry[p + 'PostId']); }); });
    var posts = null;
    if (due.length) { try { posts = bufferPosts_(due); } catch (_) {} } // Buffer unreachable, busy or resting: next run
    entries.forEach(function(entry, index) {
      if (!entry) return;
      if (posts) PUBLISH_PLATFORMS.forEach(function(p) {
        var id = entry[p + 'PostId'];
        if (!waiting(entry, p) || !Object.prototype.hasOwnProperty.call(posts, id)) return;
        if (posts[id]) applyPost_(entry, p, posts[id]);
        else { entry[p + 'Status'] = '오류'; setPublishError_(entry, p, 'Buffer에서 예약을 찾지 못했어요. Buffer에서 지웠다면 다시 게시해 주세요.'); }
      });
      if (entry.videoUrl && videoDone_(entry) && deleteVideo_(entry.videoUrl)) { entry.videoUrl = ''; entry.videoDate = ''; }
    });
    try { syncMetrics_(entries, now); } catch (_) {} // Buffer busy or resting: the next run tries again (the day is not marked)
    entries.forEach(function(entry, index) { if (entry && JSON.stringify(entry) !== before[index]) writeEntry_(sheet, index + 2, entry); });
  } finally { lock.releaseLock(); }
}

// v2.15.0 「지표」: Buffer pulls each post's numbers from the network about once a day (2026-11-12 it did so around 14–15 h),
// so the server reads them once a day after METRICS_HOUR, all posted places of the last 30 days in one call.
// Stored per place: { youtube: { views, reactions, … }, …, at: { youtube: Buffer's update time, … } }. A read Buffer made
// within an hour of posting is skipped (it says 0 then), so the web shows 「아직」 instead of 0.
var METRICS_HOUR = 18, METRICS_DAYS = 30;
var METRIC_TYPES = ['views', 'reactions', 'comments', 'shares', 'saves', 'reach', 'averageTimeWatched'];
function parseMetrics_(text) { try { var value = JSON.parse(text || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } }
function syncMetrics_(entries, now) {
  var stamp = kst_(new Date(now)); var day = stamp.slice(0, 10);
  if (Number(stamp.slice(11, 13)) < METRICS_HOUR || publishProps_().getProperty('METRICS_DAY') === day) return;
  var asks = [];
  entries.forEach(function(entry) {
    if (entry) PUBLISH_PLATFORMS.forEach(function(p) {
      if (entry[p + 'Status'] === '업로드완료' && entry[p + 'PostId'] && now - kstTime_(entry[p + 'Date']) < METRICS_DAYS * 864e5) asks.push({ entry: entry, p: p, id: entry[p + 'PostId'] });
    });
  });
  // ponytail: one query for every place (about 90 aliases at three posts a day); split it if Buffer ever refuses the size.
  var data = asks.length ? buffer_('query { ' + asks.map(function(ask, i) { return 'p' + i + ': post(input: { id: ' + q_(ask.id) + ' }) { sentAt metricsUpdatedAt metrics { type value } }'; }).join(' ') + ' }', true) : {};
  asks.forEach(function(ask, i) {
    var post = data['p' + i]; if (!post || !post.metrics || !post.metrics.length || !post.metricsUpdatedAt) return;
    var updated = new Date(post.metricsUpdatedAt).getTime();
    if (post.sentAt && updated - new Date(post.sentAt).getTime() < 3600e3) return;
    var numbers = {}; post.metrics.forEach(function(metric) { if (METRIC_TYPES.indexOf(metric.type) >= 0 && isFinite(metric.value)) numbers[metric.type] = Math.round(Number(metric.value) * 100) / 100; });
    var stored = parseMetrics_(ask.entry.metrics); stored[ask.p] = numbers;
    stored.at = stored.at && typeof stored.at === 'object' ? stored.at : {}; stored.at[ask.p] = kst_(new Date(updated));
    ask.entry.metrics = JSON.stringify(stored);
  });
  publishProps_().setProperty('METRICS_DAY', day);
}
