import { invoke } from '@tauri-apps/api/core';
import { applyTheme, loadPreferences } from '../preferences.js';
import { isWebUrl } from '../url.js';
import {
    element,
    favicon,
    formatTimestamp,
    renderEmpty,
    showPageStatus,
} from './dom.js';

const list = document.getElementById('history-list');
const search = document.getElementById('history-search');
const clearButton = document.getElementById('clear-history');
let entries = [];

applyTheme(loadPreferences());

function render() {
    const query = search.value.trim().toLowerCase();
    const filtered = entries.filter((entry) => (
        entry.title.toLowerCase().includes(query)
        || entry.url.toLowerCase().includes(query)
    ));

    if (!filtered.length) {
        renderEmpty(
            list,
            query ? 'No matching history' : 'No browsing history',
            query ? 'Try a different search.' : 'Visited pages will appear here.',
        );
        return;
    }

    const nodes = [];
    let currentDate = '';
    for (const entry of filtered) {
        const date = formatTimestamp(entry.timestamp);
        const dateLabel = date?.toLocaleDateString() ?? 'Unknown date';
        if (dateLabel !== currentDate) {
            currentDate = dateLabel;
            const today = new Date().toLocaleDateString();
            nodes.push(element('div', {
                className: 'date-header',
                text: dateLabel === today ? 'Today' : dateLabel,
            }));
        }

        const item = element('article', {
            className: 'item',
            attributes: { tabindex: '0' },
        }, [
            favicon(entry.url),
            element('div', { className: 'item-content' }, [
                element('div', { className: 'item-title', text: entry.title || entry.url }),
                element('div', { className: 'item-url', text: entry.url }),
            ]),
            element('time', {
                className: 'item-meta',
                text: date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '',
            }),
        ]);

        const open = () => {
            if (!isWebUrl(entry.url)) {
                showPageStatus('This history entry has an unsupported URL.', { error: true });
                return;
            }
            window.location.assign(entry.url);
        };
        item.addEventListener('click', open);
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') open();
        });
        nodes.push(item);
    }
    list.replaceChildren(...nodes);
}

async function loadHistory() {
    try {
        entries = await invoke('get_history', { limit: 500 });
        render();
    } catch (error) {
        console.error('Failed to load history:', error);
        renderEmpty(list, 'History could not be loaded', 'The history data file may be unavailable.');
    }
}

search.addEventListener('input', render);
clearButton.addEventListener('click', async () => {
    if (!window.confirm('Clear all browsing history?')) return;
    clearButton.disabled = true;
    try {
        await invoke('clear_history');
        entries = [];
        render();
        showPageStatus('Browsing history cleared.');
    } catch (error) {
        console.error('Failed to clear history:', error);
        showPageStatus('Browsing history could not be cleared.', { error: true });
    } finally {
        clearButton.disabled = false;
    }
});

loadHistory();
