"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    // File system
    listNotes: () => electron_1.ipcRenderer.invoke('fs:list-notes'),
    readNote: (filePath) => electron_1.ipcRenderer.invoke('fs:read-note', filePath),
    writeNote: (filePath, content) => electron_1.ipcRenderer.invoke('fs:write-note', filePath, content),
    deleteNote: (filePath) => electron_1.ipcRenderer.invoke('fs:delete-note', filePath),
    renameNote: (oldPath, newPath) => electron_1.ipcRenderer.invoke('fs:rename-note', oldPath, newPath),
    getNotesDir: () => electron_1.ipcRenderer.invoke('fs:notes-dir'),
    openNotesFolder: () => electron_1.ipcRenderer.invoke('app:open-notes-folder'),
    chooseNotesDir: () => electron_1.ipcRenderer.invoke('app:choose-notes-dir'),
    // Window controls
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
    // Events from main → renderer
    onNewNote: (cb) => {
        electron_1.ipcRenderer.on('new-note', cb);
        return () => electron_1.ipcRenderer.removeListener('new-note', cb);
    },
};
electron_1.contextBridge.exposeInMainWorld('noteflow', api);
