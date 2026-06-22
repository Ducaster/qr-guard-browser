import {
  buildAuditEvent,
  buildLoginModeAuditEvent,
  type AuditLockReason
} from "../core/audit-log";
import type { AuditLogStore } from "./settings-adapters";

interface UnlockSession {
  readonly unlockedAtMs: number;
  readonly userId: string;
}

interface LoginModeSession {
  readonly enteredAtMs: number;
}

export interface AuditSessionTracker {
  readonly beginLoginModeSession: (enteredAtMs: number) => void;
  readonly beginUnlockSession: (userId: string, unlockedAtMs: number) => void;
  readonly finishLoginModeSession: (lockedAtMs: number) => void;
  readonly finishUnlockSession: (reason: AuditLockReason, lockedAtMs: number) => void;
  readonly getActiveUserId: () => string | null;
}

export interface AuditSessionTrackerOptions {
  readonly appVersion: string;
  readonly auditLogStore: AuditLogStore;
}

export const createAuditSessionTracker = (
  options: AuditSessionTrackerOptions
): AuditSessionTracker => {
  let activeSession: UnlockSession | null = null;
  let loginModeSession: LoginModeSession | null = null;

  return {
    beginLoginModeSession: (enteredAtMs: number): void => {
      loginModeSession = { enteredAtMs };
    },
    beginUnlockSession: (userId: string, unlockedAtMs: number): void => {
      activeSession = { unlockedAtMs, userId };
    },
    finishLoginModeSession: (lockedAtMs: number): void => {
      if (loginModeSession === null) {
        return;
      }

      options.auditLogStore.append(
        buildLoginModeAuditEvent({
          appVersion: options.appVersion,
          enteredAtMs: loginModeSession.enteredAtMs,
          lockedAtMs
        })
      );
      loginModeSession = null;
    },
    finishUnlockSession: (reason: AuditLockReason, lockedAtMs: number): void => {
      if (activeSession === null) {
        return;
      }

      options.auditLogStore.append(
        buildAuditEvent({
          appVersion: options.appVersion,
          lockedAtMs,
          reason,
          unlockedAtMs: activeSession.unlockedAtMs,
          userId: activeSession.userId
        })
      );
      activeSession = null;
    },
    getActiveUserId: (): string | null => activeSession?.userId ?? null
  };
};
