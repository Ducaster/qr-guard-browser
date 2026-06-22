import { app, BaseWindow } from "electron";
import path from "node:path";

import { APP_NAME } from "../core/sanity";
import { createSettingsRepository, type SettingsRepository } from "../core/settings-repo";
import { registerLockIpc } from "./lock-ipc";
import { createLockController, type LockController } from "./lock-controller";
import { registerSettingsIpc, registerShellIpc } from "./ipc";
import {
  createElectronAuditLogStore,
  createElectronLockoutStateStore,
  createElectronSafeStorageSealer,
  createElectronSettingsStore,
  createInsecureTestSealer
} from "./settings-adapters";
import { createShellWindow, getRendererHtmlPath, type ShellWindow } from "./views";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

let activeShellWindow: ShellWindow | undefined;
let activeLockController: LockController | undefined;
let settingsRepository: SettingsRepository | undefined;

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

  const allowInsecureTestStorage =
    process.env["QR_GUARD_ALLOW_INSECURE_TEST_STORAGE"] === "1" && !app.isPackaged;
  const sealer = allowInsecureTestStorage
    ? createInsecureTestSealer()
    : createElectronSafeStorageSealer();

  settingsRepository = createSettingsRepository(createElectronSettingsStore(), sealer);

  return settingsRepository;
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
  const rawValue = process.env["QR_GUARD_TEST_UNLOCK_DURATION_SECONDS"];

  if (rawValue === undefined) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isInteger(parsedValue) && parsedValue >= 1 ? parsedValue : undefined;
};

const createAndLoadShellWindow = (): void => {
  const controlDevServerUrl = getControlDevServerUrl();
  const qrUrl = getConfiguredQrUrl();
  const shellWindow = createShellWindow({
    controlHtmlPath: getRendererHtmlPath(getRendererName()),
    preloadPath: path.join(__dirname, "preload.js"),
    ...(controlDevServerUrl === undefined ? {} : { controlDevServerUrl }),
    ...(qrUrl === undefined ? {} : { qrUrl })
  });

  activeShellWindow = shellWindow;
  const unlockDurationOverrideSeconds = getUnlockDurationOverrideSeconds();
  activeLockController = createLockController({
    appVersion: app.getVersion(),
    auditLogStore: createElectronAuditLogStore(),
    lockoutStateStore: createElectronLockoutStateStore(),
    repository: getSettingsRepository(),
    shellWindow,
    ...(unlockDurationOverrideSeconds === undefined ? {} : { unlockDurationOverrideSeconds })
  });

  void shellWindow.load()
    .then(() => {
      shellWindow.window.show();
      shellWindow.window.setTitle(APP_NAME);
    })
    .catch((error: unknown) => {
      console.error(formatUnknownError(error));
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
      registerSettingsIpc({
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
      createAndLoadShellWindow();

      app.on("activate", () => {
        if (BaseWindow.getAllWindows().length === 0) {
          createAndLoadShellWindow();
        }
      });
    })
    .catch((error: unknown) => {
      console.error(formatUnknownError(error));
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
