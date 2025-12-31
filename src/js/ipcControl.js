// Shim Electron IPC with Tauri
// This allows legacy code using "ipc.send" to mostly work

window.electron = {
    ipcRenderer: {
        send: (channel, data) => {
            // console.log('IPC SEND:', channel, data);
            window.__TAURI__.core.invoke('ipc_message', { channel, data });
        },
        on: (channel, listener) => {
            // console.log('IPC LISTEN:', channel);
            // Tauri events need unique names or a bridge. 
            // For now, simple console log to prove it's called.
            window.addEventListener('tauri://' + channel, (e) => {
                listener(e, e.detail);
            });
        },
        invoke: (channel, data) => {
            return window.__TAURI__.core.invoke(channel, data);
        }
    }
};

window.ipc = window.electron.ipcRenderer;
window.process = { platform: 'win32', argv: [] }; // Mock process
