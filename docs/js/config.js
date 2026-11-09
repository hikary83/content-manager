/* Public configuration only. Never put API keys in this file. The server needs no access code (v1.6.1). */
window.HIKARY_CONFIG = Object.freeze({ version: '2.2.0', apiUrl: 'https://script.google.com/macros/s/AKfycbzN9mw2OKRKHdEYjUCqv3sYOsp5LPKRLhBP7yR_8pwfK3j1FKY-4eUc5hdG6FOLov1z/exec' });

window.HikaryApi = (() => {
  const endpoint = window.HIKARY_CONFIG.apiUrl;
  const pending = new Set();
  async function request(action, payload = {}) {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    pending.add(requestId);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'follow', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, requestId }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
      let result;
      try { result = await response.json(); } catch { throw new Error('웹앱 응답을 읽지 못했어요. 배포 주소와 접근 설정을 확인해주세요.'); }
      if (!result.ok) throw new Error(result.error || '처리에 실패했어요.');
      return result.data;
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error(action === 'save' || action === 'delete' ? '응답이 늦어요. 새로고침해서 반영됐는지 확인한 뒤 다시 시도해주세요.' : '응답 시간이 초과됐어요. 잠시 후 다시 시도해주세요.');
      throw error;
    } finally {
      pending.delete(requestId);
      console.info('[HIKARY]', { action, requestId, elapsedMs: Math.round(performance.now() - startedAt) });
    }
  }
  return { request, isBusy: () => pending.size > 0 };
})();
