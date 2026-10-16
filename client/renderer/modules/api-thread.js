export const apiThread = {
    // ========== 帖子详情 ==========
    async getThreadDetail(tid, page = 1) {
        const response = await this.request(`${API_BASE}/thread.php?tid=${tid}&page=${page}`);
        if (response.status === 'success' && response.data) {
            if (response.data.message || response.data.reply_list || response.data.content) {
                const replyPage = response.data.reply_page || {};
                let threadData = {
                    ...response.data,
                    message: this.normalizeHtmlContent(response.data.message_html || response.data.message || response.data.content || ''),
                    reply_list: Array.isArray(response.data.reply_list) ? response.data.reply_list.map(reply => ({
                        ...reply,
                        message: this.normalizeHtmlContent(reply.message || '')
                    })) : [],
                    total_reply_pages: response.data.total_reply_pages || replyPage.total_page || 1,
                    total_replies: response.data.total_replies || replyPage.total || response.data.replies || 0
                };
                // 结构化分类字段已包含客户端会话下的权限结果；只有旧接口没有
                // 返回字段时，才读取帖子页模板作为兼容兜底。
                const hasSortOptions = Array.isArray(threadData.sort_options) && threadData.sort_options.length > 0;
                const sortInfo = hasSortOptions
                    ? { sort_title: '', sort_options: [], sort_template_html: '' }
                    : await this.fetchThreadSortInfo(tid, page);
                threadData = this.withThreadSortInfo(threadData, sortInfo);
                const native = response.data.message_html!==undefined?{status:'skipped'}:await this.getThreadDetailFallback(tid, page);
                if (native.status === 'success' && native.data?.message) {
                    if (Number(page) === 1) threadData.message = native.data.message;
                    threadData.reply_list = native.data.reply_list;
                }
                return {
                    status: 'success',
                    data: threadData
                };
            }
        }
        return this.getThreadDetailFallback(tid, page);
    },


};
