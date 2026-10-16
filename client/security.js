const API_METHODS = {
  client_config: ['GET'], client_control: [], user: ['GET'], latest: ['GET'],
  forums: ['GET'], thread: ['GET'], search: ['GET'], notifications: ['GET'],
  login: ['POST'], register: ['POST'], logout: ['POST'], post: ['POST'],
  sms_config: ['GET'], sms_send: ['POST'], sms_login: ['POST'], sms_register: ['POST'], sms_reset: ['POST'], sms_bind: ['POST']
};
function permittedRequest(url, method, config = {}) {
  if (url.origin !== 'https://www.zozse.cn' || url.username || url.password || url.port) return false;
  if (url.pathname.startsWith('/anniversary/')) return false;
  const api = url.pathname.match(/^\/api\/desktop\/([a-z_]+)\.php$/);
  if (api) {
    if (!(API_METHODS[api[1]] || []).includes(method)) return false;
    const auth = config.auth || {}, operation = api[1];
    if (operation === 'login' && (auth.login_enabled === false || auth.password_login_enabled === false) || operation === 'register' && auth.register_enabled === false) return false;
    if (operation.startsWith('sms_') && operation !== 'sms_config' && (auth.sms_enabled === false || operation !== 'sms_send' && auth[operation + '_enabled'] === false)) return false;
    if(operation==='sms_login'&&auth.login_enabled===false||operation==='sms_register'&&auth.register_enabled===false)return false;
    const state = config.run_state || {};
    if ((state.mode === 'disabled' || state.can_run === false) && state.action !== 'notice' && api[1] !== 'client_config') return false;
    if (state.mode === 'maintenance' && method === 'POST' && api[1] !== 'logout') return false;
    const feature = {post: 'posting_enabled', search: 'search_enabled', notifications: 'notifications_enabled'}[api[1]];
    return !feature || config.features?.[feature] !== false;
  }
  if (['/forum.php', '/home.php', '/member.php', '/plugin.php', '/misc.php', '/search.php'].includes(url.pathname)) {
    if (method === 'POST' && config.run_state?.mode === 'maintenance') return false;
    if (config.run_state?.can_run === false && config.run_state?.action !== 'notice') return false;
    const mod = url.searchParams.get('mod');
    if (url.pathname === '/home.php') {
      if (mod === 'medal' && config.features?.medals_enabled === false || mod === 'task' && config.features?.tasks_enabled === false || mod === 'spacecp' && method === 'POST' && config.features?.profile_save_enabled === false) return false;
      return ['space', 'spacecp', 'misc', 'medal', 'task'].includes(mod);
    }
    if (url.pathname === '/forum.php') {
      if (mod === 'attachment' && config.features?.download_enabled === false || mod === 'post' && method === 'POST' && config.features?.reply_enabled === false) return false;
      return (mod === null && method === 'GET') || ['guide', 'forumdisplay', 'viewthread', 'attachment', 'post', 'misc', 'ajax'].includes(mod);
    }
    if (url.pathname === '/member.php') return ['logging', 'register', 'lostpasswd'].includes(mod);
    if (url.pathname === '/plugin.php') {
      const plugin = url.searchParams.get('id') || '';
      if (/^(?:dsu_paulsign|k_misign)/i.test(plugin) && (config.features?.sign_in_enabled === false || config.features?.signin_enabled === false)) return false;
      if (/^comiis_sms/i.test(plugin) && config.auth?.sms_enabled === false) return false;
      return /^(?:comiis_sms|dsu_paulsign|hidethreadsort|k_misign)(?::[a-z_]+)?$/i.test(plugin);
    }
    return method === 'GET';
  }
  return method === 'GET' && (url.pathname === '/' || url.pathname === '/forum.php' || /^\/(?:thread|forum)-\d+-\d+(?:-\d+)?\.html$/.test(url.pathname));
}
function safeHeaders(input) {
  const result = {Accept: 'application/json,text/html', Referer: 'https://www.zozse.cn/'};
  const entry = Object.entries(input || {}).find(([key]) => key.toLowerCase() === 'content-type');
  if (entry && /^application\/(?:x-www-form-urlencoded|json)(?:;charset=UTF-8)?$/i.test(String(entry[1]).replace(/\s/g, ''))) result['Content-Type'] = entry[1];
  return result;
}
module.exports = {permittedRequest, safeHeaders};
