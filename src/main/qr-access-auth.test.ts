import { describe, expect, it } from "vitest";

import { createLockoutState, hashCode, type LockoutState } from "../core/auth";
import { createDefaultSettings, type Settings, type SettingsRepository } from "../core/settings-repo";
import {
  ADMIN_LOCKOUT_KEY,
  authenticateAdminCode,
  authenticateAdminSiteLogin
} from "./qr-access-auth";
import type { LockoutStateStore } from "./settings-adapters";

class MemorySettingsRepository implements SettingsRepository {
  constructor(private readonly settings: Settings) {}

  load(): Settings {
    return this.settings;
  }

  save(_settings: Settings): void {
    return;
  }
}

class MemoryLockoutStateStore implements LockoutStateStore {
  constructor(private state: LockoutState = createLockoutState()) {}

  load(): LockoutState {
    return this.state;
  }

  save(state: LockoutState): void {
    this.state = state;
  }
}

describe("admin code lockout", () => {
  it("shares one persistent admin lockout key across settings and site-login checks", () => {
    // Given
    const repository = new MemorySettingsRepository(createSettings());
    const lockoutStateStore = new MemoryLockoutStateStore();
    const nowMs = Date.parse("2026-06-26T00:00:00.000Z");

    // When
    authenticateAdminCode({ lockoutStateStore, nowMs, rawCode: "bad-1", repository });
    authenticateAdminCode({ lockoutStateStore, nowMs, rawCode: "bad-2", repository });
    const lockedSettingsResult = authenticateAdminCode({
      lockoutStateStore,
      nowMs,
      rawCode: "bad-3",
      repository
    });
    const validSiteLoginWhileLocked = authenticateAdminSiteLogin({
      lockoutStateStore,
      nowMs,
      rawCode: "admin-code",
      repository
    });
    const lockedEntry = lockoutStateStore.load().entries[ADMIN_LOCKOUT_KEY];
    lockoutStateStore.save(createLockoutState());
    const validAfterReset = authenticateAdminCode({
      lockoutStateStore,
      nowMs,
      rawCode: "admin-code",
      repository
    });

    // Then
    expect(lockedSettingsResult.kind).toBe("failure");
    expect(lockedEntry?.consecutiveFailures).toBe(3);
    expect(validSiteLoginWhileLocked.kind).toBe("failure");
    if (validSiteLoginWhileLocked.kind !== "failure") {
      throw new Error("Expected site login to be locked out.");
    }
    expect(
      validSiteLoginWhileLocked.lockoutState.entries[ADMIN_LOCKOUT_KEY]?.consecutiveFailures
    ).toBe(3);
    expect(validSiteLoginWhileLocked.response).toEqual({
      errors: ["실패 횟수가 너무 많습니다. 잠시 후 다시 시도하세요."],
      ok: false,
      retryAfterMs: 31_000
    });
    expect(validAfterReset.kind).toBe("success");
    expect(lockoutStateStore.load().entries[ADMIN_LOCKOUT_KEY]).toBeUndefined();
  });
});

const createSettings = (): Settings => ({
  ...createDefaultSettings(),
  admin: hashCode("admin-code")
});
