import { SEARCH_ENGINES } from './url.js';

export const PREFERENCES_KEY = 'casablanca_preferences_v1';
export const DEFAULT_PREFERENCES = Object.freeze({
    searchEngine: 'google',
    theme: 'dark',
    homepage: 'https://www.google.com',
});

function getStorage(storage) {
    if (storage) return storage;
    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

export function sanitizePreferences(value = {}) {
    const searchEngine = Object.hasOwn(SEARCH_ENGINES, value.searchEngine)
        ? value.searchEngine
        : DEFAULT_PREFERENCES.searchEngine;
    const theme = ['dark', 'light', 'system'].includes(value.theme)
        ? value.theme
        : DEFAULT_PREFERENCES.theme;

    let homepage = DEFAULT_PREFERENCES.homepage;
    if (typeof value.homepage === 'string') {
        try {
            const parsed = new URL(value.homepage);
            if (['http:', 'https:'].includes(parsed.protocol)) {
                homepage = parsed.href;
            }
        } catch {
            // Keep the safe default.
        }
    }

    return { searchEngine, theme, homepage };
}

export function loadPreferences(storage) {
    const target = getStorage(storage);
    if (!target) return { ...DEFAULT_PREFERENCES };

    try {
        const saved = JSON.parse(target.getItem(PREFERENCES_KEY) ?? '{}');
        return sanitizePreferences(saved);
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
}

export function savePreferences(preferences, storage) {
    const target = getStorage(storage);
    const sanitized = sanitizePreferences(preferences);
    target?.setItem(PREFERENCES_KEY, JSON.stringify(sanitized));
    return sanitized;
}

export function resolveTheme(theme, media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')) {
    if (theme !== 'system') return theme;
    return media?.matches ? 'dark' : 'light';
}

export function applyTheme(preferences, root = globalThis.document?.documentElement) {
    const theme = resolveTheme(preferences.theme);
    if (root) root.dataset.theme = theme;
    return theme;
}
