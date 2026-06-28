import { afterEach, describe, expect, it, vi } from "vitest";

import { createLockoutState, hashCode, type LockoutState } from "../core/auth";
import {
  parseAuditLog,
  toJsonl,
  type AuditEvent,
  type AuditLogFilter,
  type AuditLogReadResult
} from "../core/audit-log";
import {
  createDefaultSettings,
  type Settings,
  type SettingsRepository
} from "../core/settings-repo";
import type { StateSnapshot } from "../core/state-machine";
import { createLockController, type LockControllerOptions } from "./lock-controller";
import type { AuditLogStore, LockoutStateStore } from "./settings-adapters";

class MemorySettingsRepository implements SettingsRepository {
  loadError: Error | null = null;
  readonly savedSettings: Settings[] = [];

  constructor(private settings: Settings) {}

  load(): Settings {
    if (this.loadError !== null) {
      throw this.loadError;
    }

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
  readonly repository: MemorySettingsRepository;
  readonly sentStates: readonly StateSnapshot[];
  readonly visibilityChanges: readonly boolean[];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("lock controller unlock submission", () => {
  it("lists only unlock region names without credential secrets", () => {
    // Given
    const staff01 = hashCode("2468");
    const staff02 = hashCode("1357");
    const defaults = createDefaultSettings();
    const harness = createHarness({
      settings: {
        ...defaults,
        admin: hashCode("admin-code"),
        users: [
          {
            ...staff01,
            lastAuthenticatedAt: "2026-06-22T00:00:00.000Z",
            userId: "staff01"
          },
          {
            ...staff02,
            lastAuthenticatedAt: null,
            userId: "staff02"
          }
        ]
      }
    });

    // When
    const regions = harness.controller.listUnlockRegions();

    // Then
    expect(regions).toEqual(["staff01", "staff02"]);
    expect(regions).not.toContain(staff01.hash);
    expect(regions).not.toContain(staff01.salt);
    expect(regions).not.toContain(staff02.hash);
    expect(regions).not.toContain(staff02.salt);
  });

  it("returns no unlock regions when settings cannot load", () => {
    // Given
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const harness = createHarness();
    harness.repository.loadError = new Error("corrupted settings");

    // When
    const regions = harness.controller.listUnlockRegions();

    // Then
    expect(regions).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load settings during unlock region list")
    );
  });

  it("lists unlock regions only while locked", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({
      unlockDurationOverrideSeconds: 60
    });
    const firstRunSettings = {
      ...createSettingsWithUser(),
      admin: createDefaultSettings().admin
    };
    const setupHarness = createHarness({ settings: firstRunSettings });

    // When
    const lockedRegions = harness.controller.listUnlockRegions();
    const unlock = harness.controller.submitUnlock("staff01", "2468");
    const unlockedRegions = harness.controller.listUnlockRegions();
    const needsSetupRegions = setupHarness.controller.listUnlockRegions();

    // Then
    expect(lockedRegions).toEqual(["staff01"]);
    expect(unlock.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("unlocked");
    expect(unlockedRegions).toEqual([]);
    expect(setupHarness.controller.getState().state).toBe("needsSetup");
    expect(needsSetupRegions).toEqual([]);
  });

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
      errors: ["현재 잠긴 상태가 아닙니다."],
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
      errors: ["지역과 인증 코드가 필요합니다."],
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

describe("lock controller QR navigation and idle safety", () => {
  it("keeps QR load failures informational without changing the lock gate", () => {
    // Given
    const harness = createHarness();
    const failure = {
      errorCode: -105,
      errorDescription: "ERR_NAME_NOT_RESOLVED",
      url: "https://bad.example/login"
    };

    // When
    harness.controller.setQrLoadFailure(failure);
    const failedState = harness.controller.getState();
    harness.controller.clearQrLoadFailure();
    const clearedState = harness.controller.getState();

    // Then
    expect(failedState.state).toBe("locked");
    expect(failedState.qrVisible).toBe(false);
    expect(failedState.qrLoadFailure).toEqual(failure);
    expect(clearedState.qrLoadFailure).toBeNull();
    expect(harness.visibilityChanges.at(-1)).toBe(false);
  });

  it("keeps QR locked when the hidden QR page navigates to a login URL", () => {
    // Given
    const harness = createHarness({
      qrTitle: "Fixture Login",
      qrUrl: "https://example.test/login"
    });

    // When
    harness.qrWebContents.trigger("did-navigate");

    // Then
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.visibilityChanges.at(-1)).toBe(false);
    expect(harness.auditLogStore.events).toEqual([]);
  });

  it("keeps an unlocked authenticated session open across login URL navigation", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({
      unlockDurationOverrideSeconds: 60
    });
    const unlock = harness.controller.submitUnlock("staff01", "2468");

    // When
    harness.qrWebContents.setLocation("https://example.test/login", "Fixture Login");
    harness.qrWebContents.trigger("did-start-navigation", {
      url: "https://example.test/login"
    });

    // Then
    expect(unlock.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("unlocked");
    expect(harness.controller.getState().qrVisible).toBe(true);
    expect(harness.auditLogStore.events).toEqual([]);
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
  readonly qrTitle?: string;
  readonly qrUrl?: string;
  readonly settings?: Settings;
  readonly unlockDurationOverrideSeconds?: number | (() => number);
} = {}): ControllerHarness => {
  const settingsOverrides = {
    ...(options.idleAutoLockSeconds === undefined
      ? {}
      : { idleAutoLockSeconds: options.idleAutoLockSeconds })
  };
  const repository = new MemorySettingsRepository(options.settings ?? createSettingsWithUser(settingsOverrides));
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
    qrWebContents
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
    repository,
    sentStates,
    visibilityChanges
  };
};

const createSettingsWithUser = (
  overrides: {
    readonly idleAutoLockSeconds?: number;
  } = {}
): Settings => {
  const admin = hashCode("admin-code");
  const user = hashCode("2468");
  const defaults = createDefaultSettings();

  return {
    ...defaults,
    admin,
    idleAutoLockSeconds: overrides.idleAutoLockSeconds ?? defaults.idleAutoLockSeconds,
    users: [
      {
        ...user,
        lastAuthenticatedAt: null,
        userId: "staff01"
      }
    ]
  };
};
