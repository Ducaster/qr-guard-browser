import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { IPC_CHANNELS, type ShellInfo } from "../core/shell-config";
import type { StateSnapshot, UnlockResponse } from "../core/state-machine";
import type { SettingsSafeView } from "../core/settings-validation";

export interface SetupUserPayload {
  readonly code: string;
  readonly userId: string;
}

export interface LoginDetectionPayload {
  readonly loggedInUrlPattern: string;
  readonly loginUrlPattern: string;
  readonly titleContains: string;
}

export interface FirstRunSetupPayload {
  readonly adminCode: string;
  readonly idleAutoLockSeconds?: number;
  readonly loginDetection?: LoginDetectionPayload;
  readonly qrUrl: string;
  readonly unlockDurationSeconds?: number;
  readonly users: readonly SetupUserPayload[];
}

export interface SettingsPatchPayload {
  readonly idleAutoLockSeconds?: number;
  readonly loginDetection?: LoginDetectionPayload;
  readonly qrUrl?: string;
  readonly unlockDurationSeconds?: number;
}

export interface UpdateUserPayload {
  readonly nextUserId: string;
  readonly userId: string;
}

export interface ActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

export type StateChangeCallback = (state: StateSnapshot) => void;

export type FirstRunResponse =
  | { readonly isFirstRun: boolean; readonly ok: true }
  | { readonly errors: readonly string[]; readonly ok: false };

export type SettingsViewResponse =
  | { readonly ok: true; readonly settings: SettingsSafeView }
  | { readonly errors: readonly string[]; readonly ok: false };

const qrGuardApi = {
  addUser: (payload: SetupUserPayload): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.addUser, payload),
  clearQrSession: (adminCode: string): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.clearQrSession, adminCode),
  closeSettings: (): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.closeSettings),
  completeFirstRunSetup: (payload: FirstRunSetupPayload): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.completeFirstRunSetup, payload),
  deleteUser: (payload: Pick<SetupUserPayload, "userId">): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteUser, payload),
  getSettingsView: (): Promise<SettingsViewResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.getSettingsView),
  getState: (): Promise<StateSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.getState),
  getShellInfo: (): Promise<ShellInfo> => ipcRenderer.invoke(IPC_CHANNELS.getShellInfo),
  isFirstRun: (): Promise<FirstRunResponse> => ipcRenderer.invoke(IPC_CHANNELS.isFirstRun),
  manualLock: (): Promise<ActionResponse> => ipcRenderer.invoke(IPC_CHANNELS.manualLock),
  manualLoginComplete: (): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.manualLoginComplete),
  onStateChange: (callback: StateChangeCallback): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: StateSnapshot): void => {
      callback(state);
    };

    ipcRenderer.on(IPC_CHANNELS.stateChanged, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, listener);
    };
  },
  openSettings: (adminCode: string): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.openSettings, adminCode),
  resetUserCode: (payload: SetupUserPayload): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.resetUserCode, payload),
  saveSettings: (payload: SettingsPatchPayload): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveSettings, payload),
  submitUnlock: (userId: string, code: string): Promise<UnlockResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.submitUnlock, userId, code),
  updateUser: (payload: UpdateUserPayload): Promise<ActionResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateUser, payload)
} as const;

contextBridge.exposeInMainWorld("qrGuard", qrGuardApi);

export type QrGuardApi = typeof qrGuardApi;
