import { buildAuditEvent, type AuditLockReason } from "../core/audit-log";
import type { AuditLogStore } from "./settings-adapters";

interface UnlockSession {
  readonly unlockedAtMs: number;
  readonly userId: string;
}

export interface AuditSessionTracker {
  readonly beginUnlockSession: (userId: string, unlockedAtMs: number) => void;
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

  return {
    beginUnlockSession: (userId: string, unlockedAtMs: number): void => {
      activeSession = { unlockedAtMs, userId };
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
