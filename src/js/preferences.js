import {
    MAX_BROWSER_URL_LENGTH,
    SEARCH_ENGINES,
} from './url.js';

export const PREFERENCES_KEY = 'casablanca_preferences_v1';
export const MAX_HOMEPAGE_LENGTH = MAX_BROWSER_URL_LENGTH;
export const DEFAULT_PREFERENCES = Object.freeze({
    searchEngine: 'google',
    theme: 'dark',
    homepage: 'https://www.google.com',
});

export function normalizeHomepage(value) {
    if (typeof value !== 'string' || value.length > MAX_HOMEPAGE_LENGTH) return null;
    try {
        const parsed = new URL(value);
        return (
            ['http:', 'https:'].includes(parsed.protocol)
            && parsed.href.length <= MAX_HOMEPAGE_LENGTH
        ) ? parsed.href : null;
    } catch {
        return null;
    }
}

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

    const homepage = normalizeHomepage(value.homepage) ?? DEFAULT_PREFERENCES.homepage;

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
