import { hashCode } from "./auth";
import { createDefaultSettings, type Settings, type UserSettings } from "./settings-repo";
import {
  readFirstRunSetupInput,
  readRenameUserInput,
  readSettingsPatchInput,
  readSingleUserCodeInput,
  readUserIdPayload
} from "./settings-validation-readers";
import {
  fail,
  ok,
  type SettingsSafeView,
  type UserCodeInput,
  type ValidationResult
} from "./settings-validation-types";

export {
  ADMIN_CODE_MIN_LENGTH,
  USER_CODE_MIN_LENGTH,
  type SettingsSafeUserView,
  type SettingsSafeView
} from "./settings-validation-types";

export const isFirstRunSettings = (settings: Settings): boolean =>
  settings.admin.hash.length === 0 || settings.admin.salt.length === 0;

export const toSettingsSafeView = (settings: Settings): SettingsSafeView => ({
  idleAutoLockSeconds: settings.idleAutoLockSeconds,
  loginDetection: settings.loginDetection,
  qrUrl: settings.qrUrl,
  unlockDurationSeconds: settings.unlockDurationSeconds,
  users: settings.users.map((user) => ({
    lastAuthenticatedAt: user.lastAuthenticatedAt,
    userId: user.userId
  }))
});

export const createSettingsFromFirstRunSetup = (payload: unknown): ValidationResult<Settings> => {
  const inputResult = readFirstRunSetupInput(payload);

  if (!inputResult.ok) {
    return inputResult;
  }

  const input = inputResult.value;

  return ok({
    ...createDefaultSettings(),
    admin: hashCode(input.adminCode),
    idleAutoLockSeconds: input.idleAutoLockSeconds,
    loginDetection: input.loginDetection,
    qrUrl: input.qrUrl,
    unlockDurationSeconds: input.unlockDurationSeconds,
    users: input.users.map(toUserSettings)
  });
};

export const applySettingsPatch = (
  settings: Settings,
  payload: unknown
): ValidationResult<Settings> => {
  const patchResult = readSettingsPatchInput(settings, payload);

  if (!patchResult.ok) {
    return patchResult;
  }

  return ok({
    ...settings,
    idleAutoLockSeconds: patchResult.value.idleAutoLockSeconds,
    loginDetection: patchResult.value.loginDetection,
    qrUrl: patchResult.value.qrUrl,
    unlockDurationSeconds: patchResult.value.unlockDurationSeconds
  });
};

export const addUserToSettings = (
  settings: Settings,
  payload: unknown
): ValidationResult<Settings> => {
  const userResult = readSingleUserCodeInput(payload);

  if (!userResult.ok) {
    return userResult;
  }

  if (settings.users.some((user) => user.userId === userResult.value.userId)) {
    return fail(["Duplicate user IDs are not allowed."]);
  }

  return ok({
    ...settings,
    users: [...settings.users, toUserSettings(userResult.value)]
  });
};

export const updateUserInSettings = (
  settings: Settings,
  payload: unknown
): ValidationResult<Settings> => {
  const inputResult = readRenameUserInput(payload);

  if (!inputResult.ok) {
    return inputResult;
  }

  const { nextUserId, userId } = inputResult.value;

  if (!settings.users.some((user) => user.userId === userId)) {
    return fail(["User was not found."]);
  }

  if (settings.users.some((user) => user.userId !== userId && user.userId === nextUserId)) {
    return fail(["Duplicate user IDs are not allowed."]);
  }

  return ok({
    ...settings,
    users: settings.users.map((user) =>
      user.userId === userId ? { ...user, userId: nextUserId } : user
    )
  });
};

export const deleteUserFromSettings = (
  settings: Settings,
  payload: unknown
): ValidationResult<Settings> => {
  const userIdResult = readUserIdPayload(payload);

  if (!userIdResult.ok) {
    return userIdResult;
  }

  const users = settings.users.filter((user) => user.userId !== userIdResult.value);

  if (users.length === settings.users.length) {
    return fail(["User was not found."]);
  }

  if (users.length === 0) {
    return fail(["At least one user is required."]);
  }

  return ok({ ...settings, users });
};

export const resetUserCodeInSettings = (
  settings: Settings,
  payload: unknown
): ValidationResult<Settings> => {
  const userResult = readSingleUserCodeInput(payload);

  if (!userResult.ok) {
    return userResult;
  }

  if (!settings.users.some((user) => user.userId === userResult.value.userId)) {
    return fail(["User was not found."]);
  }

  return ok({
    ...settings,
    users: settings.users.map((user) =>
      user.userId === userResult.value.userId
        ? { ...user, ...hashCode(userResult.value.code) }
        : user
    )
  });
};

const toUserSettings = (user: UserCodeInput): UserSettings => ({
  ...hashCode(user.code),
  lastAuthenticatedAt: null,
  userId: user.userId
});
