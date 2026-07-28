import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { applyTheme, loadPreferences } from '../preferences.js';
import { element, formatTimestamp, renderEmpty } from './dom.js';

const list = document.getElementById('download-list');
const clearButton = document.getElementById('clear-downloads');
const openButton = document.getElementById('open-downloads');

applyTheme(loadPreferences());

function render(downloads) {
    if (!downloads.length) {
        renderEmpty(list, 'No downloads yet', 'Downloaded files will appear here.');
        return;
    }

    const items = downloads.map((download) => {
        const date = formatTimestamp(download.timestamp);
        const status = element('span', {
            className: `download-status ${download.status === 'failed' ? 'failed' : ''}`,
            text: download.status.replace('_', ' '),
        });
        return element('article', { className: 'item' }, [
            element('div', { className: 'item-icon', text: '↓' }),
            element('div', { className: 'item-content' }, [
                element('div', {
                    className: 'item-title',
                    text: download.file_name || 'Download',
                }),
                element('div', {
                    className: 'item-url',
                    text: download.path || download.url,
                }),
            ]),
            element('div', { className: 'item-actions' }, [
                element('time', {
                    className: 'item-meta',
                    text: date?.toLocaleString() ?? '',
                }),
                status,
            ]),
        ]);
    });
    list.replaceChildren(...items);
}

async function loadDownloads() {
    try {
        render(await invoke('get_downloads', { limit: 300 }));
    } catch (error) {
        console.error('Failed to load downloads:', error);
        renderEmpty(list, 'Downloads could not be loaded', 'The download data file may be unavailable.');
    }
}

openButton.addEventListener('click', () => invoke('open_downloads_folder'));
clearButton.addEventListener('click', async () => {
    if (!window.confirm('Clear the download list? Downloaded files will not be deleted.')) return;
    await invoke('clear_downloads');
    await loadDownloads();
});

listen('downloads-changed', loadDownloads);
loadDownloads();
