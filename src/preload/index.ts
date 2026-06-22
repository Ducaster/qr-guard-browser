import { contextBridge } from "electron";

const qrGuardApi = {} as const;

contextBridge.exposeInMainWorld("qrGuard", qrGuardApi);

export type QrGuardApi = typeof qrGuardApi;
