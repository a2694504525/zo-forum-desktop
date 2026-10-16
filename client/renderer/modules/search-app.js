import {escapeHtml, formatBytes} from './ui.js';
export function createSearchApp(context) {
    function bindSearch() {
        let tabFilter=null;
        const runSearch = async () => {
            const requestId = ++context.searchRequestId;
            const keyword = document.getElementById('searchInput').value.trim();
            if (!keyword && !tabFilter) {
                context.showToast('请输入搜索关键词', 'error');
                return;
            }

            const container = document.getElementById('searchResult');
            container.className = 'thread-grid';
            container.innerHTML = '<div class="loading">搜索中...</div>';

            const response = tabFilter?await API.getLatestThreads(1,tabFilter.count,tabFilter):await API.searchAll(keyword, 'thread');
            if (requestId !== context.searchRequestId || context.currentPage !== 'search') return;
            const threads = response && response.data && (Array.isArray(response.data) ? response.data : response.data.threads);
            if (response.status !== 'success' || !Array.isArray(threads) || !threads.length) {
                container.className = 'thread-list';
                container.innerHTML = '<div class="empty">未找到相关帖子</div>';
                return;
            }

            container.innerHTML = `<div class="search-result-summary">找到 ${threads.length} 个相关资源</div>` + threads.map((thread,index) => context.threadCardHTML(thread,index+1)).join('');
            context.bindThreadCards(container);
            if(tabFilter && threads.length===tabFilter.count){let next=2;const more=document.createElement('button');more.className='btn-secondary';more.textContent='加载更多';more.onclick=async()=>{more.disabled=true;const r=await API.getLatestThreads(next,tabFilter.count,tabFilter);if(requestId!==context.searchRequestId)return;if(r.status==='success'){const rows=r.data;more.insertAdjacentHTML('beforebegin',rows.map((t,i)=>context.threadCardHTML(t,(next-1)*tabFilter.count+i+1)).join(''));context.bindThreadCards(container);next++;if(rows.length<tabFilter.count)more.remove();}more.disabled=false;};container.append(more);}
        };

        window.addEventListener('home-tab-search',e=>{tabFilter=e.detail;document.getElementById('searchInput').value='';document.getElementById('searchInput').placeholder='筛选：'+tabFilter.label;runSearch();});
        document.getElementById('searchBtn').addEventListener('click',()=>{tabFilter=null;runSearch();});
        document.getElementById('searchInput').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                tabFilter=null;runSearch();
            }
        });
    }

    return {bindSearch};
}
