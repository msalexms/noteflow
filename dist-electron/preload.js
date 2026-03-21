"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    // Identification
    windowId: () => electron_1.ipcRenderer.sendSync('window:get-id'),
    // File system
    listNotes: () => electron_1.ipcRenderer.invoke('fs:list-notes'),
    readNote: (filePath) => electron_1.ipcRenderer.invoke('fs:read-note', filePath),
    readAllNotes: () => electron_1.ipcRenderer.invoke('fs:read-all-notes'),
    writeNote: (filePath, content) => electron_1.ipcRenderer.invoke('fs:write-note', filePath, content),
    deleteNote: (filePath) => electron_1.ipcRenderer.invoke('fs:delete-note', filePath),
    renameNote: (oldPath, newPath) => electron_1.ipcRenderer.invoke('fs:rename-note', oldPath, newPath),
    getNotesDir: () => electron_1.ipcRenderer.invoke('fs:notes-dir'),
    openNotesFolder: () => electron_1.ipcRenderer.invoke('app:open-notes-folder'),
    chooseNotesDir: () => electron_1.ipcRenderer.invoke('app:choose-notes-dir'),
    // Settings
    getTheme: () => electron_1.ipcRenderer.sendSync('settings:get-theme'),
    setTheme: (id) => electron_1.ipcRenderer.send('settings:set-theme', id),
    // Window controls
    openSticky: (noteId, sectionId) => electron_1.ipcRenderer.send('window:open-sticky', noteId, sectionId),
    minimize: () => electron_1.ipcRenderer.send('window:minimize'),
    maximize: () => electron_1.ipcRenderer.send('window:maximize'),
    close: () => electron_1.ipcRenderer.send('window:close'),
    // Updates
    checkUpdate: () => electron_1.ipcRenderer.invoke('app:check-update'),
    openUrl: (url) => electron_1.ipcRenderer.invoke('app:open-url', url),
    // Export / Import
    exportNotes: (entries) => electron_1.ipcRenderer.invoke('notes:export', entries),
    parseImportFile: () => electron_1.ipcRenderer.invoke('notes:parse-import-file'),
    writeImportedNotes: (entries) => electron_1.ipcRenderer.invoke('notes:write-imported', entries),
    // Events from main → renderer
    onNewNote: (cb) => {
        electron_1.ipcRenderer.on('new-note', cb);
        return () => electron_1.ipcRenderer.removeListener('new-note', cb);
    },
    onNotesUpdated: (cb) => {
        const wrapper = (_event, path, senderId) => cb(path, senderId);
        electron_1.ipcRenderer.on('notes-updated', wrapper);
        return () => electron_1.ipcRenderer.removeListener('notes-updated', wrapper);
    },
};
electron_1.contextBridge.exposeInMainWorld('noteflow', api);
