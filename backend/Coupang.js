/* v2.1.0 product finder: Coupang Partners Open API. Keys live only in the script properties COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY. */
// Coupang suspends a key for 24 hours at 30 calls an hour (three suspensions close the account), and this server is public.
// So every real call spends from one rolling one-hour budget shared by all visitors, and each answer is reused for 6 hours.
var COUPANG_ORIGIN = 'https://api-gateway.coupang.com';
var COUPANG_ROOT = '/v2/providers/affiliate_open_api/apis/openapi/v1';
var COUPANG_HOURLY_LIMIT = 20;
var COUPANG_CACHE_SECONDS = 21600; // CacheService maximum
var COUPANG_HOUR_MS = 3600000;
// Best-category codes from the Partners API docs. To add one, add a line here; the web reads this list from the server.
var COUPANG_CATEGORIES = [[1025,'국내여행'],[1026,'해외여행'],[1001,'여성패션'],[1002,'남성패션'],[1030,'유아동패션'],[1010,'뷰티'],[1011,'출산/유아동'],[1012,'식품'],[1013,'주방용품'],[1014,'생활용품'],[1015,'홈인테리어'],[1016,'가전디지털'],[1017,'스포츠/레저'],[1018,'자동차용품'],[1019,'도서/음반/DVD'],[1020,'완구/취미'],[1021,'문구/오피스'],[1024,'헬스/건강식품'],[1029,'반려동물용품']];

function coupangConfigured_() { var props = PropertiesService.getScriptProperties(); return !!(props.getProperty('COUPANG_ACCESS_KEY') && props.getProperty('COUPANG_SECRET_KEY')); }
function coupangCalls_() {
  var since = Date.now() - COUPANG_HOUR_MS;
  var calls; try { calls = JSON.parse(PropertiesService.getScriptProperties().getProperty('COUPANG_CALLS') || '[]'); } catch (error) { calls = []; }
  return (Array.isArray(calls) ? calls : []).filter(function(time) { return typeof time === 'number' && time > since; });
}
function coupangUsage_() {
  var calls = coupangCalls_();
  var usage = { limit: COUPANG_HOURLY_LIMIT, used: calls.length, remaining: Math.max(0, COUPANG_HOURLY_LIMIT - calls.length) };
  if (calls.length) usage.nextAt = new Date(Math.min.apply(null, calls) + COUPANG_HOUR_MS).toISOString(); // when the oldest call stops counting
  return usage;
}
function coupangStatus_() { return { configured: coupangConfigured_(), usage: coupangUsage_(), categories: COUPANG_CATEGORIES }; }
// Counted before the call, failures included: Coupang counts every request it receives.
function spendCoupangCall_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw userError_('다른 요청이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var calls = coupangCalls_();
    if (calls.length >= COUPANG_HOURLY_LIMIT) throw userError_('한 시간 쿠팡 API 횟수(' + COUPANG_HOURLY_LIMIT + '회)를 다 썼어요. 저장된 결과는 계속 볼 수 있어요.');
    calls.push(Date.now());
    PropertiesService.getScriptProperties().setProperty('COUPANG_CALLS', JSON.stringify(calls));
  } finally { lock.releaseLock(); }
}

function coupangGet_(path, query) {
  var props = PropertiesService.getScriptProperties();
  var access = props.getProperty('COUPANG_ACCESS_KEY'), secret = props.getProperty('COUPANG_SECRET_KEY'), subId = props.getProperty('COUPANG_SUB_ID');
  if (!access || !secret) throw userError_('쿠팡 파트너스 API 키가 없어요. 스크립트 속성에 COUPANG_ACCESS_KEY·COUPANG_SECRET_KEY를 넣어주세요.');
  if (subId) query += (query ? '&' : '') + 'subId=' + encodeURIComponent(subId);
  spendCoupangCall_();
  var datetime = Utilities.formatDate(new Date(), 'GMT', "yyMMdd'T'HHmmss'Z'");
  var signature = Utilities.computeHmacSha256Signature(datetime + 'GET' + path + query, secret, Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  var response = UrlFetchApp.fetch(COUPANG_ORIGIN + path + (query ? '?' + query : ''), { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'CEA algorithm=HmacSHA256, access-key=' + access + ', signed-date=' + datetime + ', signature=' + signature } });
  var code = response.getResponseCode(); var json;
  try { json = JSON.parse(response.getContentText()); } catch (error) { json = null; }
  if (code === 401 || code === 403) throw userError_('쿠팡이 API 키를 받지 않았어요. 스크립트 속성의 키를 확인해주세요.');
  if (code === 429) throw userError_('쿠팡 API 호출 한도에 걸렸어요. 한 시간 뒤에 다시 시도해주세요.');
  if (code !== 200 || !json || String(json.rCode) !== '0') throw userError_('쿠팡 API가 요청을 받지 않았어요 (' + code + (json && json.rMessage ? ' · ' + String(json.rMessage).slice(0, 120) : '') + ').');
  return json.data;
}

// Only https links and plain fields reach the page; anything else from the API is dropped.
function coupangProducts_(data) {
  var list = Array.isArray(data) ? data : data && Array.isArray(data.productData) ? data.productData : [];
  var https = function(value) { return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value) && value.length <= 2000 ? value : ''; };
  return list.map(function(item) {
    return { productId: String(item.productId || ''), productName: String(item.productName || '').trim().slice(0, 200), productPrice: Number(item.productPrice) || 0, productImage: https(item.productImage), productUrl: https(item.productUrl), categoryName: String(item.categoryName || '').slice(0, 80), isRocket: !!item.isRocket, isFreeShipping: !!item.isFreeShipping };
  }).filter(function(item) { return /^\d{1,20}$/.test(item.productId) && item.productName && item.productUrl; });
}

function findProducts_(payload) {
  var source = String(payload.source || ''), path, query = '', label;
  if (source === 'goldbox') { path = '/products/goldbox'; label = '오늘의 특가 (골드박스)'; }
  else if (source === 'best') {
    var category = COUPANG_CATEGORIES.filter(function(entry) { return entry[0] === Number(payload.categoryId); })[0];
    if (!category) throw userError_('카테고리를 다시 골라주세요.');
    path = '/products/bestcategories/' + category[0]; query = 'limit=50'; label = category[1] + ' 베스트';
  } else if (source === 'search') {
    var keyword = typeof payload.keyword === 'string' ? payload.keyword.replace(/\s+/g, ' ').trim() : '';
    if (keyword.length < 2 || keyword.length > 50) throw userError_('검색어는 2~50자로 입력해주세요.');
    path = '/products/search'; query = 'keyword=' + encodeURIComponent(keyword) + '&limit=10'; label = '「' + keyword + '」 검색';
  } else throw userError_('찾는 방법을 다시 골라주세요.');
  var cache = CacheService.getScriptCache(); var key = 'coupang:' + hash_(path + '?' + query);
  var saved = cache.get(key);
  if (saved) { var hit = JSON.parse(saved); hit.fromCache = true; hit.usage = coupangUsage_(); return hit; }
  var result = { label: label, fetchedAt: new Date().toISOString(), products: coupangProducts_(coupangGet_(COUPANG_ROOT + path, query)) };
  try { cache.put(key, JSON.stringify(result), COUPANG_CACHE_SECONDS); } catch (error) { /* over 100KB: show it, just don't keep it */ }
  result.fromCache = false; result.usage = coupangUsage_();
  return result;
}
