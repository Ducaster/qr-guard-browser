import { describe, expect, it } from "vitest";

import { getAppName } from "./sanity";

describe("getAppName", () => {
  it("returns the app name when the shell asks for identity", () => {
    // Given
    const expectedAppName = "QR Guard Browser";

    // When
    const actualAppName = getAppName();

    // Then
    expect(actualAppName).toBe(expectedAppName);
  });
});
