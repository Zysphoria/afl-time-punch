import { contextBridge, app } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: app.getVersion(),
});
