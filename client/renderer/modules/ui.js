export function escapeHtml(text) {const div=document.createElement('div');div.textContent=String(text ?? '');return div.innerHTML;}
export function formatBytes(value) {const bytes=Number(value)||0;return bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB';}
