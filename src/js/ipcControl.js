// IPC Shim
export const ipcRenderer = {
    send: (channel, ...args) => {
        // console.log(`[IPC] Send: ${channel}`, args);
    },
    on: (channel, func) => {
        // console.log(`[IPC] Listen on: ${channel}`);
    }
};
window.ipcRenderer = ipcRenderer;
