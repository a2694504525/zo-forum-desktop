import {pagerHtml,bindPager} from './paging.js';
import {escapeHtml, formatBytes} from './ui.js';
export function createThreadApp(context) {
    function bindComposeModal() {
        document.getElementById('newThreadClose').addEventListener('click', closeNewThreadModal);
        document.getElementById('newThreadCancel').addEventListener('click', closeNewThreadModal);
        document.getElementById('newThreadSubmit').addEventListener('click', submitNewThread);
        context.newThreadModal.addEventListener('click', (event) => {
            if (event.target === context.newThreadModal) {
                closeNewThreadModal();
            }
        });
    }

    function openNewThread(fid, forumName) {
        if(!window.DynamicUI.featureEnabled('posting_enabled'))return context.showToast('客户端发帖功能当前已关闭','error');
        if (context.clientConfig && context.clientConfig.features && context.clientConfig.features.posting_enabled === false) {
            context.showToast('客户端发帖功能当前已关闭', 'error');
            return;
        }
        if (!context.ensureLoggedIn('发帖', true)) {
            return;
        }

        context.composeState.fid = Number(fid);
        context.composeState.forumName = forumName || '当前版块';
        document.getElementById('composeForumText').textContent = '将发布到：' + context.composeState.forumName;
        document.getElementById('newThreadSubject').value = '';
        document.getElementById('newThreadMessage').value = '';
        context.composeMessage.textContent = '';
        context.composeMessage.className = 'auth-message';
        context.newThreadModal.classList.remove('hidden');
        document.getElementById('newThreadSubject').focus();
    }

    function closeNewThreadModal() {
        context.newThreadModal.classList.add('hidden');
    }

    async function submitNewThread() {
        if(!window.DynamicUI.featureEnabled('posting_enabled'))return context.showToast('客户端发帖功能当前已关闭','error');
        const subject = document.getElementById('newThreadSubject').value.trim();
        const message = document.getElementById('newThreadMessage').value.trim();

        if (!context.composeState.fid) {
            setComposeMessage('未找到目标版块', 'error');
            return;
        }
        if (!subject || !message) {
            setComposeMessage('请填写标题和内容', 'error');
            return;
        }

        setComposeMessage('发布中...', '');
        const response = await API.createThread(context.composeState.fid, subject, message);
        if (response.status !== 'success') {
            if (context.isAuthError(response)) {
                closeNewThreadModal();
                context.ensureLoggedIn('发帖');
                return;
            }
            setComposeMessage(response.message || '发帖失败', 'error');
            return;
        }

        closeNewThreadModal();
        context.showToast('帖子发布成功', 'success');
        context.showForum(context.composeState.fid);
    }

    function setComposeMessage(message, type) {
        context.composeMessage.textContent = message;
        context.composeMessage.className = type ? 'auth-message ' + type : 'auth-message';
    }

    async function showThread(tid, page = 1) {
        if (!API.getUser()) {
            context.showToast('登录后查看帖子', 'error');
            context.openAuthModal('login');
            return;
        }
        const requestId = ++context.threadRequestId;
        if (context.currentPage !== 'thread') {
            context.lastPageBeforeThread = context.currentPage;
        }

        context.currentThreadId = Number(tid);
        context.currentThreadPage = Number(page);

        context.switchPage('thread', { skipLoad: true, keepNav: true });
        const container = document.getElementById('threadDetail');
        container.innerHTML = '<div class="loading">加载中...</div>';

        const response = await API.getThreadDetail(tid, page);
        if (requestId !== context.threadRequestId || context.currentPage !== 'thread' || Number(tid) !== context.currentThreadId || Number(page) !== context.currentThreadPage) return;
        if (response.status !== 'success' || !response.data) {
            container.innerHTML = '<div class="empty">帖子不存在或无法访问</div>';
            return;
        }

        const thread = response.data;
        const sortOptions = thread.sort_options || [];
        const sortTemplateHtml = thread.sort_template_html || '';
        const replyList = thread.reply_list || [];
        const totalReplyPages = Number(thread.total_reply_pages || 1);
        const replySummary = Number(thread.total_replies != null ? thread.total_replies : thread.replies || 0);
        const sortHtml = sortTemplateHtml ? `
            <section class="thread-sort-template">${sortTemplateHtml}</section>
        ` : sortOptions.length ? `
            <section class="thread-sort-template">
                ${renderThreadSortCard(thread.sort_title, sortOptions)}
            </section>
        ` : '';

        const legacyPagerHtml = totalReplyPages > 1 ? `
            <div class="reply-pager">
                <div class="reply-pager-info">第 ${context.currentThreadPage} / ${totalReplyPages} 页，共 ${replySummary} 条回复</div>
                <div class="compose-actions">
                    <button id="replyPrevPage" class="btn-secondary"${context.currentThreadPage <= 1 ? ' disabled' : ''}>上一页</button>
                    <button id="replyNextPage" class="btn-secondary"${context.currentThreadPage >= totalReplyPages ? ' disabled' : ''}>下一页</button>
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <span class="back-link" id="backFromThread">← 返回</span>
            <div class="thread-detail-header">
                <div class="thread-detail-title">${escapeHtml(thread.subject)}</div>
                <div class="thread-detail-meta">
                    <span>${escapeHtml(thread.author || '')}</span>
                    <span>${API.formatTime(thread.dateline)}</span>
                    <span>浏览 ${API.formatNum(thread.views || 0)}</span>
                    <span>回复 ${API.formatNum(thread.replies || 0)}</span>
                </div>
            </div>
            ${sortHtml}
            <div class="thread-detail-content">${thread.message || ''}</div>
            <div class="reply-box">
                <h3>发表评论</h3>
                <textarea id="replyContent" placeholder="输入回复内容..."></textarea>
                <button id="submitReply" class="btn-primary">回复</button>
            </div>
            <div class="reply-list">
                ${replyList.length ? replyList.map(reply => `
                    <div class="reply-item">
                        <img class="avatar" src="${context.safeImageUrl(reply.avatar || API.getAvatar(reply.authorid, 'small'))}" alt="" style="width:38px;height:38px;">
                        <div class="reply-content">
                            <div class="reply-author">${escapeHtml(reply.author)} · ${API.formatTime(reply.dateline)}</div>
                            <div class="reply-text">${reply.message || ''}</div>
                        </div>
                    </div>
                `).join('') : '<div class="empty">暂无回复</div>'}
            </div>
            ${totalReplyPages>1?pagerHtml(context.currentThreadPage,totalReplyPages,replySummary):''}
        `;

        window.Thread226.decorate(context,container,thread);
        document.getElementById('backFromThread').addEventListener('click', restoreFromThread);
        bindRichContentLinks(container);
        bindRichContentMedia(container);
        enhanceCopyableContent(container);
        bindThreadSortActions(container, tid);
        document.getElementById('submitReply').addEventListener('click', async () => {
            if(!window.DynamicUI.featureEnabled('reply_enabled'))return context.showToast('客户端回复功能当前已关闭','error');
            if (!context.ensureLoggedIn('回帖', true)) {
                return;
            }

            const content = document.getElementById('replyContent').value.trim();
            if (!content) {
                context.showToast('请输入回复内容', 'error');
                return;
            }

            const submitButton = document.getElementById('submitReply');
            submitButton.disabled = true;
            submitButton.textContent = '提交中...';
            try {
                const result = await API.replyThread(tid, content);
                if (result.status !== 'success') {
                    if (context.isAuthError(result)) {
                        context.ensureLoggedIn('回帖', true);
                        return;
                    }
                    context.showToast(result.message || '回复失败', 'error');
                    return;
                }

                context.showToast('回复成功', 'success');
                document.getElementById('replyContent').value = '';
                showThread(tid, context.currentThreadPage);
            } catch (error) {
                console.error('回复失败:', error);
                context.showToast('回复失败，请稍后重试', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = '回复';
            }
        });

        const replyPager=container.querySelector('.pagination');if(replyPager)bindPager(replyPager,n=>showThread(tid,n),totalReplyPages);
        const prevButton = document.getElementById('replyPrevPage');
        const nextButton = document.getElementById('replyNextPage');
        if (prevButton) {
            prevButton.addEventListener('click', () => {
                if (context.currentThreadPage > 1) {
                    showThread(tid, context.currentThreadPage - 1);
                }
            });
        }
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (context.currentThreadPage < totalReplyPages) {
                    showThread(tid, context.currentThreadPage + 1);
                }
            });
        }
    }

    function restoreFromThread() {
        if (context.lastPageBeforeThread === 'forums' && context.currentForumId) {
            context.showForum(context.currentForumId);
            return;
        }
        if (context.lastPageBeforeThread === 'profile') {
            context.showProfile();
            return;
        }
        if (context.lastPageBeforeThread === 'notifications') {
            context.showNotifications(context.currentNotificationsType);
            return;
        }
        if (context.lastPageBeforeThread === 'search') {
            context.switchPage(context.lastPageBeforeThread, { skipLoad: true });
            return;
        }
        context.switchPage('home');
    }

    function bindRichContentLinks(container) {
        container.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', async (event) => {
                const authAction = link.dataset.authAction;
                const href = link.getAttribute('href') || '';
                if (authAction) {
                    event.preventDefault();
                    context.openAuthModal(authAction);
                    return;
                }

                if (!href || href === '#') {
                    event.preventDefault();
                    return;
                }

                if (/plugin\.php\?id=hidethreadsort:/i.test(href)) {
                    event.preventDefault();
                    if (window.electronAPI && window.electronAPI.openSiteWindow) {
                        await window.electronAPI.openSiteWindow(href);
                        if (context.currentThreadId) showThread(context.currentThreadId, context.currentThreadPage);
                    }
                    return;
                }

                const threadId = API.parseTid(href);
                if (threadId) {
                    event.preventDefault();
                    showThread(threadId);
                    return;
                }

                const forumId = API.parseFid(href);
                if (forumId) {
                    event.preventDefault();
                    context.showForum(forumId);
                    return;
                }

                if (/^https?:\/\//i.test(href)) {
                    event.preventDefault();
                    if (window.electronAPI && window.electronAPI.openExternal) {
                        const opened = await window.electronAPI.openExternal(href);
                        context.showToast(opened ? '已在浏览器中打开' : '链接地址无效', opened ? 'success' : 'error');
                    } else {
                        window.open(href, '_blank');
                    }
                }
            });
        });
    }

    function renderSortOptionValue(option) {
        if (!option.protected) return option.value || '';
        return `<button type="button" class="threadsort-action" data-action="${escapeHtml(option.action || 'none')}" data-url="${escapeHtml(option.action_url || '')}">${escapeHtml(option.message || '查看条件未满足')}</button>`;
    }

    function isDownloadSortOption(option) {
        const identifier = String(option.identifier || '').toLowerCase();
        const title = String(option.title || '');
        return identifier === 'xzdz' || /下载|网盘|地址/.test(title);
    }

    function getSortOptionUrl(option) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = option.value || '';
        const link = wrapper.querySelector('a[href]');
        const candidate = link ? link.getAttribute('href') : wrapper.textContent.trim();
        try {
            const url = new URL(candidate, SITE_BASE);
            return url.protocol === 'https:' ? url.toString() : '';
        } catch (error) {
            return '';
        }
    }

    function renderDownloadOption(option) {
        if (!API.getUser()) {
            return '<button type="button" class="zoz-download-btn gray threadsort-action" data-action="login">请登录下载</button>';
        }
        if (option.protected) return renderSortOptionValue(option);
        const url = getSortOptionUrl(option);
        return url
            ? `<a class="zoz-download-btn green" href="${escapeHtml(url)}">网盘下载</a>`
            : '<button type="button" class="zoz-download-btn gray" disabled>下载地址暂未设置</button>';
    }

    function renderThreadSortCard(title, options) {
        const downloadOption = options.find(isDownloadSortOption);
        const detailOptions = options.filter(option => option !== downloadOption);
        const rows = [];
        for (let index = 0; index < detailOptions.length; index += 2) {
            rows.push(`<div class="zoz-info-row">${detailOptions.slice(index, index + 2).map(option => `
                <div class="zoz-info-item${option.protected ? ' is-protected' : ''}">
                    <span class="zoz-info-label">${escapeHtml(option.title)}</span>
                    <span class="zoz-info-value">${renderSortOptionValue(option)}${option.unit ? `<span class="zoz-unit">${escapeHtml(option.unit)}</span>` : ''}</span>
                </div>`).join('')}</div>`);
        }
        const downloadRow = downloadOption ? `<div class="zoz-download-row">
            <span class="zoz-info-label">${escapeHtml(downloadOption.title)}</span>
            ${renderDownloadOption(downloadOption)}
        </div>` : '';
        return `<div class="zoz-info-card"><div class="zoz-title">${escapeHtml(title || '游戏详情')}</div>${rows.join('')}${downloadRow}</div>`;
    }

    function bindThreadSortActions(container, tid) {
        container.querySelectorAll('.threadsort-action').forEach(button => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action || 'none';
                if (action === 'reply') {
                    const input = document.getElementById('replyContent');
                    if (input) {
                        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        input.focus();
                    }
                    context.showToast('回复成功后即可查看该分类信息', 'success');
                    return;
                }
                if (action === 'login') {
                    context.openAuthModal('login');
                    return;
                }
                if (action === 'site' && button.dataset.url && window.electronAPI && window.electronAPI.openSiteWindow) {
                    context.showToast('正在打开验证窗口...', 'success');
                    await window.electronAPI.openSiteWindow(button.dataset.url);
                    showThread(tid, context.currentThreadPage);
                    return;
                }
                context.showToast(button.textContent || '当前条件未满足', 'error');
            });
        });
    }

    function bindRichContentMedia(container) {
        container.querySelectorAll('.thread-detail-content img, .reply-text img').forEach(img => {
            const handleImageError = () => {
                const fallbackSources = (img.dataset.fallbackSrcs || '').split('||').filter(Boolean);
                if (fallbackSources.length) {
                    const [nextSrc, ...rest] = fallbackSources;
                    img.dataset.fallbackSrcs = rest.join('||');
                    img.src = nextSrc;
                    return;
                }
                img.classList.add('image-load-failed');
                img.alt = '图片加载失败';
            };
            img.addEventListener('error', handleImageError);
            if (img.complete && img.naturalWidth === 0) handleImageError();
        });
    }

    function enhanceCopyableContent(container) {
        container.querySelectorAll('.thread-detail-content a[href^="http"], .thread-sort-template a[href^="http"]').forEach(link => {
            if (link.dataset.copyEnhanced === '1') {
                return;
            }
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'copy-link-btn';
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const ok = await context.copyText(link.href);
                context.showToast(ok ? '链接已复制' : '复制失败，请手动复制', ok ? 'success' : 'error');
            });
            link.dataset.copyEnhanced = '1';
            link.insertAdjacentElement('afterend', copyBtn);
        });
    }
    return {bindComposeModal, openNewThread, closeNewThreadModal, submitNewThread, setComposeMessage, showThread, restoreFromThread, bindRichContentLinks, renderSortOptionValue, isDownloadSortOption, getSortOptionUrl, renderDownloadOption, renderThreadSortCard, bindThreadSortActions, bindRichContentMedia, enhanceCopyableContent};
}
