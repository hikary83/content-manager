/* HIKARY only. No credentials or endpoints from kic-worktools. */
var SERVICE_VERSION = '2.13.0';
// Columns 1-14 are the original ledger. 15-21 (v1.7.0), 22-27 (v2.2.0), 28-30 (v2.3.0), 31-36 (v2.6.0), 37 (v2.9.0), 38 (v2.10.0) and 39-40 (v2.13.0) are appended so existing rows never move.
// v2.2.0: one row per product. Instagram columns are the reel; the card news (carousel) has its own upload columns.
// v2.3.0: KittyChat keyword and DM text, and a small Inpock thumbnail as a data URL. 「카드뉴스 문구」 is no longer filled.
// v2.6.0: 「게시」 (Publish.js) — the hosted video, the Buffer post of each place and the last publishing errors.
var LEGACY_HEADER_COUNT = 14;
var CONTENT_HEADERS = ['콘텐츠 ID', '등록일', '카테고리', '상품명', '원본 링크', '변환 링크', '대본', 'YouTube 게시글', 'YouTube 상태', 'Instagram 게시글', 'Instagram 상태', 'TikTok 게시글', 'TikTok 상태', '비고', '형식', 'YouTube 업로드일', 'YouTube 링크', 'Instagram 업로드일', 'Instagram 링크', 'TikTok 업로드일', 'TikTok 링크', 'Instagram 캐러셀 상태', 'Instagram 캐러셀 업로드일', 'Instagram 캐러셀 링크', '카드뉴스 문구', '인포크 No.', '인포크 타이틀', '키티챗 키워드', '키티챗 DM 문구', '인포크 이미지', '영상 주소', '영상 올린 날', 'YouTube 예약 ID', 'Instagram 예약 ID', 'TikTok 예약 ID', '게시 오류', '커버 이미지', '인스타 형식', '인포크 등록일', '키티챗 연결일'];
var CONTENT_KEYS = ['id', 'createdAt', 'category', 'productName', 'sourceUrl', 'affiliateUrl', 'script', 'youtube', 'youtubeStatus', 'instagram', 'instagramStatus', 'tiktok', 'tiktokStatus', 'notes', 'format', 'youtubeDate', 'youtubeLink', 'instagramDate', 'instagramLink', 'tiktokDate', 'tiktokLink', 'carouselStatus', 'carouselDate', 'carouselLink', 'carouselScript', 'inpockNo', 'inpockTitle', 'kittyKeyword', 'kittyDm', 'inpockImage', 'videoUrl', 'videoDate', 'youtubePostId', 'instagramPostId', 'tiktokPostId', 'publishError', 'coverUrl', 'instagramType', 'inpockLinkedAt', 'kittyLinkedAt'];
// 「예약됨」·「오류」 are set by 「게시」 and the result check (Publish.js); the upload dialog may still set any of them by hand.
var CONTENT_STATUSES = ['미업로드', '업로드완료', '보류', '예약됨', '오류'];
// Written by tools/register.mjs video and Publish.js. A save that leaves one out keeps what the sheet has (entry.json never carries them).
// v2.9.0: 「커버 이미지」 is the full-size cover on Cloudinary (tools/register.mjs cover), for the dashboard and for download.
// v2.10.0: 「인스타 형식」 — each product goes to Instagram once, as a reel (the video, through 「게시」) or as a carousel (card news, by hand).
// Empty means 릴스 (every row before v2.10.0 was posted as a reel). Kept like the others when entry.json leaves it out.
// v2.13.0: 「인포크 등록일」·「키티챗 연결일」 — the day the owner ticked 「인포크링크에 넣었어요」·「키티챗에 연결했어요」 in the ✎ window
// (YYYY-MM-DD, empty = not yet). Only the web sets them; the register tool's saves keep them.
var MANAGED_KEYS = ['videoUrl', 'videoDate', 'youtubePostId', 'instagramPostId', 'tiktokPostId', 'publishError', 'coverUrl', 'instagramType', 'inpockLinkedAt', 'kittyLinkedAt'];
var INSTAGRAM_TYPES = ['릴스', '캐러셀'];
var CONTENT_FORMATS = ['쇼츠', '캐러셀']; // only rows made before v2.2.0 carry a format
var UPLOAD_PLATFORMS = ['youtube', 'instagram', 'tiktok', 'carousel'];

// Run only in the NEW project. No sheet writes; existing properties are preserved.
function initializeProject() {
  var props = PropertiesService.getScriptProperties();
  var defaults = { SHEET_ID: '1ZSB7FBZTWdT_eLlo3kpom-u2yM5UwHitG059Zci6TUc', SHEET_NAME: '콘텐츠 관리', GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_DAILY_LIMIT: '40' };
  Object.keys(defaults).forEach(function(key) { if (!props.getProperty(key)) props.setProperty(key, defaults[key]); });
  console.info('초기 설정 완료. 프로젝트 설정 > 스크립트 속성에 GEMINI_API_KEY를 추가하세요.');
}

