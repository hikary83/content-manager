(() => {
  'use strict';
  // v3.0.0 (2026-11-11): dark YouTube-Studio layout — 대시보드 · 콘텐츠 · 소재 찾기, 바로가기 icons, profile menu.
  // The 「올리기」 dialog is merged into the ✎ detail window (right panel: thumbnail, links, places with an inline record).
  // v3.3.1: clicking the latest post opens ✎ (no 보기·수정 button); the cover downloads from the icon on its top right.
  // v3.3.0: the latest post shows its cover (server 2.9.0 「커버 이미지」), real platform marks, dashboard lists turn pages.
  // Before: v2.0.0 ledger web · v2.1.0 product finder · v2.2.0 one row per product · v2.8.0 「게시」 through Buffer · v2.9.0 login.
  const $ = id => document.getElementById(id);
  const PLATFORMS = [['youtube', 'YouTube 쇼츠'], ['instagram', '인스타 릴스'], ['carousel', '인스타 캐러셀'], ['tiktok', 'TikTok']];
  // v3.3.0: real platform marks — a white glyph on the platform's own colour box (css .pf.<key>). The carousel is a stack on Instagram's box.
  // TikTok: Simple Icons path (CC0), scaled into the box.
  const GLYPH = {
    youtube: '<path d="M9.4 7.2v9.6l8-4.8z"/>',
    instagram: '<rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="currentColor" stroke-width="2.1"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" stroke-width="2.1"/><circle cx="16.4" cy="7.6" r="1.1"/>',
    carousel: '<rect x="4.5" y="7.5" width="11" height="12" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M8.5 4.5h8.4a2.6 2.6 0 0 1 2.6 2.6v9.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    tiktok: '<path transform="translate(4.6 4.5) scale(.62)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>'
  };
  const svgMark = key => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${GLYPH[key]}</svg>`;
  // v2.8.0 「게시」 (server 2.6.0): the video places go through Buffer; the carousel stays manual.
  // ERROR_LABELS are the line prefixes the server writes into 「게시 오류」 (backend/Publish.js PUBLISH_LABELS).
  const PUBLISH = PLATFORMS.filter(([key]) => key !== 'carousel');
  const ERROR_LABELS = { youtube: 'YouTube', instagram: '인스타 릴스', tiktok: 'TikTok' };
  const STATE = { 업로드완료: 'done', 보류: 'hold', 예약됨: 'sched', 오류: 'err' };
  const errorFor = (row, key) => ERROR_LABELS[key] && (row.publishError || '').split('\n').find(line => line.startsWith(ERROR_LABELS[key] + ': '))?.slice(ERROR_LABELS[key].length + 2) || '';
  const settledPlace = status => ['업로드완료', '예약됨', '보류'].includes(status);
  const openToPublish = row => PUBLISH.some(([key]) => !settledPlace(row[key + 'Status']));
  const TEXT_KEYS = ['productName', 'category', 'sourceUrl', 'affiliateUrl', 'inpockNo', 'inpockTitle', 'script', 'instagram', 'kittyKeyword', 'kittyDm', 'tiktok', 'notes'];
  const imageUrl = value => /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(value || '') ? value : '';
  // The ledger keeps one YouTube cell: first line 「제목: …」, a blank line, then the description.
  const splitYoutube = text => { const match = /^제목:[ \t]*(.*)(?:\r?\n([\s\S]*))?$/.exec(text || ''); return match ? [match[1].trim(), (match[2] || '').trim()] : ['', (text || '').trim()]; };
  const joinYoutube = (title, body) => title ? `제목: ${title}${body ? '\n\n' + body : ''}` : body;
  const https = value => /^https:\/\//i.test(value || '');
  // v3.3.0 (server 2.9.0): 「커버 이미지」 is the full-size cover on Cloudinary. The page asks Cloudinary for a small copy, or for the original as a download.
  const coverUrl = value => /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/[A-Za-z0-9_/.,-]+$/.test(value || '') ? value : '';
  const coverAt = (url, how) => url.replace('/image/upload/', `/image/upload/${how}/`);
  const coverSmall = url => coverAt(url, 'w_360,q_auto,f_auto');
  const coverFile = (url, row) => coverAt(url, `fl_attachment:${/^\d+$/.test(row.inpockNo || '') ? `No${row.inpockNo}_` : ''}cover`);
  const shortDate = value => (value || '').slice(5).replace('-', '.'); // 2026-11-11 08:45 → 11.11 08:45
  const posted = row => PLATFORMS.filter(([key]) => row[key + 'Status'] === '업로드완료').length;
  // 「보류」 is a place the owner chose to skip, so it counts as done for 「다 올림」.
  const settled = row => PLATFORMS.every(([key]) => ['업로드완료', '보류'].includes(row[key + 'Status']));
  const recent = row => PLATFORMS.filter(([key]) => row[key + 'Status'] === '업로드완료' && row[key + 'Date'] && Date.now() - new Date(row[key + 'Date'].replace(' ', 'T')) < 7 * 864e5).length;
  const lastPosted = row => PLATFORMS.filter(([key]) => row[key + 'Status'] === '업로드완료').map(([key]) => row[key + 'Date']).filter(Boolean).sort().at(-1) || '';
  let rows = [];
  let requests = [];
  let report = null; // v3.2.0: Coupang Partners report (server `report`, kept 6 hours there)
  let busy = false;
  let filter = '전체';
  let view = 'dashboard';
  let current = null;
  let dirty = false;

  function notice(text, error = false) { $('notice').hidden = !text; $('notice').className = error ? 'error' : ''; $('notice').textContent = text; }
  async function task(work) {
    if (busy) return;
    busy = true; notice('처리 중입니다…');
    // Lock every control so a slow response cannot race a second click.
    const controls = [...document.querySelectorAll('button,input,textarea,select')];
    controls.forEach(control => { control.disabled = true; });
    try { await work(); } catch (error) {
      // An open dialog covers the page notice, so speak up in front of it.
      const text = error.message || '처리 중 오류가 발생했어요.';
      if (document.querySelector('dialog[open]')) { notice(''); alert(text); } else notice(text, true);
    }
    finally { busy = false; controls.forEach(control => { control.disabled = false; }); }
  }
  window.addEventListener('beforeunload', event => { if (busy || dirty) { event.preventDefault(); event.returnValue = ''; } });

  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, onclick, className = 'btn sm') { const node = element('button', className, text); node.type = 'button'; node.onclick = onclick; return node; }
  function link(text, href, className) { const node = element('a', className, text); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node; }
  function emptyBox(title, sub) { const box = element('div', 'empty'); box.append(element('strong', '', title)); if (sub) box.append(element('span', '', sub)); return box; }
  const label = (row, prefix = true) => `${prefix && row.inpockNo ? 'No.' + row.inpockNo + ' ' : ''}${row.productName}`;
  // One platform mark; the dot shows the state (green up, orange scheduled, red error, grey on hold, dim not yet).
  function placeIcon(row, key, name, onclick) {
    const status = row[key + 'Status'] || '미업로드'; const state = STATE[status];
    const node = onclick ? button('', onclick, `pf ${key}`) : element('span', `pf ${key}`); node.innerHTML = svgMark(key);
    if (state) node.dataset.state = state; else node.classList.add('none');
    node.title = `${name} · ${status}${row[key + 'Date'] ? ' ' + row[key + 'Date'] : ''}`; if (onclick) node.setAttribute('aria-label', node.title); return node;
  }
  function thumb(row) {
    const src = imageUrl(row.inpockImage);
    if (!src) return element('span', 'thumb', '—');
    const img = element('img', 'thumb'); img.src = src; img.alt = ''; img.loading = 'lazy'; return img;
  }

  // v3.3.0: long dashboard lists turn pages (●○○, ‹ ›, swipe on a phone) instead of scrolling. Rows per page follow the screen.
  const pages = {};
  const perPage = () => matchMedia('(max-width:640px)').matches ? 3 : innerHeight >= 1000 ? 6 : innerHeight >= 820 ? 5 : 4;
  function paged(id, nodes) { pages[id] = { nodes, page: pages[id]?.page || 0 }; $(id).style.minHeight = ''; showPage(id); }
  function showPage(id, page = pages[id].page) {
    const { nodes } = pages[id]; const size = perPage(); const count = Math.max(1, Math.ceil(nodes.length / size));
    page = pages[id].page = Math.min(Math.max(0, page), count - 1);
    const shown = nodes.slice(page * size, page * size + size);
    if (count > 1) {
      const nav = element('div', 'pager'); const dots = element('span', 'dots');
      if (count <= 8) for (let index = 0; index < count; index++) dots.append(Object.assign(button('', () => flip(id, index - page), index === page ? 'dot on' : 'dot'), { ariaLabel: `${index + 1}쪽` }));
      else dots.textContent = `${page + 1} / ${count}`;
      nav.append(Object.assign(button('‹', () => flip(id, -1), 'ibtn'), { disabled: page === 0, ariaLabel: '앞 쪽' }), dots, Object.assign(button('›', () => flip(id, 1), 'ibtn'), { disabled: page === count - 1, ariaLabel: '다음 쪽' }));
      shown.push(nav);
    }
    $(id).replaceChildren(...shown);
  }
  // Keep the tallest page's height so the cards below do not jump while turning.
  function flip(id, step) { const box = $(id); box.style.minHeight = `${Math.max(box.offsetHeight, parseFloat(box.style.minHeight) || 0)}px`; showPage(id, pages[id].page + step); }
  for (const id of ['recentOrders', 'productClicks', 'todo', 'upcoming']) {
    const box = $(id); let start = null; box.classList.add('paged');
    box.addEventListener('touchstart', event => { start = event.touches[0]; }, { passive: true });
    box.addEventListener('touchend', event => {
      const end = event.changedTouches[0]; const dx = start ? end.clientX - start.clientX : 0;
      if (start && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(end.clientY - start.clientY) && pages[id]) flip(id, dx < 0 ? 1 : -1);
      start = null;
    });
  }
  let pageSize = perPage();
  addEventListener('resize', () => { if (perPage() === pageSize) return; pageSize = perPage(); for (const id in pages) { $(id).style.minHeight = ''; showPage(id); } });

  async function load() { rows = (await HikaryApi.request('list')).entries; render(); }
  async function loadRequests() { requests = (await HikaryApi.request('requests')).requests; render(); }
  const openRequests = () => requests.filter(item => item.status !== '완료');
  function render() {
    renderList(); renderDashboard(); renderCalendar();
    const waiting = requests.filter(item => item.status === '대기').length;
    $('requestCount').hidden = !waiting; $('requestCount').textContent = waiting;
  }

  // ── 콘텐츠: one row per product (Studio content table). Requests not done yet sit on top as dashed rows.
  const FILTERS = {
    전체: () => true, 요청: () => false,
    예약됨: row => PLATFORMS.some(([key]) => row[key + 'Status'] === '예약됨'),
    '남은 것': row => !settled(row),
    오류: row => PLATFORMS.some(([key]) => row[key + 'Status'] === '오류'),
    '다 올림': settled
  };
  function renderList() {
    const query = $('search').value.trim().toLowerCase();
    for (const node of $('filters').children) node.querySelector('b').textContent = node.dataset.filter === '요청' ? openRequests().length : rows.filter(FILTERS[node.dataset.filter]).length;
    const reqs = ['전체', '요청'].includes(filter) ? openRequests().filter(item => `${item.productName} ${item.sourceUrl}`.toLowerCase().includes(query)) : [];
    const shown = rows.filter(row => FILTERS[filter](row) && `${row.productName} ${row.category} No.${row.inpockNo}`.toLowerCase().includes(query));
    $('entries').replaceChildren(...reqs.map(requestRow), ...shown.map(entryRow));
    if (!reqs.length && !shown.length) $('entries').append(emptyBox(rows.length ? '조건에 맞는 콘텐츠가 없어요.' : '아직 등록된 콘텐츠가 없어요.', rows.length ? '검색어나 보기를 바꿔 보세요.' : '「소재 찾기」에서 루미한테 요청하면 여기에 쌓여요.'));
  }
  function whenCell(row) {
    const box = element('div', 'when');
    const scheduled = PLATFORMS.filter(([key]) => row[key + 'Status'] === '예약됨').map(([key]) => row[key + 'Date']).filter(Boolean).sort()[0];
    const done = posted(row); const last = lastPosted(row);
    const left = PLATFORMS.filter(([key]) => !['업로드완료', '보류'].includes(row[key + 'Status'])).map(([, name]) => name);
    const errors = PLATFORMS.filter(([key]) => row[key + 'Status'] === '오류').length;
    if (scheduled) box.append(element('span', 'chip sched', `예약 ${shortDate(scheduled)}`)); else box.append(document.createTextNode(last ? shortDate(last) : '—'));
    box.append(element('small', '', errors ? `오류 ${errors}곳` : done ? (left.length ? `${done}곳 올라감 · ${left.length === 1 ? left[0] + ' 남음' : left.length + '곳 남음'}` : '다 올라감') : `등록 ${shortDate(row.createdAt)}`));
    return box;
  }
  function entryRow(row) {
    const tr = element('div', 'tr row'); tr.onclick = event => { if (!event.target.closest('button,a')) openDetail(row); };
    const item = element('div', 'item'); const text = element('div'); const name = element('b', '', label(row));
    if (row.format) name.prepend(element('span', 'pill', row.format)); // rows made before v2.2.0
    text.append(name, element('small', '', `${row.category} · 등록 ${shortDate(row.createdAt)}`)); item.append(thumb(row), text);
    const marks = element('div', 'pfs'); for (const [key, name] of PLATFORMS) marks.append(placeIcon(row, key, name, () => openDetail(row, key)));
    const actions = element('div', 'acts');
    if (openToPublish(row)) actions.append(button('게시', () => openPublish(row), 'btn sm primary'));
    actions.append(Object.assign(button('✎', () => openDetail(row), 'ibtn'), { title: '보기·수정', ariaLabel: '보기·수정' }));
    const stats = productStats(row);
    const clicks = element('div', 'clicks', stats ? String(stats.clicks) : '—'); if (stats?.orders) clicks.append(element('small', '', `주문 ${stats.orders}`));
    tr.append(item, marks, whenCell(row), clicks, actions); return tr;
  }
  // v2.7.2: the Partners link is shown as text to copy, never as a link we would click ourselves (self-referral).
  function requestRow(item) {
    const tr = element('div', 'tr req'); const box = element('div', 'item'); const text = element('div');
    text.append(element('b', '', item.productName || item.sourceUrl.replace(/^https:\/\//, '').split('?')[0]), element('small', '', `${shortDate(item.requestedAt)} 요청 · ${item.from || '루미한테 요청'}`));
    box.append(element('span', 'thumb', '⋯'), text);
    const state = element('div', 'pfs'); state.append(element('span', `chip req${item.status === '진행' ? ' doing' : ''}`, item.status === '진행' ? '루미가 만드는 중' : '루미 대기 중'));
    const hint = element('div', 'when'); hint.append(element('small', '', 'Claude에서 「요청 확인해줘」'));
    const actions = element('div', 'acts');
    if (item.affiliateUrl) {
      const copy = button('링크 복사', async () => {
        try { await navigator.clipboard.writeText(item.affiliateUrl); copy.textContent = '복사됨 ✓'; setTimeout(() => { copy.textContent = '링크 복사'; }, 1500); }
        catch { notice('복사하지 못했어요. 운영대장 「요청」 탭에서 복사해주세요.', true); }
      });
      actions.append(copy);
    }
    if (https(item.sourceUrl)) actions.append(link('상품 ↗', item.sourceUrl, 'btn sm'));
    if (item.status === '대기') actions.append(button('지우기', () => void task(async () => { await HikaryApi.request('requestUpdate', { id: item.id, delete: true }); await loadRequests(); notice('요청을 지웠어요.'); })));
    tr.append(box, state, hint, element('div', 'clicks'), actions); return tr;
  }
  function setFilter(next) { filter = next; for (const node of $('filters').children) node.classList.toggle('on', node.dataset.filter === next); renderList(); }
  for (const node of $('filters').children) node.onclick = () => setFilter(node.dataset.filter);
  $('search').oninput = () => { if (view !== 'content') go('content'); if (mode !== 'list') setMode('list'); renderList(); };
  $('refresh').onclick = () => void task(async () => { await load(); await loadRequests(); await loadReport(); notice(`${rows.length}건을 불러왔어요.`); });

  // ── v3.1.0 캘린더 (주간 · 월간): posted and scheduled places by day. An empty day's 「＋」 opens 「게시」 for that day at 08:45.
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];
  const STATE_WORD = { done: '올라감', sched: '예약됨', err: '오류' };
  const dayKey = date => date.toLocaleDateString('sv-SE');
  const today = () => dayKey(new Date());
  const addDays = (date, n) => { const day = new Date(date); day.setDate(day.getDate() + n); return day; };
  const startOfWeek = date => { const day = new Date(date); day.setHours(0, 0, 0, 0); return addDays(day, -((day.getDay() + 6) % 7)); };
  let mode = 'list';
  try { if (localStorage.getItem('hikary-content-mode') === 'calendar') mode = 'calendar'; } catch {} // remembered per browser
  let calView = 'week';
  let anchor = new Date();
  let selectedDay = today();
  // One event per product per day: the places with a date there (up, scheduled or failed), the earliest time and the strongest state.
  function events() {
    const byDay = new Map();
    for (const row of rows) for (const [key] of PLATFORMS) {
      const status = row[key + 'Status']; const at = row[key + 'Date'];
      if (!at || !['업로드완료', '예약됨', '오류'].includes(status)) continue;
      const day = at.slice(0, 10); const time = at.slice(11, 16); const id = row.id + day;
      if (!byDay.has(id)) byDay.set(id, { row, day, time, keys: [] });
      const event = byDay.get(id); event.keys.push(key); if (time && (!event.time || time < event.time)) event.time = time;
    }
    return [...byDay.values()].map(event => ({ ...event, state: event.keys.some(key => event.row[key + 'Status'] === '예약됨') ? 'sched' : event.keys.some(key => event.row[key + 'Status'] === '오류') ? 'err' : 'done' }))
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  }
  const eventsOn = (list, day) => list.filter(event => event.day === day);
  function eventCard(event) {
    const card = button('', () => openDetail(event.row), `ev ${event.state}`);
    const top = element('span', 'ev-top'); top.append(thumb(event.row), element('b', '', label(event.row)));
    const marks = element('span', 'pfs'); for (const key of event.keys) marks.append(placeIcon(event.row, key, PLATFORMS.find(([name]) => name === key)[1]));
    card.append(element('span', 't', `${event.time || '—'} · ${STATE_WORD[event.state]}`), top, marks); return card;
  }
  function renderSlots() { // Buffer free plan: 10 waiting posts per channel — show the fullest one
    const used = Math.max(0, ...PUBLISH.map(([key]) => rows.filter(row => row[key + 'Status'] === '예약됨').length));
    const meter = element('span', 'meter'); const fill = element('i'); fill.style.width = `${Math.min(used, 10) * 10}%`; fill.classList.toggle('low', used >= 8); meter.append(fill);
    $('calSlots').replaceChildren(element('span', '', 'Buffer 예약 칸'), meter, element('b', '', `${used} / 10`));
  }
  function renderWeek(list) {
    const start = startOfWeek(anchor); const end = addDays(start, 6);
    $('calRange').textContent = `${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() !== start.getMonth() ? `${end.getMonth() + 1}월 ` : ''}${end.getDate()}일`;
    $('weekGrid').replaceChildren(...DOW.map((name, i) => {
      const date = addDays(start, i); const day = dayKey(date); const items = eventsOn(list, day);
      const column = element('div', `day${day < today() ? ' past' : ''}${day === today() ? ' today' : ''}`);
      const head = element('header'); head.append(element('span', '', name), element('b', '', String(date.getDate())));
      const body = element('div', 'day-body'); body.append(...items.map(eventCard));
      if (!items.length && day >= today()) body.append(button('＋ 비어 있음', () => openPick(day), 'add'));
      column.append(head, body); return column;
    }));
  }
  function renderMonth(list) {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1); const start = startOfWeek(first);
    $('calRange').textContent = `${first.getFullYear()}년 ${first.getMonth() + 1}월`;
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const date = addDays(start, i); const day = dayKey(date); const inMonth = date.getMonth() === first.getMonth();
      if (i % 7 === 0 && i >= 28 && !inMonth) break; // no row that is all next month
      const cell = button('', () => { selectedDay = day; renderCalendar(); }, `cell${inMonth ? '' : ' out'}${day < today() ? ' past' : ''}${day === today() ? ' today' : ''}${day === selectedDay ? ' sel' : ''}`);
      cell.append(element('span', 'd', date.getDate() === 1 ? `${date.getMonth() + 1}.1` : String(date.getDate())));
      const items = eventsOn(list, day);
      for (const event of items.slice(0, 3)) { const mini = element('span', `mini ${event.state}`); mini.append(thumb(event.row), element('span', '', event.row.inpockNo ? `No.${event.row.inpockNo}` : event.row.productName), element('i')); cell.append(mini); }
      if (items.length > 3) cell.append(element('span', 'more', `+${items.length - 3}`));
      if (!items.length && inMonth && day >= today()) cell.append(element('span', 'plus', '＋'));
      cells.push(cell);
    }
    $('monthGrid').replaceChildren(...cells);
    // The chosen day, then this month in numbers.
    const date = new Date(selectedDay + 'T00:00'); const items = eventsOn(list, selectedDay);
    const dayCard = element('section', 'card'); const title = element('h2', '', `${date.getMonth() + 1}월 ${date.getDate()}일 (${DOW[(date.getDay() + 6) % 7]})`);
    if (selectedDay === today()) title.append(element('small', '', '오늘'));
    dayCard.append(title, ...items.map(eventCard));
    if (!items.length) {
      dayCard.append(emptyBox('이날은 비어 있어요'));
      if (selectedDay >= today()) { const add = button('＋ 이날 게시하기', () => openPick(selectedDay), 'btn sm primary'); add.style.width = '100%'; dayCard.append(add); }
    }
    const month = dayKey(first).slice(0, 7); const inMonth = list.filter(event => event.day.startsWith(month));
    const count = status => inMonth.reduce((sum, event) => sum + event.keys.filter(key => event.row[key + 'Status'] === status).length, 0);
    const summary = element('section', 'card'); summary.append(element('h2', '', `${first.getMonth() + 1}월`));
    const stats = element('div', 'stats four');
    for (const [value, name] of [[new Set(inMonth.filter(event => event.keys.some(key => event.row[key + 'Status'] === '업로드완료')).map(event => event.row.id)).size, '올린 상품'], [count('업로드완료'), '올린 게시물'], [count('예약됨'), '예약'], [count('오류'), '오류']]) {
      const box = element('div'); box.append(element('b', '', String(value)), element('span', '', name)); stats.append(box);
    }
    summary.append(stats); $('dayPanel').replaceChildren(dayCard, summary);
  }
  function renderCalendar() {
    if (mode !== 'calendar') return;
    const list = events(); renderSlots();
    $('weekGrid').hidden = calView !== 'week'; $('monthWrap').hidden = calView !== 'month';
    $('calWeek').classList.toggle('on', calView === 'week'); $('calMonth').classList.toggle('on', calView === 'month');
    $('calToday').textContent = calView === 'week' ? '이번 주' : '이번 달';
    if (calView === 'week') renderWeek(list); else renderMonth(list);
  }
  function setMode(next) {
    mode = next; try { localStorage.setItem('hikary-content-mode', next); } catch {}
    $('listBox').hidden = mode !== 'list'; $('calendarBox').hidden = mode !== 'calendar';
    $('modeList').classList.toggle('on', mode === 'list'); $('modeCal').classList.toggle('on', mode === 'calendar');
    renderCalendar();
  }
  $('modeList').onclick = () => setMode('list');
  $('modeCal').onclick = () => setMode('calendar');
  $('calWeek').onclick = () => { calView = 'week'; renderCalendar(); };
  $('calMonth').onclick = () => { calView = 'month'; renderCalendar(); };
  const shift = step => { anchor = calView === 'week' ? addDays(anchor, 7 * step) : new Date(anchor.getFullYear(), anchor.getMonth() + step, 1); renderCalendar(); };
  $('calPrev').onclick = () => shift(-1);
  $('calNext').onclick = () => shift(1);
  $('calToday').onclick = () => { anchor = new Date(); selectedDay = today(); renderCalendar(); };
  // 「＋」 on an empty day: pick something not yet published, then 「게시」 opens with that day at 08:45.
  function openPick(day) {
    const date = new Date(day + 'T00:00');
    $('pickTitle').textContent = `${date.getMonth() + 1}월 ${date.getDate()}일에 올릴 콘텐츠`;
    const choices = rows.filter(openToPublish);
    $('pickList').replaceChildren(...(choices.length ? choices.map(row => {
      const item = button('', () => { $('pickDialog').close(); openPublish(row, { date: day, time: '08:45' }); }, 'pick-item');
      const text = element('span', 'pick-text'); text.append(element('b', '', label(row)), element('small', row.videoUrl ? 'ok' : 'none', row.videoUrl ? '영상 준비됨' : '영상 없음 — 루미에게 「영상 올려줘」'));
      item.append(thumb(row), text); return item;
    }) : [emptyBox('올릴 콘텐츠가 없어요', '모두 올렸거나 예약해 뒀어요.')]));
    $('pickDialog').showModal();
  }
  $('pickClose').onclick = () => $('pickDialog').close();
  $('pickForm').onsubmit = event => event.preventDefault();

  // ── v3.2.0 쿠팡 실적: the Partners report covers the whole account (links made before HIKARY too).
  // Clicks and orders carry `ctag` = the product number of the link, so a ledger row is matched by the number in its address.
  const productId = row => (/\/products\/(\d+)/.exec(row.sourceUrl || '') || [])[1] || '';
  const won = value => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const reportDay = value => new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00`);
  function productStats(row) {
    const id = productId(row); if (!id || !report?.reports) return null;
    const clicks = (report.reports.clicks || []).filter(item => String(item.ctag) === id).reduce((sum, item) => sum + (Number(item.click) || 0), 0);
    const orders = (report.reports.orders || []).filter(item => String(item.ctag) === id);
    return { clicks, orders: orders.length, commission: orders.reduce((sum, item) => sum + (Number(item.commission) || 0), 0) };
  }
  async function loadReport() {
    try { report = await HikaryApi.request('report', { days: 30 }); if (report.usage) { coupang.usage = report.usage; showQuota(); } }
    catch (error) { if (error.auth) return; report = { error: error.message }; }
    renderDashboard(); renderList();
  }
  function renderCoupang() {
    const note = $('coupangNote');
    if (!report || report.error) {
      for (const id of ['coupangTotals', 'coupangBars', 'coupangAxis']) $(id).replaceChildren();
      note.textContent = report ? report.error : '불러오는 중…'; note.hidden = false; $('coupangUpdated').textContent = '';
      paged('productClicks', []); paged('recentOrders', []); return;
    }
    // Daily totals come from the commission report (click · order · commission per day); days without a row are zero.
    const byDay = new Map((report.reports.commission || []).map(item => [String(item.date), item]));
    const days = []; for (let day = reportDay(report.startDate); dayKey(day).replaceAll('-', '') <= report.endDate; day = addDays(day, 1)) days.push(dayKey(day).replaceAll('-', ''));
    const total = key => [...byDay.values()].reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
    const box = (value, name, accent) => { const node = element('div', accent ? 'accent' : ''); node.append(element('b', '', value), element('span', '', name)); return node; };
    $('coupangTotals').replaceChildren(box(String(total('click')), '클릭'), box(String(total('order')), '주문'), box(Math.round(total('commission')).toLocaleString('ko-KR'), '수익 (원)', true));
    const most = Math.max(1, ...days.map(day => Number(byDay.get(day)?.click) || 0));
    $('coupangBars').replaceChildren(...days.map(day => {
      const item = byDay.get(day) || {}; const click = Number(item.click) || 0; const order = Number(item.order) || 0;
      const bar = element('i', order ? 'hi' : ''); bar.style.height = `${Math.max(2, click / most * 100)}%`;
      bar.title = `${day.slice(4, 6)}.${day.slice(6, 8)} 클릭 ${click}${order ? ` · 주문 ${order} · ${won(Number(item.commission) || 0)}` : ''}`; return bar;
    }));
    const tick = day => `${day.slice(4, 6)}.${day.slice(6, 8)}`;
    $('coupangAxis').replaceChildren(element('span', '', tick(days[0])), element('span', '', tick(days[Math.floor(days.length / 2)])), element('span', '', tick(days.at(-1))));
    const failed = Object.keys(report.errors || {});
    $('coupangUpdated').textContent = `${shortDate(new Date(report.fetchedAt).toLocaleString('sv-SE').slice(0, 16))} 기준`; // v3.3.2: only the time; the rest is in its tooltip
    note.textContent = failed.length ? `${failed.join('·')} 리포트를 받지 못했어요` : ''; note.hidden = !failed.length;
    // HIKARY products by clicks, then the latest orders of the whole account.
    const products = rows.map(row => ({ row, stats: productStats(row) })).filter(item => item.stats).sort((a, b) => b.stats.clicks - a.stats.clicks || b.row.createdAt.localeCompare(a.row.createdAt));
    paged('productClicks', products.length ? products.map(({ row, stats }) => {
      const line = element('div', 'trow'); line.style.cursor = 'pointer'; line.onclick = () => openDetail(row);
      line.append(thumb(row), element('span', '', label(row)), element('b', 'num', `클릭 ${stats.clicks}${stats.orders ? ` · 주문 ${stats.orders} · ${won(stats.commission)}` : ''}`)); return line;
    }) : [emptyBox('상품 주소에서 번호를 찾지 못했어요')]);
    const ids = new Set(rows.map(productId).filter(Boolean));
    const orders = [...(report.reports.orders || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    paged('recentOrders', orders.length ? orders.map(item => {
      const line = element('div', 'trow'); const text = element('span', 'order-name', String(item.productName || '상품'));
      if (ids.has(String(item.ctag))) text.prepend(element('span', 'chip done', 'HIKARY'));
      line.append(element('b', '', tick(String(item.date))), text, element('b', 'num', won(Number(item.commission) || 0))); return line;
    }) : [emptyBox('최근 30일 주문이 없어요')]);
  }

  // ── 대시보드: the ledger plus the Coupang report. Post views come later (Buffer metrics were still 0 on 2026-11-11).
  function renderDashboard() {
    renderCoupang();
    $('statContents').textContent = new Set(rows.map(row => row.sourceUrl || row.productName)).size;
    $('statPosted').textContent = rows.reduce((sum, row) => sum + posted(row), 0);
    const week = rows.reduce((sum, row) => sum + recent(row), 0); $('statWeek').textContent = week ? `+${week}` : '0';
    const latest = rows.filter(lastPosted).sort((a, b) => lastPosted(b).localeCompare(lastPosted(a)))[0];
    if (!latest) $('latest').replaceChildren(emptyBox('아직 올린 게시물이 없어요.'));
    else {
      // Studio card: the vertical cover on a blurred copy of itself, the title over it. Rows from before covers show the inpock image.
      const nodes = []; const cover = coverUrl(latest.coverUrl); const src = imageUrl(latest.inpockImage);
      if (cover) {
        const hero = element('div', 'latest-hero'); hero.onclick = event => { if (!event.target.closest('a')) openDetail(latest); };
        const back = element('img', 'bg'); back.src = coverSmall(cover); back.alt = '';
        const front = element('img', 'fg'); front.src = coverSmall(cover); front.alt = '커버';
        const file = element('a', 'cover-dl'); file.href = coverFile(cover, latest); file.download = ''; file.title = '커버 저장'; file.setAttribute('aria-label', '커버 저장');
        file.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>';
        hero.append(back, front, element('p', 'over', label(latest)), file); nodes.push(hero);
      } else {
        if (src) { const img = element('img', 'latest-img'); img.src = src; img.alt = ''; img.onclick = () => openDetail(latest); nodes.push(img); }
        nodes.push(element('p', 'latest-title', label(latest)));
      }
      nodes.push(element('p', 'latest-meta', `${shortDate(lastPosted(latest))} 게시 · ${latest.category}`));
      for (const [key, name] of PLATFORMS) {
        const line = element('div', 'prow'); const status = latest[key + 'Status'] || '미업로드';
        line.append(placeIcon(latest, key, name), element('span', '', name), element('span', 'st', status === '업로드완료' ? shortDate(latest[key + 'Date']) || '올라감' : status === '미업로드' ? '아직' : status));
        if (https(latest[key + 'Link'])) line.append(Object.assign(link('↗', latest[key + 'Link'], 'ibtn'), { title: '게시물 열기' }));
        nodes.push(line);
      }
      $('latest').replaceChildren(...nodes);
    }
    paged('todo', todoItems());
    // Scheduled places in the next 7 days, one line per product and time.
    const soon = new Map();
    for (const row of rows) for (const [key] of PUBLISH) {
      const at = row[key + 'Date']; if (row[key + 'Status'] !== '예약됨' || !at) continue;
      const due = new Date(at.replace(' ', 'T')); if (due - Date.now() > 7 * 864e5) continue;
      const id = row.id + at; if (!soon.has(id)) soon.set(id, { row, at, keys: [] }); soon.get(id).keys.push(key);
    }
    const lines = [...soon.values()].sort((a, b) => a.at.localeCompare(b.at)).map(({ row, at, keys }) => {
      const line = element('div', 'trow'); line.append(element('b', '', shortDate(at)), element('span', '', label(row)));
      const marks = element('span', 'pfs'); marks.style.marginLeft = 'auto';
      for (const key of keys) marks.append(placeIcon(row, key, PLATFORMS.find(([name]) => name === key)[1]));
      line.append(marks); line.style.cursor = 'pointer'; line.onclick = () => openDetail(row); return line;
    });
    paged('upcoming', lines.length ? lines : [emptyBox('이번 주 예약이 없어요', '「콘텐츠」에서 「게시」로 예약을 걸어요')]);
  }
  function todoItems() {
    const items = [];
    const add = (text, action) => { const line = element('div', 'trow'); line.append(element('span', '', text)); if (action) line.append(action); items.push(line); };
    for (const row of rows) {
      const no = row.inpockNo ? `No.${row.inpockNo}` : row.productName;
      for (const [key, name] of PUBLISH) if (row[key + 'Status'] === '오류') add(`${no} ${name} 게시 오류`, button('보기', () => openDetail(row, key)));
      const videoUp = PUBLISH.some(([key]) => row[key + 'Status'] === '업로드완료');
      if (videoUp && (row.carouselStatus || '미업로드') === '미업로드') add(`${no} 인스타 캐러셀 올리기`, button('기록', () => openDetail(row, 'carousel')));
      const reel = row.instagramStatus === '업로드완료' && row.instagramDate && Date.now() - new Date(row.instagramDate.replace(' ', 'T')) < 2 * 864e5;
      if (reel && row.kittyKeyword) add(`${no} 키티챗 연결 · ${row.kittyKeyword}`, link('키티챗 ↗', 'https://kittychat.ai', 'btn sm'));
      if (openToPublish(row) && !row.videoUrl && !PUBLISH.some(([key]) => ['업로드완료', '예약됨'].includes(row[key + 'Status']))) add(`${no} 게시할 영상 없음 — 루미에게 「영상 올려줘」`);
    }
    const waiting = openRequests().length;
    if (waiting) add(`보낸 요청 ${waiting}개 — Claude에서 「요청 확인해줘」`, button('보기', () => { go('content'); setFilter('요청'); }));
    if (!items.length) items.push(element('div', 'trow ok-line', '할 일이 없어요'));
    return items;
  }

  // Save sends the whole row back with its revision, so upload records are kept and a newer sheet edit is not overwritten.
  async function save(changes, done) {
    const payload = { ...current, ...changes }; delete payload.createdAt;
    await HikaryApi.request('save', payload); await load(); notice(done);
  }

  // ── ✎ 세부정보 (v3.0.0): tabs on the left, Studio-style panel on the right with the per-place upload record.
  let detailTab = 'product';
  let focusPlace = '';
  let openRecord = '';
  function showTab(tab) {
    detailTab = tab;
    for (const node of $('detailTabs').children) { const on = node.dataset.tab === tab; node.classList.toggle('on', on); node.setAttribute('aria-selected', on); }
    for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
  }
  for (const node of document.querySelectorAll('h3.sec .pf')) node.innerHTML = svgMark(node.classList[1]);
  for (const node of $('detailTabs').children) node.onclick = () => { showTab(node.dataset.tab); $('detailDialog').querySelector('.dialog-body').scrollTop = 0; };
  // A required field on a hidden tab cannot show its message, so open that tab first.
  $('detailForm').addEventListener('invalid', event => { const panel = event.target.closest('[data-panel]'); if (panel?.hidden) showTab(panel.dataset.panel); }, true);
  const titleCount = () => { $('d-youtubeCount').textContent = `${$('d-youtubeTitle').value.length} / 100`; };
  function openDetail(row, place = '') {
    current = row; dirty = false; focusPlace = place; openRecord = place === 'carousel' && (row.carouselStatus || '미업로드') === '미업로드' ? 'carousel' : '';
    showTab(place && place !== 'carousel' ? 'sns' : detailTab);
    for (const key of TEXT_KEYS) $('d-' + key).value = row[key] || '';
    [$('d-youtubeTitle').value, $('d-youtubeBody').value] = splitYoutube(row.youtube); titleCount();
    $('detailTitle').textContent = label(row);
    $('detailMeta').textContent = `콘텐츠 세부정보 · ${row.createdAt} 등록 · ${row.category}${row.format ? ' · ' + row.format : ''}`;
    renderSide();
    $('detailDialog').showModal(); $('detailDialog').querySelector('.dialog-body').scrollTop = 0;
  }
  function renderSide() {
    const row = current; const image = imageUrl(row.inpockImage); const cover = coverUrl(row.coverUrl);
    $('d-coverImage').hidden = $('d-coverSave').hidden = !cover;
    if (cover) { $('d-coverImage').src = coverSmall(cover); $('d-coverSave').href = coverFile(cover, row); } else $('d-coverImage').removeAttribute('src');
    $('d-coverNote').textContent = cover ? '원본 그대로 내려받아요. 앱에서 커버로 넣을 때 써요.' : '아직 없어요 · 루미에게 「커버 올려줘」';
    $('d-inpockFigure').hidden = !image; $('d-inpockNone').hidden = !!image;
    $('d-inpockImage').src = image; $('d-inpockSave').href = image || '#';
    $('d-inpockSave').download = `inpock-${row.inpockNo || 'image'}.${image.startsWith('data:image/png') ? 'png' : 'jpg'}`;
    $('sideNo').textContent = row.inpockNo ? `No.${row.inpockNo}` : '—'; $('sideTitle').textContent = row.inpockTitle || '';
    $('sidePage').textContent = https(row.sourceUrl) ? row.sourceUrl.replace(/^https:\/\//, '') : '—'; $('sidePage').href = https(row.sourceUrl) ? row.sourceUrl : '#';
    $('sideAffiliate').textContent = row.affiliateUrl || '—';
    $('sidePublish').hidden = !openToPublish(row);
    $('places').replaceChildren(...PLATFORMS.flatMap(([key, name]) => placeRow(row, key, name)));
    const allUp = PUBLISH.every(([key]) => settledPlace(row[key + 'Status']));
    $('detailVideo').textContent = row.videoUrl ? `게시할 영상 있음 · ${row.videoDate} 올림` : allUp ? '영상은 다 올라가서 지웠어요' : '게시할 영상 없음 — 루미에게 「영상 올려줘」';
  }
  function placeRow(row, key, name) {
    const status = row[key + 'Status'] || '미업로드'; const date = row[key + 'Date'] || '';
    const line = element('div', `place-row${focusPlace === key ? ' focus' : ''}`);
    line.append(placeIcon(row, key, name), element('span', '', name));
    const tone = { 업로드완료: 'ok', 예약됨: 'sched', 오류: 'err' }[status] || '';
    line.append(element('span', `st ${tone}`, status === '업로드완료' ? `● ${shortDate(date) || '올라감'}` : status === '예약됨' ? `예약 ${shortDate(date)}` : status === '미업로드' ? '아직' : status));
    if (https(row[key + 'Link'])) line.append(Object.assign(link('↗', row[key + 'Link'], 'ibtn'), { title: '게시물 열기' }));
    // 「예약됨」 belongs to Buffer and the 10-minute result check; editing it by hand would stop that check.
    if (status !== '예약됨') line.append(button(openRecord === key ? '닫기' : status === '업로드완료' ? '수정' : '기록', () => { openRecord = openRecord === key ? '' : key; renderSide(); }));
    const nodes = [line];
    const error = errorFor(row, key); if (status === '오류' && error) nodes.push(element('div', 'place-err', error));
    if (openRecord === key) nodes.push(recordBox(row, key));
    return nodes;
  }
  // v2.4.0: the date cell may carry a time — 「2026-11-10」 or 「2026-11-10 19:30」.
  function recordBox(row, key) {
    const box = element('div', 'record'); box.dataset.record = key;
    const [day = '', hour = ''] = (row[key + 'Date'] || '').split(' ');
    const date = Object.assign(document.createElement('input'), { type: 'date', value: day }); date.setAttribute('aria-label', '올린 날');
    const time = Object.assign(document.createElement('input'), { type: 'time', value: hour }); time.setAttribute('aria-label', '올린 시간');
    const url = Object.assign(document.createElement('input'), { type: 'url', value: row[key + 'Link'] || '', placeholder: '게시물 링크 https://', maxLength: 2000 });
    for (const input of [date, time, url]) input.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
    const two = element('div', 'two'); two.append(date, time);
    const left = element('span'); left.style.cssText = 'display:flex;gap:6px';
    left.append(button('보류', () => saveRecord(key, '보류', '', '')));
    if ((row[key + 'Status'] || '미업로드') !== '미업로드') left.append(button('지우기', () => { if (confirm('이 기록의 업로드 여부·날짜·링크를 지울까요?')) saveRecord(key, '미업로드', '', ''); }));
    const actions = element('div', 'acts'); actions.append(left, button('올림으로 기록', () => {
      const post = url.value.trim(); if (post && !https(post)) { alert('게시물 링크는 https 주소로 넣어주세요.'); return; }
      // Both boxes empty → now. A date without a time stays a date.
      const now = new Date(); let when = date.value; let at = time.value;
      if (!when) { when = now.toLocaleDateString('sv-SE'); if (!at) at = now.toTimeString().slice(0, 5); }
      saveRecord(key, '업로드완료', when + (at ? ' ' + at : ''), post);
    }, 'btn sm white'));
    box.append(two, url, actions); return box;
  }
  function saveRecord(key, status, when, post) {
    if (dirty) { alert('고친 글을 먼저 「저장」해 주세요. 그다음 기록을 남길 수 있어요.'); return; }
    void task(async () => {
      await save({ [key + 'Status']: status, [key + 'Date']: when, [key + 'Link']: post }, '업로드 기록을 저장했어요.');
      current = rows.find(row => row.id === current.id) || current; openRecord = ''; renderSide();
    });
  }
  function closeDetail() { if (!dirty || confirm('고친 내용을 저장하지 않고 닫을까요?')) { dirty = false; $('detailDialog').close(); } }
  $('detailForm').oninput = event => { if (event.target.closest('[data-record]')) return; dirty = true; if (event.target.id === 'd-youtubeTitle') titleCount(); };
  $('detailClose').onclick = $('detailCancel').onclick = closeDetail;
  $('detailDialog').addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
  $('detailForm').onsubmit = event => {
    event.preventDefault();
    const changes = Object.fromEntries(TEXT_KEYS.map(key => [key, $('d-' + key).value.trim()]));
    changes.youtube = joinYoutube($('d-youtubeTitle').value.replace(/\s+/g, ' ').trim(), $('d-youtubeBody').value.trim()); // the title is one line
    void task(async () => { await save(changes, '저장했어요.'); dirty = false; $('detailDialog').close(); });
  };
  $('detailDelete').onclick = () => {
    if (!confirm(`「${current.productName}」을(를) 지울까요?\n운영대장에서 이 줄이 삭제됩니다. 실수로 지웠다면 시트의 버전 기록에서 되살릴 수 있어요.`)) return;
    void task(async () => { await HikaryApi.request('delete', { id: current.id, revision: current.revision }); dirty = false; $('detailDialog').close(); await load(); notice('지웠어요.'); });
  };
  $('sidePublish').onclick = () => { if (dirty) { alert('고친 글을 먼저 「저장」해 주세요. 게시는 운영대장 글 그대로 올라가요.'); return; } openPublish(current); };
  for (const node of document.querySelectorAll('[data-copy]')) node.onclick = async () => {
    const text = node.dataset.label ||= node.textContent;
    try { await navigator.clipboard.writeText($(node.dataset.copy).value); node.textContent = node.classList.contains('ibtn') ? '✓' : '복사됨 ✓'; setTimeout(() => { node.textContent = text; }, 1500); }
    catch { alert('복사하지 못했어요. 글을 직접 선택해 복사해주세요.'); }
  };

  // ── v2.8.0 「게시」: pick a time and the places, type the publish code (never kept), and the server schedules each place in Buffer.
  const PLACE_NOTES = { youtube: '제목·설명은 운영대장 글 그대로', instagram: '피드에도 공유 · 커버는 3초 장면', tiktok: '커버는 3초 장면' };
  const monthDay = date => `${date.getMonth() + 1}월 ${date.getDate()}일`;
  function countPlaces() {
    const count = $('publishPlaces').querySelectorAll('input:checked').length;
    $('publishSubmit').textContent = count ? `${count}곳 예약하기` : '예약하기';
    $('publishSubmit').disabled = !count || !current.videoUrl;
  }
  function openPublish(row, preset) {
    current = row; $('publishTarget').textContent = label(row);
    $('publishNo').textContent = row.inpockNo ? `No.${row.inpockNo}` : '이 상품 번호';
    const video = $('publishVideo');
    if (row.videoUrl) {
      const until = new Date(new Date(row.videoDate.replace(' ', 'T')).getTime() + 30 * 864e5);
      video.className = 'video-box ok'; video.textContent = `영상 준비됨 · ${row.videoDate} 올림 · ${isNaN(until) ? '30일' : monthDay(until)}까지 보관 (그 전에 게시돼야 해요)`;
    } else { video.className = 'video-box none'; video.textContent = `게시할 영상이 아직 없어요. 루미에게 「No.${row.inpockNo || '○○○'} 영상 올려줘」라고 해 주세요.`; }
    // Default: the next full hour at least 30 minutes away. From the calendar: that day at 08:45, unless that time has passed.
    const at = new Date(Date.now() + 90 * 60000); at.setMinutes(0, 0, 0);
    const chosen = preset && new Date(`${preset.date}T${preset.time}`);
    const usePreset = chosen && chosen > Date.now() + 2 * 60000;
    $('publishDate').value = usePreset ? preset.date : at.toLocaleDateString('sv-SE'); $('publishTime').value = usePreset ? preset.time : at.toTimeString().slice(0, 5); $('publishCode').value = '';
    $('publishPlaces').replaceChildren(...PUBLISH.map(([key, name]) => {
      const status = row[key + 'Status'] || '미업로드'; const when = row[key + 'Date'] || '';
      const place = element('label', 'place'); const box = document.createElement('input'); box.type = 'checkbox'; box.value = key;
      box.checked = ['미업로드', '오류'].includes(status); box.disabled = ['업로드완료', '예약됨'].includes(status); box.onchange = countPlaces;
      const note = { 업로드완료: `올라감 ${when}`, 예약됨: `예약됨 ${when}`, 오류: '지난번 오류 — 다시 걸기', 보류: '보류해 둔 곳' }[status] || PLACE_NOTES[key];
      place.classList.toggle('off', box.disabled); place.append(box, element('span', '', name), element('small', '', note)); return place;
    }), Object.assign(element('div', 'place off'), { textContent: '인스타 캐러셀' }));
    $('publishPlaces').lastChild.append(element('small', '', '아직 직접 올려요'));
    countPlaces(); $('publishDialog').showModal(); $('publishDialog').querySelector('.dialog-body').scrollTop = 0;
  }
  $('publishClose').onclick = $('publishCancel').onclick = () => $('publishDialog').close();
  $('publishForm').onsubmit = event => {
    event.preventDefault();
    const due = new Date(`${$('publishDate').value}T${$('publishTime').value}`);
    if (isNaN(due) || due < Date.now() + 2 * 60000) { alert('예약 시간은 지금부터 2분 뒤 이후로 골라주세요.'); return; }
    const platforms = [...$('publishPlaces').querySelectorAll('input:checked')].map(box => box.value);
    const code = $('publishCode').value;
    void task(async () => {
      const result = await HikaryApi.request('publish', { id: current.id, revision: current.revision, dueAt: due.toISOString(), platforms, code });
      $('publishCode').value = ''; $('publishDialog').close(); await load();
      if ($('detailDialog').open) { current = rows.find(row => row.id === current.id) || current; renderSide(); }
      const name = key => PUBLISH.find(([place]) => place === key)[1];
      const ok = platforms.filter(key => result.results[key]?.ok).map(name); const failed = platforms.filter(key => !result.results[key]?.ok);
      const text = [ok.length ? `${ok.join('·')} 예약했어요 (${$('publishDate').value} ${$('publishTime').value}).` : '', ...failed.map(key => `${name(key)}: ${result.results[key]?.error || '예약하지 못했어요.'}`)].filter(Boolean).join('\n');
      if ($('detailDialog').open) alert(text); else notice(text, failed.length > 0);
    }).then(() => { // task() re-enables every control; places already up or scheduled stay locked
      if (!$('publishDialog').open) return;
      for (const box of $('publishPlaces').querySelectorAll('input')) box.disabled = box.closest('.place').classList.contains('off');
      countPlaces();
    });
  };

  // ── 소재 찾기 (v2.1.0 finder). Lists load only on a click: every real Coupang call spends from one hourly budget.
  let coupang = { configured: false, usage: null, categories: [] };
  const hhmm = iso => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  function showQuota() {
    const usage = coupang.usage;
    if (!coupang.configured || !usage) {
      $('quotaLeft').textContent = '키 없음'; $('quotaBar').style.width = '0%';
      $('quotaHint').textContent = 'Apps Script 스크립트 속성에 COUPANG_ACCESS_KEY·COUPANG_SECRET_KEY를 넣으면 쓸 수 있어요.'; return;
    }
    $('quotaLeft').textContent = `${usage.remaining} / ${usage.limit}`;
    $('quotaBar').style.width = `${usage.remaining / usage.limit * 100}%`; $('quotaBar').classList.toggle('low', usage.remaining <= 5);
    $('quotaHint').textContent = `쿠팡은 한 시간에 30번 넘게 부르면 키가 멈춰서 ${usage.limit}번까지만 불러요. 불러온 목록은 6시간 저장해 두고 다시 써요.`
      + (usage.nextAt ? ` 다음 1회는 ${hhmm(usage.nextAt)}에 돌아와요.` : '');
  }
  function useStatus(status) {
    coupang = status.coupang || coupang; showQuota();
    if ($('finderSource').options.length || !coupang.categories.length) return;
    $('finderSource').append(new Option('오늘의 특가 (골드박스)', 'goldbox'));
    const group = document.createElement('optgroup'); group.label = '카테고리 베스트';
    for (const [id, name] of coupang.categories) group.append(new Option(name, 'best:' + id));
    $('finderSource').append(group); $('finderSource').value = 'best:1025';
  }
  function productCard(product, from) {
    const card = element('article', 'pick-card'); const image = element('div', 'pick-image'); const body = element('div', 'pick-body'); const actions = element('div', 'pick-actions');
    if (/^(https:|data:image\/)/.test(product.productImage)) { const img = document.createElement('img'); img.src = product.productImage; img.alt = ''; img.loading = 'lazy'; image.append(img); }
    const price = element('p', 'price', product.productPrice ? `${product.productPrice.toLocaleString('ko-KR')}원` : '');
    if (product.isRocket) price.append(element('span', 'rocket', '로켓'));
    // Open the plain product page, not the partners link: our own click on it would count as self-referral traffic.
    const page = `https://www.coupang.com/vp/products/${product.productId}`;
    const copy = button('Claude용 글 복사', async () => {
      try { await navigator.clipboard.writeText(`이 상품으로 만들어줘\n상품명: ${product.productName}\n상품 페이지: ${page}\n파트너스 링크: ${product.productUrl}\n(HIKARY 소재 찾기 · ${from})`); copy.textContent = '복사됨 ✓'; setTimeout(() => { copy.textContent = 'Claude용 글 복사'; }, 1500); }
      catch { alert('복사하지 못했어요. 상품 페이지 주소를 직접 복사해주세요.'); }
    });
    const asked = button('루미한테 요청하기', async () => { if (await ask({ productName: product.productName, sourceUrl: page, affiliateUrl: product.productUrl, from: `소재 찾기 · ${from}` })) { asked.textContent = '요청함 ✓'; asked.disabled = true; } }, 'btn sm primary');
    if (requests.some(item => item.sourceUrl === page && item.status !== '완료')) { asked.textContent = '요청함 ✓'; asked.disabled = true; }
    actions.append(link('상품 페이지 ↗', page, 'btn sm'), copy, asked);
    body.append(element('h3', '', product.productName), price, actions); card.append(image, body); return card;
  }
  async function findProducts(payload) {
    if (!coupang.configured) throw new Error('쿠팡 파트너스 API 키가 아직 없어요. 스크립트 속성에 넣은 뒤 새로고침해주세요.');
    let result;
    try { result = await HikaryApi.request('products', payload); }
    catch (error) { void HikaryApi.request('status').then(useStatus).catch(() => {}); throw error; } // a refused call may still have counted
    coupang.usage = result.usage; showQuota();
    $('finderMeta').textContent = `${result.label} · ${result.products.length}개 · ${hhmm(result.fetchedAt)}에 받아 온 목록${result.fromCache ? ' (저장된 목록이라 횟수를 쓰지 않았어요)' : ''} · 가격은 바뀔 수 있어요`;
    $('finderResults').replaceChildren(...result.products.map(product => productCard(product, result.label)));
    if (!result.products.length) $('finderResults').append(emptyBox('상품이 없어요.', '다른 카테고리나 검색어로 찾아보세요.'));
    notice('');
  }
  // v2.7.0: a pasted Coupang address → the owner's Partners link (server `link`: 1 API call, the same address is kept 6 hours).
  let made = null;
  $('linkForm').onsubmit = event => { event.preventDefault(); void task(async () => {
    let result;
    try { result = await HikaryApi.request('link', { url: $('linkUrl').value.trim() }); }
    catch (error) { void HikaryApi.request('status').then(useStatus).catch(() => {}); throw error; }
    coupang.usage = result.usage; showQuota(); made = result;
    $('linkOut').value = result.shortenUrl; $('linkPage').href = result.url; $('linkName').value = '';
    $('linkHint').textContent = result.fromCache ? '저장된 링크라 API 횟수를 쓰지 않았어요.' : 'API를 1번 썼어요. 같은 주소는 6시간 동안 다시 쓰지 않아요.';
    $('linkResult').hidden = false; $('linkAsk').textContent = '루미한테 요청하기'; notice('');
  }); };
  $('linkClaude').onclick = async () => {
    const name = $('linkName').value.trim();
    try { await navigator.clipboard.writeText(`이 상품으로 만들어줘\n${name ? `상품명: ${name}\n` : ''}상품 페이지: ${made.url}\n파트너스 링크: ${made.shortenUrl}\n(HIKARY 소재 찾기 · 주소로 만들기)`); $('linkClaude').textContent = '복사됨 ✓'; setTimeout(() => { $('linkClaude').textContent = 'Claude용 글 복사'; }, 1500); }
    catch { notice('복사하지 못했어요. 파트너스 링크 칸에서 직접 복사해주세요.', true); }
  };
  $('linkAsk').onclick = async () => { if (await ask({ productName: $('linkName').value.trim(), sourceUrl: made.url, affiliateUrl: made.shortenUrl, from: '주소로 만들기' })) $('linkAsk').textContent = '요청함 ✓'; };
  // v2.7.0: 「루미한테 요청하기」 leaves the product in the sheet tab 「요청」 (server 2.5.0). The page cannot wake a Claude chat,
  // so the owner tells Claude 「요청 확인해줘」 and it reads them with tools/register.mjs requests. They show on top of 「콘텐츠」.
  async function ask(payload) {
    let sent = false;
    await task(async () => {
      const result = await HikaryApi.request('request', { id: crypto.randomUUID(), ...payload });
      await loadRequests(); sent = true;
      notice(result.duplicate ? '이미 보낸 요청이에요. Claude에서 루미한테 「요청 확인해줘」라고 해 주세요.' : '루미한테 보냈어요. 「콘텐츠」 맨 위에 보이고, Claude에서 「요청 확인해줘」라고 하면 시작해요.');
    });
    return sent;
  }
  $('finderLoad').onclick = () => { const [source, categoryId] = $('finderSource').value.split(':'); void task(() => findProducts({ source, categoryId: Number(categoryId) || undefined })); };
  $('finderSearch').onsubmit = event => { event.preventDefault(); void task(() => findProducts({ source: 'search', keyword: $('finderKeyword').value.trim() })); };

  // ── frame: views by hash, ☰ (drawer on a phone, hide the menu on a wide screen), profile menu.
  const VIEWS = ['dashboard', 'content', 'find'];
  function go(next) {
    view = VIEWS.includes(next) ? next : next === 'finder' ? 'find' : 'dashboard'; // #finder from v2 bookmarks
    for (const name of VIEWS) $(name + 'View').hidden = name !== view;
    for (const node of document.querySelectorAll('[data-view]')) node.classList.toggle('on', node.dataset.view === view);
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    closeDrawer();
    if (view === 'find' && !busy && HikaryApi.hasSession()) HikaryApi.request('status').then(useStatus).catch(() => {}); // the hourly count frees up over time
  }
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  const narrow = () => matchMedia('(max-width:860px)').matches;
  function closeDrawer() { document.body.classList.remove('drawer'); $('scrim').hidden = true; }
  $('menuButton').onclick = () => {
    if (!narrow()) { document.body.classList.toggle('noside'); return; }
    const open = !document.body.classList.contains('drawer'); document.body.classList.toggle('drawer', open); $('scrim').hidden = !open;
  };
  $('scrim').onclick = closeDrawer;
  $('accountButton').onclick = () => { const open = $('accountMenu').hidden; $('accountMenu').hidden = !open; $('accountButton').setAttribute('aria-expanded', open); };
  document.addEventListener('click', event => { if (!event.target.closest('.account')) { $('accountMenu').hidden = true; $('accountButton').setAttribute('aria-expanded', false); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('accountMenu').hidden = true; closeDrawer(); } });

  // ── v2.9.0 login (server 2.7.0). Every call needs the session, so without one the page shows only the login screen.
  function showLogin(message = '', error = true) {
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    $('accountMenu').hidden = true; notice('');
    $('loginMessage').hidden = !message; $('loginMessage').textContent = message; $('loginMessage').classList.toggle('info', !error);
    $('loginView').hidden = false; document.body.classList.add('locked');
    setTimeout(() => $($('loginId').value ? 'loginPassword' : 'loginId').focus(), 0);
  }
  // A request refused for the session (logged out elsewhere, 90 days unused) lands here from HikaryApi.
  window.addEventListener('hikary-login', () => { if ($('loginView').hidden) showLogin('로그인이 끝났어요. 다시 로그인해주세요.'); });
  async function start() {
    try { const status = await HikaryApi.request('status'); $('connectionState').textContent = `연결됨 · 서버 ${status.version}`; $('connectionState').classList.add('ok'); useStatus(status); }
    catch (error) { if (error.auth) return; $('connectionState').textContent = '서버 연결 실패'; throw error; }
    await load(); await loadRequests().catch(() => {}); notice('');
    void loadReport(); // fills the Coupang cards when it comes back; the page does not wait for it
  }
  $('loginForm').onsubmit = event => {
    event.preventDefault();
    void task(async () => {
      try { await HikaryApi.login($('loginId').value.trim(), $('loginPassword').value, $('loginKeep').checked); }
      catch (error) { $('loginMessage').hidden = false; $('loginMessage').classList.remove('info'); $('loginMessage').textContent = error.message; return; }
      $('loginPassword').value = ''; $('loginView').hidden = true; document.body.classList.remove('locked');
      await start();
    });
  };
  function signOut(all) {
    $('accountMenu').hidden = true;
    if (all && !confirm('휴대폰·다른 PC에 남은 로그인도 모두 끝낼까요?')) return;
    void task(async () => {
      try { await HikaryApi.logout(all); }
      finally { rows = []; requests = []; render(); showLogin(all ? '모든 기기에서 로그아웃했어요.' : '로그아웃했어요.', false); }
    });
  }
  $('logoutHere').onclick = () => signOut(false);
  $('logoutAll').onclick = () => signOut(true);

  go(location.hash.slice(1));
  setMode(mode);
  if (HikaryApi.hasSession()) void task(start); else showLogin();
})();
