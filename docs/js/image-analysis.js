/* Pure geometry is shared with tests; canvas runs only in the user's browser. */
window.HikaryImages = (() => {
  function tiles(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 80000000) throw new Error('이미지 크기가 너무 크거나 올바르지 않아요.');
    const scale = Math.min(1, 1200 / width);
    const sourceHeight = Math.max(1, Math.floor(2000 / scale));
    const overlap = Math.min(100, Math.floor(sourceHeight / 10));
    const result = [];
    for (let y = 0; y < height;) {
      const h = Math.min(sourceHeight, height - y);
      result.push({ x: 0, y, width, height: h, outputWidth: Math.max(1, Math.round(width * scale)), outputHeight: Math.max(1, Math.round(h * scale)) });
      if (result.length > 24) throw new Error('상세 이미지가 너무 길어요. 필요한 구간으로 나눠 추가해주세요.');
      if (y + h >= height) break;
      y += sourceHeight - overlap;
    }
    return result;
  }
  async function encode(canvas, quality) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('분석용 이미지를 만들지 못했어요.');
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { bytes: blob.size, inline: { mimeType: 'image/jpeg', data: btoa(binary) } };
  }
  async function prepare(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
      const regions = tiles(bitmap.width, bitmap.height);
      const output = [];
      for (const region of regions) {
        const canvas = document.createElement('canvas'); canvas.width = region.outputWidth; canvas.height = region.outputHeight;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이 브라우저에서 이미지 분할을 지원하지 않아요.');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
        let encoded = await encode(canvas, 0.88);
        if (encoded.bytes > 2 * 1024 * 1024) encoded = await encode(canvas, 0.68);
        if (encoded.bytes > 2 * 1024 * 1024) throw new Error('이미지 조각 용량이 너무 커요. 원본 크기를 줄여주세요.');
        output.push(encoded.inline); canvas.width = 1; canvas.height = 1;
      }
      return { width: bitmap.width, height: bitmap.height, parts: output };
    } finally { bitmap.close(); }
  }
  return { tiles, prepare };
})();
