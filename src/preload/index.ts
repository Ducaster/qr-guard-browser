import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS, type ShellInfo } from "../core/shell-config";

const qrGuardApi = {
  getShellInfo: (): Promise<ShellInfo> => ipcRenderer.invoke(IPC_CHANNELS.getShellInfo)
} as const;

contextBridge.exposeInMainWorld("qrGuard", qrGuardApi);

export type QrGuardApi = typeof qrGuardApi;
