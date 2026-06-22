export const QR_SESSION_PARTITION = "persist:qr-site" as const;

export const QR_SURFACE_KIND = "webContentsView" as const;

export const DEFAULT_FIXTURE_QR_URL = "http://127.0.0.1:37655/login" as const;

export const IPC_CHANNELS = {
  addUser: "qr-guard:add-user",
  clearQrSession: "qr-guard:clear-qr-session",
  closeSettings: "qr-guard:close-settings",
  completeFirstRunSetup: "qr-guard:complete-first-run-setup",
  deleteUser: "qr-guard:delete-user",
  getState: "qr-guard:get-state",
  getSettingsView: "qr-guard:get-settings-view",
  getShellInfo: "qr-guard:get-shell-info",
  isFirstRun: "qr-guard:is-first-run",
  manualLock: "qr-guard:manual-lock",
  manualLoginComplete: "qr-guard:manual-login-complete",
  openSettings: "qr-guard:open-settings",
  resetUserCode: "qr-guard:reset-user-code",
  saveSettings: "qr-guard:save-settings",
  stateChanged: "qr-guard:state-changed",
  submitUnlock: "qr-guard:submit-unlock",
  updateUser: "qr-guard:update-user"
} as const;

export interface ShellInfo {
  readonly qrPartitionName: typeof QR_SESSION_PARTITION;
  readonly qrSurfaceKind: typeof QR_SURFACE_KIND;
  readonly qrVisible: boolean;
}

export interface ViewWebPreferences {
  readonly backgroundThrottling?: boolean;
  readonly contextIsolation: boolean;
  readonly nodeIntegration: boolean;
  readonly sandbox: boolean;
  readonly transparent?: boolean;
  readonly webviewTag: boolean;
}

export const QR_VIEW_WEB_PREFERENCES = {
  backgroundThrottling: false,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webviewTag: false
} as const satisfies ViewWebPreferences;

export const CONTROL_VIEW_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  transparent: true,
  webviewTag: false
} as const satisfies ViewWebPreferences;
