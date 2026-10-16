export const apiHome = {
    async getBanners(){const cfg=window.ClientRuntime?.config()||{};const configured=(cfg.banners||[]).filter(b=>b.enabled!==false);if(configured.length)return configured;let result=await this.getLatestThreads(1,3,'featured');let rows=result.status==='success'?result.data:[];if(!rows.length){result=await this.getLatestThreads(1,3);rows=result.status==='success'?result.data:[];}return rows.slice(0,3).map(t=>({id:String(t.tid),image:t.cover,title:t.subject,slogan:t.forum_name||'',link_type:'thread',link:String(t.tid),button_text:cfg.layout_labels?.banner_action||''}));},
    // ========== 首页 ==========
    homeTab(tab='latest') {
        const cfg=window.ClientRuntime?.config()||{},key=typeof tab==='string'?tab:tab.key;
        const defaults={key,label:key,enabled:true,icon:'',sort:key==='hot'?'replies':'lastpost',filter:key==='digest'?'digest':key==='featured'?'featured':'',forum_ids:key==='games'?[Number(cfg.games_forum_id)||2]:[],count:30,link:''};
        const item={...defaults,...(typeof tab==='object'?tab:(cfg.home_tabs||[]).find(t=>t.key===key)||{})};
        item.count=Math.max(1,Math.min(50,Number(item.count)||30));return item;
    },
    async getLatestThreads(page=1, perpage=30, tab='latest') {
        const item=this.homeTab(tab),params=new URLSearchParams({page:String(page),perpage:String(perpage),view:item.sort==='dateline'?'newthread':'newreply',orderby:item.sort==='replies'?'replies':'',filter:item.filter||''});
        if(item.forum_ids?.length)params.set('forum_ids',item.forum_ids.join(','));
        const response=await this.request(API_BASE+'/latest.php?'+params);
        if(response.status==='success'&&Array.isArray(response.data))return response;
        return response;
    },
};

