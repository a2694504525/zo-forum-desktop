import './modules/api-domains.js';
(function () {
    let config = {}, selected = 'code';
    function allowed(mode){const a=config.auth||{},sms=a.sms_enabled===true;return mode==='password'?a.login_enabled!==false&&a.password_login_enabled!==false:mode==='qq'?a.login_enabled!==false&&a.qq_login_enabled!==false:mode==='code'?sms&&a.login_enabled!==false&&a.sms_login_enabled!==false:mode==='register'?sms&&a.register_enabled!==false&&a.sms_register_enabled!==false:mode==='bind'?sms&&!!API.getUser()&&a.sms_bind_enabled!==false:sms&&a.sms_reset_enabled!==false;}
    const host = document.createElement('section'); host.className = 'sms-form'; host.hidden = true;
    const segments = document.createElement('div'); segments.className = 'sms-segments';
    for (const [id, label] of [['code','验证码'],['password','密码'],['qq','QQ'],['register','注册'],['reset','找回'],['bind','绑定']]) {
        const button = document.createElement('button'); button.textContent = label; button.dataset.mode = id;
        button.addEventListener('click', () => render(id)); segments.append(button);
    }
    host.append(segments);
    const formHost = document.createElement('div'); host.append(formHost);
    const message = document.getElementById('authMessage');
    const show = (value, error = false) => { message.textContent = value; message.className = 'auth-message ' + (error ? 'error' : 'success'); };
    function render(mode) {
        selected = mode;
        const emailRegistration=config.auth?.register_enabled!==false&&(config.auth?.sms_enabled!==true||config.auth?.sms_register_enabled===false);
        document.querySelector('.auth-tabs').hidden = config.auth?.sms_enabled === true&&!emailRegistration;
        document.getElementById('loginPanel').hidden = !allowed('password') || config.auth?.sms_enabled === true && mode !== 'password';
        document.getElementById('registerPanel').hidden = !emailRegistration||config.auth?.sms_enabled===true&&mode!=='email-register';
        if (mode === 'password') document.getElementById('loginPanel').classList.add('active');
        if (typeof qq !== 'undefined') qq.hidden = !allowed('qq') || config.auth?.sms_enabled===true&&mode!=='qq';
        segments.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        formHost.replaceChildren();
        if (mode==='email-register'||!allowed(mode) || mode === 'password' || mode === 'qq') return;
        const form = document.createElement('form'); form.className = 'sms-form';
        const input = (name, placeholder, type = 'text') => { const el = document.createElement('input'); el.name = name; el.placeholder = placeholder; el.type = type; el.required = true; form.append(el); return el; };
        const mobile = input('mobile', '手机号', 'tel'); mobile.autocomplete = 'tel'; mobile.maxLength = 11;
        const row = document.createElement('div'); row.className = 'sms-code';
        const code = document.createElement('input'); code.name = 'code'; code.placeholder = '短信验证码'; code.required = true; code.autocomplete = 'one-time-code'; code.maxLength = config.sms_capability?.code_length || 8; code.inputMode = 'numeric';
        const send = document.createElement('button'); send.type = 'button'; send.textContent = '获取验证码'; row.append(code, send); form.append(row);
        if (mode === 'register') {
            const username = input('username', '用户名（由论坛配置决定）'); username.required = config.sms_capability?.username_required === true;
            const password = input('password', '设置密码', 'password'); password.minLength = 8; password.autocomplete = 'new-password';
            const label = document.createElement('label'); label.className = 'agreement'; const agreement = document.createElement('input'); agreement.type = 'checkbox'; agreement.name = 'agreement'; agreement.value = '1'; agreement.required = true; label.append(agreement, document.createTextNode('我同意论坛用户协议和隐私规则')); form.append(label);
        }
        if (mode === 'reset') { const password = input('new_password', '新密码', 'password'); password.minLength = 8; password.autocomplete = 'new-password'; }
        if (mode === 'bind') { const p = document.createElement('p'); p.textContent = '绑定手机后可继续进行论坛认证。'; form.append(p); }
        const submit = document.createElement('button'); submit.className = 'primary'; submit.textContent = {code:'登录并进入',register:'注册并进入',reset:'重置密码',bind:'绑定手机'}[mode]; form.append(submit);
        const fallback = document.createElement('button'); fallback.type = 'button'; fallback.textContent = '图形验证码或操作异常时，在论坛网页完成'; fallback.onclick = () => window.electronAPI.openSiteWindow('https://www.zozse.cn/' + (mode === 'bind' ? 'home.php?mod=spacecp&ac=plugin&id=comiis_sms:comiis_setup' : mode === 'register' ? 'member.php?mod=register' : mode === 'reset' ? 'plugin.php?id=comiis_sms:comiis_sms_post&action=lostpw' : 'plugin.php?id=comiis_sms:comiis_login&action=login')); form.append(fallback);
        let sending = false, retryAt = 0, timer;
        send.onclick = async () => {
            if (sending || Date.now() < retryAt) return;
            if (!/^1\d{10}$/.test(mobile.value)) return show('请输入有效的11位手机号', true);
            sending = true; send.disabled = true;
            try {
                const response = await API.sms('send', {mobile: mobile.value, type: mode === 'code' ? 'login' : mode});
                show(response.message || response.msg || '发送失败', response.status !== 'success');
                if (response.status === 'success') {
                    retryAt = Date.now() + Math.max(60, Number(response.data?.retry_after) || 60) * 1000;
                    const tick = () => { const left = Math.ceil((retryAt - Date.now()) / 1000); send.textContent = left > 0 ? left + '秒后重试' : '获取验证码'; send.disabled = left > 0; if (left <= 0 || !send.isConnected) clearInterval(timer); };
                    timer = setInterval(tick, 500); tick();
                } else send.disabled = false;
            } finally { sending = false; if (!retryAt) send.disabled = false; }
        };
        let busy = false;
        form.onsubmit = async event => {
            event.preventDefault(); if (busy) return;
            if (!/^1\d{10}$/.test(mobile.value) || !/^\d{4,8}$/.test(code.value)) return show('请填写有效的手机号和验证码', true);
            busy = true; submit.disabled = true;
            try {
                const values = Object.fromEntries(new FormData(form));
                let response = await API.sms(mode === 'code' ? 'login' : mode, values);
                if (mode === 'reset' && response.status === 'pending' && response.data?.stage === 1) response = await API.sms('reset', {...values, stage: 1});
                if (mode === 'reset' && response.status === 'pending' && response.data?.stage === 2) {
                    const accounts = response.data.accounts || [];
                    if (accounts.length === 1) response = await API.sms('reset', {...values, stage: 2, uid: accounts[0].uid});
                    else {
                        const choose = document.createElement('select'); for (const account of accounts) { const option = document.createElement('option'); option.value = account.uid; option.textContent = account.username; choose.append(option); }
                        const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = '确认修改所选账号密码';
                        confirm.onclick = async () => { confirm.disabled = true; const result = await API.sms('reset', {...values, stage: 2, uid: choose.value}); show(result.message, result.status !== 'success'); if (result.status === 'success') render('code'); else confirm.disabled = false; };
                        form.append(choose, confirm); show('请选择要重置的账号'); return;
                    }
                }
                show(response.message || response.msg || '操作失败', response.status !== 'success');
                if (response.status === 'success' && ['code','register','bind'].includes(mode)) {
                    const user = await API.restoreSession();
                    if (user) await window.electronAPI.authComplete(); else show('操作已完成，请重新登录以同步状态', true);
                }
            } catch { show('请求失败，请重试或在论坛网页完成', true); }
            finally { busy = false; submit.disabled = false; }
        };
        formHost.append(form);
    }
    document.querySelector('.auth-card').prepend(host);
    const qq = document.createElement('button'); qq.className = 'ghost'; qq.textContent = 'QQ 登录'; qq.hidden = true;
    qq.onclick = async () => { qq.disabled = true; try { const result = await window.electronAPI.openQQLogin(); if (result.status === 'success') { await API.restoreSession(); await window.electronAPI.authComplete(); } else show(result.message || '授权已完成请按页面提示操作', true); } finally { qq.disabled = false; } };
    document.querySelector('.auth-card').append(qq);
    document.querySelectorAll('.auth-tab').forEach(tab=>tab.addEventListener('click',()=>render(tab.dataset.tab==='register'?'email-register':'password')));
    function apply(next) {
        if (JSON.stringify(next.auth) === JSON.stringify(config.auth) && Object.keys(config).length) return;
        config = {...next,sms_capability:next.sms_capability||config.sms_capability}; const auth = config.auth || {};
        host.hidden = auth.sms_enabled !== true;
        qq.hidden = !allowed('qq');
        for (const button of segments.children) {
            const mode = button.dataset.mode;
            button.hidden = !allowed(mode);
        }
        if ([...segments.children].find(b => b.dataset.mode === selected)?.hidden) selected = [...segments.children].find(b => !b.hidden)?.dataset.mode || 'code';
        document.getElementById('loginPanel').hidden = auth.password_login_enabled === false;
        if (auth.sms_enabled && auth.sms_register_enabled !== false) document.querySelector('.auth-tab[data-tab="register"]').hidden = true;
        render(auth.bind_mobile_required && allowed('bind') ? 'bind' : selected);
        if(!['code','password','qq'].some(allowed))show(auth.disabled_message||'登录功能当前已关闭',true);
    }
    Promise.all([API.getClientConfig(),API.request(API_BASE + '/sms_config.php')]).then(([result,capability]) => { if (result.status === 'success') {const next=result.data;if(capability.status==='success'){next.sms_capability=capability.data;for(const key of ['sms_enabled','sms_register_enabled','sms_login_enabled','sms_reset_enabled'])if(capability.data[key]===false)next.auth[key]=false;}apply(next);} });
    window.electronAPI.onClientConfig(apply);
})();
