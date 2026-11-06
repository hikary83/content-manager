(() => {
  'use strict';
  // v2.0.0: content is made in Claude and registered to the ledger. This page lists it, edits or deletes it, and records uploads.
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

  void task(async () => {
    try { $('connectionState').textContent = `연결됨 · 서버 ${(await HikaryApi.request('status')).version}`; $('connectionState').classList.add('ok'); }
    catch (error) { $('connectionState').textContent = '서버 연결 실패'; throw error; }
    await load(); notice('');
  });
})();
