export const apiSettings = {
    async getClientConfig() {
        // 公告和更新说明统一由主进程获取，避免部分 Windows 环境中
        // session.fetch 能加载论坛内容却无法读取配置接口的问题。
        if (window.electronAPI && window.electronAPI.getClientConfig) {
            try {
                const response = await window.electronAPI.getClientConfig();
                if (response && response.status === 'success' && response.data) return response;
                if (response && response.message) console.error('主进程配置读取失败:', response.message);
            } catch (error) {
                console.error('主进程配置桥接失败:', error.message);
            }
        }
        return this.request(`${API_BASE}/client_config.php`);
    },


};
