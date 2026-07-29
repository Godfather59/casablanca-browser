import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
    addEventListener() {},
    crypto: globalThis.crypto,
};

const { clearMocks, mockIPC } = await import('@tauri-apps/api/mocks');
const { TabManager } = await import('../src/js/browser.js');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function makeManager(tabCount = 2) {
    const manager = Object.create(TabManager.prototype);
    manager.tabs = Array.from({ length: tabCount }, (_, index) => ({
        id: index + 1,
        url: `https://example.com/${index + 1}`,
        title: `Tab ${index + 1}`,
        webviewLabel: `tab-${index + 1}`,
    }));
    manager.activeTabId = 1;
    manager.closedTabs = [];
    manager.closingTabIds = new Set();
    manager.pendingTabEvents = new Map();
    manager.preferences = { homepage: 'https://example.com' };
    manager.activationCalls = [];
    manager.toasts = [];
    manager.getTabElement = () => ({
        classList: { add() {} },
        remove() {},
    });
    manager.activateTab = async (id) => {
        manager.activationCalls.push(id);
        manager.activeTabId = id;
    };
    manager.createTab = async () => {};
    manager.saveSession = () => {};
    manager.showToast = (message) => manager.toasts.push(message);
    return manager;
}

test('ignores a duplicate close while the native close is pending', async (context) => {
    context.after(clearMocks);
    const closeGate = deferred();
    let nativeCloseCalls = 0;
    mockIPC((command) => {
        if (command === 'close_tab') {
            nativeCloseCalls += 1;
            return closeGate.promise;
        }
        return null;
    });
    const manager = makeManager();

    const firstClose = manager.closeTab(1);
    const duplicateClose = manager.closeTab(1);
    assert.equal(nativeCloseCalls, 1);

    closeGate.resolve();
    await Promise.all([firstClose, duplicateClose]);

    assert.deepEqual(manager.tabs.map((tab) => tab.id), [2]);
    assert.deepEqual(manager.activationCalls, [2]);
});

test('does not override a newer tab selection when close completes', async (context) => {
    context.after(clearMocks);
    const closeGate = deferred();
    mockIPC((command) => command === 'close_tab' ? closeGate.promise : null);
    const manager = makeManager(3);

    const closing = manager.closeTab(1);
    manager.activeTabId = 3;
    closeGate.resolve();
    await closing;

    assert.deepEqual(manager.tabs.map((tab) => tab.id), [2, 3]);
    assert.equal(manager.activeTabId, 3);
    assert.deepEqual(manager.activationCalls, []);
});

test('keeps the tab when the native webview cannot be closed', async (context) => {
    context.after(clearMocks);
    context.mock.method(console, 'error', () => {});
    mockIPC((command) => {
        if (command === 'close_tab') throw new Error('native close failed');
        return null;
    });
    const manager = makeManager();

    await manager.closeTab(1);

    assert.deepEqual(manager.tabs.map((tab) => tab.id), [1, 2]);
    assert.equal(manager.activeTabId, 1);
    assert.deepEqual(manager.toasts, ['Failed to close tab']);
    assert.equal(manager.closingTabIds.size, 0);
});
