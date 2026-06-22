import {
  checkLockout,
  recordAuthFailure,
  recordAuthSuccess,
  verifyCode,
  type LockoutState
} from "../core/auth";
import type { AuditLockReason } from "../core/audit-log";
import { shouldRelockForIdle } from "../core/idle-lock";
import { classify, matchesLoginUrl } from "../core/login-detector";
import {
  applyLoginDetection,
  closeSettings,
  completeSetup,
  exitLoginMode,
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
import { updateLastAuthenticatedAt } from "../core/user-settings";
import { createAuditSessionTracker } from "./audit-session-tracker";
import { createLockTimers } from "./lock-timers";
import {
  readQrNavigationSnapshot,
  watchQrNavigation,
  type QrWebContentsLike
} from "./qr-navigation-watcher";
import type { AuditLogStore, LockoutStateStore } from "./settings-adapters";

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
  readonly qrWebContents: QrWebContentsLike;
  readonly repository: SettingsRepository;
  readonly shellWindow: LockControllerShellWindow;
  readonly idlePollIntervalMs?: number;
  readonly idleSource?: () => number;
  readonly loginModeTimeoutOverrideMs?: number;
  readonly unlockDurationOverrideSeconds?: number;
}

const DEFAULT_LOGIN_MODE_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_IDLE_POLL_INTERVAL_MS = 1_000;

export const createLockController = (options: LockControllerOptions): LockController => {
  let state: GuardState = isFirstRunSettings(options.repository.load()) ? "needsSetup" : "locked";
  let currentUrlMatchesLoginPattern = false;
  let lockoutState: LockoutState = options.lockoutStateStore.load();
  let unlockExpiresAtMs: number | null = null;
  const auditSessions = createAuditSessionTracker({
    appVersion: options.appVersion,
    auditLogStore: options.auditLogStore
  });
  const timers = createLockTimers();

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
      activeUserId: auditSessions.getActiveUserId(),
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
    const previousState = state;

    state = nextState;
    syncModeTimers(previousState, nextState);
    applyVisibility();
    emitState();
  };

  const relock = (reason: AuditLockReason): void => {
    timers.clearUnlockTimer();
    timers.clearIdleTimer();
    auditSessions.finishUnlockSession(reason, Date.now());
    unlockExpiresAtMs = null;
    setState(reason === "timer" ? timerExpired(state) : manualLock(state));
  };

  const startLoginModeTimer = (): void => {
    timers.startLoginModeTimer(options.loginModeTimeoutOverrideMs ?? DEFAULT_LOGIN_MODE_TIMEOUT_MS, () => {
      setState(exitLoginMode(state));
    });
  };

  const startIdleTimer = (): void => {
    timers.startIdleTimer(options.idlePollIntervalMs ?? DEFAULT_IDLE_POLL_INTERVAL_MS, () => {
      const settings = options.repository.load();
      const idleSource = options.idleSource ?? (() => 0);

      if (
        shouldRelockForIdle({
          idleAutoLockSeconds: settings.idleAutoLockSeconds,
          state,
          systemIdleSeconds: idleSource()
        })
      ) {
        relock("idle");
      }
    });
  };

  const syncModeTimers = (previousState: GuardState, nextState: GuardState): void => {
    if (previousState !== "loginMode" && nextState === "loginMode") {
      auditSessions.beginLoginModeSession(Date.now());
      startLoginModeTimer();
    }

    if (previousState === "loginMode" && nextState !== "loginMode") {
      timers.clearLoginModeTimer();
      auditSessions.finishLoginModeSession(Date.now());
    }

    if (previousState !== "unlocked" && nextState === "unlocked") {
      startIdleTimer();
    }

    if (previousState === "unlocked" && nextState !== "unlocked") {
      timers.clearIdleTimer();
    }
  };

  const evaluateQrNavigation = (): void => {
    const settings = options.repository.load();
    const snapshot = readQrNavigationSnapshot(options.qrWebContents);
    const classification = classify(snapshot.url, snapshot.title, settings.loginDetection);

    currentUrlMatchesLoginPattern = matchesLoginUrl(snapshot.url, settings.loginDetection);
    const nextState = applyLoginDetection(state, classification, currentUrlMatchesLoginPattern);

    if (state === "unlocked" && nextState === "loginMode") {
      timers.clearUnlockTimer();
      auditSessions.finishUnlockSession("login-mode", Date.now());
      unlockExpiresAtMs = null;
    }

    setState(nextState);
  };

  watchQrNavigation(options.qrWebContents, evaluateQrNavigation);

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
    auditSessions.beginUnlockSession(userId, nowMs);
    const durationSeconds = getUnlockDurationSeconds(settings);
    unlockExpiresAtMs = nowMs + durationSeconds * 1_000;
    setState(unlockSucceeded(state));
    timers.startUnlockTimer(durationSeconds, () => {
      relock("timer");
    });

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
      timers.clearUnlockTimer();
      setState(closeSettings(state));
    },
    completeSetup: () => {
      setState(completeSetup(state));
      evaluateQrNavigation();
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
        timers.clearUnlockTimer();
        auditSessions.finishUnlockSession("manual", Date.now());
        unlockExpiresAtMs = null;
      }

      setState(nextState);
    },
    submitUnlock
  };
};
