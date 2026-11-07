(() => {
  'use strict';
  // v2.0.0: content is made in Claude and registered to the ledger. This page lists it, edits or deletes it, and records uploads.
  // v2.1.0: a second tab finds Coupang products to make next (Partners API through the server).
  const $ = id => document.getElementById(id);
  const PLATFORMS = [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']];
  const TEXT_KEYS = ['productName', 'category', 'sourceUrl', 'affiliateUrl', 'script', 'youtube', 'instagram', 'tiktok', 'notes'];
  let rows = [];
  let busy = false;
  let filter = '전체';
  let current = null;
  let dirty = false;

  function notice(text, error = false) { $('notice').hidden = !text; $('notice').className = error ? 'error' : ''; $('notice').textContent = text; }
  const https = value => /^https:\/\//i.test(value || '');
  const posted = row => PLATFORMS.filter(([key]) => row[key + 'Status'] === '업로드완료').length;
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

  // One card per product (same original link), one line per registered content.
  function render() {
    $('statContents').textContent = rows.length;
    $('statWaiting').textContent = rows.filter(row => !posted(row)).length;
    $('statPosted').textContent = rows.reduce((sum, row) => sum + posted(row), 0);
    const query = $('search').value.trim().toLowerCase();
    const shown = rows.filter(row => `${row.productName} ${row.category}`.toLowerCase().includes(query)
      && (filter === '전체' || (filter === '안 올림' ? !posted(row) : (row.format || '쇼츠') === filter)));
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
      title.append(element('h3', '', items[0].productName), element('small', '', `${items[0].category} · ${items.length}개`));
      head.append(title); if (https(items[0].sourceUrl)) head.append(link('상품 페이지 ↗', items[0].sourceUrl, 'ghost small'));
      card.append(head);
      for (const row of items) {
        const line = element('div', 'content-line'); const info = element('div', 'info'); const chips = element('div', 'chips'); const actions = element('div', 'line-actions');
        info.append(element('span', row.format === '캐러셀' ? 'pill carousel' : 'pill', row.format || '쇼츠'), element('span', 'date', row.createdAt));
        for (const [key, label] of PLATFORMS) {
          const status = row[key + 'Status'] || '미업로드'; const state = status === '업로드완료' ? 'done' : status === '보류' ? 'hold' : '';
          const text = `${label} ${state === 'done' ? (row[key + 'Date'] ? row[key + 'Date'].slice(5).replace('-', '.') : '완료') : state === 'hold' ? '보류' : '—'}`;
          chips.append(https(row[key + 'Link']) ? link(text, row[key + 'Link'], `chip ${state}`) : element('span', `chip ${state}`, text));
        }
        actions.append(button('보기·수정', () => openDetail(row)), button('업로드 기록', () => openUpload(row), 'small'));
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

  function openDetail(row) {
    current = row; dirty = false;
    for (const key of TEXT_KEYS) $('d-' + key).value = row[key] || '';
    $('detailMeta').textContent = `${row.format || '쇼츠'} · ${row.createdAt} 등록`;
    $('detailDialog').showModal();
  }
  function closeDetail() { if (!dirty || confirm('고친 내용을 저장하지 않고 닫을까요?')) { dirty = false; $('detailDialog').close(); } }
  $('detailForm').oninput = () => { dirty = true; };
  $('detailClose').onclick = closeDetail;
  $('detailDialog').addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
  $('detailForm').onsubmit = event => {
    event.preventDefault();
    void task(async () => { await save(Object.fromEntries(TEXT_KEYS.map(key => [key, $('d-' + key).value.trim()])), '저장했어요.'); dirty = false; $('detailDialog').close(); });
  };
  $('detailDelete').onclick = () => {
    if (!confirm(`「${current.productName}」 ${current.format || '쇼츠'}을(를) 지울까요?\n운영대장에서 이 줄이 삭제됩니다. 실수로 지웠다면 시트의 버전 기록에서 되살릴 수 있어요.`)) return;
    void task(async () => { await HikaryApi.request('delete', { id: current.id, revision: current.revision }); dirty = false; $('detailDialog').close(); await load(); notice('지웠어요.'); });
  };
  for (const node of document.querySelectorAll('[data-copy]')) node.onclick = async () => {
    try { await navigator.clipboard.writeText($(node.dataset.copy).value); node.textContent = '복사됨'; setTimeout(() => { node.textContent = '복사'; }, 1500); }
    catch { alert('복사하지 못했어요. 글을 직접 선택해 복사해주세요.'); }
  };

  const platform = () => document.querySelector('[name=platform]:checked').value;
  function fillUpload() { const key = platform(); $('uploadStatus').value = current[key + 'Status'] || '미업로드'; $('uploadDate').value = current[key + 'Date'] || ''; $('uploadLink').value = current[key + 'Link'] || ''; }
  function openUpload(row) {
    current = row; $('uploadTarget').textContent = `${row.productName} · ${row.format || '쇼츠'}`;
    for (const radio of document.getElementsByName('platform')) {
      radio.checked = radio.value === (row.format === '캐러셀' ? 'instagram' : 'youtube');
      radio.nextElementSibling.className = { 업로드완료: 'done', 보류: 'hold' }[row[radio.value + 'Status']] || '';
    }
    fillUpload(); $('uploadDialog').showModal();
  }
  for (const radio of document.getElementsByName('platform')) radio.onchange = fillUpload;
  $('uploadClose').onclick = () => $('uploadDialog').close();
  $('uploadForm').onsubmit = event => {
    event.preventDefault();
    const key = platform(); const link = $('uploadLink').value.trim(); const status = link ? '업로드완료' : $('uploadStatus').value;
    const date = $('uploadDate').value || (status === '업로드완료' ? new Date().toLocaleDateString('sv-SE') : '');
    void task(async () => { await save({ [key + 'Status']: status, [key + 'Date']: date, [key + 'Link']: link }, '업로드 기록을 저장했어요.'); $('uploadDialog').close(); });
  };
  $('uploadClear').onclick = () => {
    const key = platform();
    if (!confirm('이 플랫폼의 업로드 여부·날짜·링크를 지울까요?')) return;
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
