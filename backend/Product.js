function unescapeHtml_(text) {
  return String(text || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ').replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); });
}
function attribute_(tag, name) {
  var match = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return match ? unescapeHtml_(match[1] || match[2] || match[3] || '') : '';
}
function hostParts_(value) {
  var match = String(value || '').match(/^https:\/\/([a-z0-9.-]+)(\/[^#\s]*)?(?:#.*)?$/i);
  if (!match || match[1].length > 253 || match[1].endsWith('.') || match[1].indexOf('.') < 0 || /^(?:\d+\.)*\d+$/.test(match[1])) throw userError_('공개된 https 상품 주소를 입력해주세요.');
  return { host: match[1].toLowerCase(), path: match[2] || '/', origin: 'https://' + match[1].toLowerCase() };
}
function safeFetchUrl_(value, kind) {
  if (typeof value !== 'string' || value.length > 2000) throw userError_('주소 길이를 확인해주세요.');
  var parts = hostParts_(value);
  var defaults = kind === 'image' ? 'coupangcdn.com,coupang.com' : 'coupang.com';
  var key = kind === 'image' ? 'IMAGE_ALLOWED_HOSTS' : 'PRODUCT_ALLOWED_HOSTS';
  var extra = PropertiesService.getScriptProperties().getProperty(key) || '';
  var allowed = (defaults + ',' + extra).split(',').map(function(item) { return item.trim().toLowerCase(); }).filter(Boolean);
  if (!allowed.some(function(host) { return parts.host === host || parts.host.endsWith('.' + host); })) throw userError_('이 사이트는 아직 자동 수집 대상이 아니에요. 상세 설명과 이미지를 직접 추가해주세요.');
  return value;
}
function resolveUrl_(value, base) {
  var input = unescapeHtml_(value).trim(); var parts = hostParts_(base);
  if (input.startsWith('//')) return 'https:' + input;
  if (input.startsWith('https://')) return input;
  if (input.startsWith('/')) return parts.origin + input;
  if (/^[a-z]+:/i.test(input) || !input) return '';
  return parts.origin + parts.path.split('?')[0].replace(/[^/]*$/, '') + input;
}
function fetchPublic_(value, kind) {
  var current = safeFetchUrl_(value, kind);
  for (var i = 0; i < 4; i++) {
    var response;
    try { response = UrlFetchApp.fetch(current, { muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true }); }
    catch (_) { throw userError_('상품 서버에 연결하지 못했어요. 설명과 캡처를 직접 추가해주세요.'); }
    var code = response.getResponseCode();
    if (code >= 300 && code < 400) {
      var headers = response.getAllHeaders(); var location = headers.Location || headers.location;
      if (typeof location !== 'string') throw userError_('상품 이동 주소를 확인할 수 없어요.');
      current = safeFetchUrl_(resolveUrl_(location, current), kind); continue;
    }
    if (code !== 200) throw userError_('상품 사이트에서 자동 수집을 차단했거나 페이지를 읽을 수 없어요. 설명과 캡처를 직접 추가해주세요.');
    var type = String(response.getAllHeaders()['Content-Type'] || response.getAllHeaders()['content-type'] || '').split(';')[0].toLowerCase();
    return { response: response, url: current, type: type };
  }
  throw userError_('상품 주소의 이동 횟수가 너무 많아요.');
}
function parseProduct_(html, base) {
  var metas = html.match(/<meta\b[^>]*>/gi) || [];
  function meta(names) { for (var i = 0; i < metas.length; i++) { var tag = metas[i]; var key = (attribute_(tag, 'property') || attribute_(tag, 'name')).toLowerCase(); if (names.indexOf(key) >= 0) return attribute_(tag, 'content'); } return ''; }
  var title = meta(['og:title','twitter:title']) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  var summary = meta(['og:description','description','twitter:description']);
  var visible = html.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  var description = unescapeHtml_(summary + '\n' + visible).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 18000);
  var candidates = [];
  metas.forEach(function(tag) { if (['og:image','og:image:secure_url','twitter:image'].indexOf(attribute_(tag, 'property') || attribute_(tag, 'name')) >= 0) candidates.push(attribute_(tag, 'content')); });
  // JSON-LD product image lists and embedded image properties are common in travel detail pages.
  var scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  function scan(value, depth) {
    if (!value || depth > 12 || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(function(item) { scan(item, depth + 1); }); return; }
    if (value.image) { var values = Array.isArray(value.image) ? value.image : [value.image]; values.forEach(function(item) { candidates.push(typeof item === 'string' ? item : item && (item.url || item.contentUrl)); }); }
    Object.keys(value).forEach(function(key) { scan(value[key], depth + 1); });
  }
  scripts.forEach(function(script) { try { scan(JSON.parse(script.replace(/^<script[^>]*>|<\/script>$/gi, '')), 0); } catch (_) {} });
  (html.match(/<img\b[^>]*>/gi) || []).forEach(function(tag) {
    if (/logo|icon|sprite|banner/i.test(attribute_(tag, 'class') + ' ' + attribute_(tag, 'src'))) return;
    var source = attribute_(tag, 'data-origin') || attribute_(tag, 'data-original') || attribute_(tag, 'data-src') || attribute_(tag, 'src');
    if (source) candidates.push(source);
  });
  var images = [];
  candidates.forEach(function(value) { try { var url = safeFetchUrl_(resolveUrl_(String(value || ''), base), 'image'); if (images.indexOf(url) < 0 && images.length < 10) images.push(url); } catch (_) {} });
  return { name: unescapeHtml_(title).replace(/<[^>]*>/g, '').trim().slice(0, 200), description: description, images: images, sourceUrl: base };
}
function analyzeProduct_(url) {
  var fetched = fetchPublic_(url, 'product');
  if (fetched.type !== 'text/html' && fetched.type !== 'application/xhtml+xml') throw userError_('상품 상세 페이지 주소를 확인해주세요.');
  var bytes = fetched.response.getContent(); if (bytes.length > 3000000) throw userError_('상품 페이지가 너무 커요. 설명과 캡처를 직접 추가해주세요.');
  var html = fetched.response.getContentText();
  if (/access denied|captcha|robot check/i.test(html.slice(0, 5000))) throw userError_('사이트에서 자동 수집을 차단했어요. 상세페이지 캡처를 추가해주세요.');
  return parseProduct_(html, fetched.url);
}
function readImage_(url) {
  var fetched = fetchPublic_(url, 'image');
  if (['image/jpeg','image/png','image/webp'].indexOf(fetched.type) < 0) throw userError_('JPG·PNG·WEBP 이미지만 읽을 수 있어요.');
  var bytes = fetched.response.getContent(); if (bytes.length > 2 * 1024 * 1024) throw userError_('이미지가 2MB보다 커요. 크기를 줄여 직접 추가해주세요.');
  return { mimeType: fetched.type, data: Utilities.base64Encode(bytes) };
}
