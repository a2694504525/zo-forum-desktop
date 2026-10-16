export const apiForums = {
    // ========== 版块 ==========
    async getForums() {
        const response = await this.request(`${API_BASE}/forums.php`);
        if (response.status === 'success' && Array.isArray(response.data) && response.data.length) {
            response.data = this.filterForumsWithContent(response.data);
            return response;
        }
        const fallback = await this.getForumsFallback();
        if (fallback.status === 'success') fallback.data = this.filterForumsWithContent(fallback.data);
        return fallback;
    },
    async getForumDetail(fid, page = 1, perpage = 30, filter = '') {
        const response = await this.request(`${API_BASE}/forums.php?fid=${fid}&page=${page}&perpage=${perpage}&orderby=lastpost&filter=${encodeURIComponent(filter)}`);
        if (response.status === 'success' && response.data) {
            if (response.data.forum || response.data.threads) {
                return response;
            }
            if (response.data.thread_list || response.data.name) {
                return {
                    status: 'success',
                    data: {
                        forum: {
                            fid: Number(fid),
                            name: response.data.name || `版块 ${fid}`,
                            description: response.data.description || ''
                        },
                        threads: response.data.thread_list || []
                    }
                };
            }
        }
        return this.getForumDetailFallback(fid, page);
    },
    async getAllForumThreads(fid) {
        const first = await this.getForumDetail(fid, 1, 50);
        if (first.status !== 'success' || !first.data) return first;

        const totalPages = Math.max(1, Number(first.data.total_page || first.data.total_pages || 1));
        const allThreads = Array.isArray(first.data.threads) ? [...first.data.threads] : [];
        // 其余分页并行加载，进入版块后一次展示全部可见帖子。
        if (totalPages > 1) {
            const pages = await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, index) => this.getForumDetail(fid, index + 2, 50))
            );
            pages.forEach(response => {
                if (response.status === 'success' && response.data && Array.isArray(response.data.threads)) {
                    allThreads.push(...response.data.threads);
                }
            });
        }
        first.data.threads = this.uniqueById(allThreads, 'tid');
        first.data.total = Number(first.data.total || first.data.threads.length);
        return first;
    },


};
