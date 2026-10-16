export const apiPost = {
    // ========== 发帖/回帖 ==========
    async replyThread(tid, message) {
        const formData = new FormData();
        formData.append('action', 'reply');
        formData.append('tid', tid);
        formData.append('message', message);
        return this.request(this._authUrl(`${API_BASE}/post.php`), { method: 'POST', body: formData });
    },
    async createThread(fid, subject, message) {
        const formData = new FormData();
        formData.append('action', 'new');
        formData.append('fid', fid);
        formData.append('subject', subject);
        formData.append('message', message);
        return this.request(this._authUrl(`${API_BASE}/post.php`), { method: 'POST', body: formData });
    },


};
