// v2.22.0: 「설정」 — the owner's settings from the web 「설정」 menu, one key a row in the ledger's tab 「설정」 (키 · 값 · 바꾼 때),
// so every device sees the same and the owner can read them in the sheet (and roll back with its version history).
//   templates      {"order":[id…],"hidden":[id…],"default":id,"names":{id:이름},"notes":{id:설명}} — the request window's cards
//                  (names · notes since v2.23.0, only the renamed ones). docs/js/templates.js stays the list
//                  and the numbers; this only orders, hides and picks the default (an id it does not know is kept, the web skips it).
//   publishTime    "HH:mm" — 「게시」's default time (and the calendar's 「＋」). The one-a-day 「day after the latest」 rule stays.
//   instagramType  "릴스" · "캐러셀" — what the request window picks first. Requests already sent and the ledger keep theirs.
// Read with `status` (settings: { values, revision }); written with settingsUpdate { changes, revision } by a logged-in browser or the
// tool key. The revision is a hash of the tab, so two devices cannot silently overwrite each other (like the ledger's revision).
var SETTINGS_SHEET = '설정';
var SETTINGS_HEADERS = ['키', '값', '바꾼 때'];
var SETTING_KEYS = ['templates', 'publishTime', 'instagramType'];

// create: make the tab on first write. A read never makes it (status runs often).
function settingsSheet_(create) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw userError_('SHEET_ID를 설정해주세요.');
  var book = SpreadsheetApp.openById(id); var sheet = book.getSheetByName(SETTINGS_SHEET);
  if (!sheet) {
    if (!create) return null;
    sheet = book.insertSheet(SETTINGS_SHEET);
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]); sheet.setFrozenRows(1);
    return sheet;
  }
  if (JSON.stringify(sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).getDisplayValues()[0]) !== JSON.stringify(SETTINGS_HEADERS)) throw userError_('「설정」 탭의 칸이 예상과 달라요. 데이터를 보호하기 위해 작업을 중단했어요.');
  return sheet;
}
// Display values: a time typed into the sheet by hand stays 「07:55」, not a date.
function settingsRows_(sheet) { return !sheet || sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, SETTINGS_HEADERS.length).getDisplayValues(); }
function readSettings_(sheet) {
  var rows = settingsRows_(sheet === undefined ? settingsSheet_(false) : sheet); var values = {};
  rows.forEach(function(row) {
    var key = String(row[0]); if (SETTING_KEYS.indexOf(key) < 0) return;
    try { values[key] = settingValue_(key, key === 'templates' ? JSON.parse(row[1]) : String(row[1])); } catch (_) {} // a broken cell reads as unset
  });
  return { values: values, revision: hash_(JSON.stringify(rows.map(function(row) { return [String(row[0]), String(row[1])]; }))) };
}
// For `status`: a broken tab must not break the connection check.
function statusSettings_() { try { return readSettings_(); } catch (error) { return { values: {}, revision: '', error: safeError_(error) }; } }

var TEMPLATE_ID = /^[a-z0-9-]{1,30}$/;
function settingValue_(key, value) {
  if (key === 'publishTime') { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) throw userError_('게시 기본 시각은 07:55처럼 HH:mm으로 넣어주세요.'); return String(value); }
  if (key === 'instagramType') { if (INSTAGRAM_TYPES.indexOf(value) < 0) throw userError_('인스타 형식은 릴스나 캐러셀이에요.'); return value; }
  var ids = function(list) { return Array.isArray(list) && list.length <= 50 && list.every(function(id, i) { return typeof id === 'string' && TEMPLATE_ID.test(id) && list.indexOf(id) === i; }); };
  var setting = value && typeof value === 'object' ? value : {};
  if (!ids(setting.order) || !ids(setting.hidden) || typeof setting.default !== 'string') throw userError_('템플릿 설정의 모양이 올바르지 않아요.');
  var hidden = setting.hidden.filter(function(id) { return setting.order.indexOf(id) >= 0; });
  if (setting.order.indexOf(setting.default) < 0 || hidden.indexOf(setting.default) >= 0) throw userError_('기본 템플릿은 요청 창에 보이는 템플릿이어야 해요.');
  if (!setting.order.some(function(id) { return hidden.indexOf(id) < 0; })) throw userError_('템플릿은 하나 이상 보여야 해요.');
  var clean = { order: setting.order, hidden: hidden, default: setting.default };
  // v2.23.0: the owner's names and one-line notes (사람: "설정에서 템플릿명도 바꿀수 있을까??"). Empty = templates.js's own; the id and
  // the number never change. Left out when there are none, so a setting without renames keeps its old shape.
  var names = settingTexts_(setting.names, 20, '이름은'), notes = settingTexts_(setting.notes, 40, '설명은');
  if (Object.keys(names).length) clean.names = names;
  if (Object.keys(notes).length) clean.notes = notes;
  return clean;
}
function settingTexts_(map, max, label) {
  if (map === undefined || map === null) return {};
  var bad = function() { return userError_('템플릿 ' + label.slice(0, -1) + ' 모양이 올바르지 않아요.'); };
  if (typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length > 50) throw bad();
  var out = {};
  Object.keys(map).forEach(function(id) {
    if (!TEMPLATE_ID.test(id) || typeof map[id] !== 'string') throw bad();
    var text = map[id].replace(/\s+/g, ' ').trim();
    if (text.length > max) throw userError_('템플릿 ' + label + ' ' + max + '자까지예요.');
    if (text) out[id] = text;
  });
  return out;
}

function updateSettings_(input) {
  var changes = input && input.changes && typeof input.changes === 'object' ? input.changes : {}; var keys = Object.keys(changes);
  if (!keys.length || keys.some(function(key) { return SETTING_KEYS.indexOf(key) < 0; })) throw userError_('바꿀 설정이 올바르지 않아요.');
  var clean = {}; keys.forEach(function(key) { clean[key] = settingValue_(key, changes[key]); });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sheet = settingsSheet_(true);
    if (String(input.revision || '') !== readSettings_(sheet).revision) throw userError_('다른 곳에서 설정이 바뀌었어요. 새로고침한 뒤 다시 저장해주세요.');
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    keys.forEach(function(key) {
      var rows = settingsRows_(sheet); var index = rows.findIndex(function(row) { return String(row[0]) === key; });
      var text = key === 'templates' ? JSON.stringify(clean[key]) : clean[key];
      // Text cells (a leading '), so Sheets never turns 「07:55」 or the time stamp into a date.
      sheet.getRange(index >= 0 ? index + 2 : Math.max(2, sheet.getLastRow() + 1), 1, 1, SETTINGS_HEADERS.length).setValues([[key, "'" + text, "'" + now]]);
    });
    SpreadsheetApp.flush();
    return readSettings_(sheet);
  } finally { lock.releaseLock(); }
}
