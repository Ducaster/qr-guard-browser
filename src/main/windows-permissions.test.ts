import { describe, expect, it } from "vitest";

import {
  hardenControlWebContents,
  hardenQrWebContents,
  isAllowedControlNavigation,
  isDevToolsShortcut
} from "./windows-permissions";
import type { DevToolsShortcutInput } from "./windows-permissions";

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

describe("QR browser hardening", () => {
  it("navigates allowed popup URLs in the same QR view while denying a new window", () => {
    // Given
    const webContents = new TestWebContents();
    hardenQrWebContents(webContents, webContents.session, { disableDevTools: false });

    // When
    const result = webContents.openWindow("https://login.example.test/oauth?state=abc");

    // Then
    expect(result).toEqual({ action: "deny" });
    expect(webContents.loadUrlCalls).toEqual(["https://login.example.test/oauth?state=abc"]);
  });

  it.each([
    { label: "empty URL", url: "" },
    { label: "about blank", url: "about:blank" },
    { label: "file URL", url: "file:///tmp/qr.png" },
    { label: "custom scheme", url: "myapp://callback" }
  ] as const)("denies $label popup URLs without navigating", ({ url }) => {
    // Given
    const webContents = new TestWebContents();
    hardenQrWebContents(webContents, webContents.session, { disableDevTools: false });

    // When
    const result = webContents.openWindow(url);

    // Then
    expect(result).toEqual({ action: "deny" });
    expect(webContents.loadUrlCalls).toEqual([]);
  });

  it("allows QR permission requests and checks", () => {
    // Given
    const webContents = new TestWebContents();
    hardenQrWebContents(webContents, webContents.session, { disableDevTools: false });

    // When / Then
    expect(webContents.session.requestPermission("media")).toBe(true);
    expect(webContents.session.checkPermission("clipboard-read")).toBe(true);
  });
});

describe("control browser hardening", () => {
  it("keeps control popups and permissions denied", () => {
    // Given
    const webContents = new TestWebContents();
    hardenControlWebContents(webContents, { disableDevTools: false });

    // When
    const result = webContents.openWindow("https://login.example.test/oauth");

    // Then
    expect(result).toEqual({ action: "deny" });
    expect(webContents.loadUrlCalls).toEqual([]);
    expect(webContents.session.requestPermission("media")).toBe(false);
    expect(webContents.session.checkPermission("clipboard-read")).toBe(false);
  });
});

interface TestWindowOpenDetails {
  readonly url: string;
}

interface TestPreventableEvent {
  readonly preventDefault: () => void;
}

type TestWindowOpenResult = Readonly<{ readonly action: "deny" }>;
type TestWindowOpenHandler = (details: TestWindowOpenDetails) => TestWindowOpenResult;
type TestPermissionRequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (permissionGranted: boolean) => void
) => void;
type TestPermissionCheckHandler = (
  webContents: unknown,
  permission: string,
  requestingOrigin: string,
  details: unknown
) => boolean;

class TestSession {
  private permissionCheckHandler: TestPermissionCheckHandler | null = null;
  private permissionRequestHandler: TestPermissionRequestHandler | null = null;

  checkPermission(permission: string): boolean {
    return this.permissionCheckHandler?.({}, permission, "https://login.example.test", {}) ?? false;
  }

  requestPermission(permission: string): boolean {
    let permissionGranted = false;

    this.permissionRequestHandler?.({}, permission, (granted) => {
      permissionGranted = granted;
    });

    return permissionGranted;
  }

  setPermissionCheckHandler(handler: TestPermissionCheckHandler | null): void {
    this.permissionCheckHandler = handler;
  }

  setPermissionRequestHandler(handler: TestPermissionRequestHandler | null): void {
    this.permissionRequestHandler = handler;
  }
}

class TestWebContents {
  readonly loadUrlCalls: string[] = [];
  readonly session = new TestSession();

  private windowOpenHandler: TestWindowOpenHandler | null = null;

  closeDevTools(): void {
    return;
  }

  isDevToolsOpened(): boolean {
    return false;
  }

  loadURL(url: string): Promise<void> {
    this.loadUrlCalls.push(url);

    return Promise.resolve();
  }

  on(eventName: "will-attach-webview", listener: (event: TestPreventableEvent) => void): void;
  on(
    eventName: "before-input-event",
    listener: (event: TestPreventableEvent, input: DevToolsShortcutInput) => void
  ): void;
  on(eventName: "devtools-opened", listener: () => void): void;
  on(_eventName: string, _listener: unknown): void {
    return;
  }

  openWindow(url: string): TestWindowOpenResult {
    if (this.windowOpenHandler === null) {
      throw new Error("Window open handler was not configured.");
    }

    return this.windowOpenHandler({ url });
  }

  setWindowOpenHandler(handler: TestWindowOpenHandler): void {
    this.windowOpenHandler = handler;
  }
}
