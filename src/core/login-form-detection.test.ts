import { describe, expect, it } from "vitest";

import { detectLoginFormFields, type LoginFormInputDescriptor } from "./login-form-detection";

const input = (
  index: number,
  type: LoginFormInputDescriptor["type"],
  formId = "login-form",
  autocomplete = ""
): LoginFormInputDescriptor => ({
  autocomplete,
  formId,
  index,
  type
});

describe("login form detection", () => {
  it("pairs a password input with the preceding text input in the same form", () => {
    // Given
    const inputs = [
      input(0, "text"),
      input(1, "password"),
      input(2, "text", "other-form")
    ];

    // When
    const fields = detectLoginFormFields(inputs);

    // Then
    expect(fields).toEqual({
      passwordIndex: 1,
      usernameIndex: 0
    });
  });

  it("prefers autocomplete username when it appears before an email field", () => {
    // Given
    const inputs = [
      input(0, "email"),
      input(1, "text", "login-form", "username"),
      input(2, "password")
    ];

    // When
    const fields = detectLoginFormFields(inputs);

    // Then
    expect(fields).toEqual({
      passwordIndex: 2,
      usernameIndex: 1
    });
  });

  it("does not pair a password with a username candidate from a different form", () => {
    // Given
    const inputs = [input(0, "text", "search"), input(1, "password", "login-form")];

    // When
    const fields = detectLoginFormFields(inputs);

    // Then
    expect(fields).toBeNull();
  });

  it("returns null when there is no password input", () => {
    // Given
    const inputs = [input(0, "email"), input(1, "text")];

    // When
    const fields = detectLoginFormFields(inputs);

    // Then
    expect(fields).toBeNull();
  });
});
