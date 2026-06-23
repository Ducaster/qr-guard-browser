import { hashCode } from "./auth";
import {
  ADMIN_SITE_LOGIN_AUDIT_USER_ID,
  LOGIN_MODE_AUDIT_USER_ID
} from "./audit-log";
import { createDefaultSettings, type Settings, type UserSettings } from "./settings-repo";
import {
  readAdminCodeInput,
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
  qrTitlePattern: settings.qrTitlePattern,
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

  const reservedUser = input.users.find((user) => isReservedUserId(user.userId));

  if (reservedUser !== undefined) {
    return reservedUserIdFailure(reservedUser.userId);
  }

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
    qrTitlePattern: patchResult.value.qrTitlePattern,
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

  if (isReservedUserId(userResult.value.userId)) {
    return reservedUserIdFailure(userResult.value.userId);
  }

  if (settings.users.some((user) => user.userId === userResult.value.userId)) {
    return fail(["지역 이름은 중복될 수 없습니다."]);
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

  if (isReservedUserId(nextUserId)) {
    return reservedUserIdFailure(nextUserId);
  }

  if (!settings.users.some((user) => user.userId === userId)) {
    return fail(["지역을 찾을 수 없습니다."]);
  }

  if (settings.users.some((user) => user.userId !== userId && user.userId === nextUserId)) {
    return fail(["지역 이름은 중복될 수 없습니다."]);
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
    return fail(["지역을 찾을 수 없습니다."]);
  }

  if (users.length === 0) {
    return fail(["지역은 최소 1개 이상 필요합니다."]);
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
    return fail(["지역을 찾을 수 없습니다."]);
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

export const changeAdminCodeInSettings = (
  settings: Settings,
  payload: unknown
): ValidationResult<Settings> => {
  const inputResult = readAdminCodeInput(payload);

  if (!inputResult.ok) {
    return inputResult;
  }

  return ok({
    ...settings,
    admin: hashCode(inputResult.value.code)
  });
};

const toUserSettings = (user: UserCodeInput): UserSettings => ({
  ...hashCode(user.code),
  lastAuthenticatedAt: null,
  userId: user.userId
});

const reservedUserIdFailure = (userId: string): ValidationResult<never> =>
  fail([`${userId}는 예약된 값이라 지역으로 사용할 수 없습니다.`]);

const isReservedUserId = (userId: string): boolean =>
  userId === LOGIN_MODE_AUDIT_USER_ID || userId === ADMIN_SITE_LOGIN_AUDIT_USER_ID;
