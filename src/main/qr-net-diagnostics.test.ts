import { describe, expect, it } from "vitest";

import {
  formatQrDiagnosticsUrl,
  measureQrRequestBodyBytes,
  measureQrRequestHeaders,
  shouldCaptureQrDiagnosticsRequest
} from "./qr-net-diagnostics";

describe("QR network diagnostics helpers", () => {
  it("measures request header and cookie sizes without returning secret values", () => {
    // Given
    const requestHeaders = {
      "Content-Length": "12",
      Cookie: "session=secret; admin=token",
      "X-Test": "visible"
    };

    // When
    const metrics = measureQrRequestHeaders(requestHeaders);

    // Then
    expect(metrics).toEqual({
      cookieHeaderBytes: Buffer.byteLength("session=secret; admin=token", "utf8"),
      requestHeaderBytes: Buffer.byteLength(
        "Content-Length: 12\r\nCookie: session=secret; admin=token\r\nX-Test: visible\r\n",
        "utf8"
      )
    });
    expect(Object.values(metrics)).not.toContain("session=secret; admin=token");
  });

  it("prefers upload byte counts and falls back to Content-Length when available", () => {
    // Given
    const requestHeaders = {
      "Content-Length": "999"
    };
    const uploadData = [
      { bytes: Buffer.from("abc", "utf8") },
      { bytes: Buffer.from("defg", "utf8") }
    ];

    // When
    const uploadedBytes = measureQrRequestBodyBytes(requestHeaders, uploadData);
    const contentLengthBytes = measureQrRequestBodyBytes(requestHeaders, undefined);

    // Then
    expect(uploadedBytes).toBe(7);
    expect(contentLengthBytes).toBe(999);
  });

  it("captures top-level documents and POST requests only", () => {
    expect(shouldCaptureQrDiagnosticsRequest({ method: "GET", resourceType: "mainFrame" })).toBe(true);
    expect(shouldCaptureQrDiagnosticsRequest({ method: "POST", resourceType: "xhr" })).toBe(true);
    expect(shouldCaptureQrDiagnosticsRequest({ method: "GET", resourceType: "image" })).toBe(false);
  });

  it("formats diagnostic URLs as origin plus path without query or fragment values", () => {
    // Given
    const url = "https://example.test/login/random-id?token=secret#section";

    // When
    const diagnosticUrl = formatQrDiagnosticsUrl(url);

    // Then
    expect(diagnosticUrl).toBe("https://example.test/login/random-id");
  });
});
