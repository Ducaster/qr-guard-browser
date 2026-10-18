import type { AuditLockReason } from "../core/audit-log";
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
import { isQrBlankFallbackUrl, loadQrUrlOrBlank } from "./qr-url-loader";
import {
  watchQrNavigation,
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

interface ActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

// Mouse events go to the page body, not a screen point, so no link or button is pressed.
// A reload is avoided because some sites end the login session on reload.
// shortcut: script events are untrusted (isTrusted=false), switch to CDP Input.dispatchMouseEvent if a site ignores them.
export const QR_ACTIVITY_SCRIPT = `
(() => {
  const poke = (doc) => {
    const target = doc && (doc.body || doc.documentElement);
    if (!target) return;
    for (const type of ['mousemove', 'mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new doc.defaultView.MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }));
    }
    for (const frame of doc.querySelectorAll('iframe, frame')) {
      try { poke(frame.contentDocument); } catch (error) {}
    }
  };
  poke(document);
})();
`;

export interface LockController {
  readonly clearQrLoadFailure: () => void;
  readonly closeSettings: () => void;
  readonly completeSetup: () => void;
  readonly getState: () => StateSnapshot;
  readonly listUnlockRegions: () => readonly string[];
  readonly manualLock: () => void;
  readonly openSettings: () => void;
  readonly qrGoBack: () => void;
  readonly qrGoForward: () => void;
  readonly qrNavigateToUrl: (url: string) => Promise<ActionResponse>;
  readonly qrReload: () => void;
  readonly setQrLoadFailure: (failure: QrLoadFailure) => void;
  readonly submitSiteLogin: (code: unknown) => Promise<UnlockResponse>;
  readonly submitUnlock: (userId: unknown, code: unknown) => Promise<UnlockResponse>;
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
  readonly lockedActivityIntervalMs?: number;
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
  let syncModeTimers: (previousState: GuardState | null, nextState: GuardState) => void = () => undefined;

  const applyVisibility = (): boolean => {
    const visible = shouldShowQrView(state);

    options.shellWindow.setQrVisible(visible);

    return visible;
  };

  const isLocked = (): boolean => state === "locked";

  const getState = (): StateSnapshot => {
    const nowMs = Date.now();
    const remainingMs =
      unlockExpiresAtMs === null ? null : Math.max(0, unlockExpiresAtMs - nowMs);

    return {
      activeUserId: auditSessions.getActiveUserId(),
      canGoBack: options.qrWebContents.navigationHistory.canGoBack(),
      canGoForward: options.qrWebContents.navigationHistory.canGoForward(),
      currentUrl: options.qrWebContents.getURL(),
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
    pokeQr: () => {
      if (!isQrBlankFallbackUrl(options.qrWebContents.getURL())) {
        // A failed poke (page mid-navigation) is retried on the next tick.
        options.qrWebContents.executeJavaScript(QR_ACTIVITY_SCRIPT).catch(() => undefined);
      }
    },
    relock,
    setState,
    timers,
    ...(options.idlePollIntervalMs === undefined ? {} : { idlePollIntervalMs: options.idlePollIntervalMs }),
    ...(options.idleSource === undefined ? {} : { idleSource: options.idleSource }),
    ...(options.lockedActivityIntervalMs === undefined ? {} : { lockedActivityIntervalMs: options.lockedActivityIntervalMs }),
    ...(options.siteLoginTimeoutOverrideMs === undefined ? {} : { siteLoginTimeoutOverrideMs: options.siteLoginTimeoutOverrideMs })
  }).sync;
  syncModeTimers(null, state);

  const handleQrNavigation = (): void => {
    emitState();
  };

  watchQrNavigation(options.qrWebContents, handleQrNavigation);

  const submitUnlock = async (rawUserId: unknown, rawCode: unknown): Promise<UnlockResponse> => {
    const nowMs = Date.now();

    if (!isLocked()) {
      return notLockedResponse();
    }

    const authResult = await authenticator.authenticateQrAccess(rawUserId, rawCode, nowMs);

    if (!isLocked()) {
      return notLockedResponse();
    }

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

  const submitSiteLogin = async (rawCode: unknown): Promise<UnlockResponse> => {
    const nowMs = Date.now();

    if (!isLocked()) {
      return notLockedResponse();
    }

    const authResult = await authenticator.authenticateAdminSiteLogin(rawCode, nowMs);

    if (!isLocked()) {
      return notLockedResponse();
    }

    if (authResult.kind === "failure") {
      return authResult.response;
    }

    auditSessions.beginUnlockSession(authResult.userId, nowMs);
    unlockExpiresAtMs = null;
    setState(enterSiteLogin(state));

    return {
      ok: true,
      state: getState()
    };
  };

  const listUnlockRegions = (): readonly string[] => {
    if (state !== "locked") {
      // Unlock regions are only meaningful while rendering the lock screen.
      return [];
    }

    const settings = loadSettingsForMainEvent(options.repository, "unlock region list");

    if (settings === null) {
      return [];
    }

    return settings.users.map((user) => user.userId);
  };

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
    },
    getState,
    listUnlockRegions,
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
    qrGoBack: () => {
      if (options.qrWebContents.navigationHistory.canGoBack()) {
        options.qrWebContents.navigationHistory.goBack();
      }
    },
    qrGoForward: () => {
      if (options.qrWebContents.navigationHistory.canGoForward()) {
        options.qrWebContents.navigationHistory.goForward();
      }
    },
    qrNavigateToUrl: async (url: string): Promise<ActionResponse> => {
      await loadQrUrlOrBlank(options.qrWebContents, url);

      return { ok: true };
    },
    qrReload: () => {
      options.qrWebContents.reload();
    },
    setQrLoadFailure: (failure: QrLoadFailure) => {
      qrLoadFailure = failure;
      emitState();
    },
    submitSiteLogin,
    submitUnlock
  };
};
