import type { GuardState } from "./state-machine";

export interface IdleLockInput {
  readonly idleAutoLockSeconds: number;
  readonly state: GuardState;
  readonly systemIdleSeconds: number;
}

export const shouldRelockForIdle = (input: IdleLockInput): boolean =>
  input.state === "unlocked" &&
  input.idleAutoLockSeconds >= 1 &&
  input.systemIdleSeconds >= input.idleAutoLockSeconds;
