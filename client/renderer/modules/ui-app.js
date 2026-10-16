import {escapeHtml, formatBytes} from './ui.js';
export function createUiApp(context) {
    function bindTitlebar() {
        const bridge = window.electronAPI;
        document.getElementById('btnMin').addEventListener('click', () => bridge && bridge.minimize && bridge.minimize());
        document.getElementById('btnMax').addEventListener('click', () => bridge && bridge.maximize && bridge.maximize());
        document.getElementById('btnClose').addEventListener('click', () => bridge && bridge.close && bridge.close());
    }

    function openExternalUrl(url) {
        if (!url) {
            return;
        }
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    }

    async function copyText(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            // fallback below
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const success = document.execCommand('copy');
            textarea.remove();
            return success;
        } catch (error) {
            return false;
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('zo_desktop_theme') || 'blue';
        applyTheme(savedTheme);
        document.querySelectorAll('.theme-option').forEach(button => {
            button.addEventListener('click', () => applyTheme(button.dataset.theme || 'blue'));
        });
    }

    function applyTheme(theme) {
        const allowed = ['blue', 'purple', 'green', 'orange'];
        const selected = allowed.includes(theme) ? theme : 'blue';
        document.documentElement.dataset.tint = selected;
        localStorage.setItem('zo_desktop_theme', selected);
        document.querySelectorAll('.theme-option').forEach(button => {
            button.classList.toggle('active', button.dataset.theme === selected);
        });
    }

    function showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = 'toast' + (type ? ' ' + type : '');
        toast.textContent = message;
        context.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 2600);
    }

    function safeImageUrl(value) {
        try {
            const url = new URL(String(value || ''));
            return url.protocol === 'https:' ? escapeHtml(url.toString()) : '';
        } catch (error) {
            return '';
        }
    }

    function renderMarkdown(text) {
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/\n/g, '<br>');
    }
    return {bindTitlebar, openExternalUrl, copyText, initTheme, applyTheme, showToast, safeImageUrl, renderMarkdown};
}
