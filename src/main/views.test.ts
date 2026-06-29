import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn()
}));

const electronMock = vi.hoisted(() => {
  class FakeSession {
    readonly webRequest = {
      onBeforeSendHeaders: vi.fn(),
      onCompleted: vi.fn(),
      onErrorOccurred: vi.fn()
    };

    setPermissionRequestHandler(
      _handler: (
        webContents: FakeWebContents,
        permission: string,
        callback: (permissionGranted: boolean) => void
      ) => void
    ): void {
      return;
    }

    setPermissionCheckHandler(
      _handler: (webContents: FakeWebContents | null, permission: string, requestingOrigin: string) => boolean
    ): void {
      return;
    }
  }

  interface FakeWebContentsViewOptions {
    readonly webPreferences?: {
      readonly session?: FakeSession;
    };
  }

  class FakeWebContents {
    readonly loadFileCalls: string[] = [];
    readonly loadUrlCalls: string[] = [];
    readonly setAudioMutedCalls: boolean[] = [];
    readonly setBackgroundThrottlingCalls: boolean[] = [];
    readonly session: FakeSession;

    private readonly listeners = new Map<string, ((...args: readonly unknown[]) => void)[]>();
    private currentUrl = "";
    private loadFileError: Error | undefined;
    private loadUrlError: Error | undefined;
    private userAgent =
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) QR Guard Browser/0.1.1 Chrome/142.0.7444.234 Electron/42.4.1 Safari/537.36";

    constructor(targetSession?: FakeSession) {
      this.session = targetSession ?? new FakeSession();
    }

    closeDevTools(): void {
      return;
    }

    failNextLoadFile(error: Error): void {
      this.loadFileError = error;
    }

    failNextLoadUrl(error: Error): void {
      this.loadUrlError = error;
    }

    focus(): void {
      return;
    }

    isDevToolsOpened(): boolean {
      return false;
    }

    loadFile(filePath: string): Promise<void> {
      this.loadFileCalls.push(filePath);

      if (this.loadFileError !== undefined) {
        return Promise.reject(this.loadFileError);
      }

      return Promise.resolve();
    }

    loadURL(url: string): Promise<void> {
      this.loadUrlCalls.push(url);
      this.currentUrl = url;

      if (this.loadUrlError !== undefined) {
        return Promise.reject(this.loadUrlError);
      }

      return Promise.resolve();
    }

    getURL(): string {
      return this.currentUrl;
    }

    getUserAgent(): string {
      return this.userAgent;
    }

    emit(eventName: string, ...args: readonly unknown[]): void {
      for (const listener of this.listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }

    on(eventName: string, listener: (...args: readonly unknown[]) => void): void {
      this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
    }

    setUserAgent(userAgent: string): void {
      this.userAgent = userAgent;
    }

    setAudioMuted(muted: boolean): void {
      this.setAudioMutedCalls.push(muted);
    }

    setBackgroundThrottling(allowed: boolean): void {
      this.setBackgroundThrottlingCalls.push(allowed);
    }

    setWindowOpenHandler(_handler: () => Readonly<{ action: "deny" }>): void {
      return;
    }
  }

  class FakeWebContentsView {
    readonly webContents: FakeWebContents;

    private visible = true;

    constructor(options: FakeWebContentsViewOptions) {
      this.webContents = new FakeWebContents(options.webPreferences?.session);
      state.views.push(this);
    }

    getVisible(): boolean {
      return this.visible;
    }

    setBackgroundColor(_backgroundColor: string): void {
      return;
    }

    setBounds(_bounds: Readonly<Record<string, number>>): void {
      return;
    }

    setVisible(visible: boolean): void {
      this.visible = visible;
    }
  }

  class FakeBaseWindow {
    readonly contentView = {
      addChildView: (_view: FakeWebContentsView): void => {
        return;
      }
    };

    constructor(_options: Readonly<Record<string, unknown>>) {
      return;
    }

    getContentSize(): readonly [number, number] {
      return [1280, 800];
    }

    on(_eventName: string, _listener: (...args: readonly unknown[]) => void): void {
      return;
    }

    once(_eventName: string, _listener: (...args: readonly unknown[]) => void): void {
      return;
    }

    setBackgroundColor(_backgroundColor: string): void {
      return;
    }
  }

  const state: { readonly views: FakeWebContentsView[] } = {
    views: []
  };

  return {
    BaseWindow: FakeBaseWindow,
    WebContentsView: FakeWebContentsView,
    app: {
      getPath: vi.fn(() => "/tmp/qr-guard-test-user-data")
    },
    nativeTheme: {
      off: vi.fn(),
      on: vi.fn(),
      shouldUseDarkColors: false
    },
    session: {
      fromPartition: vi.fn(() => new FakeSession())
    },
    state
  };
});

vi.mock("electron", () => ({
  BaseWindow: electronMock.BaseWindow,
  WebContentsView: electronMock.WebContentsView,
  app: electronMock.app,
  nativeTheme: electronMock.nativeTheme,
  session: electronMock.session
}));

vi.mock("./logger", () => ({
  formatUnknownError: (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  },
  mainLogger: loggerMock
}));

