import { afterEach, describe, expect, it, vi } from "vitest";

import { createLockoutState, hashCode, type LockoutState } from "../core/auth";
import {
  parseAuditLog,
  toJsonl,
  type AuditEvent,
  type AuditLogFilter,
  type AuditLogReadResult
} from "../core/audit-log";
import { createDefaultSettings, type Settings, type SettingsRepository } from "../core/settings-repo";
import type { StateSnapshot } from "../core/state-machine";
import { createLockController, type LockControllerOptions } from "./lock-controller";
import type { AuditLogStore, LockoutStateStore } from "./settings-adapters";

class MemorySettingsRepository implements SettingsRepository {
  readonly savedSettings: Settings[] = [];

  constructor(private settings: Settings) {}

  load(): Settings {
    return this.settings;
  }

  save(settings: Settings): void {
    this.settings = settings;
    this.savedSettings.push(settings);
  }
}

class MemoryLockoutStateStore implements LockoutStateStore {
  saveCount = 0;

  constructor(private state: LockoutState = createLockoutState()) {}

  load(): LockoutState {
    return this.state;
  }

  save(state: LockoutState): void {
    this.state = state;
    this.saveCount += 1;
  }
}

class MemoryAuditLogStore implements AuditLogStore {
  readonly events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(event);
  }

  read(filter?: AuditLogFilter): AuditLogReadResult {
    return parseAuditLog(toJsonl(this.events), filter);
  }
}

interface ControllerHarness {
  readonly auditLogStore: MemoryAuditLogStore;
  readonly controller: ReturnType<typeof createLockController>;
  readonly lockoutStateStore: MemoryLockoutStateStore;
  readonly qrWebContents: FakeQrWebContents;
  readonly sentStates: readonly StateSnapshot[];
  readonly visibilityChanges: readonly boolean[];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("lock controller unlock submission", () => {
  it("does not record auth failure when unlock is submitted outside locked state", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({ unlockDurationOverrideSeconds: 60 });
    const unlock = harness.controller.submitUnlock("staff01", "2468");
    const saveCountAfterUnlock = harness.lockoutStateStore.saveCount;

    // When
    const result = harness.controller.submitUnlock("staff01", "wrong-code");

    // Then
    expect(unlock.ok).toBe(true);
    expect(result).toEqual({
      errors: ["Not in locked state."],
      ok: false,
      retryAfterMs: null
    });
    expect(harness.lockoutStateStore.saveCount).toBe(saveCountAfterUnlock);
  });

  it("does not record auth failure for missing unlock input", () => {
    // Given
    const harness = createHarness();

    // When
    const result = harness.controller.submitUnlock("staff01", "");

    // Then
    expect(result).toEqual({
      errors: ["User ID and code are required."],
      ok: false,
      retryAfterMs: null
    });
    expect(harness.lockoutStateStore.saveCount).toBe(0);
  });

  it("uses one computed unlock duration for countdown and relock timer", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    let overrideReadCount = 0;
    const harness = createHarness({
      unlockDurationOverrideSeconds: () => {
        overrideReadCount += 1;

        return overrideReadCount === 1 ? 5 : 10;
      }
    });

    // When
    const result = harness.controller.submitUnlock("staff01", "2468");
    vi.advanceTimersByTime(5_000);

    // Then
    expect(result.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("locked");
  });
});

