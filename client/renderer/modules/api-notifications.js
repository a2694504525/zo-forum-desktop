export const apiNotifications = {
    // ========== 消息 ==========
    async getNotifications(type = 'system', page = 1) {
        const mappedType = type === 'interactive' ? 'notice' : type;
        const response = await this.request(this._authUrl(`${API_BASE}/notifications.php?type=${mappedType}&page=${page}`));
        if (response.status === 'success' && Array.isArray(response.data)) {
            response.data = response.data.map(item => ({
                ...item,
                type: mappedType === 'notice' ? 'interactive' : (item.type || 'system'),
                note: item.note || item.content || '',
                new: typeof item.new === 'number' ? item.new : (item.is_read ? 0 : 1)
            }));
        }
        return response;
    },


};
