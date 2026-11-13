/* Public configuration only. Never put API keys in this file.
 * v2.9.0: the server needs a login. The session token lives in this browser only (localStorage when 「로그인 유지」, else sessionStorage). */
window.HIKARY_CONFIG = Object.freeze({ version: '3.6.0', apiUrl: 'https://script.google.com/macros/s/AKfycbzN9mw2OKRKHdEYjUCqv3sYOsp5LPKRLhBP7yR_8pwfK3j1FKY-4eUc5hdG6FOLov1z/exec' });

window.HikaryApi = (() => {
  const endpoint = window.HIKARY_CONFIG.apiUrl;
  const pending = new Set();
  const KEY = 'hikary-session';
  // Storage can be missing or blocked (private window, tests); then the session simply is not kept.
  function token() { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch { return ''; } }
  function keepToken(value, keep) {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); if (value) (keep ? localStorage : sessionStorage).setItem(KEY, value); } catch {}
  }
  async function request(action, payload = {}) {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const session = token();
    pending.add(requestId);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'follow', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, requestId, ...(session ? { token: session } : {}) }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
      let result;
      try { result = await response.json(); } catch { throw new Error('웹앱 응답을 읽지 못했어요. 배포 주소와 접근 설정을 확인해주세요.'); }
      if (!result.ok) {
        const error = new Error(result.error || '처리에 실패했어요.');
        // The session ended (logged out elsewhere, 90 days unused): forget it and let the page show the login screen.
        if (result.auth) { error.auth = true; keepToken(''); window.dispatchEvent?.(new Event('hikary-login')); }
        throw error;
      }
      return result.data;
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error(['save', 'delete', 'publish'].includes(action) ? '응답이 늦어요. 새로고침해서 반영됐는지 확인한 뒤 다시 시도해주세요.' : '응답 시간이 초과됐어요. 잠시 후 다시 시도해주세요.');
      throw error;
    } finally {
      pending.delete(requestId);
      console.info('[HIKARY]', { action, requestId, elapsedMs: Math.round(performance.now() - startedAt) });
    }
  }
  async function login(id, password, keep) { const result = await request('login', { id, password }); keepToken(result.token, keep); return result; }
  async function logout(all = false) { try { await request('logout', { all }); } finally { keepToken(''); } }
  return { request, login, logout, hasSession: () => !!token(), isBusy: () => pending.size > 0 };
})();
