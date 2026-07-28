import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_PREFERENCES,
    loadPreferences,
    PREFERENCES_KEY,
    resolveTheme,
    sanitizePreferences,
    savePreferences,
} from '../src/js/preferences.js';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.get(key) ?? null;
    }

    setItem(key, value) {
        this.values.set(key, value);
    }
}

test('returns defaults when preferences are missing or malformed', () => {
    const storage = new MemoryStorage();
    assert.deepEqual(loadPreferences(storage), DEFAULT_PREFERENCES);

    storage.setItem(PREFERENCES_KEY, '{broken');
    assert.deepEqual(loadPreferences(storage), DEFAULT_PREFERENCES);
});

test('sanitizes invalid values and unsafe homepage schemes', () => {
    assert.deepEqual(
        sanitizePreferences({
            searchEngine: 'unknown',
            theme: 'neon',
            homepage: 'javascript:alert(1)',
        }),
        DEFAULT_PREFERENCES,
    );
});

test('persists valid preferences', () => {
    const storage = new MemoryStorage();
    const saved = savePreferences({
        searchEngine: 'duckduckgo',
        theme: 'light',
        homepage: 'https://example.com/start',
    }, storage);

    assert.deepEqual(loadPreferences(storage), saved);
    assert.equal(saved.homepage, 'https://example.com/start');
});

test('resolves the system theme', () => {
    assert.equal(resolveTheme('system', { matches: true }), 'dark');
    assert.equal(resolveTheme('system', { matches: false }), 'light');
    assert.equal(resolveTheme('light', { matches: true }), 'light');
});
