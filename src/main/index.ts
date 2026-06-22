import { app, BaseWindow } from "electron";
import path from "node:path";

import { APP_NAME } from "../core/sanity";
import { registerShellIpc } from "./ipc";
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

const createAndLoadShellWindow = (): void => {
  const controlDevServerUrl = getControlDevServerUrl();
  const qrUrl = process.env["QR_GUARD_QR_URL"];
  const shellWindow = createShellWindow({
    controlHtmlPath: getRendererHtmlPath(getRendererName()),
    preloadPath: path.join(__dirname, "preload.js"),
    ...(controlDevServerUrl === undefined ? {} : { controlDevServerUrl }),
    ...(qrUrl === undefined ? {} : { qrUrl })
  });

  activeShellWindow = shellWindow;
  shellWindow.setQrVisible(false);

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
