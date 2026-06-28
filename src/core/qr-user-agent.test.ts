import { describe, expect, it } from "vitest";

import { cleanQrUserAgent } from "./qr-user-agent";

describe("QR user agent normalization", () => {
  it("removes Electron and app tokens while preserving the Chrome version", () => {
    // Given
    const electronUserAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QR Guard Browser/0.1.1 Chrome/142.0.7444.234 Electron/42.4.1 Safari/537.36";

    // When
    const userAgent = cleanQrUserAgent(electronUserAgent);

    // Then
    expect(userAgent).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.234 Safari/537.36"
    );
  });
});
