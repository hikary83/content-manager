/* HIKARY only. v2.7.0 (2026-11-11) login.
 * The server address is public (docs/js/config.js), so every action but `login` needs a session token or the tool key.
 * Script properties (set by the owner): LOGIN_ID, LOGIN_PASSWORD, TOOL_KEY (tools/register.mjs, from .env HIKARY_TOOL_KEY).
 * SESSIONS is written by the server: { sha256(token): { at, used } }. Tokens themselves are never stored or logged. */
var SESSION_DAYS = 90;          // a session ends after 90 days without use
var SESSION_TOUCH_MS = 864e5;   // 「last used」 is written at most once a day
var SESSION_MAX = 20;           // oldest sessions drop off beyond this

function authProps_() { return PropertiesService.getScriptProperties(); }
function readSessions_() { try { return JSON.parse(authProps_().getProperty('SESSIONS') || '{}') || {}; } catch (_) { return {}; } }
function liveSessions_(sessions) {
  var now = Date.now();
  var keys = Object.keys(sessions).filter(function(key) { return sessions[key] && now - sessions[key].used <= SESSION_DAYS * 864e5; })
    .sort(function(a, b) { return sessions[b].used - sessions[a].used; }).slice(0, SESSION_MAX);
  var live = {}; keys.forEach(function(key) { live[key] = sessions[key]; }); return live;
}
function authError_() { var error = userError_('로그인이 필요해요.'); error.auth = true; return error; }

function login_(input) {
  var props = authProps_(); var id = props.getProperty('LOGIN_ID'); var password = props.getProperty('LOGIN_PASSWORD');
  if (!id || !password) throw userError_('스크립트 속성에 LOGIN_ID·LOGIN_PASSWORD를 넣어주세요.');
  var cache = CacheService.getScriptCache(); var fails = Number(cache.get('LOGIN_FAILS') || 0);
  if (fails >= 5) throw userError_('5번 틀려서 1시간 동안 로그인을 막았어요.');
  var ok = typeof input.id === 'string' && typeof input.password === 'string' && hash_(input.id.trim()) === hash_(id.trim()) && hash_(input.password) === hash_(password);
  if (!ok) {
    cache.put('LOGIN_FAILS', String(fails + 1), 3600);
    throw userError_(fails + 1 >= 5 ? '5번 틀려서 1시간 동안 로그인을 막았어요.' : '아이디나 비밀번호가 맞지 않아요 (남은 기회 ' + (4 - fails) + '번).');
  }
  cache.put('LOGIN_FAILS', '0', 1);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 작업이 진행 중이에요. 잠시 후 다시 로그인해주세요.');
  try {
    var sessions = readSessions_(); var now = Date.now();
    sessions[hash_(token)] = { at: now, used: now };
    props.setProperty('SESSIONS', JSON.stringify(liveSessions_(sessions)));
  } finally { lock.releaseLock(); }
  return { token: token, days: SESSION_DAYS };
}

// 'tool' for the registration tool's key, 'session' for a logged-in browser. Anything else is refused.
function authorize_(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) throw authError_();
  var toolKey = authProps_().getProperty('TOOL_KEY');
  if (toolKey && toolKey.length >= 32 && hash_(token) === hash_(toolKey)) return 'tool';
  var key = hash_(token); var sessions = readSessions_(); var session = sessions[key];
  if (!session || Date.now() - session.used > SESSION_DAYS * 864e5) throw authError_();
  if (Date.now() - session.used > SESSION_TOUCH_MS) {
    // ponytail: no lock here — a write lost to a race only makes this session's 90 days start a day earlier.
    session.used = Date.now(); sessions[key] = session; authProps_().setProperty('SESSIONS', JSON.stringify(liveSessions_(sessions)));
  }
  return 'session';
}

function logout_(token, input) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw userError_('다른 작업이 진행 중이에요. 잠시 후 다시 시도해주세요.');
  try {
    var sessions = readSessions_();
    if (input.all) sessions = {}; else delete sessions[hash_(token)];
    authProps_().setProperty('SESSIONS', JSON.stringify(sessions));
  } finally { lock.releaseLock(); }
  return { loggedOut: true, all: !!input.all };
}
