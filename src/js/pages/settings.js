import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import {
    applyTheme,
    loadPreferences,
    savePreferences,
} from '../preferences.js';

const searchEngine = document.getElementById('search-engine');
const homepage = document.getElementById('homepage');
const theme = document.getElementById('theme');
const clearButton = document.getElementById('clear-data');
const status = document.getElementById('settings-status');
const version = document.getElementById('app-version');

let preferences = loadPreferences();

function render() {
    searchEngine.value = preferences.searchEngine;
    homepage.value = preferences.homepage;
    theme.value = preferences.theme;
    applyTheme(preferences);
}

async function persist(changes) {
    preferences = savePreferences({ ...preferences, ...changes });
    render();
    await emit('preferences-changed', preferences);
    status.textContent = 'Settings saved.';
}

searchEngine.addEventListener('change', () => {
    persist({ searchEngine: searchEngine.value });
});
theme.addEventListener('change', () => {
    persist({ theme: theme.value });
});
homepage.addEventListener('change', () => {
    const previousHomepage = preferences.homepage;
    persist({ homepage: homepage.value });
    if (preferences.homepage === previousHomepage && homepage.value !== previousHomepage) {
        status.textContent = 'Enter a complete HTTP or HTTPS URL.';
    }
});

clearButton.addEventListener('click', async () => {
    if (!window.confirm('Clear history, downloads, cookies, cache, and site storage? You will be signed out of websites.')) {
        return;
    }

    clearButton.disabled = true;
    status.textContent = 'Clearing browsing data…';
    try {
        await invoke('clear_browsing_data');
        preferences = savePreferences(preferences);
        applyTheme(preferences);
        status.textContent = 'Browsing data cleared. Bookmarks were preserved.';
    } catch (error) {
        console.error('Failed to clear browsing data:', error);
        status.textContent = 'Browsing data could not be completely cleared.';
    } finally {
        clearButton.disabled = false;
    }
});

version.textContent = __APP_VERSION__;
render();
