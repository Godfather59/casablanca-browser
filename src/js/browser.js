// Tauri Browser - Full Featured Implementation
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Total toolbar height (titlebar + navbar)
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

        this.tabsContainer = document.getElementById('tabs-inner');
        this.urlBar = document.getElementById('url-bar');

        // Navigation buttons
        document.getElementById('back-button')?.addEventListener('click', () => this.goBack());
        document.getElementById('forward-button')?.addEventListener('click', () => this.goForward());
        document.getElementById('reload-button')?.addEventListener('click', () => this.reload());
        document.getElementById('add-tab-button')?.addEventListener('click', () => this.createTab());

        // Menu button
        document.getElementById('menu-button')?.addEventListener('click', () => this.showMenu());

        // Window controls
        document.querySelector('.caption-minimise')?.addEventListener('click', () => this.minimizeWindow());
        document.querySelector('.caption-maximize')?.addEventListener('click', () => this.maximizeWindow());
        document.querySelector('.caption-close')?.addEventListener('click', () => this.closeWindow());

        // URL bar
        this.urlBar?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.navigateToUrl(this.urlBar.value);
            }
        });

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
                this.urlBar?.focus();
                this.urlBar?.select();
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
        });

        // Listen for URL changes from Tauri
        this.setupUrlListener();
    }

    async setupUrlListener() {
        await listen('tab-url-changed', (event) => {
            const { label, url } = event.payload;
            const tab = this.tabs.find(t => t.webviewLabel === label);
            if (tab) {
                tab.url = url;
                this.updateTabDisplay(tab);

                // Update URL bar if this is the active tab
                if (tab.id === this.activeTabId && this.urlBar) {
                    this.urlBar.value = url;
                }
            }
        });
    }

    showMenu() {
        // TODO: Implement dropdown menu
        console.log('Menu clicked - TODO: implement dropdown');
    }

    // Window controls
    async minimizeWindow() {
        try {
            await invoke('minimize_window');
        } catch (e) {
            console.error('Minimize failed:', e);
        }
    }

    async maximizeWindow() {
        try {
            await invoke('maximize_window');
        } catch (e) {
            console.error('Maximize failed:', e);
        }
    }

    async closeWindow() {
        try {
            await invoke('close_window');
        } catch (e) {
            console.error('Close failed:', e);
        }
    }

    // Navigation
    async goBack() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try {
                await invoke('go_back', { label: tab.webviewLabel });
            } catch (e) {
                console.error('Back failed:', e);
            }
        }
    }

    async goForward() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try {
                await invoke('go_forward', { label: tab.webviewLabel });
            } catch (e) {
                console.error('Forward failed:', e);
            }
        }
    }

    async reload() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try {
                await invoke('reload_tab', { label: tab.webviewLabel });
            } catch (e) {
                console.error('Reload failed:', e);
            }
        }
    }

    normalizeUrl(input) {
        if (input.includes('.') && !input.includes(' ')) {
            if (!input.startsWith('http://') && !input.startsWith('https://')) {
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
                displayName = urlObj.hostname.replace('www.', '');
            } catch (e) {
                displayName = tab.url.substring(0, 20);
            }

            const titleEl = tabEl.querySelector('.tab-title');
            if (titleEl) titleEl.textContent = displayName;

            const iconEl = tabEl.querySelector('.tab-icon');
            if (iconEl) {
                const faviconUrl = this.getFaviconUrl(tab.url);
                if (faviconUrl) {
                    iconEl.style.backgroundImage = `url(${faviconUrl})`;
                    iconEl.style.backgroundColor = 'transparent';
                }
            }
        }
    }

    async createTab(url = 'https://www.google.com') {
        const tab = new Tab(this.nextId++, url);
        this.tabs.push(tab);

        // Create tab UI
        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = tab.id;

        let displayName = 'New Tab';
        try {
            const urlObj = new URL(url);
            displayName = urlObj.hostname.replace('www.', '');
        } catch (e) {
            displayName = url.substring(0, 20);
        }

        const faviconUrl = this.getFaviconUrl(url);
        const faviconStyle = faviconUrl ? `background-image: url(${faviconUrl}); background-color: transparent;` : '';

        tabEl.innerHTML = `
            <span class="tab-icon" style="${faviconStyle}"></span>
            <span class="tab-title">${displayName}</span>
            <button class="tab-close">×</button>
        `;

        tabEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.activateTab(tab.id);
            }
        });

        tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tab.id);
        });

        this.tabsContainer.appendChild(tabEl);

        // Create native webview
        try {
            const label = await invoke('create_tab', { url });
            tab.webviewLabel = label;
            console.log(`Created tab: ${label}`);
        } catch (e) {
            console.error('Failed to create webview:', e);
            tabEl.querySelector('.tab-title').textContent = 'Error';
        }

        await this.activateTab(tab.id);

        if (this.urlBar) {
            this.urlBar.value = url;
        }

        const ntpContent = document.getElementById('ntp-content');
        if (ntpContent) {
            ntpContent.style.display = 'none';
        }

        return tab;
    }

    async activateTab(id) {
        // Update all tab UIs
        this.tabsContainer.querySelectorAll('.tab-item').forEach(t => {
            t.classList.remove('active');
        });

        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) {
            tabEl.classList.add('active');
        }

        // Show the webview
        const tab = this.tabs.find(t => t.id === id);
        if (tab?.webviewLabel) {
            try {
                await invoke('show_tab', { label: tab.webviewLabel });

                // Get current URL from the webview
                const currentUrl = await invoke('get_tab_url', { label: tab.webviewLabel });
                if (currentUrl) {
                    tab.url = currentUrl;
                    this.updateTabDisplay(tab);
                }
            } catch (e) {
                console.error('Failed to show tab:', e);
            }
        }

        if (tab && this.urlBar) {
            this.urlBar.value = tab.url;
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
        this.tabsContainer.querySelector(`[data-tab-id="${id}"]`)?.remove();

        if (this.activeTabId === id && this.tabs.length > 0) {
            const nextTab = this.tabs[Math.min(index, this.tabs.length - 1)];
            await this.activateTab(nextTab.id);
        }

        if (this.tabs.length === 0) {
            const ntpContent = document.getElementById('ntp-content');
            if (ntpContent) {
                ntpContent.style.display = 'flex';
            }
            if (this.urlBar) {
                this.urlBar.value = '';
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
    console.log('Casablanca Browser ready');
});

export { TabManager, Tab };
