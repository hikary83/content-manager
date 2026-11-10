(() => {
  'use strict';
  // v2.0.0: content is made in Claude and registered to the ledger. This page lists it, edits or deletes it, and records uploads.
  // v2.1.0: a second tab finds Coupang products to make next (Partners API through the server).
  // v2.2.0: one row per product. Four uploads (YouTube shorts, Instagram reel and carousel, TikTok) and the Inpock link fields.
  const $ = id => document.getElementById(id);
  const PLATFORMS = [['youtube', 'YouTube 쇼츠'], ['instagram', '인스타 릴스'], ['carousel', '인스타 캐러셀'], ['tiktok', 'TikTok']];
  // v2.5.0: a platform chip opens one dialog with that place's post text (copy) above its upload record.
  // v2.3.0: KittyChat keyword/DM and the Inpock thumbnail. Card news text is no longer shown (old cells are kept as they are).
  const TEXT_KEYS = ['productName', 'category', 'sourceUrl', 'affiliateUrl', 'inpockNo', 'inpockTitle', 'script', 'instagram', 'kittyKeyword', 'kittyDm', 'tiktok', 'notes'];
  const imageUrl = value => /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(value || '') ? value : '';
  // The ledger keeps one YouTube cell: first line 「제목: …」, a blank line, then the description.
  const splitYoutube = text => { const match = /^제목:[ \t]*(.*)(?:\r?\n([\s\S]*))?$/.exec(text || ''); return match ? [match[1].trim(), (match[2] || '').trim()] : ['', (text || '').trim()]; };
  const joinYoutube = (title, body) => title ? `제목: ${title}${body ? '\n\n' + body : ''}` : body;
  let rows = [];
  let busy = false;
  let filter = '전체';
  let current = null;
  let dirty = false;

  function notice(text, error = false) { $('notice').hidden = !text; $('notice').className = error ? 'error' : ''; $('notice').textContent = text; }
  const https = value => /^https:\/\//i.test(value || '');
  const posted = row => PLATFORMS.filter(([key]) => row[key + 'Status'] === '업로드완료').length;
  // v2.6.0: 「보류」 is a platform the owner chose to skip, so it counts as done for 「다 올림」.
  const settled = row => PLATFORMS.every(([key]) => ['업로드완료', '보류'].includes(row[key + 'Status']));
  // Uploads dated (「2026-11-10」 or 「2026-11-10 08:45」) within the last 7 days — the summary shows growth, not what is left.
  const recent = row => PLATFORMS.filter(([key]) => row[key + 'Status'] === '업로드완료' && row[key + 'Date'] && Date.now() - new Date(row[key + 'Date'].replace(' ', 'T')) < 7 * 864e5).length;
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

  async function load() { rows = (await HikaryApi.request('list')).entries; render(); }
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, onclick, className = 'ghost small') { const node = element('button', className, text); node.type = 'button'; node.onclick = onclick; return node; }
  function link(text, href, className) { const node = element('a', className, text); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node; }

  // One card per product (same original link). Rows made before v2.2.0 (one per format) still show as extra lines.
  function render() {
    const all = settled;
    $('statContents').textContent = new Set(rows.map(row => row.sourceUrl || row.productName)).size;
    $('statPosted').textContent = rows.reduce((sum, row) => sum + posted(row), 0);
    const week = rows.reduce((sum, row) => sum + recent(row), 0);
    $('statWeek').textContent = week ? `+${week}` : '0';
    const query = $('search').value.trim().toLowerCase();
    const shown = rows.filter(row => `${row.productName} ${row.category} No.${row.inpockNo}`.toLowerCase().includes(query)
      && (filter === '전체' || (filter === '다 올림' ? all(row) : !all(row))));
    const groups = new Map();
    for (const row of shown) { const key = row.sourceUrl || row.productName; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
    $('entries').replaceChildren();
    if (!shown.length) {
      const empty = element('div', 'empty');
      empty.append(element('strong', '', rows.length ? '조건에 맞는 콘텐츠가 없어요.' : '아직 등록된 콘텐츠가 없어요.'), element('span', '', rows.length ? '검색어나 보기 조건을 바꿔보세요.' : 'Claude에서 만든 뒤 「등록해줘」라고 하면 여기에 쌓여요.'));
      $('entries').append(empty);
    }
    for (const items of groups.values()) {
      const card = element('article', 'product'); const head = element('div', 'product-head'); const title = element('div');
      const no = items.map(row => row.inpockNo).find(Boolean);
      title.append(element('h3', '', items[0].productName), element('small', '', `${items[0].category}${no ? ` · 인포크 No.${no}` : ''}`));
      head.append(title); if (https(items[0].sourceUrl)) head.append(link('상품 페이지 ↗', items[0].sourceUrl, 'ghost small'));
      card.append(head);
      for (const row of items) {
        const line = element('div', 'content-line'); const info = element('div', 'info'); const chips = element('div', 'chips'); const actions = element('div', 'line-actions');
        if (row.format) info.append(element('span', row.format === '캐러셀' ? 'pill carousel' : 'pill', row.format)); // pre-v2.2.0 rows only
        info.append(element('span', 'date', row.createdAt));
        for (const [key, label] of PLATFORMS) {
          const status = row[key + 'Status'] || '미업로드'; const state = status === '업로드완료' ? 'done' : status === '보류' ? 'hold' : '';
          const text = `${label} ${state === 'done' ? (row[key + 'Date'] ? row[key + 'Date'].slice(5).replace('-', '.') : '완료') : state === 'hold' ? '보류' : '—'}`;
          chips.append(button(text, () => openUpload(row, key), `chip ${state}`)); // v2.5.0: post text + upload record in one dialog
        }
        actions.append(button('보기·수정', () => openDetail(row)));
        line.append(info, chips, actions); card.append(line);
      }
      $('entries').append(card);
    }
  }
  $('search').oninput = render;
  for (const node of $('filters').children) node.onclick = () => { filter = node.dataset.filter; for (const other of $('filters').children) other.classList.toggle('on', other === node); render(); };
  $('refresh').onclick = () => void task(async () => { await load(); notice(`${rows.length}건을 불러왔어요.`); });

  // Save sends the whole row back with its revision, so upload records are kept and a newer sheet edit is not overwritten.
  async function save(changes, done) {
    const payload = { ...current, ...changes }; delete payload.createdAt;
    await HikaryApi.request('save', payload); await load(); notice(done);
  }

  // v2.3.1: the detail dialog is split into tabs. The last tab stays open for the next product.
  let detailTab = 'product';
  function showTab(tab) {
    detailTab = tab;
    for (const node of $('detailTabs').children) { const on = node.dataset.tab === tab; node.classList.toggle('on', on); node.setAttribute('aria-selected', on); }
    for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
  }
  for (const node of $('detailTabs').children) node.onclick = () => { showTab(node.dataset.tab); $('detailDialog').querySelector('.dialog-body').scrollTop = 0; };
  // A required field on a hidden tab cannot show its message, so open that tab first.
  $('detailForm').addEventListener('invalid', event => { const panel = event.target.closest('[data-panel]'); if (panel?.hidden) showTab(panel.dataset.panel); }, true);

  function openDetail(row) {
    current = row; dirty = false; showTab(detailTab);
    for (const key of TEXT_KEYS) $('d-' + key).value = row[key] || '';
    [$('d-youtubeTitle').value, $('d-youtubeBody').value] = splitYoutube(row.youtube);
    const image = imageUrl(row.inpockImage);
    $('d-inpockFigure').hidden = !image; $('d-inpockNone').hidden = !!image;
    $('d-inpockImage').src = image; $('d-inpockSave').href = image || '#';
    $('d-inpockSave').download = `inpock-${row.inpockNo || 'image'}.${image.startsWith('data:image/png') ? 'png' : 'jpg'}`;
    $('detailMeta').textContent = `${row.format ? row.format + ' · ' : ''}${row.createdAt} 등록`;
    $('detailDialog').showModal(); $('detailDialog').querySelector('.dialog-body').scrollTop = 0;
  }
  function closeDetail() { if (!dirty || confirm('고친 내용을 저장하지 않고 닫을까요?')) { dirty = false; $('detailDialog').close(); } }
  $('detailForm').oninput = () => { dirty = true; };
  $('detailClose').onclick = closeDetail;
  $('detailDialog').addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
  $('detailForm').onsubmit = event => {
    event.preventDefault();
    const changes = Object.fromEntries(TEXT_KEYS.map(key => [key, $('d-' + key).value.trim()]));
    changes.youtube = joinYoutube($('d-youtubeTitle').value.replace(/\s+/g, ' ').trim(), $('d-youtubeBody').value.trim()); // the title is one line
    void task(async () => { await save(changes, '저장했어요.'); dirty = false; $('detailDialog').close(); });
  };
  $('detailDelete').onclick = () => {
    if (!confirm(`「${current.productName}」${current.format ? ' ' + current.format : ''}을(를) 지울까요?\n운영대장에서 이 줄이 삭제됩니다. 실수로 지웠다면 시트의 버전 기록에서 되살릴 수 있어요.`)) return;
    void task(async () => { await HikaryApi.request('delete', { id: current.id, revision: current.revision }); dirty = false; $('detailDialog').close(); await load(); notice('지웠어요.'); });
  };
  for (const node of document.querySelectorAll('[data-copy]')) node.onclick = async () => {
    const label = node.dataset.label ||= node.textContent;
    try { await navigator.clipboard.writeText($(node.dataset.copy).value); node.textContent = '복사됨 ✓'; setTimeout(() => { node.textContent = label; }, 1500); }
    catch { alert('복사하지 못했어요. 글을 직접 선택해 복사해주세요.'); }
  };

  const platform = () => document.querySelector('[name=platform]:checked').value;
  // v2.4.0: the date cell may carry a time — 「2026-11-10」 or 「2026-11-10 19:30」.
  function fillUpload() {
    const key = platform(); const [date = '', time = ''] = (current[key + 'Date'] || '').split(' ');
    $('uploadStatus').value = current[key + 'Status'] || '미업로드'; $('uploadDate').value = date; $('uploadTime').value = time; $('uploadLink').value = current[key + 'Link'] || '';
    // v2.5.0: the post text for this place sits above its record. Reels and carousel share the Instagram text.
    for (const node of $('uploadDialog').querySelectorAll('[data-show]')) node.hidden = !node.dataset.show.split(' ').includes(key);
    $('uploadNoPost').hidden = !!current[{ youtube: 'youtube', tiktok: 'tiktok' }[key] || 'instagram'];
    const post = current[key + 'Link']; $('uploadOpen').hidden = !https(post); $('uploadOpen').href = https(post) ? post : '#';
  }
  function openUpload(row, key) {
    current = row; $('uploadTarget').textContent = `${row.productName}${row.inpockNo ? ' · No.' + row.inpockNo : ''}`;
    [$('u-youtubeTitle').value, $('u-youtubeBody').value] = splitYoutube(row.youtube);
    for (const name of ['instagram', 'kittyKeyword', 'kittyDm', 'tiktok']) $('u-' + name).value = row[name] || '';
    // Open on the chip that was clicked, else on the first place not uploaded yet.
    const first = key || (PLATFORMS.find(([name]) => row[name + 'Status'] !== '업로드완료') || PLATFORMS[0])[0];
    for (const radio of document.getElementsByName('platform')) {
      radio.checked = radio.value === first;
      radio.nextElementSibling.className = { 업로드완료: 'done', 보류: 'hold' }[row[radio.value + 'Status']] || '';
    }
    fillUpload(); $('uploadDialog').showModal(); $('uploadDialog').querySelector('.dialog-body').scrollTop = 0;
  }
  for (const radio of document.getElementsByName('platform')) radio.onchange = fillUpload;
  $('uploadClose').onclick = () => $('uploadDialog').close();
  $('uploadForm').onsubmit = event => {
    event.preventDefault();
    const key = platform(); const link = $('uploadLink').value.trim(); const status = link ? '업로드완료' : $('uploadStatus').value;
    // Uploaded with both boxes empty → now. A time without a date → today. A date without a time stays a date.
    const now = new Date(); let date = $('uploadDate').value, time = $('uploadTime').value;
    if (!date && (time || status === '업로드완료')) { date = now.toLocaleDateString('sv-SE'); if (!time && status === '업로드완료') time = now.toTimeString().slice(0, 5); }
    const when = date ? date + (time ? ' ' + time : '') : '';
    void task(async () => { await save({ [key + 'Status']: status, [key + 'Date']: when, [key + 'Link']: link }, '업로드 기록을 저장했어요.'); $('uploadDialog').close(); });
  };
  $('uploadClear').onclick = () => {
    const key = platform();
    if (!confirm('이 기록의 업로드 여부·날짜·링크를 지울까요?')) return;
    void task(async () => { await save({ [key + 'Status']: '미업로드', [key + 'Date']: '', [key + 'Link']: '' }, '업로드 기록을 지웠어요.'); $('uploadDialog').close(); });
  };

  // v2.1.0 product finder. Lists load only on a click: every real Coupang call spends from one hourly budget shared by all visitors.
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
    $('quotaHint').textContent = `쿠팡은 한 시간에 30번 이상 부르면 키가 24시간 멈춰서 ${usage.limit}번까지만 불러요. 불러온 목록은 6시간 동안 저장해 두고, 다시 볼 때는 횟수를 쓰지 않아요.`
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
  function productCard(product, label) {
    const card = element('article', 'pick-card'); const image = element('div', 'pick-image'); const body = element('div', 'pick-body'); const actions = element('div', 'pick-actions');
    if (/^(https:|data:image\/)/.test(product.productImage)) { const img = document.createElement('img'); img.src = product.productImage; img.alt = ''; img.loading = 'lazy'; image.append(img); }
    const price = element('p', 'price', product.productPrice ? `${product.productPrice.toLocaleString('ko-KR')}원` : '');
    if (product.isRocket) price.append(element('span', 'rocket', '로켓'));
    // Open the plain product page, not the partners link: our own click on it would count as self-referral traffic.
    const page = `https://www.coupang.com/vp/products/${product.productId}`;
    const copy = button('Claude용 글 복사', async () => {
      try { await navigator.clipboard.writeText(`이 상품으로 만들어줘\n상품명: ${product.productName}\n상품 페이지: ${page}\n파트너스 링크: ${product.productUrl}\n(HIKARY 상품 찾기 · ${label})`); copy.textContent = '복사됨 ✓'; setTimeout(() => { copy.textContent = 'Claude용 글 복사'; }, 1500); }
      catch { alert('복사하지 못했어요. 상품 페이지 주소를 직접 복사해주세요.'); }
    }, 'small');
    actions.append(link('상품 페이지 ↗', page, 'ghost small'), copy);
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
    if (!result.products.length) { const empty = element('div', 'empty'); empty.append(element('strong', '', '상품이 없어요.'), element('span', '', '다른 카테고리나 검색어로 찾아보세요.')); $('finderResults').append(empty); }
    notice('');
  }
  $('finderLoad').onclick = () => { const [source, categoryId] = $('finderSource').value.split(':'); void task(() => findProducts({ source, categoryId: Number(categoryId) || undefined })); };
  $('finderSearch').onsubmit = event => { event.preventDefault(); void task(() => findProducts({ source: 'search', keyword: $('finderKeyword').value.trim() })); };

  function showView(view) {
    $('ledgerView').hidden = view !== 'ledger'; $('finderView').hidden = view !== 'finder';
    for (const node of $('views').children) node.classList.toggle('on', node.dataset.view === view);
    history.replaceState(null, '', view === 'finder' ? '#finder' : location.pathname + location.search);
  }
  for (const node of $('views').children) node.onclick = () => {
    showView(node.dataset.view);
    if (node.dataset.view === 'finder' && !busy) HikaryApi.request('status').then(useStatus).catch(() => {}); // the hourly count frees up over time
  };
  showView(location.hash === '#finder' ? 'finder' : 'ledger');

  void task(async () => {
    try { const status = await HikaryApi.request('status'); $('connectionState').textContent = `연결됨 · 서버 ${status.version}`; $('connectionState').classList.add('ok'); useStatus(status); }
    catch (error) { $('connectionState').textContent = '서버 연결 실패'; throw error; }
    await load(); notice('');
  });
})();