describe("shell window loading", () => {
  beforeEach(() => {
    electronMock.state.views.length = 0;
    loggerMock.warn.mockClear();
    delete process.env["QR_GUARD_NET_DIAGNOSTICS"];
  });

  it("keeps QR network diagnostics detached by default", async () => {
    // Given
    const { createShellWindow } = await import("./views");

    // When
    createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js"
    });

    // Then
    const qrWebContents = getQrWebContents();
    expect(qrWebContents.session.webRequest.onBeforeSendHeaders).not.toHaveBeenCalled();
    expect(qrWebContents.session.webRequest.onCompleted).not.toHaveBeenCalled();
    expect(qrWebContents.session.webRequest.onErrorOccurred).not.toHaveBeenCalled();
  });

  it("attaches QR network diagnostics only when explicitly enabled", async () => {
    // Given
    process.env["QR_GUARD_NET_DIAGNOSTICS"] = "1";
    const { createShellWindow } = await import("./views");

    // When
    createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js"
    });

    // Then
    const qrWebContents = getQrWebContents();
    expect(qrWebContents.session.webRequest.onBeforeSendHeaders).toHaveBeenCalledOnce();
    expect(qrWebContents.session.webRequest.onCompleted).toHaveBeenCalledOnce();
    expect(qrWebContents.session.webRequest.onErrorOccurred).toHaveBeenCalledOnce();
  });

  it("throttles and mutes QR contents while hidden, then restores them when shown", async () => {
    // Given
    const { createShellWindow } = await import("./views");
    const shellWindow = createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js"
    });
    const qrWebContents = getQrWebContents();

    // When
    shellWindow.setQrVisible(false);
    shellWindow.setQrVisible(true);

    // Then
    expect(qrWebContents.setBackgroundThrottlingCalls).toEqual([true, false]);
    expect(qrWebContents.setAudioMutedCalls).toEqual([true, false]);
  });

  it("leaves the QR view empty when no QR URL is configured", async () => {
    // Given
    const { createShellWindow } = await import("./views");
    const shellWindow = createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js"
    });
    const qrWebContents = getQrWebContents();

    // When
    await shellWindow.load();

    // Then
    expect(qrWebContents.loadUrlCalls).toEqual([]);
    expect(qrWebContents.getUserAgent()).toBe(
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.234 Safari/537.36"
    );
  });

  it("loads the control view when the configured QR site is unreachable", async () => {
    // Given
    const { createShellWindow } = await import("./views");
    const qrLoadStatuses: unknown[] = [];
    const qrUrl = "http://127.0.0.1:37655/login";
    const shellWindow = createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      onQrLoadStatusChanged: (status) => {
        qrLoadStatuses.push(status);
      },
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js",
      qrUrl
    });
    const qrWebContents = getQrWebContents();
    const controlWebContents = getControlWebContents();
    const qrLoadError = new Error("ERR_CONNECTION_REFUSED");
    qrWebContents.failNextLoadUrl(qrLoadError);

    // When / Then
    await expect(shellWindow.load()).resolves.toBeUndefined();
    expect(controlWebContents.loadFileCalls).toEqual(["/control/index.html"]);
    expect(loggerMock.warn).toHaveBeenCalledWith("QR site failed to load.", {
      error: "ERR_CONNECTION_REFUSED",
      url: qrUrl
    });
    expect(qrLoadStatuses.at(-1)).toEqual({
      errorCode: null,
      errorDescription: "ERR_CONNECTION_REFUSED",
      url: qrUrl
    });
  });

  it("loads a blank QR page when the configured QR URL uses a disallowed scheme", async () => {
    // Given
    const { createShellWindow } = await import("./views");
    const shellWindow = createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js",
      qrUrl: "file:///etc/passwd"
    });
    const qrWebContents = getQrWebContents();

    // When
    await shellWindow.load();

    // Then
    expect(qrWebContents.loadUrlCalls).toEqual(["about:blank"]);
    expect(loggerMock.warn).toHaveBeenCalledWith("Refusing to load disallowed QR URL.", {
      url: "file:///etc/passwd"
    });
  });

  it("reports only main-frame QR load failures and ignores intentional blank loads", async () => {
    // Given
    const { createShellWindow } = await import("./views");
    const qrLoadStatuses: unknown[] = [];
    createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      onQrLoadStatusChanged: (status) => {
        qrLoadStatuses.push(status);
      },
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js"
    });
    const qrWebContents = getQrWebContents();

    // When
    qrWebContents.emit("did-fail-load", {}, -3, "ERR_ABORTED", "about:blank", true);
    qrWebContents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "https://bad.example/frame", false);
    qrWebContents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "https://bad.example/login", true);

    // Then
    expect(qrLoadStatuses).toEqual([
      {
        errorCode: -105,
        errorDescription: "ERR_NAME_NOT_RESOLVED",
        url: "https://bad.example/login"
      }
    ]);
  });
});

const getQrWebContents = (): InstanceType<typeof electronMock.WebContentsView>["webContents"] => {
  const qrView = electronMock.state.views[0];

  if (qrView === undefined) {
    throw new Error("Missing QR view");
  }

  return qrView.webContents;
};

const getControlWebContents = (): InstanceType<typeof electronMock.WebContentsView>["webContents"] => {
  const controlView = electronMock.state.views[1];

  if (controlView === undefined) {
    throw new Error("Missing control view");
  }

  return controlView.webContents;
};
