import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import path from "node:path";

import { IPC_CHANNELS } from "../core/shell-config";
import { isSenderAuthorized } from "./admin-session-gate";

type AutoLaunchResponse =
  | { readonly enabled: boolean; readonly ok: true }
  | { readonly errors: readonly string[]; readonly ok: false };

interface LoginItemTarget {
  readonly args?: string[];
  readonly path?: string;
}

const SQUIRREL_APP_DIR_PATTERN = /^app-\d/;

const getSquirrelRoot = (): string | null => {
  if (process.platform !== "win32" || !app.isPackaged) {
    return null;
  }

  const appDir = path.dirname(process.execPath);
  const root = path.dirname(appDir);

  return SQUIRREL_APP_DIR_PATTERN.test(path.basename(appDir)) && fs.existsSync(path.join(root, "Update.exe"))
    ? root
    : null;
};

// Squirrel installs each version into a new app-x.y.z folder, so login items start through Update.exe.
const getLoginItemTarget = (): LoginItemTarget => {
  const root = getSquirrelRoot();

  return root === null
    ? {}
    : {
        args: ["--processStart", `"${path.basename(process.execPath)}"`],
        path: path.join(root, "Update.exe")
      };
};

const readAutoLaunch = (): AutoLaunchResponse => ({
  enabled: app.getLoginItemSettings(getLoginItemTarget()).openAtLogin,
  ok: true
});

export const registerAutoLaunchIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.getAutoLaunch, (event: IpcMainInvokeEvent): AutoLaunchResponse =>
    isSenderAuthorized(event) ? readAutoLaunch() : { errors: ["관리자 인증이 필요합니다."], ok: false }
  );
  ipcMain.handle(
    IPC_CHANNELS.setAutoLaunch,
    (event: IpcMainInvokeEvent, enabled: unknown): AutoLaunchResponse => {
      if (!isSenderAuthorized(event)) {
        return { errors: ["관리자 인증이 필요합니다."], ok: false };
      }

      if (typeof enabled !== "boolean") {
        return { errors: ["자동 실행 설정 값이 올바르지 않습니다."], ok: false };
      }

      app.setLoginItemSettings({ ...getLoginItemTarget(), openAtLogin: enabled });

      return readAutoLaunch();
    }
  );
};

// Squirrel keeps the previous app-x.y.z folder (~350MB) after reinstalling; the app never auto-updates.
export const removeStaleSquirrelAppDirs = async (): Promise<void> => {
  const root = getSquirrelRoot();

  if (root === null) {
    return;
  }

  const currentDir = path.basename(path.dirname(process.execPath));
  const entries = await fs.promises.readdir(root, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && SQUIRREL_APP_DIR_PATTERN.test(entry.name) && entry.name !== currentDir)
      .map((entry) => fs.promises.rm(path.join(root, entry.name), { force: true, recursive: true }))
  );
};
