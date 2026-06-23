import { describe, expect, it } from "vitest";

import { verifyCode } from "./auth";
import {
  createDefaultSettings,
  MAX_IDLE_AUTO_LOCK_SECONDS,
  MAX_UNLOCK_DURATION_SECONDS
} from "./settings-repo";
import {
  addUserToSettings,
  changeAdminCodeInSettings,
  createSettingsFromFirstRunSetup,
  resetUserCodeInSettings,
  updateUserInSettings
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
      "QR 사이트 주소를 입력하세요.",
      "관리자 코드는 최소 4자 이상이어야 합니다.",
      "지역은 최소 1개 이상 필요합니다."
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
    expect(result.errors).toEqual(["지역 이름은 중복될 수 없습니다."]);
  });

  it.each([
    {
      action: "first-run setup",
      run: () =>
        createSettingsFromFirstRunSetup({
          adminCode: "1234",
          qrUrl: "https://qr.example.test/login",
          users: [{ code: "1111", userId: "login-mode" }]
        })
    },
    {
      action: "add-user",
      run: () =>
        addUserToSettings(settingsWithUser("staff01"), {
          code: "1111",
          userId: "login-mode"
        })
    },
    {
      action: "update-user",
      run: () =>
        updateUserInSettings(settingsWithUser("staff01"), {
          nextUserId: "login-mode",
          userId: "staff01"
        })
    }
  ])("rejects the reserved login-mode user ID during $action", ({ run }) => {
    // Given
    const expectedErrors = ["login-mode는 예약된 값이라 지역으로 사용할 수 없습니다."];

    // When
    const result = run();

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected reserved user ID validation to fail.");
    }
    expect(result.errors).toEqual(expectedErrors);
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
    expect(result.errors).toEqual(["인증 코드는 최소 4자 이상이어야 합니다."]);
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

  it("changes the admin code by replacing the stored hash without plaintext", () => {
    // Given
    const setupResult = createSettingsFromFirstRunSetup({
      adminCode: "old-admin-code",
      qrUrl: "https://qr.example.test/login",
      users: [{ code: "1111", userId: "staff01" }]
    });

    if (!setupResult.ok) {
      throw new Error(setupResult.errors.join("\n"));
    }

    // When
    const changeResult = changeAdminCodeInSettings(setupResult.value, {
      code: "new-admin-code"
    });

    // Then
    expect(changeResult.ok).toBe(true);
    if (!changeResult.ok) {
      throw new Error(changeResult.errors.join("\n"));
    }
    expect(changeResult.value.admin.hash).not.toBe(setupResult.value.admin.hash);
    expect(changeResult.value.admin.salt).not.toBe(setupResult.value.admin.salt);
    expect(JSON.stringify(changeResult.value)).not.toContain("new-admin-code");
    expect(verifyCode("new-admin-code", changeResult.value.admin.salt, changeResult.value.admin.hash)).toBe(true);
    expect(verifyCode("old-admin-code", changeResult.value.admin.salt, changeResult.value.admin.hash)).toBe(false);
  });

  it("rejects admin-code changes shorter than the minimum", () => {
    // Given
    const settings = {
      ...createDefaultSettings(),
      admin: verifyCodeFixture()
    };

    // When
    const result = changeAdminCodeInSettings(settings, { code: "123" });

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected change-admin-code validation to fail.");
    }
    expect(result.errors).toEqual(["관리자 코드는 최소 4자 이상이어야 합니다."]);
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
    expect(result.errors).toEqual(["인증 코드는 최소 4자 이상이어야 합니다."]);
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
    expect(result.errors).toEqual(["인증 코드는 최소 4자 이상이어야 합니다."]);
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

const settingsWithUser = (userId: string) => ({
  ...createDefaultSettings(),
  users: [{ ...verifyCodeFixture(), lastAuthenticatedAt: null, userId }]
});
