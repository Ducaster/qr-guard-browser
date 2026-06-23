import { describe, expect, it } from "vitest";

import {
  applyLoginDetection,
  closeSettings,
  completeSetup,
  enterLoginMode,
  enterSiteLogin,
  exitLoginMode,
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
    { currentUrlMatchesLoginPattern: false, expected: false, state: "needsSetup" },
    { currentUrlMatchesLoginPattern: true, expected: false, state: "needsSetup" },
    { currentUrlMatchesLoginPattern: false, expected: false, state: "locked" },
    { currentUrlMatchesLoginPattern: true, expected: false, state: "locked" },
    { currentUrlMatchesLoginPattern: false, expected: true, state: "unlocked" },
    { currentUrlMatchesLoginPattern: true, expected: true, state: "unlocked" },
    { currentUrlMatchesLoginPattern: false, expected: false, state: "loginMode" },
    { currentUrlMatchesLoginPattern: true, expected: true, state: "loginMode" },
    { currentUrlMatchesLoginPattern: false, expected: true, state: "siteLogin" },
    { currentUrlMatchesLoginPattern: true, expected: true, state: "siteLogin" },
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

  it.each(["unlocked", "loginMode", "siteLogin"] as const)(
    "moves %s to locked on manual lock",
    (currentState) => {
      // Given / When
      const state = manualLock(currentState);

      // Then
      expect(state).toBe("locked");
    }
  );

  it.each(["unlocked", "loginMode", "siteLogin"] as const)(
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

  it("defines locked to loginMode transition shape", () => {
    // Given / When
    const state = enterLoginMode("locked");

    // Then
    expect(state).toBe("loginMode");
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

  it("does not enter loginMode from unlocked", () => {
    // Given / When
    const state = enterLoginMode("unlocked");

    // Then
    expect(state).toBe("unlocked");
  });

  it("defines loginMode to locked exit transition shape", () => {
    // Given / When
    const state = exitLoginMode("loginMode");

    // Then
    expect(state).toBe("locked");
  });

  it("enters loginMode from locked only when the QR page is classified as login", () => {
    // Given / When / Then
    expect(applyLoginDetection("locked", "login", true)).toBe("loginMode");
    expect(applyLoginDetection("locked", "loggedIn", false)).toBe("locked");
    expect(applyLoginDetection("locked", "unknown", false)).toBe("locked");
    expect(applyLoginDetection("settings", "login", true)).toBe("settings");
  });

  it("moves unlocked to loginMode when the QR page is classified as login", () => {
    // Given / When
    const state = applyLoginDetection("unlocked", "login", true);

    // Then
    expect(state).toBe("loginMode");
  });

  it("keeps siteLogin open across QR navigation classifications", () => {
    // Given / When / Then
    expect(applyLoginDetection("siteLogin", "login", true)).toBe("siteLogin");
    expect(applyLoginDetection("siteLogin", "loggedIn", false)).toBe("siteLogin");
    expect(applyLoginDetection("siteLogin", "unknown", false)).toBe("siteLogin");
  });

  it("keeps unlocked authenticated sessions unlocked for unknown QR classification", () => {
    // Given / When
    const state = applyLoginDetection("unlocked", "unknown", false);

    // Then
    expect(state).toBe("unlocked");
  });

  it("relocks loginMode immediately when navigation leaves the login URL pattern", () => {
    // Given / When / Then
    expect(applyLoginDetection("loginMode", "login", true)).toBe("loginMode");
    expect(applyLoginDetection("loginMode", "loggedIn", false)).toBe("locked");
    expect(applyLoginDetection("loginMode", "unknown", false)).toBe("locked");
  });
});
