(function () {
    window.AccountForms = {
        parse(doc, fallbackUrl) {
            const forms = [...doc.querySelectorAll('form')];
            const form = forms.find(f => /ac=profile|regverify|comiis_sms/.test(f.getAttribute('action') || ''))
                || forms.find(f => f.querySelector('input[name="formhash"]') && f.querySelector('input:not([type="hidden"]),textarea,select'));
            const fail = message => ({status: 'error', message, fallback_url: fallbackUrl});
            if (!form) return fail('论坛表单结构已变更，请在站内页面完成');
            const action = new URL(form.getAttribute('action') || fallbackUrl, fallbackUrl);
            if (action.origin !== new URL(fallbackUrl).origin || action.protocol !== 'https:') return fail('论坛表单地址校验失败');
            const controls = [...form.querySelectorAll('input[name],textarea[name],select[name]')].filter(el => !el.disabled);
            if (controls.some(el => ['file','radio','checkbox'].includes(el.type))) return fail('此页面需要附件或交互验证，请在站内完成');
            const fields = controls.filter(el => ['text','password','email','tel','number','url','textarea','select-one','select-multiple'].includes(el.type)).map(el => {
                const row = el.closest('tr,.rfm,.form-group,.comiis_input_style') || el.parentElement;
                const label = [...form.querySelectorAll('label')].find(l => l.htmlFor === el.id);
                return {name: el.name, label: (label?.textContent || row?.querySelector('th,label')?.textContent || el.placeholder || el.name).trim(), type: el.tagName.toLowerCase(), inputType: el.type, value: el.type === 'password' ? '' : el.value,
                    help: row?.querySelector('p,small')?.textContent || '', image: row?.querySelector('img') ? new URL(row.querySelector('img').getAttribute('src'),fallbackUrl).href : '',
                    options: el.tagName === 'SELECT' ? [...el.options].map(o => ({value:o.value,label:o.textContent,selected:o.selected})) : []};
            });
            if (!fields.length) return fail('当前没有可填写的表单，请在站内查看状态');
            const hidden = controls.filter(el => el.type === 'hidden').map(el => [el.name, el.value]);
            return {status: 'success', data:{action:action.href,fields,hidden}, fallback_url: fallbackUrl};
        }
    };
})();
