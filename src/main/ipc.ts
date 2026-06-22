import { ipcMain } from "electron";

import {
  IPC_CHANNELS,
  QR_SESSION_PARTITION,
  QR_SURFACE_KIND,
  type ShellInfo
} from "../core/shell-config";

export type ShellInfoProvider = () => Pick<ShellInfo, "qrVisible">;

export const registerShellIpc = (getShellInfoState: ShellInfoProvider): void => {
  ipcMain.handle(IPC_CHANNELS.getShellInfo, (): ShellInfo => {
    const state = getShellInfoState();

    return {
      qrPartitionName: QR_SESSION_PARTITION,
      qrSurfaceKind: QR_SURFACE_KIND,
      qrVisible: state.qrVisible
    };
  });
};
