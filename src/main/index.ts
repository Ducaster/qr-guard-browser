import { app, BaseWindow, Menu, nativeTheme, powerMonitor } from "electron";
import path from "node:path";

import { APP_NAME } from "../core/sanity";
import { createSettingsRepository, type Sealer, type SettingsRepository } from "../core/settings-repo";
import { createSiteCredentialRepository, type SiteCredentialRepository } from "../core/site-credentials";
import { registerLockIpc } from "./lock-ipc";
import { createLockController, type LockController } from "./lock-controller";
import { formatUnknownError, mainLogger } from "./logger";
import { registerSettingsIpc, registerShellIpc } from "./ipc";
import {
  createElectronAuditLogStore,
  createElectronLockoutStateStore,
  createElectronSafeStorageSealer,
  createElectronSettingsStore,
  createElectronSiteCredentialStore,
  createInsecureTestSealer
} from "./settings-adapters";
import { registerSiteCredentialIpc } from "./site-credential-ipc";
import {
  hasEnabledTestFlag,
  readPositiveIntegerTestEnv,
  type TestOverrideEnvironment
} from "./test-env-overrides";
import { createShellWindow, getRendererHtmlPath, type ShellWindow } from "./views";
import { createQrWebContentsAdapter } from "./qr-navigation-watcher";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let activeShellWindow: ShellWindow | undefined;
let activeLockController: LockController | undefined;
let settingsRepository: SettingsRepository | undefined;
let siteCredentialRepository: SiteCredentialRepository | undefined;

const configuredUserDataPath = process.env["QR_GUARD_USER_DATA_DIR"];

if (configuredUserDataPath !== undefined) {
  app.setPath("userData", configuredUserDataPath);
}

const getControlDevServerUrl = (): string | undefined => {
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string") {
    return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  }

  return undefined;
};

const getRendererName = (): string => {
  if (typeof MAIN_WINDOW_VITE_NAME === "string") {
    return MAIN_WINDOW_VITE_NAME;
  }

  return "main_window";
};

const getSettingsRepository = (): SettingsRepository => {
  if (settingsRepository !== undefined) {
    return settingsRepository;
  }

  settingsRepository = createSettingsRepository(createElectronSettingsStore(), createStorageSealer());

  return settingsRepository;
};

const getSiteCredentialRepository = (): SiteCredentialRepository => {
  if (siteCredentialRepository !== undefined) {
    return siteCredentialRepository;
  }

  siteCredentialRepository = createSiteCredentialRepository(
    createElectronSiteCredentialStore(),
    createStorageSealer()
  );

  return siteCredentialRepository;
};

const createStorageSealer = (): Sealer => {
  const allowInsecureTestStorage =
    hasEnabledTestFlag(getTestOverrideEnvironment(), "QR_GUARD_ALLOW_INSECURE_TEST_STORAGE");

  return allowInsecureTestStorage ? createInsecureTestSealer() : createElectronSafeStorageSealer();
};

const getConfiguredQrUrl = (): string | undefined => {
  const envQrUrl = process.env["QR_GUARD_QR_URL"];

  if (envQrUrl !== undefined) {
    return envQrUrl;
  }

  const qrUrl = getSettingsRepository().load().qrUrl;

  return qrUrl.length > 0 ? qrUrl : undefined;
};

const loadActiveQrUrl = async (url: string): Promise<void> => {
  if (activeShellWindow === undefined) {
    return;
  }

  await activeShellWindow.qrView.webContents.loadURL(url);
};

const getUnlockDurationOverrideSeconds = (): number | undefined => {
  return readPositiveIntegerTestOverrideEnv("QR_GUARD_TEST_UNLOCK_DURATION_SECONDS");
};

const getIdlePollIntervalOverrideMs = (): number | undefined =>
  readPositiveIntegerTestOverrideEnv("QR_GUARD_TEST_IDLE_POLL_MS");

const getSiteLoginTimeoutOverrideMs = (): number | undefined =>
  readPositiveIntegerTestOverrideEnv("QR_GUARD_TEST_SITE_LOGIN_TIMEOUT_MS");

