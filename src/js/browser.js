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
        this.closedTabs = [];

        this.tabsContainer = document.getElementById('tabs-inner');
        // this.urlBar is no longer single global element
        this.menuDropdown = document.getElementById('menu-dropdown');

        // Window controls
        this.minimizeBtn = document.querySelector('.title-bar-minimize');
        this.maximizeBtn = document.querySelector('.title-bar-maximize');
        this.closeBtn = document.querySelector('.title-bar-close');

        this.initEventListeners();
        this.setupUrlListener();

        // Restore session
        this.restoreSession();
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
            this.showAppMenu();
        });

        // Listen for native menu events
        listen('menu-event', (event) => {
            const action = event.payload;
            this.handleMenuAction(action);
        });

        // Bookmarks button
        document.getElementById('bookmarks-btn')?.addEventListener('click', () => this.showBookmarks());

        // Window controls
        this.minimizeBtn?.addEventListener('click', () => this.minimizeWindow());
        this.maximizeBtn?.addEventListener('click', () => this.maximizeWindow());
        this.closeBtn?.addEventListener('click', () => this.closeWindow());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // General Shortcuts
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.createTab();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                this.restoreClosedTab();
            }
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                if (this.activeTabId) {
                    this.closeTab(this.activeTabId);
                }
            }
            // Tab Switching
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.switchTab(-1);
                } else {
                    this.switchTab(1);
                }
            }
            // Address Bar Focus
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${this.activeTabId}"]`);
                if (tabEl) {
                    const input = tabEl.querySelector('.tab-url-input');
                    this.activateTabEditMode(tabEl, input);
                }
            }
            // Features
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                this.showHistory();
            }
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.showBookmarks();
            }
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                this.bookmarkCurrentTab();
            }
            if (e.ctrlKey && e.key === 'j') {
                e.preventDefault();
                this.showDownloads();
            }
            // Open Downloads Folder (Quick Access)
            if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                e.preventDefault();
                invoke('open_downloads_folder');
            }

            // Navigation
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
                const activeTabEl = this.tabsContainer.querySelector('.tab.editing');
                if (activeTabEl) {
                    activeTabEl.classList.remove('editing');
                    const input = activeTabEl.querySelector('.tab-url-input');
                    const tab = this.getActiveTab();
                    if (input && tab) input.value = tab.url;
                }
            }
        });

        // Tab Drag and Drop Container Listeners
        this.tabsContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingTab = document.querySelector('.tab.dragging');
            if (!draggingTab) return;

            const afterElement = this.getDragAfterElement(this.tabsContainer, e.clientX);

            // Should not drop after the "new tab" button
            const addBtn = document.getElementById('add-tab-button');
            if (afterElement === addBtn) {
                this.tabsContainer.insertBefore(draggingTab, addBtn);
            } else if (afterElement == null) {
                // If null, it means append to end. But end is the button.
                if (addBtn) this.tabsContainer.insertBefore(draggingTab, addBtn);
                else this.tabsContainer.appendChild(draggingTab);
            } else {
                this.tabsContainer.insertBefore(draggingTab, afterElement);
            }
        });

        this.tabsContainer.addEventListener('drop', (e) => {
            // Reorder this.tabs array based on DOM order
            // Filter out the add button from calculation
            const newOrderIds = Array.from(this.tabsContainer.querySelectorAll('.tab')).map(el => parseInt(el.dataset.tabId));
            this.tabs.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
            this.saveSession();
        });
    }

    getDragAfterElement(container, x) {
        // Exclude the add button from draggable elements consideration
        const draggableElements = [...container.querySelectorAll('.tab:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // Use center of box for calculation
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    showToast(message, duration = 3000) {
        let toast = document.getElementById('browser-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'browser-toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('visible');

        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('visible');
        }, duration);
    }

    getTabDisplayInfo(url) {
        let displayName = 'New Tab';
        let isLocal = false;

        try {
            if (!url) return { displayName, isLocal };

            const urlObj = new URL(url);
            if (url.startsWith('file://')) {
                const parts = url.split('/');
                displayName = parts[parts.length - 1] || 'Local File';
                isLocal = true;
            } else if (url.includes('pages/')) {
                displayName = url.split('pages/')[1].split('.')[0].replace(/^\w/, c => c.toUpperCase());
                isLocal = true;
            } else {
                displayName = urlObj.hostname.replace('www.', '');
            }
        } catch (e) {
            displayName = url.substring(0, 20);
        }

        return { displayName, isLocal };
    }

    saveSession() {
        const activeIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
        const sessionData = {
            tabs: this.tabs.map(t => ({ url: t.url })),
            activeIndex: activeIndex
        };
        localStorage.setItem('nova_session_v2', JSON.stringify(sessionData));
    }

    restoreSession() {
        try {
            const saved = localStorage.getItem('nova_session_v2');
            if (saved) {
                const sessionData = JSON.parse(saved);
                if (sessionData && Array.isArray(sessionData.tabs) && sessionData.tabs.length > 0) {
                    let first = true;
                    // Create all tabs without activating them (except the first one initially maybe)
                    // We'll activate the correct one at the end
                    for (const t of sessionData.tabs) {
                        this.createTab(t.url, false);
                    }

                    // Restore active tab
                    if (sessionData.activeIndex >= 0 && sessionData.activeIndex < this.tabs.length) {
                        const tabToActivate = this.tabs[sessionData.activeIndex];
                        this.activateTab(tabToActivate.id);
                    } else if (this.tabs.length > 0) {
                        this.activateTab(this.tabs[0].id);
                    }
                } else {
                    this.createTab();
                }
            } else {
                // Try legacy check (optional, or just default)
                this.createTab();
            }
        } catch (e) {
            console.error('Failed to restore session:', e);
            this.createTab();
        }
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
                this.saveSession();
            }
        });
    }

    // Menu
    async showAppMenu() {
        try {
            await invoke('show_app_menu');
        } catch (e) {
            console.error('Failed to show app menu:', e);
            this.showToast('Failed to open menu');
        }
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
            case 'open-downloads-folder':
                invoke('open_downloads_folder');
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
    async minimizeWindow() { try { await invoke('minimize_window'); } catch (e) { console.error(e); } }
    async maximizeWindow() { try { await invoke('maximize_window'); } catch (e) { console.error(e); } }
    async closeWindow() { try { await invoke('close_window'); } catch (e) { console.error(e); } }

    // Navigation
    async goBack() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try { await invoke('go_back', { label: tab.webviewLabel }); } catch (e) { this.showToast("Cannot go back"); }
        }
    }

    async goForward() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            try { await invoke('go_forward', { label: tab.webviewLabel }); } catch (e) { this.showToast("Cannot go forward"); }
        }
    }

    async reload() {
        const tab = this.getActiveTab();
        if (tab?.webviewLabel) {
            // Show loading state
            const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${tab.id}"]`);
            if (tabEl) {
                const icon = tabEl.querySelector('.tab-favicon');
                if (icon) icon.classList.add('loading');
            }

            try {
                await invoke('reload_tab', { label: tab.webviewLabel });
                // Note: We don't have a 'load-finish' event yet to remove spinner, 
                // but usually URL change or navigation clears it. 
                // Ideally, we'd add 'tab-loading' event listener.
                // For now, remove it after a timeout or on next URL chagne.
                setTimeout(() => {
                    const icon = tabEl?.querySelector('.tab-favicon');
                    if (icon) icon.classList.remove('loading');
                }, 2000);
            } catch (e) {
                this.showToast("Reload failed");
                const icon = tabEl?.querySelector('.tab-favicon');
                if (icon) icon.classList.remove('loading');
            }
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
            // Show loading
            const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${activeTab.id}"]`);
            if (tabEl) {
                const icon = tabEl.querySelector('.tab-favicon');
                if (icon) icon.classList.add('loading');
            }

            try {
                await invoke('navigate_tab', { label: activeTab.webviewLabel, url });
                activeTab.url = url;
                this.updateTabDisplay(activeTab);
                this.saveSession();
            } catch (e) {
                console.error('Navigate failed:', e);
                this.showToast("Navigation failed: " + e);
                const icon = tabEl?.querySelector('.tab-favicon');
                if (icon) icon.classList.remove('loading');
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
            // Stop loading spinner if URL changed (implies load started/advanced)
            const iconEl = tabEl.querySelector('.tab-favicon');
            if (iconEl) iconEl.classList.remove('loading');

            const { displayName, isLocal } = this.getTabDisplayInfo(tab.url);

            tab.title = displayName;

            const titleEl = tabEl.querySelector('.tab-title');
            if (titleEl) titleEl.textContent = displayName;

            const inputEl = tabEl.querySelector('.tab-url-input');
            if (inputEl && !tabEl.classList.contains('editing')) {
                inputEl.value = tab.url;
            }

            if (iconEl) {
                const faviconUrl = this.getFaviconUrl(tab.url);
                if (faviconUrl && !isLocal) {
                    iconEl.style.backgroundImage = `url(${faviconUrl})`;
                } else {
                    iconEl.style.backgroundImage = ''; // Reset or default
                }
            }
        }
    }

    async createTab(url = 'https://www.google.com', activate = true) {
        const tab = new Tab(this.nextId++, url);
        this.tabs.push(tab);

        // Create HTML using new NOVA properties
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.draggable = true; // Enable dragging
        tabEl.dataset.tabId = tab.id;
        tabEl.dataset.url = url;

        const { displayName, isLocal } = this.getTabDisplayInfo(url);

        tab.title = displayName;
        const faviconUrl = this.getFaviconUrl(url);
        const faviconStyle = (faviconUrl && !isLocal) ? `background-image: url(${faviconUrl})` : '';

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

        // Tab Drag Events
        tabEl.addEventListener('dragstart', () => {
            tabEl.classList.add('dragging');
        });

        tabEl.addEventListener('dragend', () => {
            tabEl.classList.remove('dragging');
        });

        // Tab Click & Edit Logic
        const urlInput = tabEl.querySelector('.tab-url-input');

        // Middle Click Close
        tabEl.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle click
                e.preventDefault();
                this.closeTab(tab.id);
            }
        });

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

        const addBtn = document.getElementById('add-tab-button');
        if (addBtn) {
            this.tabsContainer.insertBefore(tabEl, addBtn);
        } else {
            this.tabsContainer.appendChild(tabEl);
        }

        // Show immediately in DOM, then load webview
        if (activate) {
            await this.activateTab(tab.id);
        }
        this.saveSession();

        try {
            const label = await invoke('create_tab', { url });
            tab.webviewLabel = label;
        } catch (e) {
            console.error('Failed to create webview:', e);
            this.showToast('Failed to create tab content');
        }

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

        // Add to closed tabs stack for restore
        if (tab.url !== 'about:blank' && !tab.url.startsWith('file://')) { // Filter logic as needed
            this.closedTabs.push({ url: tab.url, title: tab.title });
        }

        this.tabs.splice(index, 1);
        const tabEl = this.tabsContainer.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) {
            // Animate removal
            tabEl.style.transform = 'scale(0.9)';
            tabEl.style.opacity = '0';
            setTimeout(() => tabEl.remove(), 150);
        }

        this.saveSession();

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

    // New Features Logic

    async bookmarkCurrentTab() {
        const tab = this.getActiveTab();
        if (!tab) return;
        try {
            await invoke('add_bookmark', { url: tab.url, title: tab.title || tab.url });
            this.showToast('Bookmarked!');
        } catch (e) {
            this.showToast('Failed to bookmark');
        }
    }

    restoreClosedTab() {
        if (this.closedTabs.length > 0) {
            const lastTab = this.closedTabs.pop();
            this.createTab(lastTab.url, true);
        } else {
            this.showToast('No recently closed tabs');
        }
    }

    switchTab(direction) {
        if (this.tabs.length <= 1) return;

        const currentIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
        if (currentIndex === -1) return;

        let newIndex = currentIndex + direction;
        // Wrap around
        if (newIndex < 0) newIndex = this.tabs.length - 1;
        if (newIndex >= this.tabs.length) newIndex = 0;

        const nextTab = this.tabs[newIndex];
        this.activateTab(nextTab.id);
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.tabManager = new TabManager();
});

export { TabManager, Tab };
