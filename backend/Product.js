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
  if (/^http:\/\/[^/]*coupangcdn\.com\//i.test(input)) return input.replace(/^http:/i, 'https:');
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
function cleanProductText_(value) {
  return unescapeHtml_(String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}
function parseTravelProduct_(html, base) {
  if (!/(^|\.)trip\.coupang\.com$/.test(hostParts_(base).host)) return null;
  var scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  var tag = scripts.find(function(script) { return attribute_(script.split('>')[0] + '>', 'id') === 'travel-detail-product-data'; });
  if (!tag) return null;
  var data;
  try { data = JSON.parse(tag.replace(/^<script[^>]*>|<\/script>$/gi, '')); } catch (_) { return null; }
  var product = data.product;
  if (!product || typeof product !== 'object' || !product.productName) return null;
  var sections = [];
  function section(title, text) { var value = cleanProductText_(text); if (value) sections.push('[' + title + ']\n' + value); }
  section('상품명', product.productName);
  (product.introductions || []).forEach(function(item) { section(item.title || '상품 소개', item.description); });
  if (product.location) section('위치', product.location.address);
  (product.keyInfos || []).forEach(function(item) { section(item.title || '이용 정보', item.description); });
  (product.policies || []).forEach(function(item) { section(item.title || '예약 안내', item.description); });
  (product.facilities || []).forEach(function(group) { section(group.title || '시설', (group.facilities || []).map(function(item) { return item.description || ''; }).join(', ')); });
  // Keep representative option conditions explicitly labelled, not universal claims.
  if (product.representativeVendorItem) section('대표 옵션 조건 — 다른 옵션에 동일 적용 여부 확인 필요', (product.representativeVendorItem.descriptions || []).join('\n'));
  (product.cancelPolicies || []).forEach(function(item) { section(item.title || '취소 안내', item.description); });
  var assets = [];
  function addImage(value, kind) {
    try {
      var url = safeFetchUrl_(resolveUrl_(String(value || ''), base), 'image');
      if (!/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url) || assets.some(function(item) { return item.url === url; })) return;
      if (assets.length < 20) assets.push({ url: url, kind: kind });
    } catch (_) {}
  }
  (product.imageGroups || []).forEach(function(group) { (group.images || []).forEach(function(image) { addImage(image.originImagePath || image.largeThumbnailPath || image.smallThumbnailPath, 'product'); }); });
  var content = product.content && product.content.content;
  if (typeof content === 'string') {
    section('상세 설명', content);
    (content.match(/<img\b[^>]*>/gi) || []).forEach(function(img) { addImage(attribute_(img, 'data-origin') || attribute_(img, 'data-original') || attribute_(img, 'data-src') || attribute_(img, 'src'), 'detail'); });
  }
  var warnings = [];
  if (product.onSale === false) warnings.push('판매 중이 아닌 것으로 표시되어 있어요. 현재 판매 상태를 확인해주세요.');
  if (!assets.some(function(item) { return item.kind === 'detail'; })) warnings.push('상세 설명 이미지를 찾지 못했어요. 필요한 캡처를 직접 추가해주세요.');
  return { name: cleanProductText_(product.productName).slice(0, 200), description: sections.join('\n\n').slice(0, 18000), images: assets.map(function(item) { return item.url; }), imageAssets: assets, sourceUrl: base, extraction: 'coupang-travel-data', warnings: warnings };
}
function parseProduct_(html, base) {
  var travel = parseTravelProduct_(html, base);
  if (travel) return travel;
  var metas = html.match(/<meta\b[^>]*>/gi) || [];
  function meta(names) { for (var i = metas.length - 1; i >= 0; i--) { var tag = metas[i]; var key = (attribute_(tag, 'property') || attribute_(tag, 'name')).toLowerCase(); var content = attribute_(tag, 'content'); if (names.indexOf(key) >= 0 && content) return content; } return ''; }
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
    if (/logo|icon|sprite|banner|\/static\/media\/(?:search|person|cart)|img_fb_like|\/displayitem\//i.test(attribute_(tag, 'class') + ' ' + attribute_(tag, 'src'))) return;
    var source = attribute_(tag, 'data-origin') || attribute_(tag, 'data-original') || attribute_(tag, 'data-src') || attribute_(tag, 'src');
    if (source) candidates.push(source);
  });
  var images = [];
  candidates.forEach(function(value) { try { var url = safeFetchUrl_(resolveUrl_(String(value || ''), base), 'image'); if (/logo|\/icons?\/|img_fb_like|\/displayitem\//i.test(url)) return; if (images.indexOf(url) < 0 && images.length < 10) images.push(url); } catch (_) {} });
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
  var bytes = fetched.response.getContent(); if (bytes.length > 12 * 1024 * 1024) throw userError_('원본 이미지는 12MB 이하로 준비해주세요.');
  return { mimeType: fetched.type, data: Utilities.base64Encode(bytes) };
}
