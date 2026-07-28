import { getFaviconUrl } from '../url.js';

export function element(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = String(options.text);
    for (const [name, value] of Object.entries(options.attributes ?? {})) {
        node.setAttribute(name, String(value));
    }
    node.append(...children.filter(Boolean));
    return node;
}

export function favicon(url) {
    let hostname = '';
    try {
        hostname = new URL(url).hostname;
    } catch {
        // The fallback remains a generic initial.
    }

    const wrapper = element('div', {
        className: 'item-icon',
        text: hostname.charAt(0).toUpperCase() || 'C',
    });
    const source = getFaviconUrl(url);
    if (!source) return wrapper;

    const image = element('img', {
        attributes: {
            src: source,
            alt: '',
            loading: 'lazy',
        },
    });
    image.addEventListener('load', () => {
        wrapper.textContent = '';
        wrapper.appendChild(image);
    });
    return wrapper;
}

export function formatTimestamp(timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    return Number.isNaN(date.valueOf()) ? null : date;
}

export function renderEmpty(container, title, hint) {
    const copy = element('div', {}, [
        element('strong', { text: title }),
        element('span', { text: hint }),
    ]);
    container.replaceChildren(element('div', { className: 'empty' }, [copy]));
}
