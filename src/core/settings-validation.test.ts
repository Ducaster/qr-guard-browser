import { describe, expect, it } from "vitest";

import { verifyCode } from "./auth";
import {
  createDefaultSettings,
  MAX_IDLE_AUTO_LOCK_SECONDS,
  MAX_UNLOCK_DURATION_SECONDS
} from "./settings-repo";
import {
  addUserToSettings,
  createSettingsFromFirstRunSetup,
  resetUserCodeInSettings
} from "./settings-validation";

describe("settings validation", () => {
  it("rejects first-run setup when required fields are missing", () => {
    // Given
    const payload = {
      adminCode: "",
      qrUrl: "",
      users: []
    };

    // When
    const result = createSettingsFromFirstRunSetup(payload);

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected setup validation to fail.");
    }
    expect(result.errors).toEqual([
      "QR URL is required.",
      "Admin code must be at least 4 characters.",
      "At least one user is required."
    ]);
  });

  it("rejects duplicate user IDs during first-run setup", () => {
    // Given
    const payload = {
      adminCode: "1234",
      qrUrl: "https://qr.example.test/login",
      users: [
        { code: "1111", userId: "staff01" },
        { code: "2222", userId: "staff01" }
      ]
    };

    // When
    const result = createSettingsFromFirstRunSetup(payload);

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected duplicate user validation to fail.");
    }
    expect(result.errors).toEqual(["Duplicate user IDs are not allowed."]);
  });

  it("rejects first-run setup when a user code is shorter than the minimum", () => {
    // Given
    const payload = {
      adminCode: "1234",
      qrUrl: "https://qr.example.test/login",
      users: [{ code: "123", userId: "staff01" }]
    };

    // When
    const result = createSettingsFromFirstRunSetup(payload);

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected user code validation to fail.");
    }
    expect(result.errors).toEqual(["User code must be at least 4 characters."]);
  });

  it("clamps duration values above the maximum caps during first-run setup", () => {
    // Given
    const payload = {
      adminCode: "1234",
      idleAutoLockSeconds: 999_999_999,
      qrUrl: "https://qr.example.test/login",
      unlockDurationSeconds: 999_999_999,
      users: [{ code: "1111", userId: "staff01" }]
    };

    // When
    const result = createSettingsFromFirstRunSetup(payload);

    // Then
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.errors.join("\n"));
    }
    expect(result.value.unlockDurationSeconds).toBe(MAX_UNLOCK_DURATION_SECONDS);
    expect(result.value.idleAutoLockSeconds).toBe(MAX_IDLE_AUTO_LOCK_SECONDS);
  });

  it("updates a user code by replacing the stored hash", () => {
    // Given
    const setupResult = createSettingsFromFirstRunSetup({
      adminCode: "1234",
      qrUrl: "https://qr.example.test/login",
      users: [{ code: "old-code", userId: "staff01" }]
    });

    if (!setupResult.ok) {
      throw new Error(setupResult.errors.join("\n"));
    }

    const originalUser = setupResult.value.users[0];

    if (originalUser === undefined) {
      throw new Error("Expected setup to create a user.");
    }

    // When
    const resetResult = resetUserCodeInSettings(setupResult.value, {
      code: "new-code",
      userId: "staff01"
    });

    // Then
    expect(resetResult.ok).toBe(true);
    if (!resetResult.ok) {
      throw new Error(resetResult.errors.join("\n"));
    }

    const updatedUser = resetResult.value.users[0];

    if (updatedUser === undefined) {
      throw new Error("Expected reset to keep the user.");
    }

    expect(updatedUser.hash).not.toBe(originalUser.hash);
    expect(updatedUser.salt).not.toBe(originalUser.salt);
    expect(verifyCode("new-code", updatedUser.salt, updatedUser.hash)).toBe(true);
    expect(verifyCode("old-code", updatedUser.salt, updatedUser.hash)).toBe(false);
  });

  it("rejects add-user when the user code is shorter than the minimum", () => {
    // Given
    const settings = {
      ...createDefaultSettings(),
      users: [{ ...verifyCodeFixture(), lastAuthenticatedAt: null, userId: "staff01" }]
    };

    // When
    const result = addUserToSettings(settings, { code: "123", userId: "staff02" });

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected add-user validation to fail.");
    }
    expect(result.errors).toEqual(["User code must be at least 4 characters."]);
  });

  it("rejects reset-user-code when the user code is shorter than the minimum", () => {
    // Given
    const settings = {
      ...createDefaultSettings(),
      users: [{ ...verifyCodeFixture(), lastAuthenticatedAt: null, userId: "staff01" }]
    };

    // When
    const result = resetUserCodeInSettings(settings, { code: "123", userId: "staff01" });

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected reset-code validation to fail.");
    }
    expect(result.errors).toEqual(["User code must be at least 4 characters."]);
  });

  it("detects first run when the admin record has not been configured", () => {
    // Given
    const settings = createDefaultSettings();

    // When
    const result = createSettingsFromFirstRunSetup({
      adminCode: "1234",
      qrUrl: "https://qr.example.test/login",
      users: [{ code: "1111", userId: "staff01" }]
    });

    // Then
    expect(settings.admin.hash).toBe("");
    expect(result.ok).toBe(true);
  });
});

const verifyCodeFixture = () => ({
  hash: "fixture-hash",
  salt: "fixture-salt"
});
