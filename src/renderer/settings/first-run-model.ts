import type { FirstRunSetupPayload } from "../../preload";
import {
  hasDuplicateValues,
  isValidHttpUrl,
  parseSeconds,
  validateAdminCode,
  validateUserCode
} from "./validation";

export interface SetupUserRow {
  readonly code: string;
  readonly rowId: string;
  readonly userId: string;
}

export interface SetupValidationInput {
  readonly adminCode: string;
  readonly idleAutoLockSeconds: string;
  readonly loggedInUrlPattern: string;
  readonly loginUrlPattern: string;
  readonly qrUrl: string;
  readonly titleContains: string;
  readonly unlockDurationSeconds: string;
  readonly users: readonly SetupUserRow[];
}

export type SetupValidationResult =
  | { readonly errors: readonly string[]; readonly ok: false }
  | { readonly ok: true; readonly payload: FirstRunSetupPayload };

export const createUserRow = (): SetupUserRow => ({
  code: "",
  rowId: crypto.randomUUID(),
  userId: ""
});

export const validateSetupForm = (input: SetupValidationInput): SetupValidationResult => {
  const errors: string[] = [];
  const unlockSeconds = parseSeconds(input.unlockDurationSeconds);
  const idleSeconds = parseSeconds(input.idleAutoLockSeconds);
  const users = input.users.map((user) => ({
    ...user,
    code: user.code.trim(),
    userId: user.userId.trim()
  }));

  if (!isValidHttpUrl(input.qrUrl)) {
    errors.push(input.qrUrl.trim().length === 0 ? "QR URL is required." : "QR URL must be valid.");
  }

  errors.push(...validateAdminCode(input.adminCode));

  if (unlockSeconds === null) {
    errors.push("Unlock duration must be at least 1 second.");
  }

  if (idleSeconds === null) {
    errors.push("Idle timeout must be at least 1 second.");
  }

  if (users.length === 0) {
    errors.push("At least one user is required.");
  }

  for (const user of users) {
    if (user.userId.length === 0) {
      errors.push("Each user needs a user ID.");
      break;
    }
  }

  const userCodeErrors = users.flatMap((user) => validateUserCode(user.code));

  if (userCodeErrors.length > 0) {
    const firstError = userCodeErrors[0];

    if (firstError !== undefined) {
      errors.push(firstError);
    }
  }

  if (hasDuplicateValues(users.map((user) => user.userId))) {
    errors.push("Duplicate user IDs are not allowed.");
  }

  if (errors.length > 0 || unlockSeconds === null || idleSeconds === null) {
    return {
      errors,
      ok: false
    };
  }

  return {
    ok: true,
    payload: {
      adminCode: input.adminCode.trim(),
      idleAutoLockSeconds: idleSeconds,
      loginDetection: {
        loggedInUrlPattern: input.loggedInUrlPattern.trim(),
        loginUrlPattern: input.loginUrlPattern.trim(),
        titleContains: input.titleContains.trim()
      },
      qrUrl: input.qrUrl.trim(),
      unlockDurationSeconds: unlockSeconds,
      users: users.map((user) => ({
        code: user.code,
        userId: user.userId
      }))
    }
  };
};
