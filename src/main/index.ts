import { app, BrowserWindow } from "electron";
import path from "node:path";

import { APP_NAME } from "../core/sanity";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

const createMainWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
    height: 800,
    show: false,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: true
    },
    width: 1280
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.setTitle(APP_NAME);
  });

  return mainWindow;
};

const loadRenderer = async (mainWindow: BrowserWindow): Promise<void> => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }

  await mainWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
  );
};

const createAndLoadMainWindow = (): void => {
  const mainWindow = createMainWindow();

  void loadRenderer(mainWindow).catch((error: unknown) => {
    console.error(formatUnknownError(error));
    app.quit();
  });
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.setName(APP_NAME);

  app.on("second-instance", () => {
    const [mainWindow] = BrowserWindow.getAllWindows();

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
      createAndLoadMainWindow();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createAndLoadMainWindow();
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