describe("lock controller loginMode and idle safety", () => {
  it("enters loginMode from locked when QR navigation is classified as login", () => {
    // Given
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      qrTitle: "Fixture Login",
      qrUrl: "https://example.test/login"
    });

    // When
    harness.qrWebContents.trigger("did-navigate");

    // Then
    expect(harness.controller.getState().state).toBe("loginMode");
    expect(harness.controller.getState().qrVisible).toBe(true);
    expect(harness.visibilityChanges.at(-1)).toBe(true);
  });

  it("relocks loginMode immediately when QR navigation leaves the login URL pattern", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      qrUrl: "https://example.test/login"
    });
    harness.qrWebContents.trigger("did-navigate");

    // When
    vi.setSystemTime(new Date("2026-06-22T00:00:03.000Z"));
    harness.qrWebContents.setLocation("https://example.test/qr", "Fixture QR");
    harness.qrWebContents.trigger("did-navigate");

    // Then
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.auditLogStore.events).toEqual([
      expect.objectContaining({
        durationSeconds: 3,
        reason: "login-mode",
        userId: "login-mode"
      })
    ]);
  });

  it("relocks loginMode on navigation start using the target URL before commit", () => {
    // Given
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      qrUrl: "https://example.test/login"
    });
    harness.qrWebContents.trigger("did-navigate");

    // When
    harness.qrWebContents.trigger("did-start-navigation", {
      url: "https://example.test/qr"
    });

    // Then
    expect(harness.qrWebContents.getURL()).toBe("https://example.test/login");
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
  });

  it("enters loginMode on navigation start using the target login URL before commit", () => {
    // Given
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      qrUrl: "https://example.test/qr"
    });

    // When
    harness.qrWebContents.trigger("did-start-navigation", {
      url: "https://example.test/login"
    });

    // Then
    expect(harness.qrWebContents.getURL()).toBe("https://example.test/qr");
    expect(harness.controller.getState().state).toBe("loginMode");
    expect(harness.controller.getState().qrVisible).toBe(true);
  });

  it("manual login completion relocks loginMode without waiting for navigation", () => {
    // Given
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      qrUrl: "https://example.test/login"
    });
    harness.qrWebContents.trigger("did-navigate");

    // When
    harness.controller.manualLoginComplete();

    // Then
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.auditLogStore.events.at(-1)?.reason).toBe("login-mode");
  });

  it("finishes the active unlock session before entering loginMode from QR navigation", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "/qr",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      loginModeTimeoutOverrideMs: 120_000,
      unlockDurationOverrideSeconds: 60
    });
    const unlock = harness.controller.submitUnlock("staff01", "2468");

    // When
    vi.setSystemTime(new Date("2026-06-22T00:00:05.000Z"));
    harness.qrWebContents.setLocation("https://example.test/login", "Fixture Login");
    harness.qrWebContents.trigger("did-navigate");
    vi.advanceTimersByTime(60_000);

    // Then
    expect(unlock.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("loginMode");
    expect(harness.controller.getState().remainingMs).toBeNull();
    expect(harness.controller.getState().qrVisible).toBe(true);
    expect(harness.auditLogStore.events).toEqual([
      expect.objectContaining({
        durationSeconds: 5,
        reason: "login-mode",
        userId: "staff01"
      })
    ]);
  });

  it("heartbeat timeout relocks loginMode when login never completes", () => {
    // Given
    vi.useFakeTimers();
    const harness = createHarness({
      loginDetection: {
        loggedInUrlPattern: "",
        loginUrlPattern: "/login",
        titleContains: ""
      },
      loginModeTimeoutOverrideMs: 1_000,
      qrUrl: "https://example.test/login"
    });
    harness.qrWebContents.trigger("did-navigate");

    // When
    vi.advanceTimersByTime(1_000);

    // Then
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.auditLogStore.events.at(-1)?.reason).toBe("login-mode");
  });

  it("idle polling relocks an unlocked session with reason idle", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({
      idlePollIntervalMs: 100,
      idleSource: () => 5,
      idleAutoLockSeconds: 5,
      unlockDurationOverrideSeconds: 60
    });
    const unlock = harness.controller.submitUnlock("staff01", "2468");

    // When
    vi.advanceTimersByTime(100);

    // Then
    expect(unlock.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.auditLogStore.events.at(-1)?.reason).toBe("idle");
  });
});

type QrNavigationEvent =
  | "did-navigate"
  | "did-navigate-in-page"
  | "did-redirect-navigation"
  | "did-start-navigation"
  | "page-title-updated";

interface FakeQrNavigationTarget {
  readonly url: string;
}

class FakeQrWebContents {
  private readonly listeners = new Map<QrNavigationEvent, ((details?: FakeQrNavigationTarget) => void)[]>();

