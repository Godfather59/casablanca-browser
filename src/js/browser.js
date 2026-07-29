import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    getFaviconUrl,
    getTabDisplayInfo,
    isBookmarkableUrl,
    isInternalUrl,
    isSecureUrl,
    isWebUrl,
    MAX_BROWSER_URL_LENGTH,
    normalizeUrl,
} from './url.js';
import {
    applyTheme,
    loadPreferences,
    PREFERENCES_KEY,
} from './preferences.js';

const SESSION_KEY = 'casablanca_session_v1';
const LEGACY_SESSION_KEY = 'nova_session_v2';
const MAX_RESTORED_TABS = 50;
const MAX_CLOSED_TABS = 20;
const MAX_TITLE_LENGTH = 512;

class Tab {
    constructor(id, url) {
        this.id = id;
        this.url = url;
        this.title = getTabDisplayInfo(url).displayName;
        this.webviewLabel = null;
        this.loading = true;
    }
}

class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.nextId = 1;
        this.closedTabs = [];
        this.restoringSession = false;
        this.activationRequestId = 0;
        this.preferences = loadPreferences();
        this.toastTimeout = null;
        this.unlisteners = [];
        this.pendingTabEvents = new Map();
        this.closingTabIds = new Set();

        this.tabsContainer = document.getElementById('tabs-inner');
        this.minimizeBtn = document.querySelector('.title-bar-minimize');
        this.maximizeBtn = document.querySelector('.title-bar-maximize');
        this.closeBtn = document.querySelector('.title-bar-close');
        this.bookmarkPageBtn = document.getElementById('bookmarks-btn');

        this.ready = this.initialize();
    }

    async initialize() {
        applyTheme(this.preferences);
        this.initEventListeners();
        await this.setupNativeListeners();
        await this.restoreSession();
    }

    initEventListeners() {
        document.getElementById('back-button')?.addEventListener('click', () => this.goBack());
        document.getElementById('forward-button')?.addEventListener('click', () => this.goForward());
        document.getElementById('reload-button')?.addEventListener('click', () => this.reload());
        document.getElementById('home-button')?.addEventListener('click', () => {
            this.preferences = loadPreferences();
            this.navigateToUrl(this.preferences.homepage);
        });
        document.getElementById('add-tab-button')?.addEventListener('click', () => this.createTab());
        document.getElementById('menu-button')?.addEventListener('click', () => this.showAppMenu());
        this.bookmarkPageBtn?.addEventListener('click', () => this.toggleBookmarkCurrentTab());

        this.minimizeBtn?.addEventListener('click', () => this.minimizeWindow());
        this.maximizeBtn?.addEventListener('click', () => this.maximizeWindow());
        this.closeBtn?.addEventListener('click', () => this.closeWindow());

        document.addEventListener('keydown', (event) => {
            const action = this.getKeyboardAction(event);
            if (!action) return;
            event.preventDefault();
            this.handleShortcut(action);
        });

        this.tabsContainer?.addEventListener('dragover', (event) => {
            event.preventDefault();
            const draggingTab = this.tabsContainer.querySelector('.tab.dragging');
            if (!draggingTab) return;

            const afterElement = this.getDragAfterElement(this.tabsContainer, event.clientX);
            const addButton = document.getElementById('add-tab-button');
            if (!afterElement || afterElement === addButton) {
                this.tabsContainer.insertBefore(draggingTab, addButton);
            } else {
                this.tabsContainer.insertBefore(draggingTab, afterElement);
            }
        });

        this.tabsContainer?.addEventListener('drop', () => {
            const orderedIds = Array.from(this.tabsContainer.querySelectorAll('.tab'))
                .map((element) => Number.parseInt(element.dataset.tabId, 10));
            this.tabs.sort((left, right) => (
                orderedIds.indexOf(left.id) - orderedIds.indexOf(right.id)
            ));
            this.saveSession();
        });

        window.addEventListener('storage', (event) => {
            if (event.key === PREFERENCES_KEY) {
                this.reloadPreferences();
            }
        });
    }

    async setupNativeListeners() {
        const subscriptions = [
            listen('menu-event', ({ payload }) => this.handleMenuAction(payload)),
            listen('tab-url-changed', ({ payload }) => this.handleTabEvent('url', payload)),
            listen('tab-title-changed', ({ payload }) => this.handleTabEvent('title', payload)),
            listen('tab-load-state', ({ payload }) => this.handleTabEvent('load', payload)),
            listen('tab-new-window', ({ payload }) => this.createTab(payload.url)),
            listen('tab-shortcut', ({ payload }) => {
                this.handleShortcut(payload.action, payload.label);
            }),
            listen('tab-navigation-blocked', ({ payload }) => {
                this.showToast(`Blocked unsupported URL scheme: ${payload.scheme}`);
            }),
            listen('download-event', ({ payload }) => {
                if (payload.status === 'finished') {
                    this.showToast(payload.success ? 'Download completed' : 'Download failed');
                }
            }),
            listen('preferences-changed', () => this.reloadPreferences()),
        ];

        this.unlisteners = await Promise.all(subscriptions);
    }

    handleTabEvent(type, payload) {
        if (!this.getTabByLabel(payload.label)) {
            const pending = this.pendingTabEvents.get(payload.label) ?? [];
            if (pending.length < 30) pending.push({ type, payload });
            this.pendingTabEvents.set(payload.label, pending);
            return;
        }

        Promise.resolve(this.dispatchTabEvent(type, payload)).catch((error) => {
            console.error(`Failed to process ${type} event:`, error);
        });
    }

    dispatchTabEvent(type, payload) {
        if (type === 'url') return this.handleUrlChanged(payload);
        if (type === 'title') return this.handleTitleChanged(payload);
        if (type === 'load') return this.handleLoadState(payload);
        return undefined;
    }

    async flushPendingTabEvents(label) {
        const pending = this.pendingTabEvents.get(label) ?? [];
        this.pendingTabEvents.delete(label);
        for (const { type, payload } of pending) {
            await this.dispatchTabEvent(type, payload);
        }
    }

    reloadPreferences() {
        this.preferences = loadPreferences();
        applyTheme(this.preferences);
    }

    getKeyboardAction(event) {
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();

        if (modifier && event.shiftKey && key === 't') return 'restore-tab';
        if (modifier && event.shiftKey && key === 'j') return 'open-downloads-folder';
        if (modifier && key === 't') return 'new-tab';
        if (modifier && key === 'w') return 'close-tab';
        if (modifier && key === 'l') return 'focus-address';
        if (modifier && key === 'h') return 'history';
        if (modifier && key === 'b') return 'bookmarks';
        if (modifier && key === 'd') return 'bookmark';
        if (modifier && key === 'j') return 'downloads';
        if (modifier && key === 'r') return 'reload';
        if (modifier && key === 'tab') return event.shiftKey ? 'previous-tab' : 'next-tab';
        if (event.altKey && key === 'arrowleft') return 'back';
        if (event.altKey && key === 'arrowright') return 'forward';
        if (event.key === 'F5') return 'reload';
        return null;
    }

    handleShortcut(action, sourceLabel = null) {
        const activeTab = this.getActiveTab();
        if (sourceLabel && activeTab?.webviewLabel !== sourceLabel) return;

        const handlers = {
            'new-tab': () => this.createTab(),
            'restore-tab': () => this.restoreClosedTab(),
            'close-tab': () => activeTab && this.closeTab(activeTab.id),
            'focus-address': () => this.focusAddressBar(),
            'history': () => this.showHistory(),
            'bookmarks': () => this.showBookmarks(),
            'bookmark': () => this.toggleBookmarkCurrentTab(),
            'downloads': () => this.showDownloads(),
            'open-downloads-folder': () => this.openDownloadsFolder(),
            'reload': () => this.reload(),
            'back': () => this.goBack(),
            'forward': () => this.goForward(),
            'next-tab': () => this.switchTab(1),
            'previous-tab': () => this.switchTab(-1),
        };

        handlers[action]?.();
    }

    handleMenuAction(action) {
        const menuActions = {
            'new-tab': 'new-tab',
            history: 'history',
            bookmarks: 'bookmarks',
            downloads: 'downloads',
            'open-downloads-folder': 'open-downloads-folder',
            settings: 'settings',
        };

        if (action === 'settings') {
            this.showSettings();
        } else {
            this.handleShortcut(menuActions[action]);
        }
    }

    handleUrlChanged({ label, url }) {
        const tab = this.getTabByLabel(label);
        if (!tab) return;

        tab.url = url;
        tab.title = getTabDisplayInfo(url).displayName;
        this.updateTabDisplay(tab);
        this.saveSession();
        if (tab.id === this.activeTabId) this.refreshBookmarkState(tab);
    }

    handleTitleChanged({ label, title }) {
        const tab = this.getTabByLabel(label);
        const normalizedTitle = String(title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
        if (!tab || !normalizedTitle) return;

        tab.title = normalizedTitle;
        this.updateTabDisplay(tab, { preserveTitle: true });
    }

    async handleLoadState({ label, state, url }) {
        const tab = this.getTabByLabel(label);
        if (!tab) return;

        tab.loading = state === 'started';
        if (url) tab.url = url;
        this.setTabLoading(tab, tab.loading);

        if (state === 'finished') {
            this.updateTabDisplay(tab, { preserveTitle: true });
            await this.addToHistory(tab.url, tab.title);
            this.saveSession();
        }
    }

    createTabElement(tab) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = String(tab.id);
        tabElement.draggable = true;
        tabElement.tabIndex = 0;
        tabElement.setAttribute('role', 'tab');
        tabElement.setAttribute('aria-selected', 'false');

        const favicon = document.createElement('div');
        favicon.className = 'tab-favicon loading';
        favicon.setAttribute('aria-hidden', 'true');

        const lock = document.createElement('span');
        lock.className = 'lock-icon-tab';
        lock.textContent = '●';
        lock.title = 'Secure HTTPS connection';
        lock.setAttribute('aria-label', 'Secure HTTPS connection');

        const info = document.createElement('div');
        info.className = 'tab-info';

        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = tab.title;

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'tab-url-input';
        urlInput.value = tab.url;
        urlInput.autocomplete = 'off';
        urlInput.spellcheck = false;
        urlInput.setAttribute('aria-label', 'Address and search');

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'tab-close';
        closeButton.textContent = '×';
        closeButton.setAttribute('aria-label', `Close ${tab.title}`);

        info.append(title, urlInput);
        tabElement.append(favicon, lock, info, closeButton);

        tabElement.addEventListener('dragstart', () => tabElement.classList.add('dragging'));
        tabElement.addEventListener('dragend', () => tabElement.classList.remove('dragging'));
        tabElement.addEventListener('mousedown', (event) => {
            if (event.button === 1) {
                event.preventDefault();
                this.closeTab(tab.id);
            }
        });
        tabElement.addEventListener('click', (event) => {
            if (event.target.closest('.tab-close, .tab-url-input')) return;
            if (tab.id === this.activeTabId) {
                this.activateTabEditMode(tabElement, urlInput);
            } else {
                this.activateTab(tab.id);
            }
        });
        tabElement.addEventListener('keydown', (event) => {
            if (event.target.closest('.tab-close, .tab-url-input')) return;
            if (!['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            if (tab.id === this.activeTabId) {
                this.activateTabEditMode(tabElement, urlInput);
            } else {
                this.activateTab(tab.id);
            }
        });

        urlInput.addEventListener('click', (event) => event.stopPropagation());
        urlInput.addEventListener('blur', () => {
            tabElement.classList.remove('editing');
            if (!urlInput.value.trim()) urlInput.value = tab.url;
        });
        urlInput.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                const input = urlInput.value;
                urlInput.blur();
                this.navigateToUrl(input);
            } else if (event.key === 'Escape') {
                urlInput.value = tab.url;
                urlInput.blur();
            }
        });
        closeButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.closeTab(tab.id);
        });

        return tabElement;
    }

    async createTab(url = this.preferences.homepage, activate = true, persist = true) {
        const tab = new Tab(this.nextId++, url);
        const tabElement = this.createTabElement(tab);
        const addButton = document.getElementById('add-tab-button');
        let requestedActivation = null;

        this.tabs.push(tab);
        this.tabsContainer.insertBefore(tabElement, addButton);
        if (activate) {
            requestedActivation = ++this.activationRequestId;
            this.activeTabId = tab.id;
            this.updateActiveTabStyles();
        }

        try {
            tab.webviewLabel = await invoke('create_tab', { url });
            if (!this.tabs.includes(tab)) {
                this.pendingTabEvents.delete(tab.webviewLabel);
                try {
                    await invoke('close_tab', { label: tab.webviewLabel });
                } catch (error) {
                    console.error('Failed to close a cancelled tab:', error);
                }
                return null;
            }

            await this.flushPendingTabEvents(tab.webviewLabel);
            if (activate && requestedActivation === this.activationRequestId) {
                await this.activateTab(tab.id);
            }
            if (persist) this.saveSession();
            return tab;
        } catch (error) {
            console.error('Failed to create webview:', error);
            if (tab.webviewLabel) {
                this.pendingTabEvents.delete(tab.webviewLabel);
                try {
                    await invoke('close_tab', { label: tab.webviewLabel });
                } catch (closeError) {
                    console.error('Failed to clean up the tab webview:', closeError);
                }
            }
            this.tabs = this.tabs.filter((candidate) => candidate.id !== tab.id);
            tabElement.remove();
            this.showToast(`Failed to open tab: ${error}`);

            if (this.activeTabId === tab.id) {
                this.activeTabId = this.tabs.at(-1)?.id ?? null;
                if (this.activeTabId) await this.activateTab(this.activeTabId);
            }
            return null;
        }
    }

    async activateTab(id) {
        if (this.closingTabIds.has(id)) return;
        const tab = this.tabs.find((candidate) => candidate.id === id);
        if (!tab?.webviewLabel) return;

        const requestId = ++this.activationRequestId;
        this.activeTabId = id;
        this.updateActiveTabStyles();

        try {
            await invoke('show_tab', { label: tab.webviewLabel });
            if (!await this.keepLatestTabVisible(requestId)) return;

            const currentUrl = await invoke('get_tab_url', { label: tab.webviewLabel });
            if (!await this.keepLatestTabVisible(requestId)) return;

            if (currentUrl) {
                tab.url = currentUrl;
                this.updateTabDisplay(tab, { preserveTitle: true });
            }
            await this.refreshBookmarkState(tab);
            this.saveSession();
        } catch (error) {
            console.error('Failed to activate tab:', error);
            this.showToast('Failed to switch tabs');
        }
    }

    async keepLatestTabVisible(requestId) {
        if (requestId === this.activationRequestId) return true;

        const latest = this.getActiveTab();
        if (latest?.webviewLabel) {
            try {
                await invoke('show_tab', { label: latest.webviewLabel });
            } catch (error) {
                console.error('Failed to restore the latest active tab:', error);
            }
        }
        return false;
    }

    updateActiveTabStyles() {
        this.tabsContainer.querySelectorAll('.tab').forEach((element) => {
            const isActive = Number(element.dataset.tabId) === this.activeTabId;
            element.classList.toggle('active', isActive);
            element.classList.remove('editing');
            element.setAttribute('aria-selected', String(isActive));
        });
    }

    async closeTab(id) {
        if (this.closingTabIds.has(id)) return;
        const index = this.tabs.findIndex((tab) => tab.id === id);
        if (index < 0) return;

        const tab = this.tabs[index];
        this.closingTabIds.add(id);

        try {
            if (tab.webviewLabel) {
                await invoke('close_tab', { label: tab.webviewLabel });
            }

            const currentIndex = this.tabs.indexOf(tab);
            if (currentIndex < 0) return;
            const closedActiveTab = tab.id === this.activeTabId;

            if (!isInternalUrl(tab.url) && tab.url !== 'about:blank') {
                this.closedTabs.push({ url: tab.url, title: tab.title });
                this.closedTabs = this.closedTabs.slice(-MAX_CLOSED_TABS);
            }

            this.tabs.splice(currentIndex, 1);
            if (tab.webviewLabel) this.pendingTabEvents.delete(tab.webviewLabel);
            const element = this.getTabElement(tab.id);
            if (element) {
                element.classList.add('closing');
                setTimeout(() => element.remove(), 150);
            }

            if (!this.tabs.length) {
                this.activeTabId = null;
                await this.createTab(this.preferences.homepage);
            } else if (closedActiveTab) {
                const adjacent = this.tabs[Math.min(currentIndex, this.tabs.length - 1)];
                await this.activateTab(adjacent.id);
            } else {
                this.saveSession();
            }
        } catch (error) {
            console.error('Failed to close webview:', error);
            this.showToast('Failed to close tab');
        } finally {
            this.closingTabIds.delete(id);
        }
    }

    async restoreSession() {
        this.restoringSession = true;
        try {
            const raw = localStorage.getItem(SESSION_KEY)
                ?? localStorage.getItem(LEGACY_SESSION_KEY);
            const session = raw ? JSON.parse(raw) : null;
            const savedTabs = Array.isArray(session?.tabs)
                ? session.tabs
                    .filter((tab) => (
                        typeof tab?.url === 'string'
                        && tab.url.length <= MAX_BROWSER_URL_LENGTH
                    ))
                    .slice(0, MAX_RESTORED_TABS)
                : [];

            for (const savedTab of savedTabs) {
                await this.createTab(savedTab.url, false, false);
            }

            if (this.tabs.length) {
                const requestedIndex = Number.isInteger(session?.activeIndex)
                    ? session.activeIndex
                    : 0;
                const activeIndex = Math.min(Math.max(requestedIndex, 0), this.tabs.length - 1);
                await this.activateTab(this.tabs[activeIndex].id);
            } else {
                await this.createTab(this.preferences.homepage, true, false);
            }

            localStorage.removeItem(LEGACY_SESSION_KEY);
        } catch (error) {
            console.error('Failed to restore session:', error);
            await this.createTab(this.preferences.homepage, true, false);
        } finally {
            this.restoringSession = false;
            this.saveSession();
        }
    }

    saveSession() {
        if (this.restoringSession) return;
        const activeIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);
        const session = {
            tabs: this.tabs.map((tab) => ({
                url: tab.url.length <= MAX_BROWSER_URL_LENGTH
                    ? tab.url
                    : this.preferences.homepage,
            })),
            activeIndex: Math.max(activeIndex, 0),
        };
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    async navigateToUrl(input) {
        const tab = this.getActiveTab();
        if (!tab?.webviewLabel) return;

        this.preferences = loadPreferences();
        const url = normalizeUrl(
            input,
            this.preferences.searchEngine,
            this.preferences.homepage,
        );
        this.setTabLoading(tab, true);

        try {
            await invoke('navigate_tab', { label: tab.webviewLabel, url });
            tab.url = url;
            tab.title = getTabDisplayInfo(url).displayName;
            this.updateTabDisplay(tab);
            this.saveSession();
        } catch (error) {
            this.setTabLoading(tab, false);
            this.showToast(`Navigation failed: ${error}`);
        }
    }

    async goBack() {
        await this.invokeForActiveTab('go_back', 'Cannot go back');
    }

    async goForward() {
        await this.invokeForActiveTab('go_forward', 'Cannot go forward');
    }

    async reload() {
        const tab = this.getActiveTab();
        if (!tab) return;
        this.setTabLoading(tab, true);
        await this.invokeForActiveTab('reload_tab', 'Reload failed');
    }

    async invokeForActiveTab(command, errorMessage) {
        const tab = this.getActiveTab();
        if (!tab?.webviewLabel) return;
        try {
            await invoke(command, { label: tab.webviewLabel });
        } catch (error) {
            console.error(`${command} failed:`, error);
            this.setTabLoading(tab, false);
            this.showToast(errorMessage);
        }
    }

    updateTabDisplay(tab, { preserveTitle = false } = {}) {
        const element = this.getTabElement(tab.id);
        if (!element) return;

        const fallback = getTabDisplayInfo(tab.url);
        if (!preserveTitle || !tab.title) tab.title = fallback.displayName;

        element.classList.toggle('secure', isSecureUrl(tab.url));
        const title = element.querySelector('.tab-title');
        const input = element.querySelector('.tab-url-input');
        const favicon = element.querySelector('.tab-favicon');
        const closeButton = element.querySelector('.tab-close');

        if (title) title.textContent = tab.title;
        if (input && !element.classList.contains('editing')) input.value = tab.url;
        if (closeButton) closeButton.setAttribute('aria-label', `Close ${tab.title}`);

        if (favicon && !tab.loading) {
            const faviconUrl = getFaviconUrl(tab.url);
            favicon.style.backgroundImage = faviconUrl ? `url("${faviconUrl}")` : '';
        }
    }

    setTabLoading(tab, loading) {
        tab.loading = loading;
        const favicon = this.getTabElement(tab.id)?.querySelector('.tab-favicon');
        favicon?.classList.toggle('loading', loading);
        if (!loading) this.updateTabDisplay(tab, { preserveTitle: true });
    }

    focusAddressBar() {
        const tab = this.getActiveTab();
        const element = tab ? this.getTabElement(tab.id) : null;
        const input = element?.querySelector('.tab-url-input');
        if (element && input) this.activateTabEditMode(element, input);
    }

    activateTabEditMode(tabElement, input) {
        tabElement.classList.add('editing');
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    async toggleBookmarkCurrentTab() {
        const tab = this.getActiveTab();
        if (!tab || !isBookmarkableUrl(tab.url) || isInternalUrl(tab.url)) {
            this.showToast('Only web pages and local files can be bookmarked');
            return;
        }

        try {
            const result = await invoke('toggle_bookmark', {
                url: tab.url,
                title: tab.title || tab.url,
            });
            this.setBookmarkButtonState(result.bookmarked);
            this.showToast(result.bookmarked ? 'Bookmark added' : 'Bookmark removed');
        } catch (error) {
            console.error('Failed to toggle bookmark:', error);
            this.showToast('Failed to update bookmark');
        }
    }

    async refreshBookmarkState(tab) {
        if (
            tab.id !== this.activeTabId
            || !isBookmarkableUrl(tab.url)
            || isInternalUrl(tab.url)
        ) {
            this.setBookmarkButtonState(false);
            return;
        }
        try {
            const bookmarked = await invoke('is_bookmarked', { url: tab.url });
            this.setBookmarkButtonState(bookmarked);
        } catch {
            this.setBookmarkButtonState(false);
        }
    }

    setBookmarkButtonState(bookmarked) {
        this.bookmarkPageBtn?.classList.toggle('active', bookmarked);
        this.bookmarkPageBtn?.setAttribute('aria-pressed', String(bookmarked));
        if (this.bookmarkPageBtn) {
            this.bookmarkPageBtn.title = bookmarked
                ? 'Remove bookmark (Ctrl+D)'
                : 'Bookmark this page (Ctrl+D)';
        }
    }

    restoreClosedTab() {
        const lastTab = this.closedTabs.pop();
        if (lastTab) {
            this.createTab(lastTab.url);
        } else {
            this.showToast('No recently closed tabs');
        }
    }

    switchTab(direction) {
        if (this.tabs.length < 2) return;
        const currentIndex = this.tabs.findIndex((tab) => tab.id === this.activeTabId);
        if (currentIndex < 0) return;
        const nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
        this.activateTab(this.tabs[nextIndex].id);
    }

    async addToHistory(url, title) {
        if (!isWebUrl(url) || isInternalUrl(url)) return;
        try {
            await invoke('add_to_history', { url, title: title || url });
        } catch (error) {
            console.error('Failed to add history entry:', error);
        }
    }

    showInternalPage(page) {
        const url = new URL(`pages/${page}.html`, window.location.href).href;
        this.createTab(url);
    }

    showBookmarks() {
        this.showInternalPage('bookmarks');
    }

    showHistory() {
        this.showInternalPage('history');
    }

    showDownloads() {
        this.showInternalPage('downloads');
    }

    showSettings() {
        this.showInternalPage('settings');
    }

    async showAppMenu() {
        try {
            await invoke('show_app_menu');
        } catch (error) {
            console.error('Failed to show app menu:', error);
            this.showToast('Failed to open menu');
        }
    }

    async openDownloadsFolder() {
        try {
            await invoke('open_downloads_folder');
        } catch (error) {
            console.error('Failed to open downloads folder:', error);
            this.showToast('Failed to open downloads folder');
        }
    }

    async minimizeWindow() {
        try { await invoke('minimize_window'); } catch (error) { console.error(error); }
    }

    async maximizeWindow() {
        try { await invoke('maximize_window'); } catch (error) { console.error(error); }
    }

    async closeWindow() {
        try { await invoke('close_window'); } catch (error) { console.error(error); }
    }

    getActiveTab() {
        return this.tabs.find((tab) => tab.id === this.activeTabId);
    }

    getTabByLabel(label) {
        return this.tabs.find((tab) => tab.webviewLabel === label);
    }

    getTabElement(id) {
        return this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
    }

    getDragAfterElement(container, x) {
        const candidates = [...container.querySelectorAll('.tab:not(.dragging)')];
        return candidates.reduce((closest, element) => {
            const box = element.getBoundingClientRect();
            const offset = x - box.left - (box.width / 2);
            return offset < 0 && offset > closest.offset
                ? { offset, element }
                : closest;
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    }

    showToast(message, duration = 3000) {
        let toast = document.getElementById('browser-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'browser-toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('visible');
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => toast.classList.remove('visible'), duration);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.tabManager = new TabManager();
});

export { Tab, TabManager };
