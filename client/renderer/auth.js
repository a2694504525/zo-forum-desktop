import './modules/api-domains.js';
(function () {
    const message = document.getElementById('authMessage');
    const loginButton = document.getElementById('loginSubmit');
    const registerButton = document.getElementById('registerSubmit');
    let announcementUrl = '';
    let remoteAuth = {};
    let configLoading = false;

    function setMessage(text, type = '') {
        message.textContent = text || '';
        message.className = 'auth-message' + (type ? ' ' + type : '');
    }

    function setBusy(button, busy, label) {
        button.disabled = busy;
        button.textContent = busy ? '请稍候...' : label;
    }

    async function enterClient() {
        setMessage('登录成功，正在进入客户端...', 'success');
        if (!await window.electronAPI.authComplete()) setMessage('请先绑定手机，再进入客户端', 'error');
    }

    async function restoreSession() {
        const user = await API.restoreSession();
        const card = document.getElementById('sessionCard');
        if (!user) {
            card.classList.add('hidden');
            return null;
        }
        document.getElementById('sessionUsername').textContent = user.username || ('UID ' + user.uid);
        card.classList.remove('hidden');
        return user;
    }

    async function login() {
        if (remoteAuth.login_enabled === false || remoteAuth.password_login_enabled===false) return setMessage(remoteAuth.disabled_message || '登录功能当前已关闭', 'error');
        if(remoteAuth.captcha_enabled===true)return window.electronAPI.openSiteWindow('https://www.zozse.cn/member.php?mod=logging&action=login');
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!username || !password) return setMessage('请输入用户名和密码', 'error');
        setBusy(loginButton, true, '登录并进入');
        try {
            const response = await API.login(username, password);
            if (response.status !== 'success') return setMessage(response.message || '登录失败', 'error');
            const user = await API.restoreSession();
            if (!user) return setMessage('登录状态保存失败，请重试', 'error');
            await enterClient();
        } catch (error) {
            setMessage('登录请求失败：' + error.message, 'error');
        } finally {
            setBusy(loginButton, false, '登录并进入');
        }
    }

    async function register() {
        if (remoteAuth.register_enabled === false) return setMessage(remoteAuth.disabled_message || '注册功能当前已关闭', 'error');
        if(remoteAuth.captcha_enabled===true)return window.electronAPI.openSiteWindow('https://www.zozse.cn/member.php?mod=register');
        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regPasswordConfirm').value;
        const agreement = document.getElementById('regAgreement').checked;
        if (username.length < 3 || username.length > 15 || !/^[^\s<>"']+$/.test(username)) return setMessage('用户名应为3-15个字符，且不能包含空格或特殊符号', 'error');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage('请输入有效邮箱', 'error');
        if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setMessage('密码应为8-64位，并同时包含字母和数字', 'error');
        if (password !== confirm) return setMessage('两次输入的密码不一致', 'error');
        if (!agreement) return setMessage('请先同意用户协议和隐私规则', 'error');
        setBusy(registerButton, true, '注册并进入');
        try {
            const response = await API.register(username, password, email, confirm, agreement);
            if (response.status !== 'success') return setMessage(response.message || '注册失败', 'error');
            const user = await API.restoreSession();
            if (!user) return setMessage('注册成功，但自动登录失败，请切换到登录页', 'error');
            await enterClient();
        } catch (error) {
            setMessage('注册请求失败：' + error.message, 'error');
        } finally {
            setBusy(registerButton, false, '注册并进入');
        }
    }

    async function loadClientInfo() {
        if (configLoading) return;
        configLoading = true;
        try {
        const appInfo = await window.electronAPI.getAppInfo().catch(() => ({ version: '--' }));
        document.getElementById('versionText').textContent = 'v' + (appInfo.version || '--');
        const response = await API.getClientConfig();
        if (response.status !== 'success' || !response.data) {
            const reason = response.message || '请检查网络连接';
            document.getElementById('announcementContent').textContent = `公告读取失败：${reason}`;
            document.getElementById('updateText').textContent = '版本信息读取失败，可稍后重试';
            return;
        }
        const config = response.data;
        window.ClientRuntime.apply(config);
        remoteAuth = config.auth || {}; applyAuth(config);
        document.querySelectorAll('.auth-tab').forEach(tab => {
            const enabled = tab.dataset.tab === 'register' ? remoteAuth.register_enabled !== false : remoteAuth.login_enabled !== false;
            tab.style.display = enabled ? '' : 'none';
        });
        if (remoteAuth.login_enabled === false && remoteAuth.register_enabled !== false) {
            document.querySelector('.auth-tab[data-tab="register"]').click();
        }
        const announcement = config.announcement || {};
        document.getElementById('announcementTitle').textContent = announcement.title || '客户端公告';
        document.getElementById('announcementContent').textContent = announcement.enabled === false ? '' : String(announcement.content || '').replace(/\|/g, '\n');
        const hasUpdate = API.compareVersions(config.latest_version || '0', appInfo.version || '0') > 0;
        document.getElementById('updateText').textContent = hasUpdate ? `发现新版本 ${config.latest_version}` : '当前已是最新版本';
        announcementUrl = announcement.link || config.download_url || '';
        document.getElementById('announcementLink').classList.toggle('hidden', !announcementUrl);
        } finally {
            configLoading = false;
        }
    }

    document.getElementById('btnMin').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('btnClose').addEventListener('click', () => window.electronAPI.close());
    document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(item => item.classList.toggle('active', item === tab));
        document.getElementById('loginPanel').classList.toggle('active', tab.dataset.tab === 'login');
        document.getElementById('registerPanel').classList.toggle('active', tab.dataset.tab === 'register');
        setMessage('');
    }));
    loginButton.addEventListener('click', login);
    const captcha=document.createElement('button');captcha.id='captchaField';captcha.type='button';captcha.className='ghost';captcha.textContent='在论坛完成验证码验证';captcha.hidden=true;captcha.onclick=()=>window.electronAPI.openSiteWindow('https://www.zozse.cn/member.php?mod=logging&action=login');document.getElementById('loginPanel').append(captcha);
    function applyAuth(config){remoteAuth=config.auth||{};loginButton.disabled=remoteAuth.login_enabled===false||remoteAuth.password_login_enabled===false;registerButton.disabled=remoteAuth.register_enabled===false;captcha.hidden=remoteAuth.captcha_enabled!==true;document.querySelector('.auth-tab[data-tab="login"]').hidden=remoteAuth.login_enabled===false||remoteAuth.password_login_enabled===false;document.querySelector('.auth-tab[data-tab="register"]').hidden=remoteAuth.register_enabled===false;if(remoteAuth.login_enabled===false)setMessage(remoteAuth.disabled_message||'登录功能当前已关闭','error');}
    window.electronAPI.onClientConfig(applyAuth);
    registerButton.addEventListener('click', register);
    document.getElementById('loginPassword').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
    document.getElementById('regPasswordConfirm').addEventListener('keydown', event => { if (event.key === 'Enter') register(); });
    document.getElementById('continueButton').addEventListener('click', enterClient);
    document.getElementById('switchAccountButton').addEventListener('click', async () => {
        API.clearUser();
        await window.electronAPI.clearAuthCookies();
        document.getElementById('sessionCard').classList.add('hidden');
        setMessage('已退出原账号，请重新登录', 'success');
    });
    document.getElementById('announcementLink').addEventListener('click', () => { if (announcementUrl) window.electronAPI.openExternal(announcementUrl); });

    if (window.electronAPI.onUpdateAvailable) {
        window.electronAPI.onUpdateAvailable(update => {
            const version = update.latestVersion || update.latest_version || '';
            const changelog = Array.isArray(update.changelog) ? update.changelog.filter(Boolean) : [];
            document.getElementById('announcementTitle').textContent = version ? `发现新版本 ${version}` : '发现客户端更新';
            document.getElementById('announcementContent').textContent = changelog.length
                ? changelog.map((item, index) => `${index + 1}. ${item}`).join('\n')
                : '新版本已经发布，登录客户端后可以自动下载并安装。';
            document.getElementById('updateText').textContent = version ? `可更新至 ${version}` : '发现可用更新';
        });
    }

    loadClientInfo();
    setInterval(loadClientInfo, 600000);
    restoreSession().catch(() => setMessage('登录状态检查失败，请重新登录', 'error'));
})();
