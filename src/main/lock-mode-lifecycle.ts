import type { AuditLockReason } from "../core/audit-log";
import { shouldRelockForIdle } from "../core/idle-lock";
import type { Settings } from "../core/settings-repo";
import type { GuardState } from "../core/state-machine";
import type { AuditSessionTracker } from "./audit-session-tracker";
import type { LockTimers } from "./lock-timers";

export const DEFAULT_SITE_LOGIN_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_IDLE_POLL_INTERVAL_MS = 1_000;

export interface LockModeLifecycle {
  readonly sync: (previousState: GuardState, nextState: GuardState) => void;
}

export interface LockModeLifecycleOptions {
  readonly auditSessions: AuditSessionTracker;
  readonly getState: () => GuardState;
  readonly loadSettings: () => Settings;
  readonly relock: (reason: AuditLockReason) => void;
  readonly setState: (nextState: GuardState) => void;
  readonly timers: LockTimers;
  readonly idlePollIntervalMs?: number;
  readonly idleSource?: () => number;
  readonly siteLoginTimeoutOverrideMs?: number;
}

export const createLockModeLifecycle = (
  options: LockModeLifecycleOptions
): LockModeLifecycle => {
  const startSiteLoginTimer = (): void => {
    options.timers.startSiteLoginTimer(
      options.siteLoginTimeoutOverrideMs ?? DEFAULT_SITE_LOGIN_TIMEOUT_MS,
      () => {
        options.relock("timer");
      }
    );
  };

  const startIdleTimer = (): void => {
    options.timers.startIdleTimer(options.idlePollIntervalMs ?? DEFAULT_IDLE_POLL_INTERVAL_MS, () => {
      const idleSource = options.idleSource ?? (() => 0);

      if (
        shouldRelockForIdle({
          idleAutoLockSeconds: options.loadSettings().idleAutoLockSeconds,
          state: options.getState(),
          systemIdleSeconds: idleSource()
        })
      ) {
        options.relock("idle");
      }
    });
  };

  return {
    sync: (previousState: GuardState, nextState: GuardState): void => {
      if (previousState !== "siteLogin" && nextState === "siteLogin") {
        startIdleTimer();
        startSiteLoginTimer();
      }

      if (previousState === "siteLogin" && nextState !== "siteLogin") {
        options.timers.clearIdleTimer();
        options.timers.clearSiteLoginTimer();
      }

      if (previousState !== "unlocked" && nextState === "unlocked") {
        startIdleTimer();
      }

      if (previousState === "unlocked" && nextState !== "unlocked") {
        options.timers.clearIdleTimer();
      }
    }
  };
};
