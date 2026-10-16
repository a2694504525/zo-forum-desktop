export const apiAuth = {
    // ========== 登录注册 ==========
    async login(username, password) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);
        return this.request(`${API_BASE}/login.php`, { method: 'POST', body: formData });
    },
    async register(username, password, email, passwordConfirm, agreement) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);
        formData.append('email', email);
        formData.append('password_confirm', passwordConfirm);
        formData.append('agreement', agreement ? '1' : '0');
        return this.request(`${API_BASE}/register.php`, { method: 'POST', body: formData });
    },


};
