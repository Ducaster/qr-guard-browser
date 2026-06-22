import {
  checkLockout,
  recordAuthFailure,
  recordAuthSuccess,
  verifyCode,
  type LockoutState
} from "../core/auth";
import { buildAuditEvent, type AuditLockReason } from "../core/audit-log";
import {
  closeSettings,
  completeSetup,
  manualLock,
  openSettings,
  shouldShowQrView,
  timerExpired,
  unlockSucceeded,
  type GuardState,
  type StateSnapshot,
  type UnlockResponse
} from "../core/state-machine";
import { IPC_CHANNELS } from "../core/shell-config";
import type { Settings, SettingsRepository } from "../core/settings-repo";
import { isFirstRunSettings } from "../core/settings-validation";
import type { AuditLogStore, LockoutStateStore } from "./settings-adapters";

interface UnlockSession {
  readonly unlockedAtMs: number;
  readonly userId: string;
}

interface LockControllerShellWindow {
  readonly controlView: {
    readonly webContents: {
      readonly send: (channel: string, state: StateSnapshot) => void;
    };
  };
  readonly setQrVisible: (visible: boolean) => void;
}

export interface LockController {
  readonly closeSettings: () => void;
  readonly completeSetup: () => void;
  readonly getState: () => StateSnapshot;
  readonly manualLock: () => void;
  readonly manualLoginComplete: () => void;
  readonly openSettings: () => void;
  readonly submitUnlock: (userId: unknown, code: unknown) => UnlockResponse;
}

export interface LockControllerOptions {
  readonly appVersion: string;
  readonly auditLogStore: AuditLogStore;
  readonly lockoutStateStore: LockoutStateStore;
  readonly repository: SettingsRepository;
  readonly shellWindow: LockControllerShellWindow;
  readonly unlockDurationOverrideSeconds?: number;
}

export const createLockController = (options: LockControllerOptions): LockController => {
  let state: GuardState = isFirstRunSettings(options.repository.load()) ? "needsSetup" : "locked";
  let currentUrlMatchesLoginPattern = false;
  let lockoutState: LockoutState = options.lockoutStateStore.load();
  let activeSession: UnlockSession | null = null;
  let unlockExpiresAtMs: number | null = null;
  let unlockTimer: ReturnType<typeof setTimeout> | null = null;

  const applyVisibility = (): boolean => {
    const visible = shouldShowQrView(state, currentUrlMatchesLoginPattern);

    options.shellWindow.setQrVisible(visible);

    return visible;
  };

  const getState = (): StateSnapshot => {
    const nowMs = Date.now();
    const remainingMs =
      unlockExpiresAtMs === null ? null : Math.max(0, unlockExpiresAtMs - nowMs);

    return {
      activeUserId: activeSession?.userId ?? null,
      now: new Date(nowMs).toISOString(),
      qrVisible: shouldShowQrView(state, currentUrlMatchesLoginPattern),
      remainingMs,
      state,
      unlockExpiresAt: unlockExpiresAtMs === null ? null : new Date(unlockExpiresAtMs).toISOString()
    };
  };

  const emitState = (): void => {
    options.shellWindow.controlView.webContents.send(IPC_CHANNELS.stateChanged, getState());
  };

  const setState = (nextState: GuardState): void => {
    state = nextState;
    applyVisibility();
    emitState();
  };

  const clearUnlockTimer = (): void => {
    if (unlockTimer === null) {
      return;
    }

    clearTimeout(unlockTimer);
    unlockTimer = null;
  };

  const finishUnlockSession = (reason: AuditLockReason, lockedAtMs: number): void => {
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
    unlockExpiresAtMs = null;
  };

  const relock = (reason: AuditLockReason): void => {
    clearUnlockTimer();
    finishUnlockSession(reason, Date.now());
    setState(reason === "timer" ? timerExpired(state) : manualLock(state));
  };

  const updateLastAuthenticatedAt = (
    settings: Settings,
    userId: string,
    authenticatedAtMs: number
  ): Settings => ({
    ...settings,
    users: settings.users.map((user) =>
      user.userId === userId
        ? { ...user, lastAuthenticatedAt: new Date(authenticatedAtMs).toISOString() }
        : user
    )
  });

  const startUnlockTimer = (durationSeconds: number): void => {
    clearUnlockTimer();
    unlockTimer = setTimeout(() => {
      relock("timer");
    }, durationSeconds * 1_000);
  };

  const submitUnlock = (rawUserId: unknown, rawCode: unknown): UnlockResponse => {
    const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const nowMs = Date.now();

    if (state !== "locked") {
      return {
        errors: ["Not in locked state."],
        ok: false,
        retryAfterMs: null
      };
    }

    if (userId.length === 0 || code.length === 0) {
      return {
        errors: ["User ID and code are required."],
        ok: false,
        retryAfterMs: null
      };
    }

    const decision = checkLockout(lockoutState, userId, nowMs);

    if (!decision.allowed) {
      return {
        errors: ["Too many failed attempts. Try again later."],
        ok: false,
        retryAfterMs: decision.retryAfterMs ?? null
      };
    }

    const settings = options.repository.load();
    const user = settings.users.find((candidate) => candidate.userId === userId);

    if (user === undefined || !verifyCode(code, user.salt, user.hash)) {
      return recordFailedUnlock(userId, nowMs, ["User ID or code is incorrect."]);
    }

    lockoutState = recordAuthSuccess(lockoutState, userId);
    options.lockoutStateStore.save(lockoutState);
    options.repository.save(updateLastAuthenticatedAt(settings, userId, nowMs));
    activeSession = { unlockedAtMs: nowMs, userId };
    const durationSeconds = getUnlockDurationSeconds(settings);
    unlockExpiresAtMs = nowMs + durationSeconds * 1_000;
    setState(unlockSucceeded(state));
    startUnlockTimer(durationSeconds);

    return {
      ok: true,
      state: getState()
    };
  };

  const recordFailedUnlock = (
    userId: string,
    nowMs: number,
    errors: readonly string[]
  ): UnlockResponse => {
    const result = recordAuthFailure(lockoutState, userId, nowMs);

    lockoutState = result.state;
    options.lockoutStateStore.save(lockoutState);

    return {
      errors,
      ok: false,
      retryAfterMs: result.decision.retryAfterMs ?? null
    };
  };

  const getUnlockDurationSeconds = (settings: Settings): number =>
    options.unlockDurationOverrideSeconds ?? settings.unlockDurationSeconds;

  applyVisibility();

  return {
    closeSettings: () => {
      clearUnlockTimer();
      setState(closeSettings(state));
    },
    completeSetup: () => {
      setState(completeSetup(state));
    },
    getState,
    manualLock: () => {
      relock("manual");
    },
    manualLoginComplete: () => {
      currentUrlMatchesLoginPattern = false;
      relock("manual");
    },
    openSettings: () => {
      const nextState = openSettings(state);

      if (nextState === "settings") {
        clearUnlockTimer();
        finishUnlockSession("manual", Date.now());
      }

      setState(nextState);
    },
    submitUnlock
  };
};
