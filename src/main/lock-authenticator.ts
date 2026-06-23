import type { LockoutState } from "../core/auth";
import type { SettingsRepository } from "../core/settings-repo";
import {
  authenticateAdminSiteLogin,
  authenticateQrAccess,
  type QrAccessAuthResult
} from "./qr-access-auth";
import type { LockoutStateStore } from "./settings-adapters";

export interface LockAuthenticator {
  readonly authenticateAdminSiteLogin: (
    rawCode: unknown,
    nowMs: number
  ) => QrAccessAuthResult;
  readonly authenticateQrAccess: (
    rawUserId: unknown,
    rawCode: unknown,
    nowMs: number
  ) => QrAccessAuthResult;
}

export interface LockAuthenticatorOptions {
  readonly initialLockoutState: LockoutState;
  readonly lockoutStateStore: LockoutStateStore;
  readonly repository: SettingsRepository;
}

export const createLockAuthenticator = (
  options: LockAuthenticatorOptions
): LockAuthenticator => {
  let lockoutState = options.initialLockoutState;

  const commitResult = (authResult: QrAccessAuthResult): QrAccessAuthResult => {
    lockoutState = authResult.lockoutState;

    return authResult;
  };

  return {
    authenticateAdminSiteLogin: (rawCode: unknown, nowMs: number): QrAccessAuthResult =>
      commitResult(
        authenticateAdminSiteLogin({
          lockoutState,
          lockoutStateStore: options.lockoutStateStore,
          nowMs,
          rawCode,
          repository: options.repository
        })
      ),
    authenticateQrAccess: (
      rawUserId: unknown,
      rawCode: unknown,
      nowMs: number
    ): QrAccessAuthResult =>
      commitResult(
        authenticateQrAccess({
          lockoutState,
          lockoutStateStore: options.lockoutStateStore,
          nowMs,
          rawCode,
          rawUserId,
          repository: options.repository
        })
      )
  };
};
