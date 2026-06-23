import { ipcMain, session, type IpcMainInvokeEvent } from "electron";

import { verifyCode } from "../core/auth";
import {
  IPC_CHANNELS,
  QR_SESSION_PARTITION,
  QR_SURFACE_KIND,
  type ShellInfo
} from "../core/shell-config";
import { SettingsParseError, type Settings, type SettingsRepository } from "../core/settings-repo";
import {
  addUserToSettings,
  applySettingsPatch,
  changeAdminCodeInSettings,
  createSettingsFromFirstRunSetup,
  deleteUserFromSettings,
  isFirstRunSettings,
  resetUserCodeInSettings,
  toSettingsSafeView,
  updateUserInSettings,
  type SettingsSafeView
} from "../core/settings-validation";
import type { ValidationResult } from "../core/settings-validation-types";
import { authorizeSender, isSenderAuthorized, revokeSender } from "./admin-session-gate";
import { registerAuditLogIpc } from "./audit-log-ipc";
import type { AuditLogStore } from "./settings-adapters";

export type ShellInfoProvider = () => Pick<ShellInfo, "qrVisible">;

export interface SettingsIpcOptions {
  readonly auditLogStore: AuditLogStore;
  readonly loadQrUrl: (url: string) => Promise<void>;
  readonly onSettingsClosed: () => void;
  readonly onSettingsOpened: () => void;
  readonly onSetupCompleted: () => void;
  readonly repository: SettingsRepository;
}

interface ActionOkResponse {
  readonly ok: true;
}

interface ActionErrorResponse {
  readonly errors: readonly string[];
  readonly ok: false;
}

type ActionResponse = ActionOkResponse | ActionErrorResponse;

type SettingsViewResponse =
  | { readonly ok: true; readonly settings: SettingsSafeView }
  | ActionErrorResponse;

type FirstRunResponse =
  | { readonly isFirstRun: boolean; readonly ok: true }
  | ActionErrorResponse;

type SettingsLoadResponse =
  | { readonly ok: true; readonly settings: Settings }
  | ActionErrorResponse;

const SETTINGS_READ_ERROR = "설정을 읽을 수 없습니다.";
let hasCompletedFirstRunSetupInProcess = false;

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

