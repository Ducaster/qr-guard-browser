import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn()
}));

vi.mock("./logger", () => ({
  mainLogger: loggerMock
}));

import { loadQrUrlOrBlank } from "./qr-url-loader";

describe("QR URL loader", () => {
  it("loads about:blank instead of disallowed QR URL schemes", async () => {
    // Given
    const loadUrlCalls: string[] = [];
    const webContents = {
      loadURL: (url: string): Promise<void> => {
        loadUrlCalls.push(url);

        return Promise.resolve();
      }
    };

    // When
    await loadQrUrlOrBlank(webContents, "javascript:alert(1)");

    // Then
    expect(loadUrlCalls).toEqual(["about:blank"]);
    expect(loggerMock.warn).toHaveBeenCalledWith("Refusing to load disallowed QR URL.", {
      url: "javascript:alert(1)"
    });
  });
});
