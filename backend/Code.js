/* HIKARY only. No credentials or endpoints from kic-worktools. */
var SERVICE_VERSION = '1.2.0';
var CONTENT_HEADERS = ['콘텐츠 ID', '등록일', '카테고리', '상품명', '원본 링크', '변환 링크', '대본', 'YouTube 게시글', 'YouTube 상태', 'Instagram 게시글', 'Instagram 상태', 'TikTok 게시글', 'TikTok 상태', '비고'];
var CONTENT_KEYS = ['id', 'createdAt', 'category', 'productName', 'sourceUrl', 'affiliateUrl', 'script', 'youtube', 'youtubeStatus', 'instagram', 'instagramStatus', 'tiktok', 'tiktokStatus', 'notes'];
var CONTENT_STATUSES = ['미업로드', '업로드완료', '보류'];

// Run only in the NEW project. No sheet writes; existing properties are preserved.
function initializeProject() {
  var props = PropertiesService.getScriptProperties();
  var defaults = { SHEET_ID: '1ZSB7FBZTWdT_eLlo3kpom-u2yM5UwHitG059Zci6TUc', SHEET_NAME: '콘텐츠 관리', GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_DAILY_LIMIT: '40' };
  Object.keys(defaults).forEach(function(key) { if (!props.getProperty(key)) props.setProperty(key, defaults[key]); });
  if (!props.getProperty('APP_ACCESS_TOKEN')) props.setProperty('APP_ACCESS_TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  console.info('초기 설정 완료. 프로젝트 설정 > 스크립트 속성에서 접속 코드를 확인하고 GEMINI_API_KEY를 추가하세요.');
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
    authenticate_(input.token);
    var payload = input.payload || {};
    action = String(input.action || '');
    var data;
    if (action === 'status') { getContentSheet_(); data = { version: SERVICE_VERSION, aiConfigured: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') }; }
    else if (action === 'list') data = { entries: readEntries_() };
    else if (action === 'save') data = saveEntry_(payload);
    else if (action === 'analyze') data = analyzeProduct_(payload.url);
    else if (action === 'image') data = readImage_(payload.url);
    else if (action === 'generate') data = generateContent_(payload);
    else throw new Error('지원하지 않는 요청입니다.');
    result = { ok: true, requestId: requestId, data: data };
  } catch (error) {
    // Do not log exception text: UrlFetch errors can contain credentials or URLs.
    result = { ok: false, requestId: requestId, error: safeError_(error) };
  }
  console.info(JSON.stringify({ requestId: requestId, action: ['status','list','save','analyze','image','generate'].indexOf(action) >= 0 ? action : 'unknown', elapsedMs: Date.now() - started, ok: result.ok }));
  return jsonResponse_(result);
}

function userError_(message) { var error = new Error(message); error.userSafe = true; return error; }
function safeError_(error) { return error && error.userSafe ? error.message : '요청을 처리하지 못했어요. 서버 설정과 요청 내용을 확인해주세요.'; }
function authenticate_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_ACCESS_TOKEN');
  if (!expected || expected.length < 32) throw userError_('서버 접속 코드가 설정되지 않았어요.');
  var actualHash = hash_(typeof token === 'string' ? token : ''); var expectedHash = hash_(expected); var difference = 0;
  for (var i = 0; i < expectedHash.length; i++) difference |= expectedHash.charCodeAt(i) ^ actualHash.charCodeAt(i);
  if (difference !== 0) throw userError_('접속 코드가 올바르지 않아요.');
}
function hash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join(''); }
function getContentSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID'); var name = props.getProperty('SHEET_NAME');
  if (!id || !name) throw userError_('SHEET_ID와 SHEET_NAME을 설정해주세요.');
  var sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw userError_('설정한 시트 탭을 찾지 못했어요.');
  var headers = sheet.getRange(1, 1, 1, CONTENT_HEADERS.length).getDisplayValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(CONTENT_HEADERS)) throw userError_('운영대장 컬럼이 예상과 달라요. 데이터를 보호하기 위해 작업을 중단했어요.');
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
  ['category','productName','sourceUrl','affiliateUrl','script','youtube','instagram','tiktok','notes'].forEach(function(key) {
    var max = key === 'productName' ? 200 : key === 'category' ? 80 : /Url$/.test(key) ? 2000 : key === 'notes' ? 5000 : 12000;
    entry[key] = field_(input[key] || '', max);
  });
  if (!entry.category || !entry.productName || !entry.script) throw userError_('상품명·카테고리·대본은 필수예요.');
  if (!/^https:\/\/[^\s@]+\.[^\s]+$/i.test(entry.sourceUrl) || (entry.affiliateUrl && !/^https:\/\/[^\s@]+\.[^\s]+$/i.test(entry.affiliateUrl))) throw userError_('https 상품 링크를 확인해주세요.');
  ['youtubeStatus','instagramStatus','tiktokStatus'].forEach(function(key) { entry[key] = input[key] || '미업로드'; if (CONTENT_STATUSES.indexOf(entry[key]) < 0) throw userError_('업로드 상태가 올바르지 않아요.'); });
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
    if (existing && sameEntry_(existing, entry)) return { id: entry.id, revision: existing.revision, replayed: true };
    if (existing && (!input.revision || input.revision !== existing.revision)) throw userError_('시트 내용이 변경됐어요. 관리 목록에서 다시 열어 수정해주세요.');
    if (!existing && input.revision) throw userError_('기존 콘텐츠를 찾지 못했어요. 관리 목록을 다시 확인해주세요.');
    entry.createdAt = existing ? existing.createdAt : Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var output = CONTENT_KEYS.map(function(key) { return sheetLiteral_(entry[key]); });
    var rowNumber = existing ? index + 2 : Math.max(2, sheet.getLastRow() + 1);
    if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    var range = sheet.getRange(rowNumber, 1, 1, CONTENT_HEADERS.length);
    range.setValues([output]);
    var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(CONTENT_STATUSES, true).setAllowInvalid(false).build();
    [9,11,13].forEach(function(col) { sheet.getRange(rowNumber, col).setDataValidation(statusRule); });
    SpreadsheetApp.flush();
    var saved = rowEntry_(range.getValues()[0]);
    return { id: entry.id, revision: saved.revision, replayed: false };
  } finally { lock.releaseLock(); }
}
