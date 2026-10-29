(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fields = ['category', 'productName', 'sourceUrl', 'affiliateUrl', 'script', 'youtube', 'youtubeStatus', 'instagram', 'instagramStatus', 'tiktok', 'tiktokStatus', 'notes'];
  let contentId = crypto.randomUUID();
  let revision = null;
  let images = [];
  let rows = [];
  let busy = false;
  let dirty = false;
  let saveUncertain = false;
  let lastSave = null;
  const production = HikaryProduction.create({
    images: () => images, blob: imageBlob, task, notice, changed,
    productName: () => $('productName').value, script: () => $('script').value,
    narration: text => { $('script').value = text; },
    addCrop(file) {
      if (images.length >= 40) throw new Error('사진이 너무 많아요. 불필요한 사진을 제거한 뒤 다시 잘라주세요.');
      const image = { id: crypto.randomUUID(), url: URL.createObjectURL(file), file, kind: 'video', name: file.name, selected: false };
      images.push(image); renderImages(); return image;
    }
  });
  for (const select of document.querySelectorAll('.status-select')) for (const status of ['미업로드', '업로드완료', '보류']) select.add(new Option(status, status));
  function notice(text, error = false) { $('notice').hidden = !text; $('notice').className = error ? 'error' : ''; $('notice').textContent = text; }
  function validUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }
  async function task(work) {
    if (busy) return;
    busy = true; notice('처리 중입니다…');
    // Lock the entire form so a delayed response cannot overwrite newer edits.
    const controls = [...document.querySelectorAll('main input,main textarea,main select,main button,aside button')];
    controls.forEach(control => { control.disabled = true; });
    try { await work(); } catch (error) { notice(error.message || '처리 중 오류가 발생했어요.', true); }
    finally { busy = false; controls.forEach(control => { control.disabled = false; }); }
  }
  function switchView(view) {
    $('registration').hidden = view !== 'registration'; $('management').hidden = view !== 'management';
    $('registrationTab').classList.toggle('active', view === 'registration'); $('managementTab').classList.toggle('active', view === 'management');
    $('pageTitle').textContent = view === 'registration' ? '콘텐츠 등록' : '콘텐츠 관리';
  }
  function changed() { dirty = true; }
  $('contentForm').addEventListener('input', changed);
  window.addEventListener('beforeunload', event => { if (dirty || busy || saveUncertain) { event.preventDefault(); event.returnValue = ''; } });
  $('settingsButton').onclick = () => $('settingsDialog').showModal();
  $('apiUrl').value = window.HIKARY_CONFIG.apiUrl;
  $('connectButton').onclick = async () => {
    $('connectButton').disabled = true;
    try {
      HikaryApi.configure($('apiUrl').value.trim(), $('accessToken').value.trim());
      const status = await HikaryApi.request('status');
      $('accessToken').value = ''; $('settingsDialog').close();
      $('connectionState').textContent = `연결됨 · 서버 ${status.version}`;
      notice(status.aiConfigured ? '시트·Gemini 연결 설정을 확인했어요.' : '시트 연결 완료. Gemini 키는 스크립트 속성에 추가해주세요.');
    } catch (error) { alert(error.message); } finally { $('connectButton').disabled = false; }
  };
  $('registrationTab').onclick = () => switchView('registration');
  async function loadEntries() {
    const data = await HikaryApi.request('list'); rows = data.entries; renderEntries(); notice(`${rows.length}건을 불러왔어요.`);
  }
  $('managementTab').onclick = () => { switchView('management'); void task(loadEntries); };
  $('refreshList').onclick = () => void task(loadEntries);
  $('search').oninput = renderEntries;
  function renderEntries() {
    $('entries').replaceChildren();
    const query = $('search').value.trim().toLowerCase();
    const filtered = rows.filter(row => `${row.productName} ${row.category}`.toLowerCase().includes(query));
    if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '등록된 콘텐츠가 없어요.'; $('entries').append(empty); }
    for (const row of filtered) {
      const button = document.createElement('button'); button.className = 'entry';
      const title = document.createElement('span'); const meta = document.createElement('small');
      title.textContent = row.productName; meta.textContent = `${row.category} · ${row.createdAt} · YT ${row.youtubeStatus} / IG ${row.instagramStatus} / TT ${row.tiktokStatus}`; title.append(meta);
      const arrow = document.createElement('span'); arrow.textContent = '조회·수정 →'; button.append(title, arrow);
      button.onclick = () => {
        if (dirty && !confirm('작성 중인 내용을 닫고 저장한 콘텐츠를 열까요?')) return;
        if (saveUncertain && !confirm('이전 저장 응답이 확인되지 않았어요. 다른 내용을 열기 전에 같은 항목인지 확인해주세요. 계속할까요?')) return;
        for (const key of fields) $(key).value = row[key] || '';
        const restored = HikaryProduction.unpack(row.script || ''); $('script').value = restored.script;
        contentId = row.id; revision = row.revision; saveUncertain = false; lastSave = null; dirty = false;
        $('description').value = ''; $('analysisEvidence').textContent = ''; clearImages();
        production.set(restored.plan);
        $('saveButton').textContent = '수정 내용 저장 →'; notice('저장된 내용을 열었어요. 원본 이미지는 로컬에서 다시 추가할 수 있어요.'); switchView('registration');
      };
      $('entries').append(button);
    }
  }
  function clearImages() { images.forEach(image => { if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url); }); images = []; renderImages(); }
  $('newButton').onclick = () => {
    if ((dirty || saveUncertain) && !confirm('저장되지 않은 내용이 있을 수 있어요. 새로 작성할까요?')) return;
    $('contentForm').reset(); contentId = crypto.randomUUID(); revision = null; dirty = false; saveUncertain = false; lastSave = null;
    $('analysisEvidence').textContent = ''; clearImages(); notice(''); $('saveButton').textContent = '콘텐츠 등록 →';
    production.set(null);
  };
  $('analyzeButton').onclick = () => {
    if (!validUrl($('sourceUrl').value.trim())) { notice('https로 시작하는 상품 링크를 입력해주세요.', true); return; }
    if (($('productName').value || $('description').value || images.length) && !confirm('상품명·상세 설명·이미지를 새 분석 결과로 바꿀까요? 대본과 게시글은 유지돼요.')) return;
    void task(async () => {
      const result = await HikaryApi.request('analyze', { url: $('sourceUrl').value.trim() });
      $('productName').value = result.name || ''; $('description').value = result.description || '';
      clearImages();
      const assets = result.imageAssets || result.images.map(url => ({ url, kind: 'product' }));
      let productCount = 0; let detailCount = 0;
      images = assets.map(asset => {
        const detail = asset.kind === 'detail'; const index = detail ? ++detailCount : ++productCount;
        return { id: crypto.randomUUID(), url: asset.url, kind: detail ? 'detail' : 'product', name: `${detail ? '상세 설명' : '상품 사진'} ${index}`, selected: detail ? detailCount <= 2 : productCount <= 2 };
      });
      renderImages(); dirty = true;
      const warnings = Array.isArray(result.warnings) ? result.warnings.join('\n') : '';
      $('analysisEvidence').textContent = result.extraction === 'coupang-travel-data' ? `쿠팡 트래블 상품 데이터에서 소개·이용안내·취소조건을 추출했어요.\n상품 사진 ${productCount}장 · 상세 설명 이미지 ${detailCount}장\n${warnings}` : warnings;
      notice(`상품 사진 ${productCount}장과 상세 설명 이미지 ${detailCount}장을 불러왔어요. 긴 상세 이미지는 Gemini 분석 시 자동으로 나눠 읽습니다.${warnings ? '\n' + warnings : ''}`);
    });
  };
  $('imageInput').onchange = async event => {
    if (busy) return;
    const files = Array.from(event.target.files); event.target.value = '';
    for (const file of files) {
      if (images.length >= 20) { notice('원본 이미지는 최대 20장까지 추가할 수 있어요.', true); break; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) { notice('JPG·PNG·WEBP 이미지를 장당 12MB 이하로 추가해주세요.', true); continue; }
      images.push({ id: crypto.randomUUID(), url: URL.createObjectURL(file), file, kind: 'manual', name: file.name, selected: images.filter(image => image.selected).length < 4 });
    }
    dirty = true; renderImages();
  };
  function renderImages() {
    $('images').replaceChildren();
    if (!images.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '상품 링크를 분석하거나 상세페이지 캡처를 추가해주세요.'; $('images').append(empty); }
    const displayed = ['product', 'detail', 'manual', 'video'].flatMap(kind => images.filter(image => (image.kind || 'product') === kind));
    let previousKind = '';
    displayed.forEach(image => {
      if (previousKind !== image.kind) {
        const heading = document.createElement('h3'); heading.style.gridColumn = '1 / -1'; heading.style.margin = '12px 0 0'; heading.style.fontSize = '14px';
        heading.textContent = image.kind === 'detail' ? '상세 설명 이미지 · 정보 분석용' : image.kind === 'manual' ? '직접 추가한 이미지' : image.kind === 'video' ? '잘라낸 영상용 사진 · 로컬 다운로드 필요' : '상품 사진 · 영상 제작 참고용';
        $('images').append(heading); previousKind = image.kind;
      }
      const article = document.createElement('article'); const img = document.createElement('img'); img.src = image.url; img.alt = image.name; img.referrerPolicy = 'no-referrer';
      const label = document.createElement('label'); const check = document.createElement('input'); check.type = 'checkbox'; check.checked = image.selected;
      check.onchange = () => { image.selected = check.checked; dirty = true; }; label.append(check, document.createTextNode(image.name));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '제거'; remove.onclick = () => { if (image.file) URL.revokeObjectURL(image.url); images = images.filter(item => item !== image); dirty = true; renderImages(); };
      const crop = document.createElement('button'); crop.type = 'button'; crop.textContent = '영상용 잘라내기'; crop.onclick = () => void task(() => production.crop(image));
      article.append(img, label, crop, remove); $('images').append(article);
    });
    production.refresh();
  }
  async function imageBlob(image) {
    if (image.file) return image.file;
    if (image.blob) return image.blob;
    const data = await HikaryApi.request('image', { url: image.url });
    const bytes = Uint8Array.from(atob(data.data), char => char.charCodeAt(0));
    image.blob = new Blob([bytes], { type: data.mimeType });
    return image.blob;
  }
  $('generateButton').onclick = () => {
    if (!$('productName').value.trim()) { notice('상품명을 입력해주세요.', true); return; }
    if (images.filter(image => image.selected).length > 4) { notice('AI 분석용 원본은 최대 4장을 선택해주세요. 긴 이미지는 자동으로 분할됩니다.', true); return; }
    if (!$('description').value.trim() && !images.some(image => image.selected)) { notice('상세 설명 또는 분석할 이미지를 추가해주세요.', true); return; }
    if (['script', 'youtube', 'instagram', 'tiktok'].some(key => $(key).value) && !confirm('현재 대본·4컷 제작안·플랫폼별 게시글을 AI 초안으로 바꿀까요?')) return;
    void task(async () => {
      const selected = []; let base64Length = 0;
      const sources = images.filter(image => image.selected);
      for (const [sourceIndex, image] of sources.entries()) {
        notice(`${image.name} 준비 중… 긴 상세 이미지는 글자를 읽을 수 있도록 분할합니다.`);
        const prepared = await HikaryImages.prepare(await imageBlob(image));
        for (const part of prepared.parts) { selected.push({ inline: part, sourceImage: sourceIndex + 1 }); base64Length += part.data.length; }
        if (selected.length > 24) throw new Error('분할 이미지가 24장을 넘어요. 상세 설명 이미지 1장부터 선택해서 분석해주세요.');
        if (base64Length > 11000000) throw new Error('분석 자료의 용량이 너무 커요. 선택한 원본 이미지 수를 줄여주세요.');
      }
      notice(`분석용 이미지 ${selected.length}개 구간을 Gemini가 읽고 있어요…`);
      const data = await HikaryApi.request('generate', { productName: $('productName').value, category: $('category').value, description: $('description').value, images: selected, sources: sources.map(image => ({ name: image.name, kind: image.kind })) });
      if (!Array.isArray(data.scenes) || data.scenes.length !== 4) throw new Error('서버 버전이 맞지 않아요. 새로고침하고 서버 1.2.0 연결을 확인해주세요.');
      for (const key of ['script', 'youtube', 'instagram', 'tiktok']) $(key).value = data[key] || '';
      production.set({ highlights: data.highlights, scenes: data.scenes }, sources);
      $('analysisEvidence').textContent = `AI가 확인한 내용\n${data.summary || ''}\n\n확인이 필요한 내용\n${(data.warnings || []).join('\n') || '가격·이용조건·제휴 고지문은 게시 전에 다시 확인해주세요.'}`;
      dirty = true; notice(`이미지 ${selected.length}개 구간에서 대본·4컷 제작안을 만들었어요. 컷별 사진을 고르고, 상세 이미지 속 사진은 필요한 부분을 잘라 사용해주세요.`);
    });
  };
  $('downloadImages').onclick = () => void task(async () => {
    const selected = images.filter(image => image.selected);
    if (!selected.length) throw new Error('내려받을 이미지를 선택해주세요.');
    for (const image of selected) {
      const blob = await imageBlob(image);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url;
      const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'; anchor.download = `HIKARY-${image.name.replace(/\.(png|jpe?g|webp)$/i, '')}.${extension}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    notice('선택 이미지 다운로드를 요청했어요. 여러 파일 다운로드 허용이 필요할 수 있습니다.');
  });
  $('contentForm').onsubmit = event => {
    event.preventDefault();
    if (busy) return;
    const payload = { id: contentId, revision };
    for (const key of fields) payload[key] = $(key).value.trim();
    payload.script = HikaryProduction.pack(payload.script, production.get());
    if (payload.script.length > 12000) { notice('대본과 제작안이 너무 길어요. 합계 12,000자 이내로 줄여주세요.', true); return; }
    if (!payload.productName || !payload.script || !validUrl(payload.sourceUrl) || (payload.affiliateUrl && !validUrl(payload.affiliateUrl))) { notice('상품명·대본과 https 링크를 확인해주세요.', true); return; }
    if (saveUncertain && JSON.stringify(payload) !== lastSave) { notice('이전 저장 결과가 확인되지 않았어요. 관리 목록에서 해당 콘텐츠를 열어 확인한 뒤 수정해주세요.', true); return; }
    lastSave = JSON.stringify(payload); saveUncertain = true;
    void task(async () => {
      const saved = await HikaryApi.request('save', payload); revision = saved.revision; saveUncertain = false; lastSave = null; dirty = false;
      $('saveButton').textContent = '수정 내용 저장 →'; notice(saved.replayed ? '이미 같은 내용이 저장되어 있어요. 중복 등록하지 않았습니다.' : 'Google Sheets에 저장했어요. 이미지는 별도로 보관해주세요.');
    });
  };
})();
