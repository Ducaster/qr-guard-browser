import { describe, expect, it } from "vitest";

import {
  closeSettings,
  completeSetup,
  enterLoginMode,
  exitLoginMode,
  manualLock,
  openSettings,
  shouldShowQrView,
  timerExpired,
  unlockSucceeded,
  type VisibilityState
} from "./state-machine";

describe("QR visibility gate", () => {
  it.each([
    { currentUrlMatchesLoginPattern: false, expected: false, state: "needsSetup" },
    { currentUrlMatchesLoginPattern: true, expected: false, state: "needsSetup" },
    { currentUrlMatchesLoginPattern: false, expected: false, state: "locked" },
    { currentUrlMatchesLoginPattern: true, expected: false, state: "locked" },
    { currentUrlMatchesLoginPattern: false, expected: true, state: "unlocked" },
    { currentUrlMatchesLoginPattern: true, expected: true, state: "unlocked" },
    { currentUrlMatchesLoginPattern: false, expected: false, state: "loginMode" },
    { currentUrlMatchesLoginPattern: true, expected: true, state: "loginMode" },
    { currentUrlMatchesLoginPattern: false, expected: false, state: "settings" },
    { currentUrlMatchesLoginPattern: true, expected: false, state: "settings" },
    { currentUrlMatchesLoginPattern: false, expected: false, state: "unknown" },
    { currentUrlMatchesLoginPattern: true, expected: false, state: "unknown" }
  ] satisfies readonly {
    readonly currentUrlMatchesLoginPattern: boolean;
    readonly expected: boolean;
    readonly state: VisibilityState;
  }[])(
    "returns $expected for $state when login match is $currentUrlMatchesLoginPattern",
    ({ currentUrlMatchesLoginPattern, expected, state }) => {
      // Given / When
      const visible = shouldShowQrView(state, currentUrlMatchesLoginPattern);

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

  it.each(["unlocked", "loginMode"] as const)(
    "moves %s to locked on manual lock",
    (currentState) => {
      // Given / When
      const state = manualLock(currentState);

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

  it.each(["locked", "unlocked"] as const)(
    "defines %s to loginMode transition shape",
    (currentState) => {
      // Given / When
      const state = enterLoginMode(currentState);

      // Then
      expect(state).toBe("loginMode");
    }
  );

  it("defines loginMode to locked exit transition shape", () => {
    // Given / When
    const state = exitLoginMode("loginMode");

    // Then
    expect(state).toBe("locked");
  });
});
