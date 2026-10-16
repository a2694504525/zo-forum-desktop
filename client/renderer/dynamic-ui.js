(function(){
    'use strict';let config={},navSignature='',originalNav;const records=new Map(),dismissed=new Set();
    const safeLink=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
    const enabled=key=>config.features?.[key]!==false;
    const time=value=>{if(!value)return 0;let v=String(value).replace(' ','T');if(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(v))v+='+08:00';return Date.parse(v);};
    const active=item=>item&&item.enabled!==false&&(!item.start_at||Number.isFinite(time(item.start_at))&&time(item.start_at)<=Date.now())&&(!item.end_at||Number.isFinite(time(item.end_at))&&time(item.end_at)>Date.now());
    const latest=list=>(Array.isArray(list)?list:[]).map((item,index)=>({item,index})).filter(x=>active(x.item)).sort((a,b)=>Number(b.item.updated_at||0)-Number(a.item.updated_at||0)||b.index-a.index)[0]?.item;
    function notice(kind,item){
        const main=document.querySelector('.nav-menu');if(!main)return;
        let state=records.get(kind);if(!state){const box=document.createElement('section');box.id=kind==='home'?'homeNotice':'floatingNotice';box.className=kind==='home'?'home-notice':'floating-notice';box.hidden=true;
            const close=document.createElement('button');close.className='notice-close';close.type='button';close.textContent='×';close.title='关闭公告';
            const icon=document.createElement('span'),body=document.createElement('div'),title=document.createElement('strong'),content=document.createElement('p'),link=document.createElement('button');link.type='button';link.className='notice-link';body.append(title,content);box.append(close,icon,body,link);
            if(kind==='home'){const target=document.getElementById('homeBanner')||document.getElementById('homeThreads');if(!target)return;target.before(box);}else document.body.append(box);
            state={box,close,icon,title,content,link,signature:'',timer:null};records.set(kind,state);close.onclick=()=>{dismissed.add(state.signature);box.hidden=true;};}
        if(!item){state.box.hidden=true;clearTimeout(state.timer);state.signature='';return;}
        const signature=kind+':'+item.id+':'+Number(item.updated_at||0);if(state.signature===signature){state.box.hidden=dismissed.has(signature);return;}
        clearTimeout(state.timer);state.signature=signature;state.icon.textContent=item.icon||'';state.title.textContent=item.title||'';state.content.textContent=item.content||'';
        const color=v=>/^#[a-f0-9]{6}$/i.test(v||'')?v:'';state.box.style.background=color(item.bg_color);state.box.style.color=color(item.text_color);state.close.hidden=item.dismissible===false;
        const url=safeLink(item.link);state.link.hidden=!url;state.link.textContent=item.button_text||'查看详情';state.link.onclick=()=>url&&window.electronAPI.openExternal(url);
        state.box.hidden=dismissed.has(signature);if(kind==='floating'&&Number(item.auto_hide)>0)state.timer=setTimeout(()=>{dismissed.add(signature);state.box.hidden=true;},Math.min(86400,Number(item.auto_hide))*1000);
    }
    function navigation(){const nav=document.querySelector('.nav-menu');if(!nav)return;if(!originalNav)originalNav=new Map([...nav.children].filter(el=>el.dataset.page).map(el=>[el.dataset.page,{el,label:el.querySelector('.nav-text')?.textContent}]));
        const signature=JSON.stringify(config.navigation||{});if(signature===navSignature)return;navSignature=signature;
        const items=Array.isArray(config.navigation?.items)&&config.navigation.items.length?config.navigation.items:[...originalNav].map(([id])=>({id,page:id,enabled:true}));
        const order=config.navigation?.order||[];const sorted=items.map((item,index)=>({item,index})).sort((a,b)=>{const ai=order.indexOf(a.item.id),bi=order.indexOf(b.item.id);return (ai<0?1000+a.index:ai)-(bi<0?1000+b.index:bi);});
        nav.replaceChildren();for(const {item}of sorted){if(item.enabled===false)continue;const url=safeLink(item.url);let el;if(url){el=document.createElement('a');el.className='nav-item';el.href='#';el.dataset.navId=item.id;const label=document.createElement('span');label.className='nav-text';label.textContent=item.label||item.id;el.append(label);el.onclick=event=>{event.preventDefault();window.electronAPI.openExternal(url);};}else{const original=originalNav.get(item.page||item.id);if(!original)continue;el=original.el;el.querySelector('.nav-text').textContent=item.label||original.label;el.hidden=false;}nav.append(el);}
    }
    function features(){
        const selectors={posting_enabled:'#btnNewThread,#newThreadSubmit',reply_enabled:'.reply-box,#submitReply',download_enabled:'.zoz-download-btn,.zoz-download-row,a[href*="mod=attachment"]',sign_in_enabled:'[data-action="signin"],#signInBtn',medals_enabled:'[data-native-page="medals"],[data-page="medals"]',tasks_enabled:'[data-native-page="tasks"],[data-page="tasks"]',profile_save_enabled:'#personalSettingsBox button[type="submit"]',dark_mode_enabled:'#appearanceMode',theme_enabled:'.theme-settings'};
        for(const [key,selector]of Object.entries(selectors))document.querySelectorAll(selector).forEach(el=>{el.hidden=!enabled(key);if('disabled'in el)el.disabled=!enabled(key);});
        document.querySelectorAll('.theme-settings').forEach(el=>el.hidden=!enabled('theme_enabled')||config.theme?.allow_user_change===false);
        for(const [page,key]of [['search','search_enabled'],['notifications','notifications_enabled']])document.querySelectorAll('.nav-menu [data-page="'+page+'"]').forEach(el=>el.hidden=!enabled(key));
    }
    window.DynamicUI={apply(next){config=next||{};navigation();features();notice('home',latest(config.home_notices));notice('floating',latest(config.floating_notices));},featureEnabled:enabled,safeLink};
    const observer=new MutationObserver(()=>features());observer.observe(document.body,{childList:true,subtree:true});
    setInterval(()=>{notice('home',latest(config.home_notices));notice('floating',latest(config.floating_notices));},1000);
})();
