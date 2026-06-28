import { ipcMain, type IpcMainInvokeEvent } from "electron";

import { isAllowedQrNavigation } from "../core/qr-navigation";
import { IPC_CHANNELS } from "../core/shell-config";
import type {
  ListUnlockRegionsResponse,
  StateSnapshot,
  UnlockResponse
} from "../core/state-machine";
import type { LockController } from "./lock-controller";

interface ActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

export type LockControllerProvider = () => LockController | undefined;
export type ControlWebContentsProvider = () => { readonly id: number } | undefined;

export const registerLockIpc = (
  getController: LockControllerProvider,
  getControlWebContents: ControlWebContentsProvider
): void => {
  ipcMain.handle(IPC_CHANNELS.getState, (event: IpcMainInvokeEvent): StateSnapshot => {
    assertControlSender(event, getControlWebContents);

    return getRequiredController(getController).getState();
  });

  ipcMain.handle(
    IPC_CHANNELS.submitUnlock,
    (event: IpcMainInvokeEvent, userId: unknown, code: unknown): UnlockResponse => {
      if (!isControlSender(event, getControlWebContents)) {
        return unauthorizedUnlockResponse();
      }

      return getRequiredController(getController).submitUnlock(userId, code);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.submitSiteLogin,
    (event: IpcMainInvokeEvent, code: unknown): UnlockResponse => {
      if (!isControlSender(event, getControlWebContents)) {
        return unauthorizedUnlockResponse();
      }

      return getRequiredController(getController).submitSiteLogin(code);
    }
  );

  ipcMain.handle(IPC_CHANNELS.manualLock, (event: IpcMainInvokeEvent): ActionResponse => {
    if (!isControlSender(event, getControlWebContents)) {
      return unauthorizedActionResponse();
    }

    getRequiredController(getController).manualLock();

    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.qrGoBack, (event: IpcMainInvokeEvent): ActionResponse => {
    if (!isControlSender(event, getControlWebContents)) {
      return unauthorizedActionResponse();
    }

    getRequiredController(getController).qrGoBack();

    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.qrGoForward, (event: IpcMainInvokeEvent): ActionResponse => {
    if (!isControlSender(event, getControlWebContents)) {
      return unauthorizedActionResponse();
    }

    getRequiredController(getController).qrGoForward();

    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.qrReload, (event: IpcMainInvokeEvent): ActionResponse => {
    if (!isControlSender(event, getControlWebContents)) {
      return unauthorizedActionResponse();
    }

    getRequiredController(getController).qrReload();

    return { ok: true };
  });

  ipcMain.handle(
    IPC_CHANNELS.qrNavigateToUrl,
    (event: IpcMainInvokeEvent, url: unknown): Promise<ActionResponse> | ActionResponse => {
      if (!isControlSender(event, getControlWebContents)) {
        return unauthorizedActionResponse();
      }

      if (typeof url !== "string" || !isAllowedQrNavigation(url)) {
        return disallowedQrNavigationResponse();
      }

      return getRequiredController(getController).qrNavigateToUrl(url);
    }
  );

  ipcMain.handle(IPC_CHANNELS.learnCurrentQrTitle, (event: IpcMainInvokeEvent): ActionResponse => {
    if (!isControlSender(event, getControlWebContents)) {
      return unauthorizedActionResponse();
    }

    return getRequiredController(getController).learnCurrentQrTitle();
  });

  ipcMain.handle(
    IPC_CHANNELS.listUnlockRegions,
    (event: IpcMainInvokeEvent): ListUnlockRegionsResponse => {
      if (!isControlSender(event, getControlWebContents)) {
        return unauthorizedListUnlockRegionsResponse();
      }

      return {
        ok: true,
        regions: getRequiredController(getController).listUnlockRegions()
      };
    }
  );
};

const getRequiredController = (getController: LockControllerProvider): LockController => {
  const controller = getController();

  if (controller === undefined) {
    throw new Error("Lock controller has not been initialized.");
  }

  return controller;
};

const assertControlSender = (
  event: IpcMainInvokeEvent,
  getControlWebContents: ControlWebContentsProvider
): void => {
  if (!isControlSender(event, getControlWebContents)) {
    throw new Error("Unauthorized lock IPC sender.");
  }
};

const isControlSender = (
  event: IpcMainInvokeEvent,
  getControlWebContents: ControlWebContentsProvider
): boolean => event.sender.id === getControlWebContents()?.id;

const unauthorizedActionResponse = (): ActionResponse => ({
  errors: ["허용되지 않은 요청입니다."],
  ok: false
});

const disallowedQrNavigationResponse = (): ActionResponse => ({
  errors: ["허용되지 않은 QR 주소입니다."],
  ok: false
});

const unauthorizedUnlockResponse = (): UnlockResponse => ({
  errors: ["허용되지 않은 요청입니다."],
  ok: false,
  retryAfterMs: null
});

const unauthorizedListUnlockRegionsResponse = (): ListUnlockRegionsResponse => ({
  errors: ["허용되지 않은 요청입니다."],
  ok: false
});
