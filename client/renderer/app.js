import './modules/api-domains.js';
import {createAuthApp} from './modules/auth-app.js';
import {createHomeApp} from './modules/home-app.js';
import {createForumsApp} from './modules/forums-app.js';
import {createThreadApp} from './modules/thread-app.js';
import {createSearchApp} from './modules/search-app.js';
import {createProfileApp} from './modules/profile-app.js';
import {createSettingsApp} from './modules/settings-app.js';
import {createUiApp} from './modules/ui-app.js';
window.addEventListener('error',e=>window.electronAPI.reportDiagnostic({reason:'exception',kind:e.error?.name || 'Error'}));
window.addEventListener('unhandledrejection',e=>window.electronAPI.reportDiagnostic({reason:'rejection',kind:e.reason?.name || 'Error'}));
import {escapeHtml, formatBytes} from './modules/ui.js';
/**
 * ZO论坛桌面客户端 - 主应用逻辑
 */

(function () {
    let currentPage = 'home';
    let currentForumId = null;
    let currentThreadId = null;
    let currentThreadPage = 1;
    let lastPageBeforeThread = 'home';
    let currentNotificationsType = 'system';
    let homePage = 1;
    let homeLoading = false;
    let homeHasMore = true;
    let clientConfig = null;
    let appInfo = { version: '' };
    let removeUpdateListener = null;
    let removeUpdateStatusListener = null;
    let forumRequestId = 0;
    let threadRequestId = 0;
    let searchRequestId = 0;
    let profileRequestId = 0;
    let notificationRequestId = 0;
    let lastAnnouncementId = '';
    let clientConfigSignature = '';
    let clientConfigLoading = false;
    let clientConfigPollTimer = null;

    const composeState = {
        fid: null,
        forumName: ''
    };

    const pages = {
        home: document.getElementById('page-home'),
        forums: document.getElementById('page-forums'),
        search: document.getElementById('page-search'),
        notifications: document.getElementById('page-notifications'),
        profile: document.getElementById('page-profile'),
        medals: document.getElementById('page-medals'),
        tasks: document.getElementById('page-tasks'),
        'personal-settings': document.getElementById('page-personal-settings'),
        certification: document.getElementById('page-certification'),
        'password-security': document.getElementById('page-password-security'),
        settings: document.getElementById('page-settings'),
        thread: document.getElementById('page-thread')
    };

    const navItems = document.querySelectorAll('.nav-item');
    const authModal = document.getElementById('authModal');
    const authMessage = document.getElementById('authMessage');
    const newThreadModal = document.getElementById('newThreadModal');
    const composeMessage = document.getElementById('newThreadMessageText');
    const notificationsBox = document.getElementById('notificationsBox');
    const toastContainer = document.getElementById('toastContainer');
    const noticeModal = document.getElementById('noticeModal');
    const updateModal = document.getElementById('updateModal');
    const appVersionText = document.getElementById('appVersionText');
    const appUpdateText = document.getElementById('appUpdateText');

    const context = {};
    Object.defineProperties(context,{
        currentPage: {get:()=>currentPage,set:value=>currentPage=value},
        currentForumId: {get:()=>currentForumId,set:value=>currentForumId=value},
        currentThreadId: {get:()=>currentThreadId,set:value=>currentThreadId=value},
        currentThreadPage: {get:()=>currentThreadPage,set:value=>currentThreadPage=value},
        lastPageBeforeThread: {get:()=>lastPageBeforeThread,set:value=>lastPageBeforeThread=value},
        currentNotificationsType: {get:()=>currentNotificationsType,set:value=>currentNotificationsType=value},
        homePage: {get:()=>homePage,set:value=>homePage=value},
        homeLoading: {get:()=>homeLoading,set:value=>homeLoading=value},
        homeHasMore: {get:()=>homeHasMore,set:value=>homeHasMore=value},
        clientConfig: {get:()=>clientConfig,set:value=>clientConfig=value},
        appInfo: {get:()=>appInfo,set:value=>appInfo=value},
        removeUpdateListener: {get:()=>removeUpdateListener,set:value=>removeUpdateListener=value},
        removeUpdateStatusListener: {get:()=>removeUpdateStatusListener,set:value=>removeUpdateStatusListener=value},
        forumRequestId: {get:()=>forumRequestId,set:value=>forumRequestId=value},
        threadRequestId: {get:()=>threadRequestId,set:value=>threadRequestId=value},
        searchRequestId: {get:()=>searchRequestId,set:value=>searchRequestId=value},
        profileRequestId: {get:()=>profileRequestId,set:value=>profileRequestId=value},
        notificationRequestId: {get:()=>notificationRequestId,set:value=>notificationRequestId=value},
        lastAnnouncementId: {get:()=>lastAnnouncementId,set:value=>lastAnnouncementId=value},
        clientConfigSignature: {get:()=>clientConfigSignature,set:value=>clientConfigSignature=value},
        clientConfigLoading: {get:()=>clientConfigLoading,set:value=>clientConfigLoading=value},
        clientConfigPollTimer: {get:()=>clientConfigPollTimer,set:value=>clientConfigPollTimer=value},
        composeState: {get:()=>composeState},
        pages: {get:()=>pages},
        navItems: {get:()=>navItems},
        authModal: {get:()=>authModal},
        authMessage: {get:()=>authMessage},
        newThreadModal: {get:()=>newThreadModal},
        composeMessage: {get:()=>composeMessage},
        notificationsBox: {get:()=>notificationsBox},
        toastContainer: {get:()=>toastContainer},
        noticeModal: {get:()=>noticeModal},
        updateModal: {get:()=>updateModal},
        appVersionText: {get:()=>appVersionText},
        appUpdateText: {get:()=>appUpdateText},
    });
    Object.assign(context,createAuthApp(context));
    Object.assign(context,createHomeApp(context));
    Object.assign(context,createForumsApp(context));
    Object.assign(context,createThreadApp(context));
    Object.assign(context,createSearchApp(context));
    Object.assign(context,createProfileApp(context));
    Object.assign(context,createSettingsApp(context));
    Object.assign(context,createUiApp(context));
    Object.assign(context,{init,bindNavigation,switchPage,setActiveNav});

    async function init() {
        context.initTheme();
        context.bindTitlebar();
        bindNavigation();
        context.bindAuthModal();
        context.bindComposeModal();
        context.bindClientFeatures();
        context.bindSearch();
        context.bindHomeScroll();
        context.bindNativeAccountPages();
        await context.syncSessionState();
        await context.initClientFeatures();
        context.startClientConfigPolling();
        context.updateLoginButton();
        switchPage('home');
    }

    function bindNavigation() {
        context.navItems.forEach(item => {
            item.addEventListener('click', (event) => {
                event.preventDefault();
                const page = item.dataset.page;
                if ((page === 'profile' || page === 'notifications' || page === 'medals' || page === 'tasks') && !API.getUser()) {
                    context.openAuthModal('login');
                    return;
                }
                if(page==='medals'){context.showMedals();return;}
                if(page==='tasks'){context.showTasks();return;}
                if (page === 'profile') {
                    context.showProfile();
                    return;
                }
                if (page === 'notifications') {
                    context.showNotifications();
                    return;
                }
                switchPage(page);
            });
        });
    }

    function switchPage(page, options = {}) {
        const features = window.ClientRuntime.config()?.features || {};
        const guard={medals:'medals_enabled',tasks:'tasks_enabled','personal-settings':'profile_save_enabled'}[page];
        if(guard&&features[guard]===false){context.showToast('该客户端功能当前已关闭','error');return false;}
        if ((page === 'search' && features.search_enabled === false)
            || (page === 'notifications' && features.notifications_enabled === false)) {
            context.showToast('该客户端功能当前已关闭', 'error');
            return false;
        }
        if ((page === 'profile' || page === 'notifications' || page === 'medals' || page === 'tasks') && !API.getUser() && !options.allowGuest) {
            context.openAuthModal('login');
            return false;
        }
        Object.values(context.pages).forEach(pageEl => pageEl.classList.remove('active'));
        if (context.pages[page]) {
            context.pages[page].classList.add('active');
        }
        context.currentPage = page;
        window.Layout225.page(page);

        if (!options.keepNav && page !== 'thread') {
            setActiveNav(page);
        }

        if (options.skipLoad) {
            return;
        }

        if (page === 'home') {
            context.loadHome();
        } else if (page === 'forums') {
            context.loadForums();
        } else if (page === 'search') {
            document.getElementById('searchInput').focus();

        }
    }

    function setActiveNav(page) {
        context.navItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));
    }
    window.Layout225.bind(context);
    init();
})();
