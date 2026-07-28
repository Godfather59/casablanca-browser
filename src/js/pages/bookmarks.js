import { invoke } from '@tauri-apps/api/core';
import { applyTheme, loadPreferences } from '../preferences.js';
import { element, favicon, renderEmpty } from './dom.js';

const list = document.getElementById('bookmark-list');
const search = document.getElementById('bookmark-search');
let bookmarks = [];

applyTheme(loadPreferences());

function render() {
    const query = search.value.trim().toLowerCase();
    const filtered = bookmarks.filter((bookmark) => (
        bookmark.title.toLowerCase().includes(query)
        || bookmark.url.toLowerCase().includes(query)
    ));

    if (!filtered.length) {
        renderEmpty(
            list,
            query ? 'No matching bookmarks' : 'No bookmarks yet',
            query ? 'Try a different search.' : 'Press Ctrl+D on a website to add one.',
        );
        return;
    }

    const cards = filtered.map((bookmark) => {
        const deleteButton = element('button', {
            className: 'icon-button danger',
            text: '×',
            attributes: {
                type: 'button',
                'aria-label': `Delete ${bookmark.title}`,
                title: 'Delete bookmark',
            },
        });
        deleteButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            await invoke('delete_bookmark', { id: bookmark.id });
            bookmarks = bookmarks.filter((candidate) => candidate.id !== bookmark.id);
            render();
        });

        const card = element('article', {
            className: 'item',
            attributes: { tabindex: '0' },
        }, [
            favicon(bookmark.url),
            element('div', { className: 'item-content' }, [
                element('div', { className: 'item-title', text: bookmark.title || bookmark.url }),
                element('div', { className: 'item-url', text: bookmark.url }),
            ]),
            element('div', { className: 'item-actions' }, [deleteButton]),
        ]);

        const open = () => { window.location.href = bookmark.url; };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') open();
        });
        return card;
    });

    list.replaceChildren(...cards);
}

async function loadBookmarks() {
    try {
        bookmarks = await invoke('get_bookmarks');
        render();
    } catch (error) {
        console.error('Failed to load bookmarks:', error);
        renderEmpty(list, 'Bookmarks could not be loaded', 'The bookmarks data file may be unavailable.');
    }
}

search.addEventListener('input', render);
loadBookmarks();
