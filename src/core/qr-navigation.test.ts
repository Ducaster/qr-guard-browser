import { describe, expect, it } from "vitest";

import { isAllowedQrNavigation } from "./qr-navigation";

describe("QR navigation policy", () => {
  it("allows top-level QR navigation for http and https URLs", () => {
    // Given
    const allowedUrls = [
      "http://127.0.0.1:37655/login",
      "https://login.example.com/oauth/callback?code=abc"
    ] as const;

    // When
    const results = allowedUrls.map((url) => isAllowedQrNavigation(url));

    // Then
    expect(results).toEqual([true, true]);
  });

  it("blocks dangerous top-level QR navigation schemes", () => {
    // Given
    const blockedUrls = [
      "file:///Users/example/secret.html",
      "data:text/html,<script>alert(1)</script>",
      "about:blank",
      "chrome://settings",
      "javascript:alert(1)",
      "blob:https://example.com/token"
    ] as const;

    // When
    const results = blockedUrls.map((url) => isAllowedQrNavigation(url));

    // Then
    expect(results).toEqual([false, false, false, false, false, false]);
  });
});
