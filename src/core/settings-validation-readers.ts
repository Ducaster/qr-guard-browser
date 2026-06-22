import {
  createDefaultSettings,
  MAX_IDLE_AUTO_LOCK_SECONDS,
  MAX_UNLOCK_DURATION_SECONDS,
  type Settings
} from "./settings-repo";
import {
  isRecord,
  readDurationSeconds,
  readHttpUrl,
  readLoginDetection,
  readRequiredCode,
  readRequiredString
} from "./settings-validation-primitives";
import {
  fail,
  ok,
  USER_CODE_MIN_LENGTH,
  type FirstRunSetupInput,
  type SettingsPatchInput,
  type UserCodeInput,
  type UserRenameInput,
  type ValidationResult
} from "./settings-validation-types";

export const readFirstRunSetupInput = (
  payload: unknown
): ValidationResult<FirstRunSetupInput> => {
  if (!isRecord(payload)) {
    return fail(["Settings payload is invalid."]);
  }

  const defaults = createDefaultSettings();
  const errors: string[] = [];
  const qrUrl = readHttpUrl(payload, "qrUrl", errors);
  const adminCode = readRequiredCode(payload, "adminCode", "Admin code", errors);
  const usersResult = readUserCodeInputs(payload["users"]);
  const unlockDurationSeconds = readDurationSeconds(
    payload,
    "unlockDurationSeconds",
    defaults.unlockDurationSeconds,
    MAX_UNLOCK_DURATION_SECONDS,
    "Unlock duration",
    errors
  );
  const idleAutoLockSeconds = readDurationSeconds(
    payload,
    "idleAutoLockSeconds",
    defaults.idleAutoLockSeconds,
    MAX_IDLE_AUTO_LOCK_SECONDS,
    "Idle auto-lock",
    errors
  );
  const loginDetection = readLoginDetection(payload["loginDetection"], defaults.loginDetection, errors);

  if (!usersResult.ok) {
    errors.push(...usersResult.errors);
  }

  return errors.length > 0
    ? fail(errors)
    : ok({
        adminCode,
        idleAutoLockSeconds,
        loginDetection,
        qrUrl,
        unlockDurationSeconds,
        users: usersResult.ok ? usersResult.value : []
      });
};

export const readSettingsPatchInput = (
  settings: Settings,
  payload: unknown
): ValidationResult<SettingsPatchInput> => {
  if (!isRecord(payload)) {
    return fail(["Settings payload is invalid."]);
  }

  const errors: string[] = [];
  const qrUrl = Object.hasOwn(payload, "qrUrl")
    ? readHttpUrl(payload, "qrUrl", errors)
    : settings.qrUrl;
  const unlockDurationSeconds = readDurationSeconds(
    payload,
    "unlockDurationSeconds",
    settings.unlockDurationSeconds,
    MAX_UNLOCK_DURATION_SECONDS,
    "Unlock duration",
    errors
  );
  const idleAutoLockSeconds = readDurationSeconds(
    payload,
    "idleAutoLockSeconds",
    settings.idleAutoLockSeconds,
    MAX_IDLE_AUTO_LOCK_SECONDS,
    "Idle auto-lock",
    errors
  );
  const loginDetection = Object.hasOwn(payload, "loginDetection")
    ? readLoginDetection(payload["loginDetection"], settings.loginDetection, errors)
    : settings.loginDetection;

  return errors.length > 0
    ? fail(errors)
    : ok({ idleAutoLockSeconds, loginDetection, qrUrl, unlockDurationSeconds });
};

export const readSingleUserCodeInput = (payload: unknown): ValidationResult<UserCodeInput> => {
  if (!isRecord(payload)) {
    return fail(["User payload is invalid."]);
  }

  const errors: string[] = [];
  const userId = readRequiredString(payload, "userId", "User ID", errors);
  const code = readRequiredCode(payload, "code", "User code", errors, USER_CODE_MIN_LENGTH);

  return errors.length > 0 ? fail(errors) : ok({ code, userId });
};

export const readUserIdPayload = (payload: unknown): ValidationResult<string> => {
  if (!isRecord(payload)) {
    return fail(["User payload is invalid."]);
  }

  const errors: string[] = [];
  const userId = readRequiredString(payload, "userId", "User ID", errors);

  return errors.length > 0 ? fail(errors) : ok(userId);
};

export const readRenameUserInput = (payload: unknown): ValidationResult<UserRenameInput> => {
  if (!isRecord(payload)) {
    return fail(["User payload is invalid."]);
  }

  const errors: string[] = [];
  const userId = readRequiredString(payload, "userId", "User ID", errors);
  const nextUserId = readRequiredString(payload, "nextUserId", "Updated user ID", errors);

  return errors.length > 0 ? fail(errors) : ok({ nextUserId, userId });
};

const readUserCodeInputs = (payload: unknown): ValidationResult<readonly UserCodeInput[]> => {
  if (!Array.isArray(payload) || payload.length === 0) {
    return fail(["At least one user is required."]);
  }

  const errors: string[] = [];
  const users = payload.flatMap((item) => readUserCodeItem(item, errors));

  if (hasDuplicateUserIds(users)) {
    errors.push("Duplicate user IDs are not allowed.");
  }

  return errors.length > 0 ? fail(errors) : ok(users);
};

const readUserCodeItem = (item: unknown, errors: string[]): readonly UserCodeInput[] => {
  if (!isRecord(item)) {
    errors.push("User payload is invalid.");
    return [];
  }

  const userId = readRequiredString(item, "userId", "User ID", errors);
  const code = readRequiredCode(item, "code", "User code", errors, USER_CODE_MIN_LENGTH);

  return userId.length > 0 && code.length >= USER_CODE_MIN_LENGTH ? [{ code, userId }] : [];
};

const hasDuplicateUserIds = (users: readonly UserCodeInput[]): boolean => {
  const seen = new Set<string>();

  for (const user of users) {
    if (seen.has(user.userId)) {
      return true;
    }

    seen.add(user.userId);
  }

  return false;
};
