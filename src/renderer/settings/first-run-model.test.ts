import { describe, expect, it } from "vitest";

import { validateSetupForm } from "./first-run-model";

const validInput = {
  adminCode: "1234",
  idleAutoLockSeconds: "30",
  loggedInUrlPattern: "",
  loginUrlPattern: "/login",
  qrUrl: "https://qr.example.test/login",
  titleContains: "",
  unlockDurationSeconds: "10",
  users: [{ code: "2468", rowId: "row-1", userId: "staff01" }]
};

describe("first-run setup form model", () => {
  it("returns an error result without a payload when validation fails", () => {
    // Given
    const input = {
      ...validInput,
      users: [{ code: "123", rowId: "row-1", userId: "staff01" }]
    };

    // When
    const result = validateSetupForm(input);

    // Then
    expect(result.ok).toBe(false);
    expect("payload" in result).toBe(false);
    if (result.ok) {
      throw new Error("Expected setup form validation to fail.");
    }
    expect(result.errors).toEqual(["User code must be at least 4 characters."]);
  });

  it("returns a payload only when validation succeeds", () => {
    // Given
    const input = validInput;

    // When
    const result = validateSetupForm(input);

    // Then
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.errors.join("\n"));
    }
    expect(result.payload.users).toEqual([{ code: "2468", userId: "staff01" }]);
  });
});
