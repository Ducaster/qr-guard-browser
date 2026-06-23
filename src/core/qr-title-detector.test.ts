import { describe, expect, it } from "vitest";

import { matchesQrTitle } from "./qr-title-detector";

describe("QR title detection", () => {
  it("matches by case and whitespace normalized substring", () => {
    // Given / When
    const matched = matchesQrTitle("  매장 QR   코드 - 12번  ", "qr 코드");

    // Then
    expect(matched).toBe(true);
  });

  it("never matches when the configured pattern is empty", () => {
    // Given / When / Then
    expect(matchesQrTitle("QR 코드", "")).toBe(false);
    expect(matchesQrTitle("QR 코드", "   ")).toBe(false);
  });

  it("does not match unrelated titles", () => {
    // Given / When
    const matched = matchesQrTitle("로그인", "QR 코드");

    // Then
    expect(matched).toBe(false);
  });
});