const getIdleSource = (): (() => number) => {
  const fixedIdleSeconds = readPositiveIntegerTestOverrideEnv("QR_GUARD_TEST_SYSTEM_IDLE_SECONDS");

  return fixedIdleSeconds === undefined ? () => powerMonitor.getSystemIdleTime() : () => fixedIdleSeconds;
};

const getTestOverrideEnvironment = (): TestOverrideEnvironment => ({
  isPackaged: app.isPackaged,
  variables: process.env
});

const readPositiveIntegerTestOverrideEnv = (key: string): number | undefined =>
  readPositiveIntegerTestEnv(getTestOverrideEnvironment(), key);

const createAndLoadShellWindow = (): void => {
  const controlDevServerUrl = getControlDevServerUrl();
  const qrUrl = getConfiguredQrUrl();
  const shellWindow = createShellWindow({
    controlHtmlPath: getRendererHtmlPath(getRendererName()),
    disableDevTools: app.isPackaged,
    preloadPath: path.join(__dirname, "preload.js"),
    qrPreloadPath: path.join(__dirname, "qr-site-preload.js"),
    ...(controlDevServerUrl === undefined ? {} : { controlDevServerUrl }),
    ...(qrUrl === undefined ? {} : { qrUrl })
  });

  activeShellWindow = shellWindow;
  const unlockDurationOverrideSeconds = getUnlockDurationOverrideSeconds();
  const idlePollIntervalMs = getIdlePollIntervalOverrideMs();
  const siteLoginTimeoutOverrideMs = getSiteLoginTimeoutOverrideMs();
  activeLockController = createLockController({
    appVersion: app.getVersion(),
    auditLogStore: createElectronAuditLogStore(),
    idleSource: getIdleSource(),
    lockoutStateStore: createElectronLockoutStateStore(),
    qrWebContents: createQrWebContentsAdapter(shellWindow.qrView.webContents),
    repository: getSettingsRepository(),
    shellWindow,
    ...(idlePollIntervalMs === undefined ? {} : { idlePollIntervalMs }),
    ...(siteLoginTimeoutOverrideMs === undefined ? {} : { siteLoginTimeoutOverrideMs }),
    ...(unlockDurationOverrideSeconds === undefined ? {} : { unlockDurationOverrideSeconds })
  });

  void shellWindow.load()
    .then(() => {
      shellWindow.window.show();
      shellWindow.window.setTitle(APP_NAME);
    })
    .catch((error: unknown) => {
      mainLogger.error("Failed to load shell window.", { error: formatUnknownError(error) });
      app.quit();
    });
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.setName(APP_NAME);
  registerLockIpc(() => activeLockController);
  registerShellIpc(() => ({
    qrVisible: activeShellWindow?.isQrVisible() ?? false
  }));

  app.on("second-instance", () => {
    const [mainWindow] = BaseWindow.getAllWindows();

    if (mainWindow === undefined) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady()
    .then(() => {
      nativeTheme.themeSource = "system";

      if (app.isPackaged) {
        Menu.setApplicationMenu(null);
      }

      registerSettingsIpc({
        auditLogStore: createElectronAuditLogStore(),
        loadQrUrl: loadActiveQrUrl,
        onSettingsClosed: () => {
          activeLockController?.closeSettings();
        },
        onSettingsOpened: () => {
          activeLockController?.openSettings();
        },
        onSetupCompleted: () => {
          activeLockController?.completeSetup();
        },
        repository: getSettingsRepository()
      });
      registerSiteCredentialIpc({
        getControlWebContents: () => activeShellWindow?.controlView.webContents,
        getQrWebContents: () => activeShellWindow?.qrView.webContents,
        repository: getSiteCredentialRepository()
      });
      createAndLoadShellWindow();

      app.on("activate", () => {
        if (BaseWindow.getAllWindows().length === 0) {
          createAndLoadShellWindow();
        }
      });
    })
    .catch((error: unknown) => {
      mainLogger.error("Failed during app startup.", { error: formatUnknownError(error) });
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
