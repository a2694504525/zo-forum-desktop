import {escapeHtml, formatBytes} from './ui.js';
export function createAuthApp(context) {
    async function syncSessionState() {
        try {
            await API.restoreSession();
        } catch (error) {
            console.error('恢复登录状态失败:', error);
        }
    }

    function bindAuthModal() {
        const initialProfileLogin = document.getElementById('btnLogin2');
        if (initialProfileLogin) {
            initialProfileLogin.addEventListener('click', () => openAuthModal('login'));
        }
        document.getElementById('authClose').addEventListener('click', closeAuthModal);
        context.authModal.addEventListener('click', (event) => {
            if (event.target === context.authModal) {
                closeAuthModal();
            }
        });

        document.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', () => setAuthTab(button.dataset.tab));
        });

        document.getElementById('loginSubmit').addEventListener('click', doLogin);
        document.getElementById('regSubmit').addEventListener('click', doRegister);
        document.getElementById('qqLoginSubmit').addEventListener('click', doQQLogin);
        document.getElementById('loginPassword').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                doLogin();
            }
        });
        document.getElementById('regPasswordConfirm').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                doRegister();
            }
        });
    }

    function setAuthTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === 'tab-' + tab);
        });
        document.getElementById('authTitle').textContent = tab === 'register' ? '注册' : '登录';
        showAuthMsg('', '');
    }

    function openAuthModal() { window.electronAPI.showAuthWindow(); }

    function closeAuthModal() {
        context.authModal.classList.add('hidden');
    }

    async function doQQLogin() {
        if (context.clientConfig && context.clientConfig.auth && context.clientConfig.auth.qq_login_enabled === false) {
            showAuthMsg(context.remoteDisabledMessage(), 'error');
            return;
        }
        const button = document.getElementById('qqLoginSubmit');
        button.disabled = true;
        button.textContent = '等待 QQ 授权...';
        try {
            const result = await window.electronAPI.openQQLogin();
            if (!result || result.status === 'cancelled') return;
            if (result.status !== 'success') {
                showAuthMsg(result.message || 'QQ 登录状态同步失败，请重试', 'error');
                return;
            }
            const user = await API.restoreSession();
            if (!user) {
                showAuthMsg('QQ 授权已完成，请按页面提示完成账号绑定后重试', 'error');
                return;
            }
            updateLoginButton();
            closeAuthModal();
            context.showToast('QQ 登录成功', 'success');
            context.switchPage('home');
        } finally {
            button.disabled = false;
            button.textContent = '使用 QQ 登录 / 注册';
        }
    }

    async function doLogin() {
        if (context.clientConfig && context.clientConfig.auth && context.clientConfig.auth.login_enabled === false) {
            showAuthMsg(context.remoteDisabledMessage(), 'error');
            return;
        }
        const submitButton = document.getElementById('loginSubmit');
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!username || !password) {
            showAuthMsg('请输入用户名和密码', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = '登录中...';
        try {
            const response = await API.login(username, password);
            if (response.status !== 'success') {
                showAuthMsg(response.message || '登录失败', 'error');
                return;
            }

            const restored = await API.restoreSession();
            if (!restored) {
                showAuthMsg('账号验证成功，但登录状态未能保存，请重试', 'error');
                return;
            }
            API.setUser({ uid: restored.uid, username: restored.username });

            updateLoginButton();
            showAuthMsg('登录成功', 'success');
            context.showToast('已登录，客户端会自动保持会话', 'success');
            setTimeout(() => {
                closeAuthModal();
                if (context.currentPage === 'settings') {
                    context.switchPage('home');
                } else if (context.currentPage === 'profile') {
                    context.showProfile();
                } else if (context.currentPage === 'notifications') {
                    context.showNotifications(context.currentNotificationsType);
                }
            }, 400);
        } catch (error) {
            console.error('登录失败:', error);
            showAuthMsg('登录时发生异常，请重试', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = '登录';
        }
    }

    async function doRegister() {
        if (context.clientConfig && context.clientConfig.auth && context.clientConfig.auth.register_enabled === false) {
            showAuthMsg(context.remoteDisabledMessage(), 'error');
            return;
        }
        const submitButton = document.getElementById('regSubmit');
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const email = document.getElementById('regEmail').value.trim();
        const passwordConfirm = document.getElementById('regPasswordConfirm').value;
        const agreement = document.getElementById('regAgreement').checked;
        if (!username || !password || !email) {
            showAuthMsg('请填写完整信息', 'error');
            return;
        }
        if (username.length < 3 || username.length > 15) {
            showAuthMsg('用户名长度应为3-15个字符', 'error');
            return;
        }
        if (!/^[^\s<>"']+$/.test(username)) {
            showAuthMsg('用户名不能包含空格或特殊符号', 'error');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showAuthMsg('请输入有效的邮箱地址', 'error');
            return;
        }
        if (password.length < 8 || password.length > 64) {
            showAuthMsg('密码长度应为8-64位', 'error');
            return;
        }
        if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            showAuthMsg('密码必须同时包含字母和数字', 'error');
            return;
        }
        if (password !== passwordConfirm) {
            showAuthMsg('两次输入的密码不一致', 'error');
            return;
        }
        if (!agreement) {
            showAuthMsg('请先同意用户协议和隐私规则', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = '注册中...';
        try {
            const response = await API.register(username, password, email, passwordConfirm, agreement);
            if (response.status !== 'success') {
                showAuthMsg(response.message || '注册失败', 'error');
                return;
            }

            const restored = await API.restoreSession();
            if (!restored) {
                showAuthMsg('账号已创建，但自动登录失败，请切换到登录页重试', 'error');
                return;
            }
            API.setUser({ uid: restored.uid, username: restored.username });

            updateLoginButton();
            showAuthMsg('注册成功', 'success');
            context.showToast('账号已创建并登录成功', 'success');
            setTimeout(() => {
                closeAuthModal();
                if (context.currentPage === 'settings') {
                    context.switchPage('home');
                } else if (context.currentPage === 'profile') {
                    context.showProfile();
                }
            }, 400);
        } catch (error) {
            console.error('注册失败:', error);
            showAuthMsg('注册时发生异常，请重试', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = '注册';
        }
    }

    function showAuthMsg(message, type) {
        context.authMessage.textContent = message;
        context.authMessage.className = type ? 'auth-message ' + type : 'auth-message';
    }

    function updateLoginButton() {
        const button = document.getElementById('btnLogin');
        const user = API.getUser();

        if (!user) {
            button.textContent = '登录 / 注册';
            button.onclick = () => openAuthModal('login');
            return;
        }

        button.textContent = user.username + ' / 退出';
        button.onclick = async () => {
            await logoutCurrentUser();
        };
    }

    async function logoutCurrentUser() {
        try {
            await API.logout();
        } catch (error) {
            console.error('退出登录失败:', error);
        } finally {
            API.clearUser();
            if (window.electronAPI && window.electronAPI.clearAuthCookies) {
                await window.electronAPI.clearAuthCookies();
            }
            updateLoginButton();
            context.showToast('已退出登录', 'success');
            context.switchPage('home');
        }
    }

    function ensureLoggedIn(actionLabel, requireSession = false) {
        const hasUser = !!API.getUser();
        if (hasUser) {
            return true;
        }
        context.showToast((actionLabel || '此操作') + '需要先登录', 'error');
        openAuthModal('login');
        return false;
    }

    function isAuthError(response) {
        return response && response.message && response.message.indexOf('请先登录') !== -1;
    }
    return {syncSessionState, bindAuthModal, setAuthTab, openAuthModal, closeAuthModal, doQQLogin, doLogin, doRegister, showAuthMsg, updateLoginButton, logoutCurrentUser, ensureLoggedIn, isAuthError};
}
