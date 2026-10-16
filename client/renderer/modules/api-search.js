export const apiSearch = {
    // ========== 搜索 ==========
    async search(keyword, type = 'thread', page = 1, perpage = 20) {
        const response = await this.request(`${API_BASE}/search.php?q=${encodeURIComponent(keyword)}&type=${type}&page=${page}&perpage=${perpage}`);
        if (response.status === 'success' && response.data && (Array.isArray(response.data) || Array.isArray(response.data.threads))) {
            return response;
        }
        return this.searchFallback(keyword, type, page);
    },
    async searchAll(keyword, type = 'thread') {
        const first = await this.search(keyword, type, 1, 50);
        if (first.status !== 'success') return first;
        // 兼容旧接口和网页抓取兜底。
        if (Array.isArray(first.data)) {
            return { ...first, data: { threads: this.uniqueById(first.data, 'tid'), total: first.data.length, total_page: 1 } };
        }
        const allThreads = Array.isArray(first.data.threads) ? [...first.data.threads] : [];
        const totalPages = Math.max(1, Number(first.data.total_page || 1));
        if (totalPages > 1) {
            const pages = await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, index) => this.search(keyword, type, index + 2, 50))
            );
            pages.forEach(response => {
                const threads = response && response.data && (Array.isArray(response.data) ? response.data : response.data.threads);
                if (Array.isArray(threads)) allThreads.push(...threads);
            });
        }
        first.data.threads = this.uniqueById(allThreads, 'tid');
        // 数量与最终去重后的实际卡片严格一致。
        first.data.total = first.data.threads.length;
        return first;
    },


};
