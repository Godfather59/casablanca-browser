export const SEARCH_ENGINES = Object.freeze({
    google: {
        label: 'Google',
        searchUrl: 'https://www.google.com/search?q=',
    },
    bing: {
        label: 'Bing',
        searchUrl: 'https://www.bing.com/search?q=',
    },
    duckduckgo: {
        label: 'DuckDuckGo',
        searchUrl: 'https://duckduckgo.com/?q=',
    },
    yahoo: {
        label: 'Yahoo',
        searchUrl: 'https://search.yahoo.com/search?p=',
    },
});

const EXPLICIT_BROWSER_SCHEMES = new Set(['http:', 'https:', 'file:', 'about:']);
const INTERNAL_PAGE_NAMES = new Map([
    ['bookmarks.html', 'Bookmarks'],
    ['downloads.html', 'Downloads'],
    ['history.html', 'History'],
    ['settings.html', 'Settings'],
]);
const INTERNAL_PROTOCOLS = new Set(['asset:', 'tauri:']);

export function buildSearchUrl(query, engine = 'google') {
    const selected = SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.google;
    return `${selected.searchUrl}${encodeURIComponent(query)}`;
}

function hasExplicitScheme(value) {
    return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function looksLikeLocalAddress(value) {
    return /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\])(?::\d+)?(?:[/?#].*)?$/.test(value);
}

function looksLikeWebHost(value) {
    return /^(?:www\.)?[^\s/:?#]+\.[^\s/:?#]+(?::\d+)?(?:[/?#].*)?$/.test(value);
}

export function normalizeUrl(input, engine = 'google', homepage = 'https://www.google.com') {
    const value = String(input ?? '').trim();
    if (!value) return homepage;

    if (looksLikeLocalAddress(value)) {
        return `http://${value}`;
    }

    if (looksLikeWebHost(value)) {
        return `https://${value}`;
    }

    if (hasExplicitScheme(value)) {
        try {
            const parsed = new URL(value);
            return EXPLICIT_BROWSER_SCHEMES.has(parsed.protocol)
                ? parsed.href
                : buildSearchUrl(value, engine);
        } catch {
            return buildSearchUrl(value, engine);
        }
    }

    return buildSearchUrl(value, engine);
}

export function isSecureUrl(url) {
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}

function getInternalPageName(parsed, appOrigin = globalThis.location?.origin) {
    const pageName = parsed.pathname.split('/').pop();
    if (!INTERNAL_PAGE_NAMES.has(pageName)) return null;
    if (INTERNAL_PROTOCOLS.has(parsed.protocol)) return INTERNAL_PAGE_NAMES.get(pageName);
    return appOrigin && parsed.origin === appOrigin
        ? INTERNAL_PAGE_NAMES.get(pageName)
        : null;
}

export function isInternalUrl(url, appOrigin = globalThis.location?.origin) {
    try {
        const parsed = new URL(url);
        return getInternalPageName(parsed, appOrigin) !== null;
    } catch {
        return false;
    }
}

export function getTabDisplayInfo(url, appOrigin = globalThis.location?.origin) {
    if (!url) return { displayName: 'New Tab', isLocal: true };

    try {
        const parsed = new URL(url);
        const pageName = parsed.pathname.split('/').pop();
        const internalPageName = getInternalPageName(parsed, appOrigin);

        if (internalPageName) {
            return {
                displayName: internalPageName,
                isLocal: true,
            };
        }

        if (parsed.protocol === 'file:') {
            return {
                displayName: decodeURIComponent(pageName || 'Local File'),
                isLocal: true,
            };
        }

        if (parsed.protocol === 'about:') {
            return { displayName: parsed.pathname || 'New Tab', isLocal: true };
        }

        return {
            displayName: parsed.hostname.replace(/^www\./, '') || 'New Tab',
            isLocal: false,
        };
    } catch {
        return {
            displayName: String(url).slice(0, 40) || 'New Tab',
            isLocal: true,
        };
    }
}

export function getFaviconUrl(url) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return new URL('/favicon.ico', parsed.origin).href;
    } catch {
        return null;
    }
}
