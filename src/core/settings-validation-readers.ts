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
    return fail(["설정 데이터가 올바르지 않습니다."]);
  }

  const defaults = createDefaultSettings();
  const errors: string[] = [];
  const qrUrl = readHttpUrl(payload, "qrUrl", errors);
  const adminCode = readRequiredCode(payload, "adminCode", "관리자 코드", errors);
  const usersResult = readUserCodeInputs(payload["users"]);
  const unlockDurationSeconds = readDurationSeconds(
    payload,
    "unlockDurationSeconds",
    defaults.unlockDurationSeconds,
    MAX_UNLOCK_DURATION_SECONDS,
    "노출 시간",
    errors
  );
  const idleAutoLockSeconds = readDurationSeconds(
    payload,
    "idleAutoLockSeconds",
    defaults.idleAutoLockSeconds,
    MAX_IDLE_AUTO_LOCK_SECONDS,
    "유휴 자동잠금",
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
    return fail(["설정 데이터가 올바르지 않습니다."]);
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
    "노출 시간",
    errors
  );
  const idleAutoLockSeconds = readDurationSeconds(
    payload,
    "idleAutoLockSeconds",
    settings.idleAutoLockSeconds,
    MAX_IDLE_AUTO_LOCK_SECONDS,
    "유휴 자동잠금",
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
    return fail(["지역 데이터가 올바르지 않습니다."]);
  }

  const errors: string[] = [];
  const userId = readRequiredString(payload, "userId", "지역", errors);
  const code = readRequiredCode(payload, "code", "인증 코드", errors, USER_CODE_MIN_LENGTH);

  return errors.length > 0 ? fail(errors) : ok({ code, userId });
};

export const readUserIdPayload = (payload: unknown): ValidationResult<string> => {
  if (!isRecord(payload)) {
    return fail(["지역 데이터가 올바르지 않습니다."]);
  }

  const errors: string[] = [];
  const userId = readRequiredString(payload, "userId", "지역", errors);

  return errors.length > 0 ? fail(errors) : ok(userId);
};

export const readRenameUserInput = (payload: unknown): ValidationResult<UserRenameInput> => {
  if (!isRecord(payload)) {
    return fail(["지역 데이터가 올바르지 않습니다."]);
  }

  const errors: string[] = [];
  const userId = readRequiredString(payload, "userId", "지역", errors);
  const nextUserId = readRequiredString(payload, "nextUserId", "변경할 지역 이름", errors);

  return errors.length > 0 ? fail(errors) : ok({ nextUserId, userId });
};

const readUserCodeInputs = (payload: unknown): ValidationResult<readonly UserCodeInput[]> => {
  if (!Array.isArray(payload) || payload.length === 0) {
    return fail(["지역은 최소 1개 이상 필요합니다."]);
  }

  const errors: string[] = [];
  const users = payload.flatMap((item) => readUserCodeItem(item, errors));

  if (hasDuplicateUserIds(users)) {
    errors.push("지역 이름은 중복될 수 없습니다.");
  }

  return errors.length > 0 ? fail(errors) : ok(users);
};

const readUserCodeItem = (item: unknown, errors: string[]): readonly UserCodeInput[] => {
  if (!isRecord(item)) {
    errors.push("지역 데이터가 올바르지 않습니다.");
    return [];
  }

  const userId = readRequiredString(item, "userId", "지역", errors);
  const code = readRequiredCode(item, "code", "인증 코드", errors, USER_CODE_MIN_LENGTH);

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
