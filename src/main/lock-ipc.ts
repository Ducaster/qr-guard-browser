import { ipcMain } from "electron";

import { IPC_CHANNELS } from "../core/shell-config";
import type { StateSnapshot, UnlockResponse } from "../core/state-machine";
import type { LockController } from "./lock-controller";

interface ActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

export type LockControllerProvider = () => LockController | undefined;

export const registerLockIpc = (getController: LockControllerProvider): void => {
  ipcMain.handle(IPC_CHANNELS.getState, (): StateSnapshot => getRequiredController(getController).getState());

  ipcMain.handle(
    IPC_CHANNELS.submitUnlock,
    (_event, userId: unknown, code: unknown): UnlockResponse =>
      getRequiredController(getController).submitUnlock(userId, code)
  );

  ipcMain.handle(
    IPC_CHANNELS.submitSiteLogin,
    (_event, code: unknown): UnlockResponse =>
      getRequiredController(getController).submitSiteLogin(code)
  );

  ipcMain.handle(IPC_CHANNELS.manualLock, (): ActionResponse => {
    getRequiredController(getController).manualLock();

    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.learnCurrentQrTitle, (): ActionResponse =>
    getRequiredController(getController).learnCurrentQrTitle()
  );
};

const getRequiredController = (getController: LockControllerProvider): LockController => {
  const controller = getController();

  if (controller === undefined) {
    throw new Error("Lock controller has not been initialized.");
  }

  return controller;
};
