// v2.5.0: 「루미한테 요청하기」. The web leaves a product to make content for in the tab 「요청」 of the same spreadsheet
// (made on first use); Claude reads the waiting ones with `node tools/register.mjs requests` and marks them done.
// The web cannot wake a Claude conversation, so the owner says 「요청 확인해줘」 there. No Coupang API call is spent here.
var REQUEST_SHEET = '요청';
// v2.10.0: the request window picks the video template (an id from docs/js/templates.js) and the Instagram format; 「메모」 is 「루미에게 한마디」.
var REQUEST_HEADERS = ['요청 ID', '요청 시각', '상태', '상품명', '쿠팡 주소', '파트너스 링크', '메모', '어디서', '템플릿', '인스타 형식'];
var REQUEST_KEYS = ['id', 'requestedAt', 'status', 'productName', 'sourceUrl', 'affiliateUrl', 'note', 'from', 'template', 'instagramType'];
var REQUEST_FIRST_HEADERS = 8; // the tab made by v2.5.0 had these; the rest are filled into empty cells
var REQUEST_STATUSES = ['대기', '진행', '완료'];

function getRequestSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw userError_('SHEET_ID를 설정해주세요.');
  var book = SpreadsheetApp.openById(id);
  var sheet = book.getSheetByName(REQUEST_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(REQUEST_SHEET);
    sheet.getRange(1, 1, 1, REQUEST_HEADERS.length).setValues([REQUEST_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var headers = sheet.getRange(1, 1, 1, REQUEST_HEADERS.length).getDisplayValues()[0];
  if (JSON.stringify(headers) === JSON.stringify(REQUEST_HEADERS)) return sheet;
  var added = headers.slice(REQUEST_FIRST_HEADERS);
  if (JSON.stringify(headers.slice(0, REQUEST_FIRST_HEADERS)) !== JSON.stringify(REQUEST_HEADERS.slice(0, REQUEST_FIRST_HEADERS))
    || added.some(function(value, index) { return value !== '' && value !== REQUEST_HEADERS[REQUEST_FIRST_HEADERS + index]; })) throw userError_('「요청」 탭의 칸이 예상과 달라요. 데이터를 보호하기 위해 작업을 중단했어요.');
  sheet.getRange(1, REQUEST_FIRST_HEADERS + 1, 1, added.length).setValues([REQUEST_HEADERS.slice(REQUEST_FIRST_HEADERS)]);
  return sheet;
}
function requestRows_(sheet) { return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, REQUEST_HEADERS.length).getValues(); }
function requestEntry_(row) { var entry = {}; REQUEST_KEYS.forEach(function(key, index) { entry[key] = String(row[index] == null ? '' : row[index]); }); return entry; }
function readRequests_() { return { requests: requestRows_(getRequestSheet_()).filter(function(row) { return row[0]; }).map(requestEntry_).reverse() }; }

// What the request window chooses (v2.10.0); also what a waiting request may change (v2.11.0).
var REQUEST_CHOICES = ['productName', 'note', 'template', 'instagramType'];
function requestChoice_(input) {
  var choice = { productName: field_(input.productName || '', 200), note: field_(input.note || '', 1000), template: field_(input.template || '', 30), instagramType: field_(input.instagramType || '릴스', 10) };
  if (choice.template && !/^[a-z0-9-]+$/.test(choice.template)) throw userError_('템플릿 이름이 올바르지 않아요.');
  if (INSTAGRAM_TYPES.indexOf(choice.instagramType) < 0) throw userError_('인스타 형식은 릴스나 캐러셀이에요.');
  return choice;
}

function addRequest_(input) {
  var choice = requestChoice_(input);
  var entry = {
    id: /^[a-f0-9-]{36}$/i.test(input.id || '') ? input.id : Utilities.getUuid(),
    productName: choice.productName,
    sourceUrl: field_(input.sourceUrl || '', 2000),
    affiliateUrl: field_(input.affiliateUrl || '', 2000),
    note: choice.note,
    from: field_(input.from || '', 100),
    template: choice.template,
    instagramType: choice.instagramType
  };
  if (!/^https:\/\/((www|m|trip)\.)?coupang\.com\/\S*$/i.test(entry.sourceUrl)) throw userError_('쿠팡 상품 주소(https://www.coupang.com/… 또는 https://trip.coupang.com/…)를 넣어주세요.');
  if (entry.affiliateUrl && !/^https:\/\/link\.coupang\.com\/\S+$/i.test(entry.affiliateUrl)) throw userError_('파트너스 링크는 https://link.coupang.com/… 주소여야 해요.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sheet = getRequestSheet_(); var rows = requestRows_(sheet).map(requestEntry_);
    var same = rows.filter(function(row) { return row.id === entry.id || (row.sourceUrl === entry.sourceUrl && row.status !== '완료'); })[0];
    if (same) return { request: same, duplicate: true }; // a retry, or the same product still waiting
    entry.requestedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    entry.status = '대기';
    // Text, not a date: Sheets would otherwise turn 「2026-11-10 14:05」 into a date in its own time zone.
    var output = REQUEST_KEYS.map(function(key) { return key === 'requestedAt' ? "'" + entry[key] : sheetLiteral_(entry[key]); });
    var rowNumber = Math.max(2, sheet.getLastRow() + 1);
    if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
    sheet.getRange(rowNumber, 1, 1, REQUEST_HEADERS.length).setValues([output]);
    SpreadsheetApp.flush();
    return { request: entry, duplicate: false };
  } finally { lock.releaseLock(); }
}

// status: 대기 · 진행 · 완료, delete: true to take a mistaken request back,
// or edit: true (v2.11.0) to change the request window's choices while it still waits — once Lumi starts, it is fixed.
function updateRequest_(input) {
  var id = field_(input.id || '', 80);
  var choice = input.edit ? requestChoice_(input) : null;
  if (!input.delete && !input.edit && REQUEST_STATUSES.indexOf(input.status) < 0) throw userError_('요청 상태가 올바르지 않아요.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sheet = getRequestSheet_(); var rows = requestRows_(sheet);
    var index = rows.findIndex(function(row) { return String(row[0]) === id; });
    if (index < 0) throw userError_('요청을 찾지 못했어요. 새로고침해주세요.');
    if (input.delete) {
      if (sheet.getMaxRows() - sheet.getFrozenRows() <= 1) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
      sheet.deleteRow(index + 2); SpreadsheetApp.flush();
      return { id: id, deleted: true };
    }
    if (choice) {
      var waiting = requestEntry_(rows[index]);
      if (waiting.status !== '대기') throw userError_('루미가 이미 시작한 요청이라 고칠 수 없어요.');
      REQUEST_CHOICES.forEach(function(key) { waiting[key] = choice[key]; sheet.getRange(index + 2, REQUEST_KEYS.indexOf(key) + 1).setValues([[sheetLiteral_(choice[key])]]); });
      SpreadsheetApp.flush();
      return { request: waiting };
    }
    sheet.getRange(index + 2, REQUEST_KEYS.indexOf('status') + 1).setValues([[input.status]]);
    SpreadsheetApp.flush();
    var entry = requestEntry_(rows[index]); entry.status = input.status;
    return { request: entry };
  } finally { lock.releaseLock(); }
}
