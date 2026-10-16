import {escapeHtml, formatBytes} from './ui.js';
export function createProfileApp(context) {
    async function showProfile() {
        const requestId = ++context.profileRequestId;
        context.switchPage('profile', { skipLoad: true });
        context.setActiveNav('profile');

        const box = document.getElementById('profileBox');
        let user = API.getUser();
        if (!user) {
            await context.syncSessionState();
            if (requestId !== context.profileRequestId || context.currentPage !== 'profile') return;
            user = API.getUser();
        }
        if (!user) {
            box.innerHTML = `
                <div class="profile-empty">
                    <p>登录后查看个人中心</p>
                    <button id="profileLoginButton" class="btn-primary">立即登录</button>
                </div>
            `;
            document.getElementById('profileLoginButton').addEventListener('click', () => context.openAuthModal('login'));
            return;
        }

        box.innerHTML = '<div class="loading">加载中...</div>';
        const response = await API.getUserInfo(user.uid);
        if (requestId !== context.profileRequestId || context.currentPage !== 'profile') return;
        if (response.status !== 'success' || !response.data) {
            box.innerHTML = '<div class="empty">加载失败，请重新登录</div>';
            return;
        }

        const profile = response.data;
        box.innerHTML = `
            <img class="profile-avatar" src="${context.safeImageUrl(API.getAvatar(profile.uid, 'big'))}" alt="">
            <div class="profile-name">${escapeHtml(profile.username)}</div>
            <div class="profile-group">${escapeHtml(profile.groupname || '普通会员')}</div>
            <div class="profile-stats">
                <div><div class="stat-value">${API.formatNum((profile.count && profile.count.threads) || 0)}</div><div class="stat-label">主题</div></div>
                <div><div class="stat-value">${API.formatNum((profile.count && profile.count.posts) || 0)}</div><div class="stat-label">帖子</div></div>
                <div><div class="stat-value">${API.formatNum(profile.credits || 0)}</div><div class="stat-label">积分</div></div>
            </div>
            <button id="btnLogout" class="btn-primary">退出登录</button>
        `;

        const logoutButton = document.getElementById('btnLogout');
        logoutButton.insertAdjacentHTML('beforebegin', `
            <div class="profile-actions">
                <button class="profile-action" data-native-page="tasks"><span class="profile-action-icon">✓</span><span><strong>任务中心</strong><small>领取任务、查看进度与奖励</small></span></button>
                <button class="profile-action" data-action="signin"><span class="profile-action-icon">☑</span><span><strong>论坛签到</strong><small>在论坛原生页面完成签到</small></span></button>
                <button class="profile-action" data-native-page="medals">
                    <span class="profile-action-icon">🏅</span><span><strong>勋章中心</strong><small>查看并领取可用勋章</small></span>
                </button>
                <button class="profile-action" data-native-page="medals" data-owned="true">
                    <span class="profile-action-icon css-icon medal-owned-icon">★</span><span><strong>我的勋章</strong><small>查看已获得的论坛勋章</small></span>
                </button>
                <button class="profile-action" data-native-page="personal-settings">
                    <span class="profile-action-icon css-icon profile-settings-icon">设</span><span><strong>个人设置</strong><small>在客户端内管理论坛个人资料</small></span>
                </button>
                <button class="profile-action" data-native-page="certification">
                    <span class="profile-action-icon css-icon certification-icon">认</span><span><strong>论坛认证</strong><small>实名认证、手机认证与官方认证</small></span>
                </button>
                <button class="profile-action" data-native-page="password-security">
                    <span class="profile-action-icon css-icon security-icon">锁</span><span><strong>密码安全</strong><small>密码、邮箱和安全验证设置</small></span>
                </button>
            </div>
        `);
        box.querySelectorAll('.profile-action').forEach(button => {
            button.addEventListener('click', () => {
                const page = button.dataset.nativePage;
                if(button.dataset.action==='signin'&&window.DynamicUI.featureEnabled('sign_in_enabled'))window.electronAPI.openSiteWindow(SITE_BASE+'/plugin.php?id=dsu_paulsign:sign');
                if(page==='tasks'&&window.DynamicUI.featureEnabled('tasks_enabled'))showTasks();
                if (page === 'medals') showMedals(button.dataset.owned === 'true');
                if (page === 'personal-settings') showPersonalSettings();
                if (page === 'certification') showCertificationSettings();
                if (page === 'password-security') showPasswordSecurity();
            });
        });
        logoutButton.addEventListener('click', context.logoutCurrentUser);
    }

    function bindNativeAccountPages() {
        document.querySelectorAll('.native-back').forEach(button => button.addEventListener('click', showProfile));
        document.querySelectorAll('.settings-back').forEach(button => button.addEventListener('click', showProfile));
    }

    async function showMedals(owned = false) {
        if(!window.DynamicUI.featureEnabled('medals_enabled'))return;
        context.switchPage('medals', { skipLoad: true });
        context.setActiveNav('profile');
        const box = document.getElementById('medalsBox');
        box.innerHTML = '<div class="loading">正在加载勋章...</div>';
        const response = await API.getMedals(owned);
        if (context.currentPage !== 'medals') return;
        const items = response.data || [];
        box.innerHTML = items.length ? `<div class="native-grid medal-grid">${items.map(item => `
            <article class="native-item medal-item">
                <img src="${context.safeImageUrl(item.image)}" alt="">
                <div class="native-item-body"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || item.status || (owned ? '已获得' : '论坛勋章'))}</p></div>
                ${!owned && item.canClaim ? `<button class="btn-primary medal-claim" data-id="${item.id}">领取</button>` : `<span class="native-status">${escapeHtml(item.status || '已获得')}</span>`}
            </article>`).join('')}</div>` : `<div class="empty">${escapeHtml(response.message || '暂无可领取勋章')}</div>`;
        box.querySelectorAll('.medal-claim').forEach(button => button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = '处理中...';
            const result = await API.claimMedal(button.dataset.id);
            context.showToast(result.message || '操作完成', result.status === 'error' ? 'error' : '');
            await showMedals(owned);
        }));
    }

    async function showTasks(type = 'new') {
        if(!window.DynamicUI.featureEnabled('tasks_enabled'))return;
        context.switchPage('tasks', { skipLoad: true });
        context.setActiveNav('profile');
        const box = document.getElementById('tasksBox');
        const types = [['new', '可领取'], ['doing', '进行中'], ['done', '已完成'], ['failed', '已失败']];
        box.innerHTML = `<div class="native-tabs">${types.map(([key, label]) => `<button data-type="${key}" class="${key === type ? 'active' : ''}">${label}</button>`).join('')}</div><div class="loading">正在加载任务...</div>`;
        box.querySelectorAll('.native-tabs button').forEach(button => button.addEventListener('click', () => showTasks(button.dataset.type)));
        const response = await API.getTasks(type);
        if (context.currentPage !== 'tasks') return;
        const tabs = box.querySelector('.native-tabs').outerHTML;
        const items = response.data || [];
        box.innerHTML = tabs + (items.length ? `<div class="native-list">${items.map(item => `
            <article class="native-item task-item">
                ${item.image ? `<img src="${context.safeImageUrl(item.image)}" alt="">` : '<span class="task-placeholder">✓</span>'}
                <div class="native-item-body"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || '论坛任务')}</p>${type === 'doing' ? `<div class="native-progress"><span style="width:${Math.max(0, Math.min(100, item.progress))}%"></span></div><small>完成进度 ${item.progress}%</small>` : ''}<small>${escapeHtml(item.reward)}</small></div>
                ${item.action ? `<button class="btn-primary task-action" data-id="${item.id}" data-action="${item.action}">${escapeHtml(item.actionLabel || (item.action === 'apply' ? '领取任务' : '领取奖励'))}</button>` : ''}
            </article>`).join('')}</div>` : `<div class="empty">${escapeHtml(response.message || '当前分类暂无任务')}</div>`);
        box.querySelectorAll('.native-tabs button').forEach(button => button.addEventListener('click', () => showTasks(button.dataset.type)));
        box.querySelectorAll('.task-action').forEach(button => button.addEventListener('click', async () => {
            button.disabled = true;
            const result = await API.runTaskAction(button.dataset.id, button.dataset.action);
            context.showToast(result.message || '操作完成', result.status === 'error' ? 'error' : '');
            await showTasks(type === 'new' ? 'doing' : type);
        }));
    }

    async function showPersonalSettings(op = 'base') {
        context.switchPage('personal-settings', { skipLoad: true });
        context.setActiveNav('profile');
        const box = document.getElementById('personalSettingsBox');
        const groups = [['base', '基本资料'], ['contact', '联系方式'], ['edu', '教育情况'], ['work', '工作情况'], ['info', '个人信息']];
        const tabsHtml = `<div class="native-tabs profile-tabs">${groups.map(([key, label]) => `<button data-op="${key}" class="${key === op ? 'active' : ''}">${label}</button>`).join('')}</div>`;
        box.innerHTML = tabsHtml + '<div class="loading">正在加载个人资料...</div>';
        box.querySelectorAll('.profile-tabs button').forEach(button => button.addEventListener('click', () => showPersonalSettings(button.dataset.op)));
        const response = await API.getPersonalSettings(op);
        if (context.currentPage !== 'personal-settings') return;
        if (response.status !== 'success') {
            box.innerHTML = tabsHtml + `<div class="empty">${escapeHtml(response.message || '个人设置加载失败')}</div>`;
            appendAccountFallback(box, response.fallback_url);
            box.querySelectorAll('.profile-tabs button').forEach(button => button.addEventListener('click', () => showPersonalSettings(button.dataset.op)));
            return;
        }
        const data = response.data;
        box.innerHTML = tabsHtml + `<form id="nativeProfileForm" class="native-profile-form">${data.fields.map(field => {
            const label = `<label for="native_${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>`;
            if (field.type === 'textarea') return `<div class="native-form-row">${label}<textarea id="native_${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" rows="4">${escapeHtml(field.value)}</textarea></div>`;
            if (field.type === 'select') return `<div class="native-form-row">${label}<select id="native_${escapeHtml(field.name)}" name="${escapeHtml(field.name)}">${field.options.map(option => `<option value="${escapeHtml(option.value)}"${option.selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
            return `<div class="native-form-row">${label}<input id="native_${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" type="${field.inputType === 'radio' ? 'text' : escapeHtml(field.inputType || 'text')}" value="${escapeHtml(field.value)}"></div>`;
        }).join('')}<div class="native-form-actions"><button type="submit" class="btn-primary">保存个人资料</button></div></form>`;
        box.querySelectorAll('.profile-tabs button').forEach(button => button.addEventListener('click', () => showPersonalSettings(button.dataset.op)));
        document.getElementById('nativeProfileForm').addEventListener('submit', async event => {
            event.preventDefault();
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = '保存中...';
            const entries = [...data.hidden, ...Array.from(new FormData(event.currentTarget).entries())];
            const result = await API.savePersonalSettings(data.action, entries);
            context.showToast(result.message || '保存完成', result.status === 'error' ? 'error' : '');
            submit.disabled = false;
            submit.textContent = '保存个人资料';
        });
    }

    async function showCertificationSettings(type = 1) {
        if (!context.ensureLoggedIn('论坛认证')) return;
        context.switchPage('certification', { skipLoad: true });
        context.setActiveNav('profile');
        const box = document.getElementById('certificationBox');
        const tabs = `<div class="native-tabs certification-tabs"><button data-type="1" class="${type === 1 ? 'active' : ''}">实名认证</button><button data-type="2" class="${type === 2 ? 'active' : ''}">手机认证</button><button data-type="3" class="${type === 3 ? 'active' : ''}">论坛官方认证</button></div>`;
        box.innerHTML = tabs + '<div id="certificationFormHost"><div class="loading">正在读取认证资料...</div></div>';
        box.querySelectorAll('.certification-tabs button').forEach(button => button.addEventListener('click', () => showCertificationSettings(Number(button.dataset.type))));
        await showNativeSecurityForm('certificationFormHost', () => API.getCertificationSettings(type), '提交认证资料');
    }

    async function showPasswordSecurity() {
        if (!context.ensureLoggedIn('密码安全')) return;
        context.switchPage('password-security', { skipLoad: true });
        context.setActiveNav('profile');
        await showNativeSecurityForm('passwordSecurityBox', () => API.getPasswordSettings(), '保存安全设置');
    }

    function appendAccountFallback(box, url) {
        const safe = window.ClientRuntime.safeSite(url);
        if (!safe) return;
        const button = document.createElement('button'); button.className = 'btn-secondary'; button.textContent = '在论坛页面完成'; button.onclick = () => window.electronAPI.openSiteWindow(safe); box.append(button);
    }

    async function showNativeSecurityForm(boxId, loader, submitLabel) {
        const box = document.getElementById(boxId);
        box.innerHTML = '<div class="loading">正在读取论坛设置...</div>';
        const response = await loader();
        if (response.status !== 'success') {
            box.innerHTML = `<div class="empty">${escapeHtml(response.message || '设置加载失败')}</div>`;
            appendAccountFallback(box, response.fallback_url);
            return;
        }
        const data = response.data;
        if (!data.fields.length) {
            box.innerHTML = '<div class="empty">当前账号没有可填写的设置项目，或认证资料已通过审核并被锁定。</div>';
            return;
        }
        box.innerHTML = `<form class="native-profile-form security-form">${data.fields.map(field => {
            const name = escapeHtml(field.name);
            const label = `<label>${escapeHtml(field.label)}</label>`;
            if (field.type === 'textarea') return `<div class="native-form-row">${label}<textarea name="${name}" rows="4">${escapeHtml(field.value)}</textarea></div>`;
            if (field.type === 'select') return `<div class="native-form-row">${label}<select name="${name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}"${option.selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
            const type = /password/i.test(field.name) ? 'password' : (field.inputType === 'email' ? 'email' : 'text');
            return `<div class="native-form-row">${label}<input name="${name}" type="${type}" value="${type === 'password' ? '' : escapeHtml(field.value)}" autocomplete="off">${field.image ? `<img class="security-code-image" src="${context.safeImageUrl(field.image)}" alt="验证码">` : ''}${field.help ? `<small>${escapeHtml(field.help)}</small>` : ''}</div>`;
        }).join('')}<div class="native-form-actions"><button type="submit" class="btn-primary">${submitLabel}</button></div></form>`;
        const form = box.querySelector('form');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            button.textContent = '保存中...';
            const entries = [...data.hidden, ...Array.from(new FormData(form).entries())];
            const result = await API.savePersonalSettings(data.action, entries);
            context.showToast(result.message || '保存完成', result.status === 'error' ? 'error' : '');
            button.disabled = false;
            button.textContent = submitLabel;
        });
    }

    async function showNotifications(type) {
        const requestId = ++context.notificationRequestId;
        context.currentNotificationsType = type || context.currentNotificationsType;
        context.switchPage('notifications', { skipLoad: true });
        context.setActiveNav('notifications');

        let user = API.getUser();
        if (!user) {
            await context.syncSessionState();
            if (requestId !== context.notificationRequestId || context.currentPage !== 'notifications') return;
            user = API.getUser();
        }
        if (!user) {
            context.notificationsBox.innerHTML = `
                <div class="profile-empty">
                    <p>登录后查看系统通知和互动提醒</p>
                    <button id="notificationsLoginButton" class="btn-primary">立即登录</button>
                </div>
            `;
            document.getElementById('notificationsLoginButton').addEventListener('click', () => context.openAuthModal('login'));
            return;
        }

        context.notificationsBox.innerHTML = '<div class="loading">加载中...</div>';
        const response = await API.getNotifications(context.currentNotificationsType, 1);
        if (requestId !== context.notificationRequestId || context.currentPage !== 'notifications') return;
        if (response.status !== 'success') {
            context.notificationsBox.innerHTML = `<div class="empty">${escapeHtml(context.isAuthError(response) ? '登录态未同步，请先重新登录一次' : (response.message || '消息加载失败'))}</div>`;
            return;
        }

        const items = response.data || [];
        context.notificationsBox.innerHTML = `
            <div class="notification-tabs">
                <button class="notification-tab${context.currentNotificationsType === 'system' ? ' active' : ''}" data-type="system">系统通知</button>
                <button class="notification-tab${context.currentNotificationsType === 'interactive' ? ' active' : ''}" data-type="interactive">互动提醒</button>
            </div>
            <div class="notification-list">
                ${items.length ? items.map(renderNotificationItem).join('') : '<div class="empty">暂时没有消息</div>'}
            </div>
        `;

        context.notificationsBox.querySelectorAll('.notification-tab').forEach(button => {
            button.addEventListener('click', () => showNotifications(button.dataset.type));
        });
    }

    function renderNotificationItem(item) {
        const unread = Number(item.new || 0) > 0;
        const title = item.type === 'interactive' ? '互动提醒' : '系统通知';
        const author = item.author ? escapeHtml(item.author) : 'ZO论坛';
        const note = escapeHtml(cleanNotificationText(item.note || ''));

        return `
            <div class="notification-item${unread ? ' unread' : ''}">
                <div class="notification-avatar">${item.type === 'interactive' ? '💬' : '🔔'}</div>
                <div class="notification-content">
                    <div class="notification-top">
                        <div class="notification-title">${author} · ${title}</div>
                        <div class="notification-time">${API.formatTime(item.dateline)}</div>
                    </div>
                    <div class="notification-text">${note || '暂无详情'}</div>
                </div>
                ${unread ? '<span class="notification-badge">新</span>' : ''}
            </div>
        `;
    }

    function cleanNotificationText(text) {
        const container = document.createElement('div');
        container.innerHTML = text;
        return container.textContent.replace(/\s+/g, ' ').trim();
    }
    return {showProfile, bindNativeAccountPages, showMedals, showTasks, showPersonalSettings, showCertificationSettings, showPasswordSecurity, appendAccountFallback, showNativeSecurityForm, showNotifications, renderNotificationItem, cleanNotificationText};
}
