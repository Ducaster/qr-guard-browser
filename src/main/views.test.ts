import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn()
}));

const electronMock = vi.hoisted(() => {
  class FakeSession {
    setPermissionRequestHandler(
      _handler: (
        webContents: FakeWebContents,
        permission: string,
        callback: (permissionGranted: boolean) => void
      ) => void
    ): void {
      return;
    }
  }

  class FakeWebContents {
    readonly loadFileCalls: string[] = [];
    readonly loadUrlCalls: string[] = [];
    readonly session = new FakeSession();

    private loadFileError: Error | undefined;
    private loadUrlError: Error | undefined;

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

      if (this.loadUrlError !== undefined) {
        return Promise.reject(this.loadUrlError);
      }

      return Promise.resolve();
    }

    on(_eventName: string, _listener: (...args: readonly unknown[]) => void): void {
      return;
    }

    setWindowOpenHandler(_handler: () => Readonly<{ action: "deny" }>): void {
      return;
    }
  }

  class FakeWebContentsView {
    readonly webContents = new FakeWebContents();

    private visible = true;

    constructor(_options: Readonly<Record<string, unknown>>) {
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
  });

  it("loads the control view when the configured QR site is unreachable", async () => {
    // Given
    const { createShellWindow } = await import("./views");
    const shellWindow = createShellWindow({
      controlHtmlPath: "/control/index.html",
      disableDevTools: true,
      preloadPath: "/preload.js",
      qrPreloadPath: "/qr-site-preload.js",
      qrUrl: "http://127.0.0.1:37655/login"
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
      url: "http://127.0.0.1:37655/login"
    });
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
