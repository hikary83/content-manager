window.HikaryProduction = (() => {
  const marker = '\n\n### HIKARY PLAN v1\n';
  const keys = { title: '제목', voiceover: '대사', caption: '후반 자막', visual: '화면', motion: '움직임', imageName: '사용 이미지' };
  const timings = ['0–3초', '3–7초', '7–12초', '12–18초'];
  function field(label, value) { return label + ': ' + String(value || '').replace(/\r/g, '').split('\n').join('\n  '); }
  function pack(script, plan) {
    if (!plan || !plan.scenes?.length) return script;
    return script + marker + field('핵심 매력', (plan.highlights || []).join('\n')) + '\n' + plan.scenes.map((scene, i) => `### CUT ${i + 1}\n시간: ${timings[i]}\n` + Object.entries(keys).map(([key, label]) => field(label, scene[key])).join('\n')).join('\n');
  }
  function unpack(text) {
    const index = text.lastIndexOf(marker);
    if (index < 0) return { script: text, plan: null };
    const blocks = text.slice(index + marker.length).split(/^### CUT \d+\n/m);
    function fields(block) {
      const result = {}; let key;
      for (const line of block.split('\n')) {
        if (line.startsWith('  ') && key) result[key] += '\n' + line.slice(2);
        else { const match = line.match(/^([^:]+): (.*)$/); if (match) { key = match[1]; result[key] = match[2]; } }
      }
      return result;
    }
    if (blocks.length !== 5) return { script: text, plan: null };
    const scenes = blocks.slice(1).map(block => { const values = fields(block); return Object.fromEntries(Object.entries(keys).map(([key, label]) => [key, values[label] || ''])); });
    if (scenes.some(scene => !scene.title)) return { script: text, plan: null };
    return { script: text.slice(0, index), plan: { highlights: (fields(blocks[0])['핵심 매력'] || '').split('\n').filter(Boolean), scenes } };
  }
  function cropRect(start, end, width, height) {
    const left = Math.max(0, Math.min(width, Math.min(start.x, end.x)));
    const top = Math.max(0, Math.min(height, Math.min(start.y, end.y)));
    const right = Math.max(0, Math.min(width, Math.max(start.x, end.x)));
    const bottom = Math.max(0, Math.min(height, Math.max(start.y, end.y)));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function flowPrompt(productName, scene) {
    return `Create one vertical 9:16 commercial shot for this specific product: ${productName}.\nUse the attached selected reference image as the product/location identity source. Preserve actual appearance, architecture, objects, colors and logos; do not invent facilities, animals, views or product features.\nScene: ${scene.title}\nVisual direction: ${scene.visual}\nCamera and motion: ${scene.motion}\nNo on-screen captions, subtitles, prices, title cards, or added readable text. No voiceover. Captions and narration will be added in post-production.\nIf using a travel reference, do not present imagined scenes as documentary footage of the actual venue.`;
  }
  function create(options) {
    const root = document.getElementById('production');
    const cards = document.getElementById('sceneCards');
    let plan = null; let croppedCount = 0;
    function resolve(scene) { return options.images().find(image => image.id === scene.imageId) || options.images().find(image => image.name === scene.imageName); }
    function snapshot() {
      if (!plan) return null;
      return { highlights: [...plan.highlights], scenes: plan.scenes.map(scene => ({ ...scene, imageName: resolve(scene)?.name || scene.imageName || '' })) };
    }
    function saveText(text, name, type = 'text/plain;charset=utf-8') { const blob = new Blob([text], { type }); downloadBlob(blob, name); }
    function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    async function downloadScene(index) {
      const scene = plan.scenes[index]; const image = resolve(scene);
      if (!image) throw new Error(`컷 ${index + 1}에 사용할 이미지를 선택해주세요.`);
      const blob = await options.blob(image); const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      downloadBlob(blob, `HIKARY-CUT-${index + 1}.${extension}`);
    }
    function render() {
      root.hidden = !plan; cards.replaceChildren(); if (!plan) return;
      document.getElementById('highlights').value = plan.highlights.join('\n');
      plan.scenes.forEach((scene, index) => {
        const card = document.createElement('article'); card.className = 'scene-card';
        const heading = document.createElement('h3'); heading.textContent = `CUT ${index + 1} · ${timings[index]}`; card.append(heading);
        const media = resolve(scene); const preview = document.createElement('div'); preview.className = 'scene-preview';
        if (media) { const image = document.createElement('img'); image.src = media.url; image.alt = media.name; image.referrerPolicy = 'no-referrer'; preview.append(image); }
        else preview.textContent = '이미지를 선택하거나 로컬 사진을 다시 추가해주세요.';
        card.append(preview);
        const label = document.createElement('label'); label.textContent = '사용할 이미지'; const select = document.createElement('select'); select.add(new Option('이미지 선택', ''));
        for (const image of options.images()) select.add(new Option(image.name + (image.kind === 'detail' ? ' · 필요한 부분을 잘라 쓰세요' : ''), image.id));
        select.value = media?.id || '';
        select.onchange = () => { const selected = options.images().find(item => item.id === select.value); scene.imageId = selected?.id || ''; scene.imageName = selected?.name || ''; options.changed(); render(); };
        label.append(select); card.append(label);
        for (const key of ['title', 'voiceover', 'caption', 'visual', 'motion']) {
          const fieldLabel = document.createElement('label'); fieldLabel.textContent = keys[key]; const input = document.createElement('textarea'); input.rows = ['visual', 'motion'].includes(key) ? 3 : 2; input.maxLength = key === 'title' ? 120 : 1000; input.value = scene[key] || '';
          input.oninput = () => { scene[key] = input.value; options.changed(); if (key === 'voiceover') options.narration(plan.scenes.map(item => item.voiceover).join('\n')); };
          fieldLabel.append(input); card.append(fieldLabel);
        }
        const actions = document.createElement('div'); actions.className = 'actions';
        const crop = document.createElement('button'); crop.type = 'button'; crop.textContent = '이미지 잘라 쓰기'; crop.className = 'secondary';
        crop.onclick = () => { if (!media) { options.notice('먼저 이미지를 선택해주세요.', true); return; } void options.task(() => openCrop(media, index)); };
        const download = document.createElement('button'); download.type = 'button'; download.textContent = '컷 이미지 다운로드'; download.className = 'secondary'; download.onclick = () => void options.task(async () => { await downloadScene(index); options.notice('컷 이미지를 내려받았어요.'); });
        const prompt = document.createElement('button'); prompt.type = 'button'; prompt.textContent = 'Flow 프롬프트 복사'; prompt.className = 'secondary'; prompt.onclick = async () => { try { await navigator.clipboard.writeText(flowPrompt(options.productName(), scene)); options.notice('이 컷의 Flow 프롬프트를 복사했어요. 선택한 이미지도 함께 첨부해주세요.'); } catch { options.notice('복사 권한을 확인해주세요. 제작안 TXT에서도 확인할 수 있어요.', true); } };
        actions.append(crop, download, prompt); card.append(actions); cards.append(card);
      });
    }
    document.getElementById('highlights').oninput = event => { if (plan) { plan.highlights = event.target.value.split('\n').filter(Boolean).slice(0, 5); options.changed(); } };
    document.getElementById('planTextDownload').onclick = () => {
      if (!plan) return;
      const text = pack(options.script(), snapshot()) + '\n\n' + plan.scenes.map((scene, i) => `[CUT ${i + 1} Flow 프롬프트]\n${flowPrompt(options.productName(), scene)}`).join('\n\n');
      saveText(text, 'HIKARY-production-plan.txt'); options.notice('대본·후반 자막·4컷 제작안을 내려받았어요.');
    };
    document.getElementById('sceneImagesDownload').onclick = () => void options.task(async () => {
      if (!plan) throw new Error('제작안이 없어요.');
      for (const scene of plan.scenes) if (!resolve(scene)) throw new Error('모든 컷에 이미지를 선택한 뒤 내려받아주세요.');
      for (let index = 0; index < plan.scenes.length; index++) await downloadScene(index);
      options.notice('컷별 이미지 4장 다운로드를 요청했어요. 여러 파일 다운로드를 허용해주세요.');
    });
    const dialog = document.getElementById('cropDialog'); const surface = document.getElementById('cropSurface'); const cropImage = document.getElementById('cropImage'); const selection = document.getElementById('cropSelection');
    let activeCrop = null; let start = null; let selectionRect = null; let cropUrl = '';
    function closeCrop() { if (cropUrl) URL.revokeObjectURL(cropUrl); cropUrl = ''; activeCrop = null; selectionRect = null; start = null; cropImage.removeAttribute('src'); }
    dialog.addEventListener('close', closeCrop);
    function updateSelection(rect) {
      selectionRect = rect; selection.hidden = !rect;
      if (rect) { const scale = cropImage.clientWidth / cropImage.naturalWidth; Object.assign(selection.style, { left: rect.x * scale + 'px', top: rect.y * scale + 'px', width: rect.width * scale + 'px', height: rect.height * scale + 'px' }); }
      document.getElementById('cropSize').textContent = rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)} px` : '범위를 드래그하거나 아래 숫자로 지정해주세요.';
      if (rect) for (const key of ['x', 'y', 'width', 'height']) document.getElementById('crop-' + key).value = Math.round(rect[key]);
    }
    async function openCrop(image, sceneIndex) {
      const blob = await options.blob(image); const url = URL.createObjectURL(blob);
      try { cropImage.src = url; await cropImage.decode(); } catch { URL.revokeObjectURL(url); throw new Error('자르기용 이미지를 읽지 못했어요.'); }
      cropUrl = url; activeCrop = { image, sceneIndex }; selectionRect = null; selection.hidden = true;
      dialog.showModal(); document.getElementById('cropViewport').scrollTop = 0;
      updateSelection({ x: 0, y: 0, width: cropImage.naturalWidth, height: Math.min(cropImage.naturalHeight, Math.round(cropImage.naturalWidth * 9 / 16)) });
      options.notice('영상에 쓸 사진 영역을 선택해주세요. 안내 문구가 포함되지 않도록 잘라보세요.');
    }
    function point(event) { const box = cropImage.getBoundingClientRect(); return { x: (event.clientX - box.left) * cropImage.naturalWidth / box.width, y: (event.clientY - box.top) * cropImage.naturalHeight / box.height }; }
    surface.onpointerdown = event => { if (!activeCrop || event.button !== 0) return; event.preventDefault(); start = point(event); surface.setPointerCapture(event.pointerId); };
    surface.onpointermove = event => { if (start) updateSelection(cropRect(start, point(event), cropImage.naturalWidth, cropImage.naturalHeight)); };
    surface.onpointerup = () => { start = null; };
    surface.onpointercancel = () => { start = null; };
    for (const key of ['x', 'y', 'width', 'height']) document.getElementById('crop-' + key).onchange = () => {
      if (!activeCrop) return;
      const values = Object.fromEntries(['x', 'y', 'width', 'height'].map(name => [name, Number(document.getElementById('crop-' + name).value)]));
      if (Object.values(values).some(value => !Number.isFinite(value))) return;
      updateSelection(cropRect({ x: values.x, y: values.y }, { x: values.x + Math.max(0, values.width), y: values.y + Math.max(0, values.height) }, cropImage.naturalWidth, cropImage.naturalHeight));
    };
    document.getElementById('cropConfirm').onclick = async () => {
      if (!activeCrop || !selectionRect || selectionRect.width < 30 || selectionRect.height < 30) { options.notice('가로·세로 30px 이상의 사진 영역을 선택해주세요.', true); return; }
      const button = document.getElementById('cropConfirm'); button.disabled = true;
      try {
        const rect = selectionRect; const scale = Math.min(1, 1920 / rect.width, 1920 / rect.height); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(rect.width * scale)); canvas.height = Math.max(1, Math.round(rect.height * scale));
        const context = canvas.getContext('2d'); if (!context) throw new Error('이미지 자르기를 지원하지 않는 브라우저예요.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(cropImage, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92)); if (!blob) throw new Error('이미지를 만들지 못했어요.');
        const name = `영상용 사진 ${++croppedCount}.jpg`; const file = new File([blob], name, { type: 'image/jpeg' });
        const newImage = options.addCrop(file); const scene = plan?.scenes[activeCrop.sceneIndex]; if (scene) { scene.imageId = newImage.id; scene.imageName = newImage.name; }
        dialog.close(); options.changed(); render(); options.notice('선택 영역을 영상용 사진으로 추가했어요. 컷 이미지 다운로드로 로컬에 보관해주세요.');
      } catch (error) { options.notice(error.message, true); } finally { button.disabled = false; }
    };
    document.getElementById('cropClose').onclick = () => dialog.close();
    return {
      set(value, sources = []) {
        plan = value && value.scenes?.length === 4 ? { highlights: value.highlights || [], scenes: value.scenes.map(scene => { const source = sources[scene.sourceImage - 1]; return { ...scene, imageId: source?.id || '', imageName: source?.name || scene.imageName || '' }; }) } : null;
        render();
      },
      get: snapshot,
      refresh: render,
      crop: (image, sceneIndex = -1) => openCrop(image, sceneIndex)
    };
  }
  return { pack, unpack, cropRect, flowPrompt, create };
})();
