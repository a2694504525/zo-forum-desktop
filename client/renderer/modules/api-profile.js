export const apiProfile = {
    async getMedals(owned = false) {
        const path = owned ? 'home.php?mod=medal&action=log' : 'home.php?mod=medal';
        const html = await this.fetchHtml(`${SITE_BASE}/${path}`);
        const doc = this.parseHtml(html);
        const items = Array.from(doc.querySelectorAll('.mgcl li')).map(node => {
            const image = node.querySelector('img');
            const actionLink = Array.from(node.querySelectorAll('a')).find(link => /action=confirm/.test(link.getAttribute('onclick') || link.href || ''));
            const sourceMatch = actionLink ? ((actionLink.getAttribute('onclick') || '').match(/home\.php[^'\"]+/) || [actionLink.getAttribute('href')]) : [];
            const source = sourceMatch[0] || '';
            const medalId = Number((source.match(/[?&]medalid=(\d+)/) || [])[1] || 0);
            const paragraphs = Array.from(node.querySelectorAll('p')).map(p => this.plainText(p.textContent)).filter(Boolean);
            return {
                id: medalId,
                name: image ? (image.getAttribute('alt') || paragraphs[0] || '勋章') : (paragraphs[0] || '勋章'),
                image: this.absoluteUrl(image && image.getAttribute('src')),
                description: paragraphs.slice(1).join(' · '),
                canClaim: !!medalId,
                status: paragraphs[paragraphs.length - 1] || ''
            };
        }).filter(item => item.image || item.name);
        return { status: html ? 'success' : 'error', data: items, message: html ? '' : '勋章数据加载失败' };
    },

    async claimMedal(medalId) {
        const confirmHtml = await this.fetchHtml(`${SITE_BASE}/home.php?mod=medal&action=confirm&medalid=${Number(medalId)}`);
        const doc = this.parseHtml(confirmHtml);
        const form = doc.querySelector('form[action*="mod=medal"]');
        if (!form) return { status: 'error', message: this.plainText(doc.body.textContent) || '无法领取该勋章' };
        const body = new URLSearchParams();
        form.querySelectorAll('input[name]').forEach(input => body.append(input.name, input.value || ''));
        if (!body.has('medalsubmit')) body.append('medalsubmit', 'true');
        const action = this.absoluteUrl(form.getAttribute('action'));
        const res = await this._siteRequest(action, { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
        const message = this.forumMessage(res.text || '', res.ok ? '操作已提交' : '领取失败');
        const denied = /抱歉|不满足|权限|不能|无法|失败|不足/.test(message);
        return { status: res.ok && !denied ? 'success' : 'error', message: message || (res.ok ? '操作已提交' : '领取失败') };
    },

    async getTasks(type = 'new') {
        const safeType = ['new', 'doing', 'done', 'failed'].includes(type) ? type : 'new';
        const html = await this.fetchHtml(`${SITE_BASE}/home.php?mod=task&item=${safeType}`);
        const doc = this.parseHtml(html);
        const items = Array.from(doc.querySelectorAll('table tr')).map(row => {
            const view = row.querySelector('a[href*="mod=task"][href*="id="]');
            const image = row.querySelector('img');
            if (!view) return null;
            const id = Number((view.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1] || 0);
            const action = Array.from(row.querySelectorAll('a[href*="mod=task"]')).find(link => /[?&]do=(apply|draw|delete|giveup)/.test(link.getAttribute('href') || ''));
            const actionMatch = action && (action.getAttribute('href') || '').match(/[?&]do=(apply|draw|delete|giveup)/);
            const progress = Number(this.plainText(row.querySelector('[id^="csc_"]')?.textContent || '0')) || 0;
            const cells = row.querySelectorAll('td');
            return { id, name: this.plainText(view.textContent), image: this.absoluteUrl(image && image.getAttribute('src')), description: this.plainText(cells[1]?.querySelector('p')?.textContent || ''), reward: this.plainText(cells[2]?.textContent || ''), progress, action: actionMatch ? actionMatch[1] : '', actionLabel: this.plainText(action?.textContent || '') };
        }).filter(Boolean);
        return { status: html ? 'success' : 'error', data: items, message: html ? '' : '任务数据加载失败' };
    },

    async runTaskAction(id, action) {
        if (!['apply', 'draw', 'delete', 'giveup'].includes(action)) return { status: 'error', message: '无效操作' };
        const html = await this.fetchHtml(`${SITE_BASE}/home.php?mod=task&do=${action}&id=${Number(id)}`);
        const doc = this.parseHtml(html);
        const message = this.plainText(doc.querySelector('#messagetext, .alert_info, .alert_error')?.textContent || '').slice(0, 180);
        return { status: html ? 'success' : 'error', message: message || (html ? '操作成功' : '操作失败') };
    },

    async getPersonalSettings(op = 'base') {
        const safeOp = ['base','contact','edu','work','info','verify','password'].includes(op) ? op : 'base';
        const url = SITE_BASE + '/home.php?mod=spacecp&ac=profile&op=' + safeOp;
        return window.AccountForms.parse(this.parseHtml(await this.fetchHtml(url)), url);
    },
    async getCertificationSettings(type = 1) {
        const url = SITE_BASE + '/home.php?mod=spacecp&ac=profile&op=verify&vid=' + Math.max(1, Math.min(7, Number(type) || 1));
        return window.AccountForms.parse(this.parseHtml(await this.fetchHtml(url)), url);
    },
    async getPasswordSettings() {
        return this.getPersonalSettings('password');
    },

    async savePersonalSettings(action, entries) {
        const body = new URLSearchParams(entries);
        if (!body.has('passwordsubmit') && !body.has('verifysubmit')) {
            body.set('profilesubmit', 'true');
            body.set('profilesubmitbtn', 'true');
        }
        const res = await this._siteRequest(action, { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
        const doc = this.parseHtml(res.text || '');
        const message = this.plainText(doc.querySelector('#messagetext, .alert_info, .alert_error, #submit_result')?.textContent || '').slice(0, 180);
        const denied = /失败|错误|不正确|非法|无权|不足|抱歉|不能|验证码/.test(message);
        const confirmed = /成功|已保存|已更新/.test(message);
        return { status: res.ok && !denied && confirmed ? 'success' : 'error', message: message || '服务器未确认保存结果，请在站内页面检查' };
    },
    async logout() {
        return this.request(this._authUrl(`${API_BASE}/logout.php`), { method: 'POST' });
    },


};