function jsonResponse_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return jsonResponse_({ ok: true, data: { service: 'HIKARY', version: SERVICE_VERSION } }); }
function doPost(event) {
  var started = Date.now(); var requestId = Utilities.getUuid(); var action = 'unknown'; var result;
  try {
    var text = event && event.postData && event.postData.contents || '';
    if (!text || text.length > 12000000) throw new Error('요청 용량을 확인해주세요.');
    var input = JSON.parse(text);
    if (/^[a-zA-Z0-9-]{1,64}$/.test(input.requestId || '')) requestId = input.requestId;
    var payload = input.payload || {};
    action = String(input.action || '');
    // v2.7.0: everything but `login` needs a session token or the tool key (Auth.js). Before this the server was open to anyone with the address.
    var who = action === 'login' ? '' : authorize_(input.token);
    var data;
    if (action === 'login') data = login_(payload);
    else if (action === 'logout') { if (who !== 'session') throw userError_('브라우저에서 로그인한 세션만 로그아웃할 수 있어요.'); data = logout_(input.token, payload); }
    else if (action === 'status') { getContentSheet_(); data = { version: SERVICE_VERSION, aiConfigured: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'), coupang: coupangStatus_(), publishing: publishStatus_() }; }
    else if (action === 'list') data = { entries: readEntries_() };
    else if (action === 'save') data = saveEntry_(payload);
    else if (action === 'delete') data = deleteEntry_(payload);
    else if (action === 'products') data = findProducts_(payload);
    else if (action === 'link') data = coupangLink_(payload);
    else if (action === 'report') data = coupangReport_(payload); // v2.8.0: Partners reports for the dashboard (Coupang.js)
    else if (action === 'request') data = addRequest_(payload); // v2.5.0: 루미한테 요청하기 (Requests.js)
    else if (action === 'requests') data = readRequests_();
    else if (action === 'requestUpdate') data = updateRequest_(payload);
    else if (action === 'publish') data = publish_(payload); // v2.6.0: 「게시」 through Buffer (Publish.js), needs PUBLISH_CODE
    else if (action === 'analyze') data = analyzeProduct_(payload.url);
    else if (action === 'image') data = readImage_(payload.url);
    else if (action === 'generate') data = generateContent_(payload);
    else if (action === 'reference') data = analyzeReference_(payload);
    else if (action === 'carousel') data = generateCarousel_(payload);
    else throw new Error('지원하지 않는 요청입니다.');
    result = { ok: true, requestId: requestId, data: data };
  } catch (error) {
    // Do not log exception text: UrlFetch errors can contain credentials or URLs.
    result = { ok: false, requestId: requestId, error: safeError_(error), auth: !!(error && error.auth) };
  }
  console.info(JSON.stringify({ requestId: requestId, action: ['login','logout','status','list','save','delete','products','link','report','request','requests','requestUpdate','publish','analyze','image','generate','reference','carousel'].indexOf(action) >= 0 ? action : 'unknown', elapsedMs: Date.now() - started, ok: result.ok }));
  return jsonResponse_(result);
}

function userError_(message) { var error = new Error(message); error.userSafe = true; return error; }
function safeError_(error) { return error && error.userSafe ? error.message : '요청을 처리하지 못했어요. 서버 설정과 요청 내용을 확인해주세요.'; }
function hash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join(''); }
function getContentSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID'); var name = props.getProperty('SHEET_NAME');
  if (!id || !name) throw userError_('SHEET_ID와 SHEET_NAME을 설정해주세요.');
  var sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw userError_('설정한 시트 탭을 찾지 못했어요.');
  if (sheet.getMaxColumns() < CONTENT_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), CONTENT_HEADERS.length - sheet.getMaxColumns());
  var headers = sheet.getRange(1, 1, 1, CONTENT_HEADERS.length).getDisplayValues()[0];
  if (JSON.stringify(headers.slice(0, LEGACY_HEADER_COUNT)) !== JSON.stringify(CONTENT_HEADERS.slice(0, LEGACY_HEADER_COUNT))) throw userError_('운영대장 컬럼이 예상과 달라요. 데이터를 보호하기 위해 작업을 중단했어요.');
  var added = headers.slice(LEGACY_HEADER_COUNT), expected = CONTENT_HEADERS.slice(LEGACY_HEADER_COUNT);
  if (JSON.stringify(added) === JSON.stringify(expected)) return sheet;
  // Fill the appended headers only into empty cells; anything else there is someone's data, so stop.
  if (added.some(function(value, index) { return value !== '' && value !== expected[index]; })) throw userError_('운영대장 15~' + CONTENT_HEADERS.length + '번째 칸에 다른 내용이 있어요. 데이터를 보호하기 위해 작업을 중단했어요.');
  sheet.getRange(1, LEGACY_HEADER_COUNT + 1, 1, expected.length).setValues([expected]);
  return sheet;
}
function rowEntry_(row) {
  var entry = {}; CONTENT_KEYS.forEach(function(key, index) { entry[key] = row[index] instanceof Date ? Utilities.formatDate(row[index], 'Asia/Seoul', 'yyyy-MM-dd') : String(row[index] == null ? '' : row[index]); });
  entry.revision = hash_(JSON.stringify(CONTENT_KEYS.map(function(key) { return entry[key]; })));
  return entry;
}
function readSheetRows_(sheet) { return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, CONTENT_HEADERS.length).getValues(); }
function readEntries_() { return readSheetRows_(getContentSheet_()).filter(function(row) { return row[0]; }).map(rowEntry_).reverse(); }
function field_(value, max) { if (typeof value !== 'string' || value.length > max) throw userError_('입력값의 형식 또는 길이를 확인해주세요.'); return value.trim(); }
function validateEntry_(input) {
  var entry = {};
  entry.id = field_(input.id, 80);
  if (!/^[a-f0-9-]{36}$/i.test(entry.id)) throw userError_('올바른 콘텐츠 ID가 필요해요.');
  ['category','productName','sourceUrl','affiliateUrl','script','youtube','instagram','tiktok','notes','carouselScript','inpockNo','inpockTitle','kittyKeyword','kittyDm'].forEach(function(key) {
    var max = key === 'productName' || key === 'inpockTitle' ? 200 : key === 'category' ? 80 : key === 'inpockNo' ? 10 : key === 'kittyKeyword' ? 50 : /Url$/.test(key) ? 2000 : key === 'notes' || key === 'kittyDm' ? 5000 : 12000;
    entry[key] = field_(input[key] || '', max);
  });
  // A sheet cell holds at most 50,000 characters, so the thumbnail is a small JPEG/PNG data URL (tools/register.mjs makes it).
  // ponytail: every list call carries these images (~40KB a product); move them out if the ledger grows past a few hundred rows.
  entry.inpockImage = field_(input.inpockImage || '', 45000);
  if (entry.inpockImage && !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/]+=*$/.test(entry.inpockImage)) throw userError_('인포크 이미지는 JPEG·PNG 데이터만 받아요.');
  if (!entry.category || !entry.productName || !entry.script) throw userError_('상품명·카테고리·대본은 필수예요.');
  if (!/^https:\/\/[^\s@]+\.[^\s]+$/i.test(entry.sourceUrl) || (entry.affiliateUrl && !/^https:\/\/[^\s@]+\.[^\s]+$/i.test(entry.affiliateUrl))) throw userError_('https 상품 링크를 확인해주세요.');
  if (entry.inpockNo && !/^\d{1,6}$/.test(entry.inpockNo)) throw userError_('인포크 No.는 숫자만 입력해주세요.');
  UPLOAD_PLATFORMS.forEach(function(platform) { var key = platform + 'Status'; entry[key] = input[key] || '미업로드'; if (CONTENT_STATUSES.indexOf(entry[key]) < 0) throw userError_('업로드 상태가 올바르지 않아요.'); });
  // New fields are optional so an older screen can still save while the server is updated first. Rows from v2.2.0 have no format.
  entry.format = input.format || '';
  if (entry.format && CONTENT_FORMATS.indexOf(entry.format) < 0) throw userError_('콘텐츠 형식이 올바르지 않아요.');
  UPLOAD_PLATFORMS.forEach(function(platform) {
    // v2.4.0: an upload may carry a time too — 「2026-11-10」 or 「2026-11-10 19:30」.
    var date = field_(input[platform + 'Date'] || '', 16), link = field_(input[platform + 'Link'] || '', 2000);
    if (date && !/^\d{4}-\d{2}-\d{2}( ([01]\d|2[0-3]):[0-5]\d)?$/.test(date)) throw userError_('업로드일은 YYYY-MM-DD 형식(시간은 HH:mm)으로 입력해주세요.');
    if (link && !/^https:\/\/[^\s@]+\.[^\s]+$/i.test(link)) throw userError_('게시물 링크는 https 주소로 입력해주세요.');
    entry[platform + 'Date'] = date; entry[platform + 'Link'] = link;
    if (link) entry[platform + 'Status'] = '업로드완료';
  });
  // v2.6.0: managed fields are checked for shape only; saveEntry_ fills the ones left out. Publish.js decides what may be posted.
  MANAGED_KEYS.forEach(function(key) { if (input[key] !== undefined) entry[key] = field_(input[key], key === 'videoDate' ? 16 : key === 'videoUrl' || key === 'coverUrl' || key === 'publishError' ? 2000 : 64); });
  if (entry.videoUrl && !/^https:\/\/[^\s@]+\.[^\s]+$/i.test(entry.videoUrl)) throw userError_('영상 주소는 https 주소로 입력해주세요.');
  if (entry.coverUrl && !/^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/[A-Za-z0-9_\/.,-]+$/.test(entry.coverUrl)) throw userError_('커버 이미지는 Cloudinary 이미지 주소만 받아요.');
  if (entry.instagramType && INSTAGRAM_TYPES.indexOf(entry.instagramType) < 0) throw userError_('인스타 형식은 릴스나 캐러셀이에요.');
  ['inpockLinkedAt', 'kittyLinkedAt'].forEach(function(key) { if (entry[key] && !/^\d{4}-\d{2}-\d{2}$/.test(entry[key])) throw userError_('인포크·키티챗 날짜는 YYYY-MM-DD 형식이어야 해요.'); });
  if (entry.videoDate && !/^\d{4}-\d{2}-\d{2}( ([01]\d|2[0-3]):[0-5]\d)?$/.test(entry.videoDate)) throw userError_('영상 올린 날은 YYYY-MM-DD HH:mm 형식이어야 해요.');
  ['youtubePostId', 'instagramPostId', 'tiktokPostId'].forEach(function(key) { if (entry[key] && !/^[A-Za-z0-9_-]+$/.test(entry[key])) throw userError_('예약 ID 형식이 올바르지 않아요.'); });
  return entry;
}
function sameEntry_(existing, candidate) { return CONTENT_KEYS.filter(function(key) { return key !== 'createdAt'; }).every(function(key) { return existing[key] === candidate[key]; }); }
function sheetLiteral_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }
function saveEntry_(input) {
  var entry = validateEntry_(input); var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 등록 여부를 확인해주세요.');
  try {
    var sheet = getContentSheet_(); var rows = readSheetRows_(sheet); var index = rows.findIndex(function(row) { return String(row[0]) === entry.id; });
    var existing = index >= 0 ? rowEntry_(rows[index]) : null;
    MANAGED_KEYS.forEach(function(key) { if (entry[key] === undefined) entry[key] = existing ? existing[key] : ''; });
    if (existing && sameEntry_(existing, entry)) return { id: entry.id, revision: existing.revision, replayed: true };
    if (existing && (!input.revision || input.revision !== existing.revision)) throw userError_('시트 내용이 변경됐어요. 새로고침한 뒤 다시 열어 수정해주세요.');
    if (!existing && input.revision) throw userError_('기존 콘텐츠를 찾지 못했어요. 새로고침해서 다시 확인해주세요.');
    entry.createdAt = existing ? existing.createdAt : Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var saved = writeEntry_(sheet, existing ? index + 2 : Math.max(2, sheet.getLastRow() + 1), entry);
    return { id: entry.id, revision: saved.revision, replayed: false };
  } finally { lock.releaseLock(); }
}
// Call with the script lock held. Publish.js writes through here too.
function writeEntry_(sheet, rowNumber, entry) {
  // Upload dates are written as text so Sheets does not turn 「2026-11-10 19:30」 into a date in its own time zone.
  var output = CONTENT_KEYS.map(function(key) { return /Date$/.test(key) && entry[key] ? "'" + entry[key] : sheetLiteral_(entry[key]); });
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  var range = sheet.getRange(rowNumber, 1, 1, CONTENT_HEADERS.length);
  range.setValues([output]);
  var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(CONTENT_STATUSES, true).setAllowInvalid(false).build();
  UPLOAD_PLATFORMS.forEach(function(platform) { sheet.getRange(rowNumber, CONTENT_KEYS.indexOf(platform + 'Status') + 1).setDataValidation(statusRule); });
  SpreadsheetApp.flush();
  return rowEntry_(range.getValues()[0]);
}
// v2.0.0: content is made in Claude; the web lists, edits and deletes. Same revision guard as save.
function deleteEntry_(input) {
  var id = field_(input.id, 80); var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sheet = getContentSheet_(); var rows = readSheetRows_(sheet); var index = rows.findIndex(function(row) { return String(row[0]) === id; });
    if (index < 0) throw userError_('이미 지워졌거나 찾지 못했어요. 목록을 새로고침해주세요.');
    if (!input.revision || input.revision !== rowEntry_(rows[index]).revision) throw userError_('시트 내용이 변경됐어요. 목록을 새로고침한 뒤 다시 지워주세요.');
    // Sheets refuses to delete the last unfrozen row, so keep one spare row.
    if (sheet.getMaxRows() - sheet.getFrozenRows() <= 1) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    sheet.deleteRow(index + 2); SpreadsheetApp.flush();
    return { id: id, deleted: true };
  } finally { lock.releaseLock(); }
}
