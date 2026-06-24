import { describe, expect, it } from "vitest";

import {
  closeSettings,
  completeSetup,
  enterSiteLogin,
  manualLock,
  openSettings,
  relockState,
  shouldShowQrView,
  timerExpired,
  unlockSucceeded,
  type VisibilityState
} from "./state-machine";

describe("QR visibility gate", () => {
  it.each([
    { expected: false, state: "needsSetup" },
    { expected: false, state: "locked" },
    { expected: true, state: "unlocked" },
    { expected: true, state: "siteLogin" },
    { expected: false, state: "settings" },
    { expected: false, state: "unknown" }
  ] satisfies readonly {
    readonly expected: boolean;
    readonly state: VisibilityState;
  }[])(
    "returns $expected for $state",
    ({ expected, state }) => {
      // Given / When
      const visible = shouldShowQrView(state);

      // Then
      expect(visible).toBe(expected);
    }
  );
});

describe("lock state transitions", () => {
  it("moves needsSetup to locked when setup completes", () => {
    // Given / When
    const state = completeSetup("needsSetup");

    // Then
    expect(state).toBe("locked");
  });

  it("moves locked to unlocked on successful unlock", () => {
    // Given / When
    const state = unlockSucceeded("locked");

    // Then
    expect(state).toBe("unlocked");
  });

  it("moves unlocked to locked on timer expiry", () => {
    // Given / When
    const state = timerExpired("unlocked");

    // Then
    expect(state).toBe("locked");
  });

  it.each(["unlocked", "siteLogin"] as const)(
    "moves %s to locked on manual lock",
    (currentState) => {
      // Given / When
      const state = manualLock(currentState);

      // Then
      expect(state).toBe("locked");
    }
  );

  it.each(["unlocked", "siteLogin"] as const)(
    "moves %s to locked on reason-independent relock",
    (currentState) => {
      // Given / When
      const state = relockState(currentState);

      // Then
      expect(state).toBe("locked");
    }
  );

  it("moves locked to settings when settings open", () => {
    // Given / When
    const state = openSettings("locked");

    // Then
    expect(state).toBe("settings");
  });

  it("moves settings to locked when settings close", () => {
    // Given / When
    const state = closeSettings("settings");

    // Then
    expect(state).toBe("locked");
  });

  it("defines locked to siteLogin transition shape", () => {
    // Given / When
    const state = enterSiteLogin("locked");

    // Then
    expect(state).toBe("siteLogin");
  });

  it("does not enter siteLogin from unlocked", () => {
    // Given / When
    const state = enterSiteLogin("unlocked");

    // Then
    expect(state).toBe("unlocked");
  });
});
