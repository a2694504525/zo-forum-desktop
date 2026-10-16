/**
 * ZO论坛桌面客户端 - API 接口层
 * 复用网站现有 API， Electron 内通过 fetch 跨域访问 https://www.zozse.cn
 */

let SITE_BASE = 'https://www.zozse.cn';
let API_BASE = `${SITE_BASE}/api/desktop`;

// 本地存储（Electron 渲染进程可用 localStorage）
const Store = {
    get(key, fallback = null) {
        try {
            const val = localStorage.getItem('zo_desktop_' + key);
            return val ? JSON.parse(val) : fallback;
        } catch { return fallback; }
    },
    set(key, value) {
        localStorage.setItem('zo_desktop_' + key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem('zo_desktop_' + key);
    }
};

const API = {
    // 登录态仅由 Electron 会话 Cookie 管理，渲染进程不接触 sid。
    _authUrl(url) {
        return url;
    },

    async _siteRequest(url, options = {}) {
        if (!window.electronAPI || !window.electronAPI.siteRequest) {
            throw new Error('客户端网络桥接不可用');
        }
        const headers = { ...(options.headers || {}) };
        let body = options.body;
        if (body instanceof FormData) {
            body = new URLSearchParams(Array.from(body.entries())).toString();
            headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        }
        return window.electronAPI.siteRequest({
            url,
            method: options.method || 'GET',
            headers,
            body: body == null ? '' : String(body)
        });
    },

    async request(url, options = {}) {
        try {
            const res = await this._siteRequest(url, options);
            if (res.error) throw new Error(res.error);
            const text = res.text || '';
            try {
                return JSON.parse(text);
            } catch (e) {
                // 返回不是 JSON，可能是 HTML 错误页或空响应
                const preview = text.trim().slice(0, 120) || '(空响应)';
                console.error('API 非 JSON 返回:', url, preview);
                return { status: 'error', message: `接口返回异常: ${preview}`, raw: text };
            }
        } catch (err) {
            console.error('API 请求失败:', url, err.message);
            return { status: 'error', message: `网络请求失败: ${err.message}` };
        }
    },

    async fetchHtml(url) {
        try {
            const res = await this._siteRequest(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.text || '';
        } catch (err) {
            console.error('HTML 请求失败:', url, err.message);
            return '';
        }
    },

    parseHtml(html) {
        return new DOMParser().parseFromString(html || '', 'text/html');
    },

    absoluteUrl(url) {
        if (!url) return '';
        const imageCDN = window.ClientRuntime?.config()?.app?.image_cdn || 'https://tp.zozse.cn';
        const normalized = String(url).trim()
            .replace(/^https?:\/\/(?:www\.)?zozse\.cn\/data\/attachment\/forum\//i, 'https://tp.zozse.cn/forum/')
            .replace(/^(?:https?:\/\/)?tp\.zozse\.cn\//i, 'https://tp.zozse.cn/');
        if (/^https?:\/\//i.test(normalized)) return normalized.replace(/^http:/i, 'https:').replace(/^https:\/\/tp\.zozse\.cn(?=\/)/i,imageCDN.replace(/\/$/,''));
        if (normalized.startsWith('//')) return 'https:' + normalized;
        if (/^\/?data\/attachment\/forum\//i.test(normalized)) {
            return 'https://tp.zozse.cn/forum/' + normalized.replace(/^\/?data\/attachment\/forum\//i, '');
        }
        if (normalized.startsWith('/')) return SITE_BASE + normalized;
        return `${SITE_BASE}/${normalized.replace(/^\.?\//, '')}`;
    },

    decodeHtml(html) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html || '';
        return textarea.value;
    },

    plainText(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    },

    forumMessage(html, fallback = '') {
        const source = String(html || '');
        const dialog = source.match(/showDialog\(\s*['"]([^'"]+)['"]/i);
        if (dialog && dialog[1]) return this.decodeHtml(dialog[1]).replace(/<[^>]+>/g, '').trim();
        const doc = this.parseHtml(source);
        doc.querySelectorAll('script,style,noscript').forEach(node => node.remove());
        return this.plainText(doc.querySelector('#messagetext,.alert_info,.alert_error,.alert_right')?.textContent || fallback).slice(0, 180);
    },

    parseCompactNumber(text) {
        const normalized = this.plainText(text);
        if (!normalized) return 0;
        const match = normalized.match(/([\d.]+)\s*([万w]?)/i);
        if (!match) return 0;
        const value = Number(match[1]);
        if (Number.isNaN(value)) return 0;
        return /万|w/i.test(match[2]) ? Math.round(value * 10000) : Math.round(value);
    },

    parseTid(url) {
        if (!url) return 0;
        const match = url.match(/thread-(\d+)-/i) || url.match(/[?&]tid=(\d+)/i);
        return match ? Number(match[1]) : 0;
    },

    parseFid(url) {
        if (!url) return 0;
        const match = url.match(/forum-(\d+)-/i) || url.match(/[?&]fid=(\d+)/i);
        return match ? Number(match[1]) : 0;
    },

    parseUid(url) {
        if (!url) return 0;
        const match = url.match(/space-uid-(\d+)/i) || url.match(/[?&]uid=(\d+)/i);
        return match ? Number(match[1]) : 0;
    },

    compareVersions(versionA, versionB) {
        const left = String(versionA || '0').split('.').map(item => Number(item) || 0);
        const right = String(versionB || '0').split('.').map(item => Number(item) || 0);
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index += 1) {
            const a = left[index] || 0;
            const b = right[index] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    },

    uniqueById(items, key) {
        const seen = new Set();
        return (items || []).filter(item => {
            const value = item && item[key];
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
    },

    filterForumsWithContent(items) {
        return (items || []).map(item => ({
            ...item,
            sub_forums: this.filterForumsWithContent(item.sub_forums || [])
        })).filter(item => Number(item.threads || 0) > 0 || Number(item.posts || 0) > 0 || Number(item.todayposts || item.today_posts || 0) > 0 || item.sub_forums.length > 0);
    },

    parseThreadSortInfo(doc) {
        // 自定义分类模板不再使用 Discuz 默认 table.typeoption。优先识别站点
        // 当前的卡片模板，保留模板结构，样式由客户端本地 CSS 提供。
        const customCard = doc.querySelector('.zoz-info-card');
        if (customCard) {
            const cleanHtml = this.normalizeHtmlContent(customCard.outerHTML || '');
            if (this.plainText(cleanHtml)) {
                return {
                    sort_title: this.plainText(customCard.querySelector('.zoz-title')?.textContent || '游戏详情'),
                    sort_options: [],
                    sort_template_html: cleanHtml
                };
            }
        }
        const typeBox = doc.querySelector('.typeoption') || null;
        const table = (typeBox && (typeBox.matches('table') ? typeBox : typeBox.querySelector('table'))) ||
            doc.querySelector('table[summary*="分类"], table.cgtl[summary], table.cgtl');
        if (!table) {
            return { sort_title: '', sort_options: [], sort_template_html: '' };
        }

        const sortTitle = this.plainText(
            (table.querySelector('caption') || (typeBox ? typeBox.querySelector('h4, .bm_h') : null))?.textContent || ''
        );
        const sortOptions = Array.from(table.querySelectorAll('tr')).map(row => {
            const titleCell = row.querySelector('th');
            const valueCell = row.querySelector('td');
            const title = this.plainText((titleCell ? titleCell.textContent : '').replace(/[：:]\s*$/, ''));
            const value = this.normalizeHtmlContent(valueCell ? valueCell.innerHTML || '' : '');
            if (!title || !this.plainText(value)) {
                return null;
            }
            return { title, value };
        }).filter(Boolean);

        return {
            sort_title: sortTitle || (sortOptions.length ? '资源信息' : ''),
            sort_options: sortOptions,
            sort_template_html: ''
        };
    },

    withThreadSortInfo(threadData, sortInfo) {
        const nextData = { ...threadData };
        const currentOptions = Array.isArray(nextData.sort_options) ? nextData.sort_options.filter(item => item && item.title && item.value != null) : [];
        if (currentOptions.length) {
            // 接口字段包含客户端当前会话下的真实查看权限。不要再用网页模板覆盖，
            // 否则网页模板中被安全过滤掉的登录检测脚本会让按钮永远停在“未登录”。
            nextData.sort_template_html = '';
            nextData.sort_options = currentOptions.map(item => ({
                ...item,
                value: this.normalizeHtmlContent(item.value)
            }));
            nextData.sort_title = nextData.sort_title || sortInfo.sort_title || '资源信息';
            return nextData;
        }
        // 仅当旧接口没有返回结构化字段时，才使用网页中的自定义模板兜底。
        if (sortInfo && sortInfo.sort_template_html) {
            nextData.sort_template_html = sortInfo.sort_template_html;
            nextData.sort_title = sortInfo.sort_title || nextData.sort_title || '游戏详情';
        }
        if (sortInfo && Array.isArray(sortInfo.sort_options) && sortInfo.sort_options.length) {
            nextData.sort_options = sortInfo.sort_options;
            nextData.sort_title = nextData.sort_title || sortInfo.sort_title || '资源信息';
        }
        return nextData;
    },

    async fetchThreadSortInfo(tid, page = 1) {
        const html = await this.fetchHtml(`${SITE_BASE}/thread-${tid}-${page}-1.html`);
        if (!html) {
            return { sort_title: '', sort_options: [], sort_template_html: '' };
        }
        return this.parseThreadSortInfo(this.parseHtml(html));
    },

    normalizeHtmlContent(html) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = window.PostRenderer.prepare(html || '');

        wrapper.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, meta, link, base').forEach(node => node.remove());
        wrapper.querySelectorAll('.atips_close').forEach(node => node.remove());

        wrapper.querySelectorAll('style').forEach(node => {
            if (node.closest('ignore_js_op')) {
                node.remove();
            }
        });

        wrapper.querySelectorAll('[src], [href], [file], [makefile], [zoomfile], [data-src], [data-original]').forEach(node => {
            if (node.hasAttribute('src')) {
                const src = node.getAttribute('src') || '';
                const fileSrc = node.getAttribute('file') || '';
                const makefileSrc = node.getAttribute('makefile') || '';
                const zoomSrc = node.getAttribute('zoomfile') || '';
                const dataSrc = node.getAttribute('data-src') || node.getAttribute('data-original') || '';
                const candidateSources = [zoomSrc, dataSrc, src.includes('static/image/common/none.gif') ? makefileSrc : '', fileSrc, src, makefileSrc]
                    .filter(Boolean)
                    .map(item => this.absoluteUrl(item));
                const uniqueSources = [...new Set(candidateSources)];
                if (uniqueSources.length) {
                    node.setAttribute('src', uniqueSources[0]);
                    if (uniqueSources.length > 1) {
                        node.setAttribute('data-fallback-srcs', uniqueSources.slice(1).join('||'));
                    }
                }
            }

            if (node.hasAttribute('href')) {
                const href = node.getAttribute('href') || '';
                if (/member\.php\?mod=logging/i.test(href)) {
                    node.setAttribute('href', '#');
                    node.setAttribute('data-auth-action', 'login');
                } else if (/member\.php\?mod=register/i.test(href)) {
                    node.setAttribute('href', '#');
                    node.setAttribute('data-auth-action', 'register');
                } else {
                    node.setAttribute('href', this.absoluteUrl(href));
                }
            }
        });

        wrapper.querySelectorAll('*').forEach(node => {
            Array.from(node.attributes || []).forEach(attribute => {
                if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
            });

        });
        wrapper.querySelectorAll('img').forEach(img => {
            img.setAttribute('loading', 'lazy');
            img.removeAttribute('referrerpolicy');
            img.removeAttribute('onerror');
        });

        wrapper.querySelectorAll('.guestviewthumb').forEach(box => {
            const img = box.querySelector('img');
            if (!img) {
                box.remove();
                return;
            }
            const finalSrc = img.getAttribute('src') || img.getAttribute('zoomfile') || img.getAttribute('file') || '';
            const fallbackSources = img.getAttribute('data-fallback-srcs') || '';
            const clean = document.createElement('p');
            clean.className = 'thread-image-wrap';
            const cleanImage = document.createElement('img');
            cleanImage.src = this.absoluteUrl(finalSrc);
            cleanImage.alt = img.getAttribute('alt') || '';
            cleanImage.loading = 'lazy';
            if (fallbackSources) cleanImage.dataset.fallbackSrcs = fallbackSources;
            clean.appendChild(cleanImage);
            box.replaceWith(clean);
        });

        wrapper.querySelectorAll('a[data-auth-action]').forEach(link => {
            if (link.closest('.guestviewthumb') || /大图|登录\/注册后可看/i.test(this.plainText(link.textContent))) {
                link.remove();
            }
        });

        // 将分类信息和正文里的纯文本网址转成可点击链接。
        const textNodes = [];
        const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.parentElement || node.parentElement.closest('a, code, pre')) continue;
            if (/https?:\/\/[^\s<]+/i.test(node.nodeValue || '')) textNodes.push(node);
        }
        textNodes.forEach(node => {
            const text = node.nodeValue || '';
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            text.replace(/https?:\/\/[^\s<]+/gi, (match, offset) => {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
                const link = document.createElement('a');
                const cleanUrl = match.replace(/[),.;，。；]+$/, '');
                link.href = cleanUrl;
                link.textContent = cleanUrl;
                fragment.appendChild(link);
                const suffix = match.slice(cleanUrl.length);
                if (suffix) fragment.appendChild(document.createTextNode(suffix));
                lastIndex = offset + match.length;
                return match;
            });
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            node.replaceWith(fragment);
        });

        return window.PostRenderer.sanitize(wrapper.innerHTML);
    },

    convertForumBbcode(value) {
        let html = String(value || '').replace(/\[hide(?:=[^\]]*)?\][\s\S]*?\[\/hide\]/gi, '<div class="hidden-content">回复后可见，请在论坛页面查看</div>');
        const makeImage = (url) => {
            const img = document.createElement('img');
            img.src = this.absoluteUrl(this.decodeHtml(String(url || '').trim()));
            img.loading = 'lazy';
            img.alt = '';
            return img.outerHTML;
        };
        const makeLink = (url, label) => {
            const link = document.createElement('a');
            link.href = this.absoluteUrl(this.decodeHtml(String(url || '').trim()));
            link.textContent = this.decodeHtml(String(label || url || '').trim());
            return link.outerHTML;
        };

        html = html.replace(/\[img(?:=[^\]]+)?\]([\s\S]*?)\[\/img\]/gi, (match, url) => makeImage(url));
        html = html.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (match, url, label) => makeLink(url, label));
        html = html.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (match, url) => makeLink(url, url));
        html = html.replace(/\[align=(left|center|right)\]/gi, '<div class="bbcode-align-$1">');
        html = html.replace(/\[\/align\]/gi, '</div>');
        html = html.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>');
        html = html.replace(/\[list(?:=[^\]]+)?\]/gi, '<ul>').replace(/\[\/list\]/gi, '</ul>');
        html = html.replace(/\[\*\]/g, '<li>');
        html = html.replace(/\[(?:b|strong)\]/gi, '<b>').replace(/\[\/(?:b|strong)\]/gi, '</b>');
        html = html.replace(/\[i\]/gi, '<i>').replace(/\[\/i\]/gi, '</i>');
        html = html.replace(/\[u\]/gi, '<u>').replace(/\[\/u\]/gi, '</u>');
        html = html.replace(/\[br\s*\/?\]/gi, '<br>');
        html = html.replace(/\[hr\s*\/?\]/gi, '<hr>');
        // 字体、颜色、缩进、隐藏等展示标签只去掉外壳，保留真实内容与链接。
        html = html.replace(/\[\/?(?:font|color|size|indent|float|p)(?:=[^\]]*)?\]/gi, '');
        return html;
    },

    parseThreadLinks(doc, selector) {
        const anchors = Array.from(doc.querySelectorAll(selector));
        return this.uniqueById(anchors.map(anchor => {
            const href = this.absoluteUrl(anchor.getAttribute('href') || '');
            const tid = this.parseTid(href);
            const titleNode = anchor.querySelector('.km_subject') || anchor;
            const title = this.plainText(titleNode.textContent);
            if (!tid || !title) return null;
            const wrapper = anchor.closest('li.kmlist, li.pbw, tr, td.fl_g, div') || anchor.parentElement;
            const wrapperText = this.plainText(wrapper ? wrapper.textContent : '');
            const foot = wrapper ? wrapper.querySelector('.kmfoot') : null;
            const statMatch = wrapperText.match(/(\d+)\s*个回复\s*-\s*(\d+)\s*次查看/i) || wrapperText.match(/回复\s*(\d+).*查看\s*(\d+)/i);
            const authorMatch = wrapperText.match(/-\s*([^-]+)\s*-\s*[^\-]*$/);
            const authorLink = wrapper ? wrapper.querySelector('a[href*="space-uid"]') : null;
            const coverNode = wrapper ? wrapper.querySelector('img:not(.user_avatar)') : null;
            const dateNode = foot ? foot.querySelector('.kmtime span[title]') : (wrapper ? wrapper.querySelector('span[title]') : null);
            const lastNode = wrapper ? wrapper.querySelector('.by:last-child em[title], .by:last-child span[title], .lastpost [title], .kmfoot .kmtime:last-child span[title], time[datetime]') : null;
            return {
                tid,
                subject: title,
                author: this.plainText(authorLink ? authorLink.textContent : (authorMatch ? authorMatch[1] : '')),
                dateline: dateNode ? (dateNode.getAttribute('title') || this.plainText(dateNode.textContent)) : '',
                lastpost: lastNode ? (lastNode.getAttribute('title') || lastNode.getAttribute('datetime') || this.plainText(lastNode.textContent)) : (dateNode ? (dateNode.getAttribute('title') || this.plainText(dateNode.textContent)) : ''),
                views: foot && foot.querySelector('.kmck') ? this.parseCompactNumber(foot.querySelector('.kmck').textContent) : (statMatch ? Number(statMatch[2]) : 0),
                replies: foot && foot.querySelector('.kmpl') ? this.parseCompactNumber(foot.querySelector('.kmpl').textContent) : (statMatch ? Number(statMatch[1]) : 0),
                cover: coverNode ? this.absoluteUrl(coverNode.getAttribute('src') || '') : '',
                url: href
            };
        }).filter(Boolean), 'tid');
    },

    async getLatestThreadsFallback(page = 1) {
        const html = await this.fetchHtml(`${SITE_BASE}/forum.php?mod=guide&view=newreply&page=${page}`);
        if (!html) return { status: 'error', message: '首页抓取失败', data: [] };
        const doc = this.parseHtml(html);
        const threads = this.parseThreadLinks(doc, 'a.kmtit, a.xst, a[href*="thread-"], a[href*="viewthread"][href*="tid="]').slice(0, 30);
        return { status: 'success', data: threads };
    },

    async getForumsFallback() {
        const html = await this.fetchHtml(`${SITE_BASE}/forum.php`);
        if (!html) return { status: 'error', message: '版块抓取失败', data: [] };
        const doc = this.parseHtml(html);
        const cells = Array.from(doc.querySelectorAll('td.fl_g'));
        const forums = this.uniqueById(cells.map(cell => {
            const anchor = cell.querySelector('dt a[href*="forum-"], .fl_icn_g a[href*="forum-"]');
            if (!anchor) return null;
            const href = this.absoluteUrl(anchor.getAttribute('href') || '');
            const fid = this.parseFid(href);
            if (!fid) return null;
            const nameNode = cell.querySelector('dt a[href*="forum-"]');
            const countNodes = cell.querySelectorAll('dd em');
            const todayNode = cell.querySelector('.kmtoday');
            const iconNode = cell.querySelector('.fl_icn_g img');
            const lastPostNode = cell.querySelector('.comiis_lastpost_ico');
            const name = this.plainText((nameNode ? nameNode.textContent : anchor.textContent) || anchor.getAttribute('title') || '');
            if (!name) return null;
            return {
                fid,
                name,
                type: 'forum',
                description: this.plainText(lastPostNode ? lastPostNode.textContent : ''),
                threads: countNodes[0] ? this.parseCompactNumber(countNodes[0].textContent) : 0,
                posts: countNodes[1] ? this.parseCompactNumber(countNodes[1].textContent) : 0,
                today_posts: todayNode ? this.parseCompactNumber(todayNode.textContent) : 0,
                icon: iconNode ? this.absoluteUrl(iconNode.getAttribute('src') || '') : '',
                url: href
            };
        }).filter(Boolean), 'fid');
        return { status: 'success', data: forums };
    },

    async getForumDetailFallback(fid, page = 1) {
        const html = await this.fetchHtml(`${SITE_BASE}/forum.php?mod=forumdisplay&fid=${encodeURIComponent(fid)}&filter=lastpost&orderby=lastpost&page=${page}`);
        if (!html) return { status: 'error', message: '版块详情抓取失败' };
        const doc = this.parseHtml(html);
        const threads = this.parseThreadLinks(doc, 'a.s.xst, a.xst, a[href*="thread-"], a[href*="viewthread"][href*="tid="]');
        const titleNode = doc.querySelector('#fjump_menu, #ct .bm_h h1, .mn h1, title');
        const forumName = this.plainText(titleNode ? titleNode.textContent.replace(/- ZO论坛.*$/, '') : `版块 ${fid}`);
        const descNode = doc.querySelector('.bm .bm_c.xld p, .bm .bm_c .xs2');
        return {
            status: 'success',
            data: {
                forum: { fid: Number(fid), name: forumName || `版块 ${fid}`, description: this.plainText(descNode ? descNode.textContent : '') },
                threads
            }
        };
    },

    async searchFallback(keyword, type = 'thread', page = 1) {
        if (type !== 'thread') {
            return { status: 'success', data: [] };
        }
        const url = `${SITE_BASE}/search.php?mod=forum&searchsubmit=yes&srchtxt=${encodeURIComponent(keyword)}&page=${page}`;
        const html = await this.fetchHtml(url);
        if (!html) return { status: 'error', message: '搜索抓取失败', data: [] };
        const doc = this.parseHtml(html);
        const items = Array.from(doc.querySelectorAll('#threadlist li.pbw, .slst li.pbw'));
        const data = this.uniqueById(items.map(item => {
            const link = item.querySelector('h3 a[href*="tid="], h3 a[href*="thread-"], a[href*="tid="], a[href*="thread-"]');
            if (!link) return null;
            const href = this.absoluteUrl(link.getAttribute('href') || '');
            const tid = this.parseTid(href);
            const subject = this.plainText(this.decodeHtml(link.innerHTML));
            if (!tid || !subject) return null;
            const metaSpans = item.querySelectorAll('p span');
            const authorLink = item.querySelector('a[href*="space-uid"]');
            const statText = this.plainText(item.querySelector('.xg1') ? item.querySelector('.xg1').textContent : '');
            const statMatch = statText.match(/(\d+)\s*个回复\s*-\s*(\d+)\s*次查看/i);
            return {
                tid,
                subject,
                author: this.plainText(authorLink ? authorLink.textContent : ''),
                dateline: metaSpans[0] ? this.plainText(metaSpans[0].textContent) : '',
                views: statMatch ? Number(statMatch[2]) : 0,
                replies: statMatch ? Number(statMatch[1]) : 0,
                url: href
            };
        }).filter(Boolean), 'tid');
        return { status: 'success', data };
    },

    async getThreadDetailFallback(tid, page = 1) {
        const html = await this.fetchHtml(`${SITE_BASE}/thread-${tid}-${page}-1.html`);
        if (!html) return { status: 'error', message: '帖子抓取失败' };
        const doc = this.parseHtml(html);
        const sortInfo = this.parseThreadSortInfo(doc);
        const subject = this.plainText((doc.querySelector('#thread_subject') || doc.querySelector('title'))?.textContent || '');
        const messageCells = Array.from(doc.querySelectorAll('td[id^="postmessage_"]'));
        const authBlocks = Array.from(doc.querySelectorAll('.authi'));
        if (!messageCells.length) {
            return { status: 'error', message: '帖子内容解析失败' };
        }
        const firstDate = doc.querySelector('#authorposton span[title], .authi span[title]');
        const firstAuthorLink = doc.querySelector('.authi a.xw1, .authi a[href*="space-uid"]');
        const replyTitle = doc.querySelector('.bm_h.mbm h2');
        const replyCountMatch = this.plainText(replyTitle ? replyTitle.textContent : '').match(/回复\s*\(?(\d+)\)?/);
        const replies = (Number(page) === 1 ? messageCells.slice(1, 21) : messageCells).map((cell, index) => {
            const auth = authBlocks[index + (Number(page) === 1 ? 1 : 0)];
            const authorNode = auth ? auth.querySelector('a.xw1, a[href*="space-uid"]') : null;
            const dateNode = auth ? auth.querySelector('span[title]') : null;
            const avatarNode = auth ? auth.querySelector('img.user_avatar, .km_avt img') : null;
            const profileLink = auth ? auth.querySelector('a[href*="space-uid-"]') : null;
            const authorid = this.parseUid(profileLink ? profileLink.getAttribute('href') || '' : '');
            return {
                pid: Number((cell.id.match(/postmessage_(\d+)/) || [])[1]) || 0,
                author: this.plainText(authorNode ? authorNode.textContent : ''),
                authorid,
                avatar: avatarNode ? this.absoluteUrl(avatarNode.getAttribute('src') || '') : this.getAvatar(authorid, 'small'),
                dateline: dateNode ? dateNode.getAttribute('title') || this.plainText(dateNode.textContent) : '',
                message: this.normalizeHtmlContent(cell.innerHTML || '')
            };
        });
        return {
            status: 'success',
            data: {
                tid: Number(tid),
                subject: subject.replace(/- ZO论坛.*$/, ''),
                author: this.plainText(firstAuthorLink ? firstAuthorLink.textContent : ''),
                dateline: firstDate ? firstDate.getAttribute('title') || this.plainText(firstDate.textContent) : '',
                views: 0,
                replies: replyCountMatch ? Number(replyCountMatch[1]) : replies.length,
                total_replies: replyCountMatch ? Number(replyCountMatch[1]) : replies.length,
                total_reply_pages: 1,
                sort_title: sortInfo.sort_title,
                sort_options: sortInfo.sort_options,
                sort_template_html: sortInfo.sort_template_html || '',
                message: this.normalizeHtmlContent(messageCells[0].innerHTML || ''),
                reply_list: replies
            }
        };
    },

    // ========== 工具函数 ==========
    formatTime(dateline) {
        if (!dateline) return '';
        const now = new Date();
        const date = new Date(typeof dateline === 'string' ? dateline.replace(/-/g, '/') : dateline * 1000);
        if (Number.isNaN(date.getTime())) return '';
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
        if (diff < 604800) return Math.floor(diff / 86400) + '天前';
        return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },
    formatNum(num) {
        if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return String(num);
    },
    getAvatar(uid, size = 'middle') {
        if (!uid || uid < 1) return '';
        return `https://www.zozse.cn/uc_server/avatar.php?uid=${uid}&size=${size}`;
    },
    threadUrl(tid) {
        return `${SITE_BASE}/thread-${tid}-1-1.html`;
    },
    getUser() {
        return Store.get('user', null);
    },
    setUser(user) {
        Store.set('user', user);
    },
    clearUser() {
        Store.remove('user');
    },
};
