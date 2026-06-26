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
  readonly lockoutStateStore: LockoutStateStore;
  readonly repository: SettingsRepository;
}

export const createLockAuthenticator = (
  options: LockAuthenticatorOptions
): LockAuthenticator => {
  return {
    authenticateAdminSiteLogin: (rawCode: unknown, nowMs: number): QrAccessAuthResult =>
      authenticateAdminSiteLogin({
        lockoutStateStore: options.lockoutStateStore,
        nowMs,
        rawCode,
        repository: options.repository
      }),
    authenticateQrAccess: (
      rawUserId: unknown,
      rawCode: unknown,
      nowMs: number
    ): QrAccessAuthResult =>
      authenticateQrAccess({
        lockoutState: options.lockoutStateStore.load(),
        lockoutStateStore: options.lockoutStateStore,
        nowMs,
        rawCode,
        rawUserId,
        repository: options.repository
      })
  };
};
