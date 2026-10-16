(function () {
    let current = {}, exitTimer, bindShown = false;
    let stored = []; try { stored = JSON.parse(localStorage.getItem('zo_runtime_seen_ids') || '[]'); } catch {};
    const seen = new Set(Array.isArray(stored) ? stored.filter(id => typeof id === 'string').slice(-200) : []);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const safeSite = value => { try { const u = new URL(value); return u.origin === 'https://www.zozse.cn' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
    const text = (node, value) => { node.textContent = typeof value === 'string' ? value : ''; };
    function appearance() {
        const pref = current.features?.dark_mode_enabled === false ? 'light' : (current.theme?.allow_user_change !== false && localStorage.getItem('zo_desktop_appearance') || current.theme?.appearance || 'system');
        document.documentElement.dataset.theme = pref === 'system' ? (media.matches ? 'dark' : 'light') : (pref === 'dark' ? 'dark' : 'light');
        const theme = current.theme || {};
        const allowed = (Array.isArray(theme.available) ? theme.available : ['blue','purple','green','orange']).filter(x => ['blue','purple','green','orange'].includes(x));
        const saved = localStorage.getItem('zo_desktop_theme');
        document.documentElement.dataset.tint = theme.allow_user_change !== false && allowed.includes(saved) ? saved : (allowed.includes(theme.default) ? theme.default : 'blue');
        document.querySelectorAll('.theme-option').forEach(button => { button.hidden = !allowed.includes(button.dataset.theme); button.disabled = theme.allow_user_change === false || current.features?.theme_enabled === false; });
    }
    media.addEventListener('change', appearance);
    appearance();
    function notice(item) {
        const activeTime = value => !value ? null : Date.parse(/^[\d-]+ [\d:]+$/.test(value) ? value.replace(' ', 'T') + '+08:00' : value);
        const start = activeTime(item.start_at), end = activeTime(item.end_at);
        if (item.enabled === false || start && start > Date.now() || end && end < Date.now()) return;
        const signature = String(item.id || JSON.stringify(item));
        if (seen.has(signature)) return;
        seen.add(signature);
        try { localStorage.setItem('zo_runtime_seen_ids', JSON.stringify([...seen].slice(-200))); } catch {}
        const box = document.createElement('section'); box.className = 'runtime-notice';
        const title = document.createElement('strong'); text(title, item.title);
        const body = document.createElement('p'); text(body, item.content);
        box.append(title, body);
        if (safeSite(item.link)) { const link = document.createElement('button'); link.textContent = '查看详情'; link.onclick = () => window.electronAPI.openSiteWindow(safeSite(item.link)); box.append(link); }
        const close = document.createElement('button'); close.textContent = item.require_ack || item.level === 'critical' ? '我已阅读' : '关闭'; close.onclick = () => box.remove(); box.append(close);
        if (true) { const mask = document.createElement('div'); mask.className = 'runtime-modal'; mask.append(box); close.onclick = () => mask.remove(); document.body.append(mask); }
        else document.body.append(box);
    }
    function runState(state = {}) {
        if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
        const mode = ['normal','maintenance','disabled'].includes(state.mode) ? state.mode : 'normal';
        const disabled = mode === 'disabled' || state.can_run === false;
        const action = ['notice','lock','exit'].includes(state.action) ? state.action : 'notice';
        document.body.dataset.runMode = mode;
        let box = document.getElementById('runtimeState');
        if (!box) { box = document.createElement('section'); box.id = 'runtimeState'; document.body.append(box); }
        box.replaceChildren(); box.hidden = mode === 'normal' && !disabled;
        box.className = (disabled || mode === 'maintenance') && action === 'lock' ? 'runtime-lock' : 'runtime-banner';
        const title = document.createElement('h2'); title.textContent = disabled ? '客户端已停止运行' : '客户端维护中';
        const message = document.createElement('p'); text(message, state.message || state.close_reason || ''); box.append(title, message);
        if (state.resume_at) { const resume = document.createElement('p'); text(resume, '预计恢复：' + state.resume_at); box.append(resume); }
        if (safeSite(state.link)) { const link = document.createElement('button'); link.textContent = '查看公告'; link.onclick = () => window.electronAPI.openSiteWindow(safeSite(state.link)); box.append(link); }
        if (exitTimer) clearTimeout(exitTimer);
        if ((disabled || mode === 'maintenance') && action === 'exit') exitTimer = setTimeout(() => window.electronAPI.quitApp(), 1000);
    }
    window.ClientRuntime = {
        config: () => current,
        apply(config) {
            if (!config || typeof config !== 'object' || Array.isArray(config)) return;
            current = config; appearance(); runState(config.run_state);
            if (typeof API !== 'undefined') {
                const site = safeSite(config.app?.site_url); const api = safeSite(config.app?.api_base);
                if (site) SITE_BASE = site.replace(/\/$/, '');
                if (api && new URL(api).pathname === '/api/desktop') API_BASE = api;
            }
            document.querySelectorAll('.title-text,.auth-brand').forEach(node => { if (typeof config.app?.name === 'string') text(node, config.app.name); });
            window.DynamicUI?.apply(config);
            window.Layout225?.apply(config);
            window.Thread226?.apply();
            for (const item of Array.isArray(config.announcements) ? config.announcements : []) if (item && typeof item === 'object') notice(item);
            const auth = config.auth || {}, features = config.features || {};
            const visible = (selector, enabled) => document.querySelectorAll(selector).forEach(el => { el.style.display = enabled ? '' : 'none'; });
            visible('.tab-btn[data-tab="login"], #tab-login', auth.login_enabled !== false);
            visible('.tab-btn[data-tab="register"], #tab-register', auth.register_enabled !== false);
            visible('#qqLoginSubmit', auth.qq_login_enabled !== false);
            visible('.nav-item[data-page="search"]', features.search_enabled !== false);
            visible('.nav-item[data-page="notifications"]', features.notifications_enabled !== false);
            const controls = {'medals_enabled': '[data-native-page="medals"]', 'tasks_enabled': '[data-native-page="tasks"]', 'profile_save_enabled': '#personalSettingsBox button[type="submit"]', 'reply_enabled': '#submitReply', 'theme_enabled': '.theme-option', 'tray_enabled': '#backgroundModeToggle'};
            for (const [key, selector] of Object.entries(controls)) document.querySelectorAll(selector).forEach(el => el.disabled = features[key] === false);
            document.querySelectorAll('.reply-box').forEach(el => { el.hidden = features.reply_enabled === false; });
            if (features.tray_enabled === false) window.electronAPI.setBackgroundMode(false);
            if (auth.bind_mobile_required === true && !bindShown && typeof API !== 'undefined' && API.getUser()) {
                API.getUserInfo().then(response => { if (response.status === 'success' && response.data?.mobile_bound === false) { bindShown = true; window.electronAPI.showAuthWindow(); } });
            }
        }, safeSite
    };
    document.addEventListener('DOMContentLoaded', () => {
        const mode = document.getElementById('appearanceMode');
        if (mode) { mode.value = localStorage.getItem('zo_desktop_appearance') || 'system'; mode.addEventListener('change', () => { localStorage.setItem('zo_desktop_appearance', mode.value); appearance(); }); }
        window.electronAPI.onClientConfig?.(config => window.ClientRuntime.apply(config));
    });
})();
