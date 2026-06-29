import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatQrDiagnosticsUrl,
  measureQrRequestBodyBytes,
  measureQrRequestHeaders,
  shouldCaptureQrDiagnosticsRequest
} from "./qr-net-diagnostics";
import { rotateQrDiagnosticsLogIfNeeded } from "./qr-net-diagnostics-log";

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

  it("rotates the diagnostics log when it reaches the configured cap", async () => {
    // Given
    const directory = await mkdtemp(path.join(os.tmpdir(), "qr-net-diagnostics-"));
    const logFilePath = path.join(directory, "qr-net-diagnostics.log");
    const rotatedLogFilePath = `${logFilePath}.1`;

    try {
      await writeFile(logFilePath, "old diagnostics\n", "utf8");
      await writeFile(rotatedLogFilePath, "stale diagnostics\n", "utf8");

      // When
      await rotateQrDiagnosticsLogIfNeeded(logFilePath, 4);

      // Then
      await expect(readFile(logFilePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(rotatedLogFilePath, "utf8")).resolves.toBe("old diagnostics\n");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
