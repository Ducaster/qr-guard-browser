import { afterEach, describe, expect, it, vi } from "vitest";

import { createLockoutState, hashCode, type LockoutState } from "../core/auth";
import type { AuditEvent } from "../core/audit-log";
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

  read(): readonly AuditEvent[] {
    return this.events;
  }
}

interface ControllerHarness {
  readonly auditLogStore: MemoryAuditLogStore;
  readonly controller: ReturnType<typeof createLockController>;
  readonly lockoutStateStore: MemoryLockoutStateStore;
  readonly sentStates: readonly StateSnapshot[];
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

const createHarness = (options: {
  readonly unlockDurationOverrideSeconds?: number | (() => number);
} = {}): ControllerHarness => {
  const repository = new MemorySettingsRepository(createSettingsWithUser());
  const lockoutStateStore = new MemoryLockoutStateStore();
  const auditLogStore = new MemoryAuditLogStore();
  const sentStates: StateSnapshot[] = [];
  const visibilityChanges: boolean[] = [];
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
    }
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
    sentStates
  };
};

const createSettingsWithUser = (): Settings => {
  const admin = hashCode("admin-code");
  const user = hashCode("2468");

  return {
    ...createDefaultSettings(),
    admin,
    users: [
      {
        ...user,
        lastAuthenticatedAt: null,
        userId: "staff01"
      }
    ]
  };
};
