import {
  checkLockout,
  recordAuthFailure,
  recordAuthSuccess,
  verifyCode,
  type LockoutState
} from "../core/auth";
import type { Settings, SettingsRepository } from "../core/settings-repo";
import type { UnlockResponse } from "../core/state-machine";
import { updateLastAuthenticatedAt } from "../core/user-settings";
import type { LockoutStateStore } from "./settings-adapters";

export type QrAccessAuthResult =
  | {
      readonly kind: "success";
      readonly lockoutState: LockoutState;
      readonly settings: Settings;
      readonly userId: string;
    }
  | {
      readonly kind: "failure";
      readonly lockoutState: LockoutState;
      readonly response: UnlockResponse;
    };

export interface QrAccessAuthInput {
  readonly lockoutState: LockoutState;
  readonly lockoutStateStore: LockoutStateStore;
  readonly nowMs: number;
  readonly rawCode: unknown;
  readonly rawUserId: unknown;
  readonly repository: SettingsRepository;
}

export const notLockedResponse = (): UnlockResponse => ({
  errors: ["현재 잠긴 상태가 아닙니다."],
  ok: false,
  retryAfterMs: null
});

export const authenticateQrAccess = (input: QrAccessAuthInput): QrAccessAuthResult => {
  const userId = typeof input.rawUserId === "string" ? input.rawUserId.trim() : "";
  const code = typeof input.rawCode === "string" ? input.rawCode.trim() : "";

  if (userId.length === 0 || code.length === 0) {
    return failure(input.lockoutState, {
      errors: ["지역과 인증 코드가 필요합니다."],
      ok: false,
      retryAfterMs: null
    });
  }

  const decision = checkLockout(input.lockoutState, userId, input.nowMs);

  if (!decision.allowed) {
    return failure(input.lockoutState, {
      errors: ["실패 횟수가 너무 많습니다. 잠시 후 다시 시도하세요."],
      ok: false,
      retryAfterMs: decision.retryAfterMs ?? null
    });
  }

  const settings = input.repository.load();
  const user = settings.users.find((candidate) => candidate.userId === userId);

  if (user === undefined || !verifyCode(code, user.salt, user.hash)) {
    const result = recordAuthFailure(input.lockoutState, userId, input.nowMs);

    input.lockoutStateStore.save(result.state);

    return failure(result.state, {
      errors: ["지역 또는 인증 코드가 올바르지 않습니다."],
      ok: false,
      retryAfterMs: result.decision.retryAfterMs ?? null
    });
  }

  const nextLockoutState = recordAuthSuccess(input.lockoutState, userId);

  input.lockoutStateStore.save(nextLockoutState);
  const updatedSettings = updateLastAuthenticatedAt(settings, userId, input.nowMs);
  input.repository.save(updatedSettings);

  return {
    kind: "success",
    lockoutState: nextLockoutState,
    settings: updatedSettings,
    userId
  };
};

const failure = (lockoutState: LockoutState, response: UnlockResponse): QrAccessAuthResult => ({
  kind: "failure",
  lockoutState,
  response
});
