import {escapeHtml, formatBytes} from './ui.js';
export function createSettingsApp(context) {
    function bindClientFeatures() {
        const checkUpdateButton = document.getElementById('btnCheckUpdate');
        if (checkUpdateButton) {
            checkUpdateButton.addEventListener('click', () => {
                manualCheckForUpdates();
            });
        }
        const settingsCheckButton = document.getElementById('btnSettingsCheckUpdate');
        if (settingsCheckButton) settingsCheckButton.addEventListener('click', manualCheckForUpdates);

        const backgroundToggle = document.getElementById('backgroundModeToggle');
        if (backgroundToggle) {
            const savedBackground=localStorage.getItem('zo_desktop_background_mode');
            const enabled = savedBackground !== 'false';
            backgroundToggle.checked = enabled;
            if (window.electronAPI && window.electronAPI.setBackgroundMode) {
                if(savedBackground===null){window.electronAPI.getAppInfo().then(info=>{const defaultEnabled=info.platform!=='linux';backgroundToggle.checked=defaultEnabled;window.electronAPI.setBackgroundMode(defaultEnabled);});}else window.electronAPI.setBackgroundMode(enabled);
            }
            backgroundToggle.addEventListener('change', async () => {
                const nextEnabled = backgroundToggle.checked;
                localStorage.setItem('zo_desktop_background_mode', String(nextEnabled));
                if (window.electronAPI && window.electronAPI.setBackgroundMode) {
                    await window.electronAPI.setBackgroundMode(nextEnabled);
                }
                context.showToast(nextEnabled ? '已开启后台运行，关闭窗口后将保留在托盘' : '已关闭后台运行，关闭窗口将退出客户端');
            });
        }

        bindModalDismiss(context.noticeModal, closeNoticeModal);
        bindModalDismiss(context.updateModal, closeUpdateModal);

        const noticeLater = document.getElementById('noticeLater');
        if (noticeLater) {
            noticeLater.addEventListener('click', closeNoticeModal);
        }

        const noticeAction = document.getElementById('noticeAction');
        if (noticeAction) {
            noticeAction.addEventListener('click', () => {
                const url = noticeAction.dataset.url || '';
                if (url) {
                    context.openExternalUrl(url);
                }
            });
        }

        const updateLater = document.getElementById('updateLater');
        if (updateLater) {
            updateLater.addEventListener('click', closeUpdateModal);
        }

        const updateAction = document.getElementById('updateAction');
        if (updateAction) {
            updateAction.addEventListener('click', startUpdateDownload);
        }

        if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
            context.removeUpdateListener = window.electronAPI.onUpdateAvailable((payload) => {
                handleUpdatePayload(payload, false);
            });
        }
        if (window.electronAPI && window.electronAPI.onUpdateStatus) {
            context.removeUpdateStatusListener = window.electronAPI.onUpdateStatus(handleUpdateStatus);
        }
        if (window.electronAPI && window.electronAPI.onShowAuthModal) {
            window.electronAPI.onShowAuthModal(() => context.openAuthModal('login'));
        }
    }

    function bindModalDismiss(modal, closeHandler) {
        if (!modal) {
            return;
        }
        const closeButton = modal.querySelector('.modal-close');
        if (closeButton) {
            closeButton.addEventListener('click', closeHandler);
        }
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeHandler();
            }
        });
    }

    async function initClientFeatures() {
        await refreshAppInfo();
        await loadClientConfigAndNotice();
        await syncCachedUpdateInfo();
    }

    async function refreshAppInfo() {
        try {
            if (window.electronAPI && window.electronAPI.getAppInfo) {
                context.appInfo = await window.electronAPI.getAppInfo() || context.appInfo;
            }
        } catch (error) {
            console.error('读取应用信息失败:', error);
        }
        if (context.appVersionText) {
            context.appVersionText.textContent = context.appInfo.version || '--';
        }
        const settingsVersion = document.getElementById('settingsVersionText');
        if (settingsVersion) settingsVersion.textContent = context.appInfo.version || '--';
    }

    function startClientConfigPolling() {
        if (context.clientConfigPollTimer) clearInterval(context.clientConfigPollTimer);
        context.clientConfigPollTimer = setInterval(() => loadClientConfigAndNotice(true), Math.max(60, Number(context.clientConfig?.run_state?.check_interval) || 600) * 1000);
    }

    async function loadClientConfigAndNotice(silent = false) {
        if (context.clientConfigLoading) return;
        context.clientConfigLoading = true;
        try {
            const response = await API.getClientConfig();
            if (response.status !== 'success' || !response.data) {
                if (!silent) setUpdateStatus('配置读取失败');
                const settingsChangelog = document.getElementById('settingsChangelog');
                if (settingsChangelog) settingsChangelog.innerHTML = `<p>更新说明读取失败：${escapeHtml(response.message || '请检查网络连接')}</p>`;
                return;
            }
            const nextSignature = JSON.stringify(response.data);
            if (silent && nextSignature === context.clientConfigSignature) return;
            context.clientConfigSignature = nextSignature;
            context.clientConfig = response.data;
            applyRemoteControl(context.clientConfig);
            startClientConfigPolling();
            if (context.clientConfig.client_enabled === false) {
                maybeShowAnnouncement({
                    enabled: true,
                    id: 'client-maintenance',
                    title: '客户端维护中',
                    content: context.clientConfig.maintenance_message || '客户端当前正在维护，请稍后再试。',
                    button_text: '',
                    link: ''
                });
                setUpdateStatus('维护中');
            }
            const settingsChangelog = document.getElementById('settingsChangelog');
            if (settingsChangelog) {
                settingsChangelog.innerHTML = renderUpdateContent(context.appInfo.version, context.clientConfig.latest_version || '', context.clientConfig.changelog || []);
            }
            const latestVersion = context.clientConfig.latest_version || '';
            if (latestVersion && context.appInfo.version) {
                const hasUpdate = API.compareVersions(latestVersion, context.appInfo.version) > 0;
                setUpdateStatus(hasUpdate ? `发现 ${latestVersion}` : '已是最新');
                const belowMinimum = context.clientConfig.minimum_version
                    && API.compareVersions(context.clientConfig.minimum_version, context.appInfo.version) > 0;
                if (hasUpdate && (belowMinimum || context.clientConfig.force_update)) {
                    handleUpdatePayload({
                        currentVersion: context.appInfo.version,
                        latestVersion,
                        downloadUrl: context.clientConfig.download_url || '',
                        feedUrl: context.clientConfig.update_feed_url || '',
                        forceUpdate: true,
                        changelog: context.clientConfig.changelog || []
                    }, false);
                }
            } else {
                setUpdateStatus('待检查');
            }
            if (!Array.isArray(context.clientConfig.announcements) || context.clientConfig.announcements.length === 0) maybeShowAnnouncement(context.clientConfig.announcement);
        } catch (error) {
            console.error('读取客户端配置失败:', error);
            if (!silent) setUpdateStatus('配置读取失败');
        } finally {
            context.clientConfigLoading = false;
        }
    }

    function applyRemoteControl(config) {
        window.ClientRuntime.apply(config);
        const auth = config.auth || {};
        const features = config.features || {};
        const setVisible = (selector, visible) => {
            document.querySelectorAll(selector).forEach(element => {
                element.style.display = visible ? '' : 'none';
            });
        };
        setVisible('.tab-btn[data-tab="login"], #tab-login', auth.login_enabled !== false);
        setVisible('.tab-btn[data-tab="register"], #tab-register', auth.register_enabled !== false);
        setVisible('#qqLoginSubmit', auth.qq_login_enabled !== false);
        setVisible('.nav-item[data-page="search"]', features.search_enabled !== false);
        setVisible('.nav-item[data-page="notifications"]', features.notifications_enabled !== false);
        if (context.authModal && !context.authModal.classList.contains('hidden')) {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.tab === 'login' && auth.login_enabled === false && auth.register_enabled !== false) {
                context.setAuthTab('register');
            } else if (activeTab && activeTab.dataset.tab === 'register' && auth.register_enabled === false && auth.login_enabled !== false) {
                context.setAuthTab('login');
            } else if (auth.login_enabled === false && auth.register_enabled === false && auth.qq_login_enabled === false) {
                context.closeAuthModal();
                context.showToast(remoteDisabledMessage(), 'error');
            }
        }
        if ((context.currentPage === 'search' && features.search_enabled === false)
            || (context.currentPage === 'notifications' && features.notifications_enabled === false)) {
            context.switchPage('home');
        }
        if (features.posting_enabled === false && context.newThreadModal && !context.newThreadModal.classList.contains('hidden')) {
            context.closeNewThreadModal();
            context.showToast('客户端发帖功能已被后台关闭', 'error');
        }
    }

    function remoteDisabledMessage() {
        return (context.clientConfig && context.clientConfig.auth && context.clientConfig.auth.disabled_message)
            || '该功能当前已关闭，请稍后再试。';
    }

    async function syncCachedUpdateInfo() {
        try {
            if (!window.electronAPI || !window.electronAPI.getCachedUpdateInfo) {
                return;
            }
            const cached = await window.electronAPI.getCachedUpdateInfo();
            if (cached) {
                handleUpdatePayload(cached, false);
            }
        } catch (error) {
            console.error('读取缓存更新信息失败:', error);
        }
    }

    async function manualCheckForUpdates() {
        const checkUpdateButtons = [document.getElementById('btnCheckUpdate'), document.getElementById('btnSettingsCheckUpdate')].filter(Boolean);
        checkUpdateButtons.forEach(button => { button.disabled = true; button.textContent = '检查中...'; });
        setUpdateStatus('检查中...');
        try {
            const result = window.electronAPI && window.electronAPI.checkForUpdates
                ? await window.electronAPI.checkForUpdates()
                : null;
            if (!result || result.status !== 'success') {
                context.showToast((result && result.message) || '检查更新失败', 'error');
                setUpdateStatus('检查失败');
                return;
            }
            if (result.hasUpdate && result.data) {
                handleUpdatePayload(result.data, false);
                context.showToast(`发现新版本 ${result.data.latestVersion}`, 'success');
            } else {
                setUpdateStatus('已是最新');
                context.showToast('当前已经是最新版本', 'success');
            }
        } catch (error) {
            console.error('手动检查更新失败:', error);
            setUpdateStatus('检查失败');
            context.showToast('检查更新失败，请稍后重试', 'error');
        } finally {
            checkUpdateButtons.forEach(button => { button.disabled = false; button.textContent = '检查更新'; });
        }
    }

    function handleUpdatePayload(payload, silent) {
        if (!payload) {
            return;
        }
        const latestVersion = payload.latestVersion || payload.latest_version || '';
        if (latestVersion) {
            setUpdateStatus(`发现 ${latestVersion}`);
        } else {
            setUpdateStatus('可更新');
        }
        if (!silent) {
            showUpdateModal(payload);
        }
    }

    function setUpdateStatus(text) {
        if (context.appUpdateText) {
            context.appUpdateText.textContent = text || '--';
        }
        const settingsStatus = document.getElementById('settingsUpdateText');
        if (settingsStatus) settingsStatus.textContent = text || '--';
    }

    function maybeShowAnnouncement(announcement) {
        if (!announcement || !announcement.enabled) {
            return;
        }
        const noticeId = String(announcement.id || '').trim();
        if (!noticeId) {
            return;
        }
        if (context.lastAnnouncementId === noticeId) {
            return;
        }
        context.lastAnnouncementId = noticeId;
        showNoticeModal(announcement);
    }

    function showNoticeModal(announcement) {
        if (!context.noticeModal) {
            return;
        }
        const noticeId = String(announcement.id || '').trim();
        document.getElementById('noticeTitle').textContent = announcement.title || '公告';
        document.getElementById('noticeBody').innerHTML = context.renderMarkdown(announcement.content || '');
        const noticeAction = document.getElementById('noticeAction');
        if (announcement.link) {
            noticeAction.dataset.url = announcement.link;
            noticeAction.textContent = announcement.button_text || '查看详情';
            noticeAction.classList.remove('hidden');
        } else {
            noticeAction.dataset.url = '';
            noticeAction.classList.add('hidden');
        }
        context.noticeModal.dataset.noticeId = noticeId;
        context.noticeModal.classList.remove('hidden');
    }

    function closeNoticeModal() {
        if (context.noticeModal) context.noticeModal.dataset.noticeId = '';
        if (context.noticeModal) {
            context.noticeModal.classList.add('hidden');
        }
    }

    function showUpdateModal(updateInfo) {
        if (!context.updateModal) {
            return;
        }
        const latestVersion = updateInfo.latestVersion || updateInfo.latest_version || '';
        const currentVersion = updateInfo.currentVersion || context.appInfo.version || '';
        const changelog = Array.isArray(updateInfo.changelog) ? updateInfo.changelog.filter(Boolean) : [];
        document.getElementById('updateTitle').textContent = latestVersion ? `发现新版本 ${latestVersion}` : '发现新版本';
        document.getElementById('updateBody').innerHTML = renderUpdateContent(currentVersion, latestVersion, changelog);
        const updateAction = document.getElementById('updateAction');
        updateAction.disabled = false;
        updateAction.dataset.state = 'ready';
        updateAction.textContent = updateInfo.manualUpdate?'前往下载 Linux 更新':'下载并安装';
        resetUpdateProgress();
        const forceUpdate = !!(updateInfo.forceUpdate || updateInfo.force_update);
        context.updateModal.dataset.forceUpdate = forceUpdate ? '1' : '0';
        document.getElementById('updateLater').classList.toggle('hidden', forceUpdate);
        document.getElementById('updateClose').classList.toggle('hidden', forceUpdate);
        context.updateModal.classList.remove('hidden');
    }

    async function startUpdateDownload() {
        const action = document.getElementById('updateAction');
        if (action.dataset.state === 'downloaded') {
            const result = await window.electronAPI.launchDownloadedInstaller();
            if (!result || result.status !== 'success') {
                context.showToast((result && result.message) || '无法打开安装程序', 'error');
            }
            return;
        }
        if (!window.electronAPI || !window.electronAPI.downloadUpdate) return;
        action.disabled = true;
        action.dataset.state = 'downloading';
        action.textContent = '下载中...';
        document.getElementById('updateProgress').classList.remove('hidden');
        const result = await window.electronAPI.downloadUpdate();
        if(result?.status==='success'&&result.external){action.disabled=false;action.dataset.state='ready';action.textContent='已打开官网下载';document.getElementById('updateProgress').classList.add('hidden');context.showToast('请安装下载的 Linux 软件包完成更新','success');return;}
        if (!result || result.status !== 'success') {
            handleUpdateStatus({ state: 'error', message: (result && result.message) || '下载更新失败' });
        }
    }

    function handleUpdateStatus(status) {
        if (!status) return;
        const action = document.getElementById('updateAction');
        const progress = document.getElementById('updateProgress');
        progress.classList.remove('hidden');
        if (status.state === 'downloading') {
            const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
            document.getElementById('updateProgressText').textContent = '正在下载更新';
            document.getElementById('updateProgressPercent').textContent = `${percent.toFixed(1)}%`;
            document.getElementById('updateProgressBar').style.width = `${percent}%`;
            document.getElementById('updateProgressMeta').textContent = `${formatBytes(status.transferred)} / ${formatBytes(status.total)} · ${formatBytes(status.bytesPerSecond)}/秒`;
            setUpdateStatus(`下载 ${percent.toFixed(0)}%`);
        } else if (status.state === 'downloaded') {
            document.getElementById('updateProgressText').textContent = '下载完成';
            document.getElementById('updateProgressPercent').textContent = '100%';
            document.getElementById('updateProgressBar').style.width = '100%';
            document.getElementById('updateProgressMeta').textContent = '请点击下方按钮打开安装程序，安装目录由您选择';
            action.disabled = false;
            action.dataset.state = 'downloaded';
            action.textContent = '打开安装程序';
            setUpdateStatus('等待用户安装');
        } else if (status.state === 'installing') {
            document.getElementById('updateProgressText').textContent = '下载完成，正在安装';
            document.getElementById('updateProgressPercent').textContent = '100%';
            document.getElementById('updateProgressBar').style.width = '100%';
            document.getElementById('updateProgressMeta').textContent = '客户端即将自动退出并完成安装';
            action.disabled = true;
            action.dataset.state = 'installing';
            action.textContent = '正在安装...';
            setUpdateStatus('正在安装');
        } else if (status.state === 'error') {
            document.getElementById('updateProgressText').textContent = '更新失败';
            document.getElementById('updateProgressMeta').textContent = status.message || '请稍后重试';
            action.disabled = false;
            action.dataset.state = 'ready';
            action.textContent = '重新下载';
            setUpdateStatus('更新失败');
            context.showToast(status.message || '更新失败', 'error');
        }
    }

    function resetUpdateProgress() {
        const progress = document.getElementById('updateProgress');
        progress.classList.add('hidden');
        document.getElementById('updateProgressText').textContent = '准备下载...';
        document.getElementById('updateProgressPercent').textContent = '0%';
        document.getElementById('updateProgressBar').style.width = '0';
        document.getElementById('updateProgressMeta').textContent = '';
    }

    function closeUpdateModal() {
        if (context.updateModal && context.updateModal.dataset.forceUpdate === '1') return;
        if (context.updateModal) {
            context.updateModal.classList.add('hidden');
        }
    }

    function renderUpdateContent(currentVersion, latestVersion, changelog) {
        const header = [
            currentVersion ? `当前版本：${escapeHtml(currentVersion)}` : '',
            latestVersion ? `最新版本：${escapeHtml(latestVersion)}` : ''
        ].filter(Boolean).join('<br>');
        const listHtml = changelog.length
            ? `<ul class="modal-list">${changelog.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
            : '<p>本次版本包含稳定性修复和功能更新。</p>';
        return `${header ? `<p>${header}</p>` : ''}${listHtml}`;
    }
    return {bindClientFeatures, bindModalDismiss, initClientFeatures, refreshAppInfo, startClientConfigPolling, loadClientConfigAndNotice, applyRemoteControl, remoteDisabledMessage, syncCachedUpdateInfo, manualCheckForUpdates, handleUpdatePayload, setUpdateStatus, maybeShowAnnouncement, showNoticeModal, closeNoticeModal, showUpdateModal, startUpdateDownload, handleUpdateStatus, resetUpdateProgress, closeUpdateModal, renderUpdateContent};
}
