import { describe, expect, it } from "vitest";

import { isAllowedControlNavigation, isDevToolsShortcut } from "./windows-permissions";

describe("isDevToolsShortcut", () => {
  it("detects production DevTools accelerators", () => {
    // Given
    const shortcuts = [
      { key: "F12" },
      { control: true, key: "I", shift: true },
      { control: true, key: "J", shift: true },
      { control: true, key: "C", shift: true },
      { alt: true, key: "I", meta: true },
      { alt: true, key: "J", meta: true },
      { alt: true, key: "C", meta: true }
    ] as const;

    // When / Then
    expect(shortcuts.every((input) => isDevToolsShortcut(input))).toBe(true);
  });

  it("ignores normal app shortcuts", () => {
    // Given
    const shortcuts = [
      { key: "I" },
      { control: true, key: "I" },
      { key: "R", meta: true },
      { alt: true, key: "ArrowLeft", meta: true }
    ] as const;

    // When / Then
    expect(shortcuts.some((input) => isDevToolsShortcut(input))).toBe(false);
  });
});

describe("control navigation guard", () => {
  it("allows only the packaged renderer file in packaged mode", () => {
    // Given
    const options = {
      controlHtmlUrl: "file:///Applications/QR%20Guard%20Browser.app/Contents/Resources/app/.vite/renderer/main_window/index.html"
    };

    // When / Then
    expect(isAllowedControlNavigation(options.controlHtmlUrl, options)).toBe(true);
    expect(isAllowedControlNavigation(`${options.controlHtmlUrl}#settings`, options)).toBe(true);
    expect(isAllowedControlNavigation("file:///tmp/other.html", options)).toBe(false);
    expect(isAllowedControlNavigation("https://example.test/", options)).toBe(false);
  });

  it("allows only the dev-server origin in dev mode", () => {
    // Given
    const options = {
      controlDevServerUrl: "http://localhost:5173/main_window",
      controlHtmlUrl: "file:///unused/index.html"
    };

    // When / Then
    expect(isAllowedControlNavigation("http://localhost:5173/main_window", options)).toBe(true);
    expect(isAllowedControlNavigation("http://localhost:5173/@vite/client", options)).toBe(true);
    expect(isAllowedControlNavigation("http://127.0.0.1:5173/main_window", options)).toBe(false);
    expect(isAllowedControlNavigation("javascript:alert(1)", options)).toBe(false);
  });
});