  constructor(
    private url: string,
    private title: string
  ) {}

  getTitle(): string {
    return this.title;
  }

  getURL(): string {
    return this.url;
  }

  on(event: QrNavigationEvent, listener: (details?: FakeQrNavigationTarget) => void): void {
    const listeners = this.listeners.get(event) ?? [];

    this.listeners.set(event, [...listeners, listener]);
  }

  setLocation(url: string, title: string): void {
    this.url = url;
    this.title = title;
  }

  trigger(event: QrNavigationEvent, details?: FakeQrNavigationTarget): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(details);
    }
  }
}

const createHarness = (options: {
  readonly idleAutoLockSeconds?: number;
  readonly idlePollIntervalMs?: number;
  readonly idleSource?: () => number;
  readonly loginDetection?: Settings["loginDetection"];
  readonly loginModeTimeoutOverrideMs?: number;
  readonly qrTitle?: string;
  readonly qrUrl?: string;
  readonly unlockDurationOverrideSeconds?: number | (() => number);
} = {}): ControllerHarness => {
  const settingsOverrides = {
    ...(options.idleAutoLockSeconds === undefined
      ? {}
      : { idleAutoLockSeconds: options.idleAutoLockSeconds }),
    ...(options.loginDetection === undefined ? {} : { loginDetection: options.loginDetection })
  };
  const repository = new MemorySettingsRepository(createSettingsWithUser(settingsOverrides));
  const lockoutStateStore = new MemoryLockoutStateStore();
  const auditLogStore = new MemoryAuditLogStore();
  const sentStates: StateSnapshot[] = [];
  const visibilityChanges: boolean[] = [];
  const qrWebContents = new FakeQrWebContents(
    options.qrUrl ?? "https://example.test/qr",
    options.qrTitle ?? "Fixture QR"
  );
  const overrideSeconds = options.unlockDurationOverrideSeconds;
  const baseOptions = {
    appVersion: "test-version",
    auditLogStore,
    lockoutStateStore,
    repository,
    shellWindow: {
      controlView: {
        webContents: {
          send: (_channel: string, state: StateSnapshot): void => {
            sentStates.push(state);
          }
        }
      },
      setQrVisible: (visible: boolean): void => {
        visibilityChanges.push(visible);
      }
    },
    ...(options.idlePollIntervalMs === undefined
      ? {}
      : { idlePollIntervalMs: options.idlePollIntervalMs }),
    ...(options.idleSource === undefined ? {} : { idleSource: options.idleSource }),
    qrWebContents,
    ...(options.loginModeTimeoutOverrideMs === undefined
      ? {}
      : { loginModeTimeoutOverrideMs: options.loginModeTimeoutOverrideMs })
  } satisfies Omit<LockControllerOptions, "unlockDurationOverrideSeconds">;

  const controllerOptions =
    typeof overrideSeconds === "function"
      ? {
          ...baseOptions,
          get unlockDurationOverrideSeconds(): number {
            return overrideSeconds();
          }
        }
      : overrideSeconds === undefined
        ? baseOptions
        : {
            ...baseOptions,
            unlockDurationOverrideSeconds: overrideSeconds
          };

  return {
    auditLogStore,
    controller: createLockController(controllerOptions),
    lockoutStateStore,
    qrWebContents,
    sentStates,
    visibilityChanges
  };
};

const createSettingsWithUser = (
  overrides: {
    readonly idleAutoLockSeconds?: number;
    readonly loginDetection?: Settings["loginDetection"];
  } = {}
): Settings => {
  const admin = hashCode("admin-code");
  const user = hashCode("2468");
  const defaults = createDefaultSettings();

  return {
    ...defaults,
    admin,
    idleAutoLockSeconds: overrides.idleAutoLockSeconds ?? defaults.idleAutoLockSeconds,
    loginDetection: overrides.loginDetection ?? defaults.loginDetection,
    users: [
      {
        ...user,
        lastAuthenticatedAt: null,
        userId: "staff01"
      }
    ]
  };
};
