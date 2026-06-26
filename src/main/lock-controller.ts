import type { AuditLockReason } from "../core/audit-log";
import { matchesQrTitle } from "../core/qr-title-detector";
import {
  closeSettings,
  completeSetup,
  enterSiteLogin,
  openSettings,
  relockState,
  shouldShowQrView,
  unlockSucceeded,
  type GuardState,
  type QrLoadFailure,
  type StateSnapshot,
  type UnlockResponse
} from "../core/state-machine";
import { IPC_CHANNELS } from "../core/shell-config";
import type { Settings, SettingsRepository } from "../core/settings-repo";
import { isFirstRunSettings } from "../core/settings-validation";
import { createAuditSessionTracker } from "./audit-session-tracker";
import { createLockAuthenticator } from "./lock-authenticator";
import { createLockModeLifecycle } from "./lock-mode-lifecycle";
import { createLockTimers } from "./lock-timers";
import { notLockedResponse } from "./qr-access-auth";
import { learnQrTitleFromCurrentPage, type ActionResponse } from "./qr-title-learning";
import {
  readQrNavigationSnapshot,
  watchQrNavigation,
  type QrNavigationTarget,
  type QrWebContentsLike
} from "./qr-navigation-watcher";
import { loadSettingsForMainEvent } from "./settings-load-failsafe";
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
  readonly clearQrLoadFailure: () => void;
  readonly closeSettings: () => void;
  readonly completeSetup: () => void;
  readonly getState: () => StateSnapshot;
  readonly learnCurrentQrTitle: () => ActionResponse;
  readonly manualLock: () => void;
  readonly openSettings: () => void;
  readonly setQrLoadFailure: (failure: QrLoadFailure) => void;
  readonly submitSiteLogin: (code: unknown) => UnlockResponse;
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
  readonly siteLoginTimeoutOverrideMs?: number;
  readonly unlockDurationOverrideSeconds?: number;
}

export const createLockController = (options: LockControllerOptions): LockController => {
  let state: GuardState = isFirstRunSettings(options.repository.load()) ? "needsSetup" : "locked";
  let unlockExpiresAtMs: number | null = null;
  let qrLoadFailure: QrLoadFailure | null = null;
  const authenticator = createLockAuthenticator({
    lockoutStateStore: options.lockoutStateStore,
    repository: options.repository
  });
  const auditSessions = createAuditSessionTracker({
    appVersion: options.appVersion,
    auditLogStore: options.auditLogStore
  });
  const timers = createLockTimers();
  let syncModeTimers: (previousState: GuardState, nextState: GuardState) => void = () => undefined;

  const applyVisibility = (): boolean => {
    const visible = shouldShowQrView(state);

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
      qrLoadFailure,
      qrVisible: shouldShowQrView(state),
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
    timers.clearSiteLoginTimer();
    auditSessions.finishUnlockSession(reason, Date.now());
    unlockExpiresAtMs = null;
    setState(relockState(state));
  };

  syncModeTimers = createLockModeLifecycle({
    auditSessions,
    getState: () => state,
    loadSettings: () => options.repository.load(),
    relock,
    setState,
    timers,
    ...(options.idlePollIntervalMs === undefined ? {} : { idlePollIntervalMs: options.idlePollIntervalMs }),
    ...(options.idleSource === undefined ? {} : { idleSource: options.idleSource }),
    ...(options.siteLoginTimeoutOverrideMs === undefined ? {} : { siteLoginTimeoutOverrideMs: options.siteLoginTimeoutOverrideMs })
  }).sync;

  const evaluateQrNavigation = (target?: QrNavigationTarget): void => {
    if (state !== "siteLogin") {
      return;
    }

    const settings = loadSettingsForMainEvent(options.repository, "QR navigation");

    if (settings === null) { relock("manual"); return; }

    const snapshot = readQrNavigationSnapshot(options.qrWebContents, target);

    if (matchesQrTitle(snapshot.title, settings.qrTitlePattern)) {
      relock("qr-title");
    }
  };

  watchQrNavigation(options.qrWebContents, evaluateQrNavigation);

  const submitUnlock = (rawUserId: unknown, rawCode: unknown): UnlockResponse => {
    const nowMs = Date.now();

    if (state !== "locked") {
      return notLockedResponse();
    }

    const authResult = authenticator.authenticateQrAccess(rawUserId, rawCode, nowMs);

    if (authResult.kind === "failure") {
      return authResult.response;
    }

    auditSessions.beginUnlockSession(authResult.userId, nowMs);
    const durationSeconds = getUnlockDurationSeconds(authResult.settings);
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

  const submitSiteLogin = (rawCode: unknown): UnlockResponse => {
    const nowMs = Date.now();

    if (state !== "locked") {
      return notLockedResponse();
    }

    const authResult = authenticator.authenticateAdminSiteLogin(rawCode, nowMs);

    if (authResult.kind === "failure") {
      return authResult.response;
    }

    if (matchesQrTitle(options.qrWebContents.getTitle(), authResult.settings.qrTitlePattern)) {
      return {
        ok: true,
        state: getState()
      };
    }

    auditSessions.beginUnlockSession(authResult.userId, nowMs);
    unlockExpiresAtMs = null;
    const nextState = enterSiteLogin(state);
    setState(nextState);
    if (nextState === "siteLogin" && matchesQrTitle(options.qrWebContents.getTitle(), authResult.settings.qrTitlePattern)) {
      relock("qr-title");
    }

    return {
      ok: true,
      state: getState()
    };
  };

  const learnCurrentQrTitle = (): ActionResponse =>
    learnQrTitleFromCurrentPage({
      qrWebContents: options.qrWebContents,
      relock,
      repository: options.repository,
      state
    });

  const getUnlockDurationSeconds = (settings: Settings): number =>
    options.unlockDurationOverrideSeconds ?? settings.unlockDurationSeconds;

  applyVisibility();

  return {
    clearQrLoadFailure: () => {
      if (qrLoadFailure === null) {
        return;
      }

      qrLoadFailure = null;
      emitState();
    },
    closeSettings: () => {
      timers.clearUnlockTimer();
      setState(closeSettings(state));
    },
    completeSetup: () => {
      setState(completeSetup(state));
      evaluateQrNavigation();
    },
    getState,
    learnCurrentQrTitle,
    manualLock: () => {
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
    setQrLoadFailure: (failure: QrLoadFailure) => {
      qrLoadFailure = failure;
      emitState();
    },
    submitSiteLogin,
    submitUnlock
  };
};
