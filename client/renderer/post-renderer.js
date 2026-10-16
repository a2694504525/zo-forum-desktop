(function () {
    const tags = ['p','br','span','div','strong','b','em','i','u','s','blockquote','ul','ol','li','img','a','table','thead','tbody','tr','td','th','pre','code','hr','h1','h2','h3','h4','dl','dt','dd','video','audio','source'];
    const attrs = ['href','src','alt','title','class','style','width','height','colspan','rowspan','loading','controls','poster','type','file','makefile','zoomfile','data-src','data-original','data-fallback-srcs','data-auth-action'];
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
        if (data.attrName === 'style') {
            const clean = [];
            for (const rule of data.attrValue.split(';')) {
                const [property, ...parts] = rule.split(':');
                const name = property.trim().toLowerCase();
                const value = parts.join(':').trim();
                if (/^(text-align|font-size|font-weight|font-style|text-decoration|color|background-color|margin(?:-(?:top|bottom|left|right))?|padding(?:-(?:top|bottom|left|right))?)$/.test(name)
                    && /^(?:[a-zA-Z#0-9.,%()\s-]+)$/.test(value) && !/url|expression|var\(|attr\(|!important/i.test(value) && value.length < 80) clean.push(name + ':' + value);
            }
            data.attrValue = clean.join(';');
        }
        if (['href','src','poster'].includes(data.attrName)) {
            try {
                const url = new URL(data.attrValue, 'https://www.zozse.cn');
                if (url.protocol !== 'https:' && !(data.attrName === 'src' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(data.attrValue))) data.keepAttr = false;
            } catch { data.keepAttr = false; }
        }
    });
    window.PostRenderer = {
        prepare(html) {
            const doc = new DOMParser().parseFromString(String(html), 'text/html');
            doc.querySelectorAll('iframe,embed,object').forEach(node => {
                try { const url = new URL(node.getAttribute('src') || node.getAttribute('data') || '', 'https://www.zozse.cn');
                    if (url.protocol === 'https:') { const link = doc.createElement('a'); link.href = url.href; link.textContent = '打开媒体内容'; link.className = 'attachment-card'; node.replaceWith(link); }
                    else node.remove();
                } catch { node.remove(); }
            });
            doc.querySelectorAll('dl.tattl,.attach_nopermission').forEach(node => node.classList.add('attachment-card'));
            return this.sanitize(doc.body.innerHTML);
        },
        sanitize(html) { return DOMPurify.sanitize(String(html), {ALLOWED_TAGS: tags, ALLOWED_ATTR: attrs, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false}); }
    };
})();
