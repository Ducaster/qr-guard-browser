import type { LoginDetectionSettings } from "./settings-repo";

export const ADMIN_CODE_MIN_LENGTH = 4;
export const USER_CODE_MIN_LENGTH = ADMIN_CODE_MIN_LENGTH;

export interface UserCodeInput {
  readonly code: string;
  readonly userId: string;
}

export interface UserRenameInput {
  readonly nextUserId: string;
  readonly userId: string;
}

export interface FirstRunSetupInput {
  readonly adminCode: string;
  readonly idleAutoLockSeconds: number;
  readonly loginDetection: LoginDetectionSettings;
  readonly qrUrl: string;
  readonly unlockDurationSeconds: number;
  readonly users: readonly UserCodeInput[];
}

export interface SettingsPatchInput {
  readonly idleAutoLockSeconds: number;
  readonly loginDetection: LoginDetectionSettings;
  readonly qrUrl: string;
  readonly unlockDurationSeconds: number;
}

export interface SettingsSafeUserView {
  readonly lastAuthenticatedAt: string | null;
  readonly userId: string;
}

export interface SettingsSafeView {
  readonly idleAutoLockSeconds: number;
  readonly loginDetection: LoginDetectionSettings;
  readonly qrUrl: string;
  readonly unlockDurationSeconds: number;
  readonly users: readonly SettingsSafeUserView[];
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });

export const fail = (errors: readonly string[]): ValidationResult<never> => ({
  errors,
  ok: false
});
