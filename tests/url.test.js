import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSearchUrl,
    getFaviconUrl,
    getTabDisplayInfo,
    isBookmarkableUrl,
    isInternalUrl,
    isSecureUrl,
    isWebUrl,
    normalizeUrl,
} from '../src/js/url.js';

test('normalizes public domains to HTTPS', () => {
    assert.equal(normalizeUrl('example.com/docs'), 'https://example.com/docs');
    assert.equal(normalizeUrl('https://example.com/a'), 'https://example.com/a');
});

test('normalizes local addresses to HTTP', () => {
    assert.equal(normalizeUrl('localhost:5173'), 'http://localhost:5173');
    assert.equal(normalizeUrl('192.168.1.10:8443/app'), 'http://192.168.1.10:8443/app');
});

test('searches malformed hosts instead of sending invalid navigation requests', () => {
    assert.equal(
        normalizeUrl('999.999.999.999', 'duckduckgo'),
        'https://duckduckgo.com/?q=999.999.999.999',
    );
    assert.equal(
        normalizeUrl('localhost:99999', 'bing'),
        'https://www.bing.com/search?q=localhost%3A99999',
    );
});

test('uses the selected search engine for text and unsupported schemes', () => {
    assert.equal(
        normalizeUrl('casablanca browser', 'duckduckgo'),
        'https://duckduckgo.com/?q=casablanca%20browser',
    );
    assert.equal(
        normalizeUrl('javascript:alert(1)', 'bing'),
        'https://www.bing.com/search?q=javascript%3Aalert(1)',
    );
});

test('uses the homepage for empty input', () => {
    assert.equal(
        normalizeUrl('  ', 'google', 'https://example.org/home'),
        'https://example.org/home',
    );
});

test('builds encoded search URLs', () => {
    assert.equal(
        buildSearchUrl('a+b c', 'yahoo'),
        'https://search.yahoo.com/search?p=a%2Bb%20c',
    );
});

test('derives safe display information and direct favicons', () => {
    assert.deepEqual(
        getTabDisplayInfo('https://www.example.com/path'),
        { displayName: 'example.com', isLocal: false },
    );
    assert.deepEqual(
        getTabDisplayInfo('tauri://localhost/pages/history.html'),
        { displayName: 'History', isLocal: true },
    );
    assert.equal(getFaviconUrl('https://example.com/path'), 'https://example.com/favicon.ico');
    assert.equal(isSecureUrl('https://example.com'), true);
    assert.equal(isSecureUrl('http://example.com'), false);
    assert.equal(isWebUrl('https://example.com'), true);
    assert.equal(isWebUrl('file:///tmp/example.html'), false);
    assert.equal(isBookmarkableUrl('file:///tmp/example.html'), true);
    assert.equal(isBookmarkableUrl('data:text/html,hello'), false);
    assert.equal(isInternalUrl('tauri://localhost/pages/settings.html'), true);
    assert.equal(isInternalUrl('https://example.com/pages/settings.html'), false);
    assert.deepEqual(
        getTabDisplayInfo('https://example.com/pages/settings.html'),
        { displayName: 'example.com', isLocal: false },
    );
});
