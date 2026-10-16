export const apiUser = {
    // ========== 用户 ==========
    async getUserInfo(uid) {
        const url = uid ? `${API_BASE}/user.php?uid=${uid}` : `${API_BASE}/user.php`;
        const response = await this.request(this._authUrl(url));
        if (response.status === 'success' && response.data) {
            if (!response.data.count && response.data.stats) {
                response.data.count = {
                    threads: response.data.stats.threads || 0,
                    posts: response.data.stats.posts || 0
                };
            }
            return response;
        }
        return response;
    },

    async restoreSession() {
        const response = await this.getUserInfo();
        if (response.status === 'success' && response.data) {
            this.setUser({
                uid: response.data.uid,
                username: response.data.username
            });
            return response.data;
        }

        this.clearUser();
        return null;
    },


};
