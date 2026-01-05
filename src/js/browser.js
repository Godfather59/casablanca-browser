// Tauri Browser - Full Featured Implementation
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const TOOLBAR_HEIGHT = 76;

class Tab {
    constructor(id, url = 'https://www.google.com') {
        this.id = id;
        this.url = url;
        this.title = 'New Tab';
        this.favicon = null;
        this.webviewLabel = null;
    }
}

class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.nextId = 1;
        this.menuOpen = false;

        this.tabsContainer = document.getElementById('tabs-inner');
        // this.urlBar is no longer single global element
        this.menuDropdown = document.getElementById('menu-dropdown');

        // Window controls
        this.minimizeBtn = document.querySelector('.title-bar-minimize');
        this.maximizeBtn = document.querySelector('.title-bar-maximize');
        this.closeBtn = document.querySelector('.title-bar-close');

        this.initEventListeners();
        this.setupUrlListener();
    }

    initEventListeners() {
        // Navigation buttons
        document.getElementById('back-button')?.addEventListener('click', () => this.goBack());
        document.getElementById('forward-button')?.addEventListener('click', () => this.goForward());
        document.getElementById('reload-button')?.addEventListener('click', () => this.reload());
        document.getElementById('home-button')?.addEventListener('click', () => this.navigateToUrl('https://www.google.com')); // Home button action

        document.getElementById('add-tab-button')?.addEventListener('click', () => this.createTab());

        // Menu button
        document.getElementById('menu-button')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Menu items
        this.menuDropdown?.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleMenuAction(action);
                this.closeMenu();
            });
        });

        // Close menu on outside click
        document.addEventListener('click', () => this.closeMenu());

        // Bookmarks button
        document.getElementById('bookmarks-btn')?.addEventListener('click', () => this.showBookmarks());

        // Window controls
        this.minimizeBtn?.addEventListener('click', () => this.minimizeWindow());
        this.maximizeBtn?.addEventListener('click', () => this.maximizeWindow());
        this.closeBtn?.addEventListener('click', () => this.closeWindow());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.createTab();
            }
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                if (this.activeTabId) {
                    this.closeTab(this.activeTabId);
                }
            }
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                // Focus current tab's input
                const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${this.activeTabId}"]`);
                if (tabEl) {
                    const input = tabEl.querySelector('.tab-url-input');
                    this.activateTabEditMode(tabEl, input);
                }
            }
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                this.showHistory();
            }
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.showBookmarks();
            }
            if (e.ctrlKey && e.key === 'j') {
                e.preventDefault();
                this.showDownloads();
            }
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.goBack();
            }
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.goForward();
            }
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.reload();
            }
            if (e.key === 'Escape') {
                this.closeMenu();
                // Deactivate edit mode if active
                const activeTabEl = this.tabsContainer.querySelector('.tab.editing');
                if (activeTabEl) {
                    activeTabEl.classList.remove('editing');
                    const input = activeTabEl.querySelector('.tab-url-input');
                    const tab = this.getActiveTab();
                    if (input && tab) input.value = tab.url; // Reset value
                }
            }
        });
    }

    async setupUrlListener() {
        await listen('tab-url-changed', async (event) => {
            const { label, url } = event.payload;
            const tab = this.tabs.find(t => t.webviewLabel === label);
            if (tab) {
                tab.url = url;
                this.updateTabDisplay(tab);

                // Add to history
                await this.addToHistory(url, tab.title);
            }
        });
    }

    // Menu
    toggleMenu() {
        this.menuOpen = !this.menuOpen;
        this.menuDropdown?.classList.toggle('hidden', !this.menuOpen);
    }

    closeMenu() {
        this.menuOpen = false;
        this.menuDropdown?.classList.add('hidden');
    }

    handleMenuAction(action) {
        switch (action) {
            case 'new-tab':
                this.createTab();
                break;
            case 'history':
                this.showHistory();
                break;
            case 'bookmarks':
                this.showBookmarks();
                break;
            case 'downloads':
                this.showDownloads();
                break;
            case 'settings':
                this.showSettings();
                break;
        }
    }

    // Actions implementations
    showBookmarks() {
        const baseUrl = window.location.origin;
        this.createTab(`${baseUrl}/pages/bookmarks.html`);
    }

    // History
    async addToHistory(url, title) {
        try {
            if (url.startsWith('http://localhost') || url.startsWith('about:') || url.startsWith('file://')) return;
            await invoke('add_to_history', { url, title: title || url });
        } catch (e) {
            console.error('Failed to add to history:', e);
        }
    }

    showHistory() {
        const baseUrl = window.location.origin;
        this.createTab(`${baseUrl}/pages/history.html`);
    }

    showDownloads() {
        const baseUrl = window.location.origin;
        this.createTab(`${baseUrl}/pages/downloads.html`);
    }

    showSettings() {
        const baseUrl = window.location.origin;
        this.createTab(`${baseUrl}/pages/settings.html`);
    }

    // Window controls
    async minimizeWindow() {
        try { await invoke('minimize_window'); } catch (e) { console.error(e); }
    }

    async maximizeWindow() {
        try { await invoke('maximize_window'); } catch (e) { console.error(e); }
    }

    async closeWindow() {
        try { await invoke('close_window'); } catch (e) { console.error(e); }
    }

    // Navigation
    async goBack() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try { await invoke('go_back', { label: tab.webviewLabel }); } catch (e) { console.error(e); }
        }
    }

    async goForward() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try { await invoke('go_forward', { label: tab.webviewLabel }); } catch (e) { console.error(e); }
        }
    }

    async reload() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try { await invoke('reload_tab', { label: tab.webviewLabel }); } catch (e) { console.error(e); }
        }
    }

    normalizeUrl(input) {
        if (input.includes('.') && !input.includes(' ')) {
            if (!input.startsWith('http://') && !input.startsWith('https://') && !input.startsWith('file://')) {
                return 'https://' + input;
            }
            return input;
        }
        return 'https://www.google.com/search?q=' + encodeURIComponent(input);
    }

    async navigateToUrl(input) {
        const url = this.normalizeUrl(input);
        const activeTab = this.getActiveTab();

        if (activeTab && activeTab.webviewLabel) {
            try {
                await invoke('navigate_tab', { label: activeTab.webviewLabel, url });
                activeTab.url = url;
                this.updateTabDisplay(activeTab);
            } catch (e) {
                console.error('Navigate failed:', e);
            }
        } else {
            this.createTab(url);
        }
    }

    getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch (e) {
            return null;
        }
    }

    updateTabDisplay(tab) {
        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${tab.id}"]`);
        if (tabEl) {
            let displayName = 'New Tab';
            try {
                const urlObj = new URL(tab.url);
                if (tab.url.startsWith('file://')) {
                    const parts = tab.url.split('/');
                    displayName = parts[parts.length - 1] || 'Local File';
                } else if (tab.url.includes('pages/')) {
                    displayName = tab.url.split('pages/')[1].split('.')[0].replace(/^\w/, c => c.toUpperCase());
                } else {
                    displayName = urlObj.hostname.replace('www.', '');
                }
            } catch (e) {
                displayName = tab.url.substring(0, 20);
            }

            tab.title = displayName;

            const titleEl = tabEl.querySelector('.tab-title');
            if (titleEl) titleEl.textContent = displayName;

            const inputEl = tabEl.querySelector('.tab-url-input');
            if (inputEl && !tabEl.classList.contains('editing')) {
                inputEl.value = tab.url;
            }

            const iconEl = tabEl.querySelector('.tab-favicon');
            if (iconEl) {
                const faviconUrl = this.getFaviconUrl(tab.url);
                if (faviconUrl && !tab.url.startsWith('file://')) {
                    iconEl.style.backgroundImage = `url(${faviconUrl})`;
                } else {
                    iconEl.style.backgroundImage = ''; // Reset or default
                }
            }
        }
    }

    async createTab(url = 'https://www.google.com') {
        const tab = new Tab(this.nextId++, url);
        this.tabs.push(tab);

        // Create HTML using new NOVA properties
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.tabId = tab.id;
        tabEl.dataset.url = url;

        let displayName = 'New Tab';
        try {
            // Logic repeated from updateTabDisplay, could be extracted
            const urlObj = new URL(url);
            displayName = urlObj.hostname.replace('www.', '');
        } catch (e) { }

        tab.title = displayName;
        const faviconUrl = this.getFaviconUrl(url);
        const faviconStyle = faviconUrl ? `background-image: url(${faviconUrl})` : '';

        tabEl.innerHTML = `
            <div class="tab-favicon" style="${faviconStyle}"></div>
            <svg class="lock-icon-tab" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a3 3 0 0 0-3 3v1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zm2 4V4a2 2 0 1 0-4 0v1h4z"/>
            </svg>
            <div class="tab-info">
                <span class="tab-title">${displayName}</span>
                <input type="text" class="tab-url-input" value="${url}">
            </div>
            <button class="tab-close">
                <svg width="8" height="8" viewBox="0 0 8 8">
                    <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.5"/>
                </svg>
            </button>
        `;

        // Tab Click & Edit Logic
        const urlInput = tabEl.querySelector('.tab-url-input');

        tabEl.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) return;

            // If already active, switch to edit mode
            if (tabEl.classList.contains('active')) {
                this.activateTabEditMode(tabEl, urlInput);
            } else {
                this.activateTab(tab.id);
            }
        });

        urlInput.addEventListener('blur', () => {
            tabEl.classList.remove('editing');
            // If invalid URL or empty, reset to current value
            if (urlInput.value.trim() === '') {
                urlInput.value = tab.url;
            }
        });

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                urlInput.blur();
                this.navigateToUrl(urlInput.value);
            } else if (e.key === 'Escape') {
                urlInput.value = tab.url;
                urlInput.blur();
            }
        });

        // Close button
        tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tab.id);
        });

        this.tabsContainer.appendChild(tabEl);

        try {
            const label = await invoke('create_tab', { url });
            tab.webviewLabel = label;
        } catch (e) {
            console.error('Failed to create webview:', e);
        }

        await this.activateTab(tab.id);

        const ntpContent = document.getElementById('ntp-content');
        if (ntpContent) {
            ntpContent.style.display = 'none';
        }

        return tab;
    }

    activateTabEditMode(tabEl, input) {
        tabEl.classList.add('editing');
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
    }

    async activateTab(id) {
        this.tabsContainer.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active', 'editing');
        });

        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) {
            tabEl.classList.add('active');
            tabEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }

        const tab = this.tabs.find(t => t.id === id);
        if (tab?.webviewLabel) {
            try {
                await invoke('show_tab', { label: tab.webviewLabel });
                const currentUrl = await invoke('get_tab_url', { label: tab.webviewLabel });
                if (currentUrl) {
                    tab.url = currentUrl;
                    this.updateTabDisplay(tab);
                }
            } catch (e) {
                console.error('Failed to show tab:', e);
            }
        }

        this.activeTabId = id;
    }

    async closeTab(id) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        const tab = this.tabs[index];

        if (tab.webviewLabel) {
            try {
                await invoke('close_tab', { label: tab.webviewLabel });
            } catch (e) {
                console.error('Failed to close webview:', e);
            }
        }

        this.tabs.splice(index, 1);
        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) {
            // Animate removal
            tabEl.style.transform = 'scale(0.9)';
            tabEl.style.opacity = '0';
            setTimeout(() => tabEl.remove(), 150);
        }

        if (this.activeTabId === id && this.tabs.length > 0) {
            // Activate adjacent tab
            const nextTab = this.tabs[Math.max(0, index - 1)]; // Prefer left tab or first one
            await this.activateTab(nextTab.id);
        } else if (this.tabs.length === 0) {
            this.activeTabId = null;
            // Maybe show NTP content if implemented
            const ntpContent = document.getElementById('ntp-content');
            if (ntpContent) {
                ntpContent.style.display = 'flex';
            }
        }
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.tabManager = new TabManager();
});

export { TabManager, Tab };
