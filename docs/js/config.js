/* Public configuration only. Never put API keys or access codes in this file. */
window.HIKARY_CONFIG = Object.freeze({ version: '1.5.0', apiUrl: 'https://script.google.com/macros/s/AKfycbzN9mw2OKRKHdEYjUCqv3sYOsp5LPKRLhBP7yR_8pwfK3j1FKY-4eUc5hdG6FOLov1z/exec' });

window.HikaryApi = (() => {
  let endpoint = window.HIKARY_CONFIG.apiUrl || '';
  let token = '';
  const pending = new Set();
  function configure(url, code) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw new Error('콘텐츠 매니저 전용 Apps Script /exec 주소를 입력해주세요.');
    if (code.length < 32) throw new Error('접속 코드는 32자 이상이어야 합니다.');
    endpoint = url; token = code;
  }
  async function request(action, payload = {}) {
    if (!endpoint || !token) throw new Error('연결 설정에서 웹앱 주소와 접속 코드를 입력해주세요.');
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    pending.add(requestId);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'follow', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token, requestId }),
        signal: AbortSignal.timeout(['generate','reference','carousel'].includes(action) ? 150000 : 60000)
      });
      if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
      let result;
      try { result = await response.json(); } catch { throw new Error('웹앱 응답을 읽지 못했어요. 배포 주소와 접근 설정을 확인해주세요.'); }
      if (!result.ok) throw new Error(result.error || '처리에 실패했어요.');
      return result.data;
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error(action === 'save' ? '저장 응답이 늦어요. 관리 목록에서 등록 여부를 확인해주세요. 같은 콘텐츠 ID는 중복 등록되지 않습니다.' : '응답 시간이 초과됐어요. 입력 내용은 유지됩니다.');
      throw error;
    } finally {
      pending.delete(requestId);
      console.info('[HIKARY]', { action, requestId, elapsedMs: Math.round(performance.now() - startedAt) });
    }
  }
  return { configure, request, isBusy: () => pending.size > 0 };
})();
