export const apiSms = {
    async sms(action, values) {
        const capability = await this.request(API_BASE + '/sms_config.php');
        if (capability.status !== 'success') return capability;
        const formhash = capability.data?.formhash || '';
        const body = new URLSearchParams({...values, formhash});
        return this.request(API_BASE + '/sms_' + action + '.php', {method: 'POST', body: body.toString(), headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'}});
    },

};
