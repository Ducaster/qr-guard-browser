export const QR_SESSION_PARTITION = "persist:qr-site" as const;

export const QR_SURFACE_KIND = "webContentsView" as const;

export const IPC_CHANNELS = {
  addUser: "qr-guard:add-user",
  changeAdminCode: "qr-guard:change-admin-code",
  clearQrSession: "qr-guard:clear-qr-session",
  closeSettings: "qr-guard:close-settings",
  completeFirstRunSetup: "qr-guard:complete-first-run-setup",
  deleteUser: "qr-guard:delete-user",
  exportAuditLog: "qr-guard:export-audit-log",
  getState: "qr-guard:get-state",
  getSettingsView: "qr-guard:get-settings-view",
  getShellInfo: "qr-guard:get-shell-info",
  isFirstRun: "qr-guard:is-first-run",
  learnCurrentQrTitle: "qr-guard:learn-current-qr-title",
  listUnlockRegions: "qr-guard:list-unlock-regions",
  manualLock: "qr-guard:manual-lock",
  openSettings: "qr-guard:open-settings",
  qrGoBack: "qr-guard:qr-go-back",
  qrGoForward: "qr-guard:qr-go-forward",
  qrNavigateToUrl: "qr-guard:qr-navigate-to-url",
  qrReload: "qr-guard:qr-reload",
  queryAuditLog: "qr-guard:query-audit-log",
  resetUserCode: "qr-guard:reset-user-code",
  retryQrLoad: "qr-guard:retry-qr-load",
  saveSettings: "qr-guard:save-settings",
  siteCredentialAutofillRequest: "qr-guard:site-credential-autofill-request",
  siteCredentialCaptured: "qr-guard:site-credential-captured",
  siteCredentialDelete: "qr-guard:site-credential-delete",
  siteCredentialList: "qr-guard:site-credential-list",
  siteCredentialSaveDecision: "qr-guard:site-credential-save-decision",
  siteCredentialSaveOffered: "qr-guard:site-credential-save-offered",
  stateChanged: "qr-guard:state-changed",
  submitSiteLogin: "qr-guard:submit-site-login",
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