export const registerSettingsIpc = (options: SettingsIpcOptions): void => {
  registerAuditLogIpc({ auditLogStore: options.auditLogStore });

  ipcMain.handle(IPC_CHANNELS.isFirstRun, (): FirstRunResponse => {
    const loadResult = loadSettingsForIpc(options.repository);

    if (!loadResult.ok) {
      return loadResult;
    }

    return {
      isFirstRun: isFirstRunSettings(loadResult.settings),
      ok: true
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.completeFirstRunSetup,
    async (_event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> => {
      if (hasCompletedFirstRunSetupInProcess) {
        return errorResponse(["초기 설정이 이미 완료되었습니다."]);
      }

      const initialLoadResult = loadSettingsForIpc(options.repository);

      if (!initialLoadResult.ok) {
        return initialLoadResult;
      }

      if (!isFirstRunSettings(initialLoadResult.settings)) {
        return errorResponse(["초기 설정이 이미 완료되었습니다."]);
      }

      const result = createSettingsFromFirstRunSetup(payload);

      if (!result.ok) {
        return errorResponse(result.errors);
      }

      const finalLoadResult = loadSettingsForIpc(options.repository);

      if (!finalLoadResult.ok) {
        return finalLoadResult;
      }

      if (!isFirstRunSettings(finalLoadResult.settings)) {
        return errorResponse(["초기 설정이 이미 완료되었습니다."]);
      }

      options.repository.save(result.value);
      hasCompletedFirstRunSetupInProcess = true;
      await options.loadQrUrl(result.value.qrUrl);
      options.onSetupCompleted();

      return okResponse();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.openSettings,
    (event: IpcMainInvokeEvent, adminCode: unknown): ActionResponse => {
      const loadResult = loadSettingsForIpc(options.repository);

      if (!loadResult.ok) {
        return loadResult;
      }

      if (!verifyAdminCode(loadResult.settings.admin.salt, loadResult.settings.admin.hash, adminCode)) {
        return errorResponse(["관리자 코드가 올바르지 않습니다."]);
      }

      authorizeSender(event);
      options.onSettingsOpened();

      return okResponse();
    }
  );

  ipcMain.handle(IPC_CHANNELS.closeSettings, (event: IpcMainInvokeEvent): ActionResponse => {
    revokeSender(event);
    options.onSettingsClosed();

    return okResponse();
  });

  ipcMain.handle(
    IPC_CHANNELS.getSettingsView,
    (event: IpcMainInvokeEvent): SettingsViewResponse => {
      if (!isSenderAuthorized(event)) {
        return unauthorizedResponse();
      }

      const loadResult = loadSettingsForIpc(options.repository);

      if (!loadResult.ok) {
        return loadResult;
      }

      return {
        ok: true,
        settings: toSettingsSafeView(loadResult.settings)
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.saveSettings,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> =>
      saveSettingsMutation(event, options, (settings) => applySettingsPatch(settings, payload), true)
  );

  ipcMain.handle(
    IPC_CHANNELS.changeAdminCode,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> =>
      saveSettingsMutation(event, options, (settings) => changeAdminCodeInSettings(settings, payload), false)
  );

  ipcMain.handle(
    IPC_CHANNELS.addUser,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> =>
      saveSettingsMutation(event, options, (settings) => addUserToSettings(settings, payload), false)
  );

  ipcMain.handle(
    IPC_CHANNELS.updateUser,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> =>
      saveSettingsMutation(event, options, (settings) => updateUserInSettings(settings, payload), false)
  );

  ipcMain.handle(
    IPC_CHANNELS.deleteUser,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> =>
      saveSettingsMutation(event, options, (settings) => deleteUserFromSettings(settings, payload), false)
  );

  ipcMain.handle(
    IPC_CHANNELS.resetUserCode,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<ActionResponse> =>
      saveSettingsMutation(event, options, (settings) => resetUserCodeInSettings(settings, payload), false)
  );

  ipcMain.handle(
    IPC_CHANNELS.clearQrSession,
    async (_event: IpcMainInvokeEvent, adminCode: unknown): Promise<ActionResponse> => {
      const loadResult = loadSettingsForIpc(options.repository);

      if (!loadResult.ok) {
        return loadResult;
      }

      const settings = loadResult.settings;

      // This destructive action intentionally re-requires the admin code directly
      // instead of trusting an existing admin session.
      if (!verifyAdminCode(settings.admin.salt, settings.admin.hash, adminCode)) {
        return errorResponse(["관리자 코드가 올바르지 않습니다."]);
      }

      await session.fromPartition(QR_SESSION_PARTITION).clearStorageData();
      await options.loadQrUrl(settings.qrUrl);

      return okResponse();
    }
  );
};

const saveSettingsMutation = async (
  event: IpcMainInvokeEvent,
  options: SettingsIpcOptions,
  mutate: (settings: Settings) => ValidationResult<Settings>,
  reloadQrUrl: boolean
): Promise<ActionResponse> => {
  if (!isSenderAuthorized(event)) {
    return unauthorizedResponse();
  }

  const loadResult = loadSettingsForIpc(options.repository);

  if (!loadResult.ok) {
    return loadResult;
  }

  const currentSettings = loadResult.settings;
  const result = mutate(currentSettings);

  if (!result.ok) {
    return errorResponse(result.errors);
  }

  options.repository.save(result.value);

  if (reloadQrUrl && result.value.qrUrl !== currentSettings.qrUrl) {
    await options.loadQrUrl(result.value.qrUrl);
  }

  return okResponse();
};

const loadSettingsForIpc = (repository: SettingsRepository): SettingsLoadResponse => {
  try {
    return {
      ok: true,
      settings: repository.load()
    };
  } catch (error: unknown) {
    if (error instanceof SettingsParseError) {
      return errorResponse([SETTINGS_READ_ERROR]);
    }

    throw error;
  }
};

const verifyAdminCode = (salt: string, hash: string, code: unknown): boolean =>
  typeof code === "string" && code.trim().length > 0 && verifyCode(code.trim(), salt, hash);

const okResponse = (): ActionOkResponse => ({ ok: true });

const errorResponse = (errors: readonly string[]): ActionErrorResponse => ({
  errors,
  ok: false
});

const unauthorizedResponse = (): ActionErrorResponse =>
  errorResponse(["관리자 인증이 필요합니다."]);
