// v2.5.0: 「루미한테 요청하기」. The web leaves a product to make content for in the tab 「요청」 of the same spreadsheet
// (made on first use); Claude reads the waiting ones with `node tools/register.mjs requests` and marks them done.
// The web cannot wake a Claude conversation, so the owner says 「요청 확인해줘」 there. No Coupang API call is spent here.
var REQUEST_SHEET = '요청';
// v2.10.0: the request window picks the video template (an id from docs/js/templates.js) and the Instagram format; 「메모」 is 「루미에게 한마디」.
// v2.21.0: Lumi's draft — a phone-size video and its cover on Cloudinary (tools/register.mjs draft) and when it came, so the
// owner can watch it in the web before 「컨펌」. Only the tool key writes them; they go when the request is done or deleted, or
// DRAFT_KEEP_DAYS after the upload (syncDrafts_, from the 10-minute trigger).
var REQUEST_HEADERS = ['요청 ID', '요청 시각', '상태', '상품명', '쿠팡 주소', '파트너스 링크', '메모', '어디서', '템플릿', '인스타 형식', '초안 영상', '초안 커버', '초안 올린 때'];
var REQUEST_KEYS = ['id', 'requestedAt', 'status', 'productName', 'sourceUrl', 'affiliateUrl', 'note', 'from', 'template', 'instagramType', 'draftUrl', 'draftCover', 'draftAt'];
var DRAFT_KEYS = ['draftUrl', 'draftCover', 'draftAt'];
var DRAFT_FOLDER = 'hikary/drafts/'; // a draft address must be under it, so clearing a draft can never touch a video waiting to be posted
var DRAFT_KEEP_DAYS = 30;
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
  if (sheet.getMaxColumns() < REQUEST_HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), REQUEST_HEADERS.length - sheet.getMaxColumns());
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
    instagramType: choice.instagramType,
    draftUrl: '', draftCover: '', draftAt: ''
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

// A draft is ours only under DRAFT_FOLDER on our Cloudinary (the video an mp4, the cover an image).
function draftVideoId_(url) { var id = videoPublicId_(url); return id.indexOf(DRAFT_FOLDER) === 0 ? id : ''; }
function draftCoverId_(url) {
  var config = cloudinary_(); var match = String(url || '').match(/^https:\/\/res\.cloudinary\.com\/([a-z0-9_-]+)\/image\/upload\/(?:v\d+\/)?([A-Za-z0-9_\/-]+)\.(?:png|jpe?g|webp)$/);
  return config && match && match[1] === config.cloud && match[2].indexOf(DRAFT_FOLDER) === 0 ? match[2] : '';
}
// true when the draft's files are gone at Cloudinary (or there were none of ours); false keeps the cells for the next try.
function deleteDraft_(entry) {
  var video = draftVideoId_(entry.draftUrl), cover = draftCoverId_(entry.draftCover);
  var gone = true;
  if (video && !destroyCloudinary_('video', video)) gone = false;
  if (cover && !destroyCloudinary_('image', cover)) gone = false;
  return gone;
}
function clearDraftCells_(sheet, rowNumber) { sheet.getRange(rowNumber, REQUEST_KEYS.indexOf('draftUrl') + 1, 1, DRAFT_KEYS.length).setValues([DRAFT_KEYS.map(function() { return ''; })]); }

// status: 대기 · 진행 · 완료, delete: true to take a mistaken request back,
// or edit: true (v2.11.0) to change the request window's choices while it still waits — once Lumi starts, it is fixed,
// or draft: true (v2.21.0, tool key only) with draftUrl · draftCover — Lumi's draft for the owner to watch; the same files again replace it.
// 완료 (= registered to the ledger, where the ✎ window plays the posting video) and delete take the draft off Cloudinary.
function updateRequest_(input, who) {
  var id = field_(input.id || '', 80);
  var choice = input.edit ? requestChoice_(input) : null;
  var draft = null;
  if (input.draft) {
    if (who !== 'tool') throw userError_('초안은 등록 도구로만 올려요.');
    draft = { draftUrl: field_(input.draftUrl || '', 2000), draftCover: field_(input.draftCover || '', 2000) };
    if (!draftVideoId_(draft.draftUrl)) throw userError_('초안 영상은 우리 Cloudinary의 ' + DRAFT_FOLDER + ' mp4만 받아요.');
    if (draft.draftCover && !draftCoverId_(draft.draftCover)) throw userError_('초안 커버는 우리 Cloudinary의 ' + DRAFT_FOLDER + ' 이미지만 받아요.');
  } else if (!input.delete && !input.edit && REQUEST_STATUSES.indexOf(input.status) < 0) throw userError_('요청 상태가 올바르지 않아요.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 저장 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sheet = getRequestSheet_(); var rows = requestRows_(sheet);
    var index = rows.findIndex(function(row) { return String(row[0]) === id; });
    if (index < 0) throw userError_('요청을 찾지 못했어요. 새로고침해주세요.');
    if (draft) {
      var drafted = requestEntry_(rows[index]);
      if (drafted.status === '완료') throw userError_('이미 등록을 마친 요청이에요. 초안은 올리지 않아요.');
      draft.draftAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
      // Text, not a date (like 요청 시각).
      sheet.getRange(index + 2, REQUEST_KEYS.indexOf('draftUrl') + 1, 1, DRAFT_KEYS.length).setValues([[draft.draftUrl, draft.draftCover, "'" + draft.draftAt]]);
      SpreadsheetApp.flush();
      DRAFT_KEYS.forEach(function(key) { drafted[key] = draft[key]; });
      return { request: drafted };
    }
    if (input.delete) {
      // ponytail: a Cloudinary failure here leaves the files behind with no row to find them; fine for the rare draft on a waiting request.
      deleteDraft_(requestEntry_(rows[index]));
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
    var entry = requestEntry_(rows[index]); entry.status = input.status;
    // Registered: the draft has done its job. If Cloudinary fails now, syncDrafts_ tries again (it clears every 완료 draft).
    if (input.status === '완료' && (entry.draftUrl || entry.draftCover) && deleteDraft_(entry)) { clearDraftCells_(sheet, index + 2); DRAFT_KEYS.forEach(function(key) { entry[key] = ''; }); }
    SpreadsheetApp.flush();
    return { request: entry };
  } finally { lock.releaseLock(); }
}

// v2.21.0: from syncPublishing every 10 minutes — drafts of requests that are done, or older than DRAFT_KEEP_DAYS, leave Cloudinary.
// No 「요청」 tab yet means nothing to do (and none is made here).
function syncDrafts_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id || !SpreadsheetApp.openById(id).getSheetByName(REQUEST_SHEET)) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var sheet = getRequestSheet_();
    requestRows_(sheet).forEach(function(row, index) {
      var entry = requestEntry_(row); if (!entry.id || !(entry.draftUrl || entry.draftCover)) return;
      var at = new Date(String(entry.draftAt).replace(' ', 'T') + ':00+09:00').getTime();
      var old = !isNaN(at) && Date.now() - at > DRAFT_KEEP_DAYS * 864e5;
      if ((entry.status === '완료' || old) && deleteDraft_(entry)) clearDraftCells_(sheet, index + 2);
    });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}
