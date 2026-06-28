import { beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "../core/shell-config";
import type { StateSnapshot, UnlockResponse } from "../core/state-machine";
import type { LockController } from "./lock-controller";

interface TestWebContents {
  readonly id: number;
}

interface TestIpcEvent {
  readonly sender: TestWebContents;
}

type InvokeHandler = (event: TestIpcEvent, ...args: readonly unknown[]) => unknown;

const invokeHandlers = new Map<string, InvokeHandler>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: InvokeHandler): void => {
      invokeHandlers.set(channel, handler);
    })
  }
}));

describe("lock IPC sender gate", () => {
  beforeEach(() => {
    invokeHandlers.clear();
    vi.resetModules();
  });

  it("rejects unauthenticated lock actions from non-control webContents", async () => {
    // Given
    const { registerLockIpc } = await import("./lock-ipc");
    const controller = new RecordingLockController();
    const controlWebContents = { id: 10 };
    const qrWebContents = { id: 20 };

    registerLockIpc(() => controller, () => controlWebContents);

    // When
    const manualLockResponse = getInvokeHandler(IPC_CHANNELS.manualLock)({
      sender: qrWebContents
    });
    const learnResponse = getInvokeHandler(IPC_CHANNELS.learnCurrentQrTitle)({
      sender: qrWebContents
    });
    const listRegionsResponse = getInvokeHandler(IPC_CHANNELS.listUnlockRegions)({
      sender: qrWebContents
    });
    const goBackResponse = getInvokeHandler(IPC_CHANNELS.qrGoBack)({
      sender: qrWebContents
    });
    const goForwardResponse = getInvokeHandler(IPC_CHANNELS.qrGoForward)({
      sender: qrWebContents
    });
    const reloadResponse = getInvokeHandler(IPC_CHANNELS.qrReload)({
      sender: qrWebContents
    });
    const navigateResponse = await getInvokeHandler(IPC_CHANNELS.qrNavigateToUrl)(
      {
        sender: qrWebContents
      },
      "https://example.test/dashboard"
    );

    // Then
    expect(manualLockResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(learnResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(listRegionsResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(goBackResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(goForwardResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(reloadResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(navigateResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(controller.manualLockCalls).toBe(0);
    expect(controller.learnCurrentQrTitleCalls).toBe(0);
    expect(controller.listUnlockRegionsCalls).toBe(0);
    expect(controller.qrGoBackCalls).toBe(0);
    expect(controller.qrGoForwardCalls).toBe(0);
    expect(controller.qrReloadCalls).toBe(0);
    expect(controller.qrNavigateToUrlCalls).toBe(0);
  });

  it("allows lock actions from the control webContents", async () => {
    // Given
    const { registerLockIpc } = await import("./lock-ipc");
    const controller = new RecordingLockController();
    const controlWebContents = { id: 10 };

    registerLockIpc(() => controller, () => controlWebContents);

    // When
    const manualLockResponse = getInvokeHandler(IPC_CHANNELS.manualLock)({
      sender: controlWebContents
    });
    const learnResponse = getInvokeHandler(IPC_CHANNELS.learnCurrentQrTitle)({
      sender: controlWebContents
    });
    const listRegionsResponse = getInvokeHandler(IPC_CHANNELS.listUnlockRegions)({
      sender: controlWebContents
    });
    const goBackResponse = getInvokeHandler(IPC_CHANNELS.qrGoBack)({
      sender: controlWebContents
    });
    const goForwardResponse = getInvokeHandler(IPC_CHANNELS.qrGoForward)({
      sender: controlWebContents
    });
    const reloadResponse = getInvokeHandler(IPC_CHANNELS.qrReload)({
      sender: controlWebContents
    });
    const navigateResponse = await getInvokeHandler(IPC_CHANNELS.qrNavigateToUrl)(
      {
        sender: controlWebContents
      },
      "https://example.test/dashboard"
    );

    // Then
    expect(manualLockResponse).toEqual({ ok: true });
    expect(learnResponse).toEqual({ ok: true });
    expect(listRegionsResponse).toEqual({ ok: true, regions: ["staff01"] });
    expect(goBackResponse).toEqual({ ok: true });
    expect(goForwardResponse).toEqual({ ok: true });
    expect(reloadResponse).toEqual({ ok: true });
    expect(navigateResponse).toEqual({ ok: true });
    expect(controller.manualLockCalls).toBe(1);
    expect(controller.learnCurrentQrTitleCalls).toBe(1);
    expect(controller.listUnlockRegionsCalls).toBe(1);
    expect(controller.qrGoBackCalls).toBe(1);
    expect(controller.qrGoForwardCalls).toBe(1);
    expect(controller.qrReloadCalls).toBe(1);
    expect(controller.qrNavigateToUrlCalls).toBe(1);
    expect(controller.qrNavigateToUrls).toEqual(["https://example.test/dashboard"]);
  });

  it("rejects disallowed QR address navigation from the control webContents", async () => {
    // Given
    const { registerLockIpc } = await import("./lock-ipc");
    const controller = new RecordingLockController();
    const controlWebContents = { id: 10 };

    registerLockIpc(() => controller, () => controlWebContents);

    // When
    const response = await getInvokeHandler(IPC_CHANNELS.qrNavigateToUrl)(
      {
        sender: controlWebContents
      },
      "file:///etc/passwd"
    );

    // Then
    expect(response).toEqual({
      errors: ["허용되지 않은 QR 주소입니다."],
      ok: false
    });
    expect(controller.qrNavigateToUrlCalls).toBe(0);
  });
});

class RecordingLockController implements LockController {
  learnCurrentQrTitleCalls = 0;
  listUnlockRegionsCalls = 0;
  manualLockCalls = 0;
  qrGoBackCalls = 0;
  qrGoForwardCalls = 0;
  qrNavigateToUrlCalls = 0;
  readonly qrNavigateToUrls: string[] = [];
  qrReloadCalls = 0;

  clearQrLoadFailure(): void {
    return;
  }

  closeSettings(): void {
    return;
  }

  completeSetup(): void {
    return;
  }

  getState(): StateSnapshot {
    return {
      activeUserId: null,
      canGoBack: false,
      canGoForward: false,
      currentUrl: "",
      now: "2026-06-26T00:00:00.000Z",
      qrLoadFailure: null,
      qrVisible: false,
      remainingMs: null,
      state: "locked",
      unlockExpiresAt: null
    };
  }

  learnCurrentQrTitle(): { readonly ok: true } {
    this.learnCurrentQrTitleCalls += 1;

    return { ok: true };
  }

  listUnlockRegions(): readonly string[] {
    this.listUnlockRegionsCalls += 1;

    return ["staff01"];
  }

  manualLock(): void {
    this.manualLockCalls += 1;
  }

  qrGoBack(): void {
    this.qrGoBackCalls += 1;
  }

  qrGoForward(): void {
    this.qrGoForwardCalls += 1;
  }

  qrReload(): void {
    this.qrReloadCalls += 1;
  }

  qrNavigateToUrl(url: string): Promise<{ readonly ok: true }> {
    this.qrNavigateToUrlCalls += 1;
    this.qrNavigateToUrls.push(url);

    return Promise.resolve({ ok: true });
  }

  openSettings(): void {
    return;
  }

  setQrLoadFailure(): void {
    return;
  }

  submitSiteLogin(_code: unknown): UnlockResponse {
    return {
      ok: true,
      state: this.getState()
    };
  }

  submitUnlock(_userId: unknown, _code: unknown): UnlockResponse {
    return {
      ok: true,
      state: this.getState()
    };
  }
}

const getInvokeHandler = (channel: string): InvokeHandler => {
  const handler = invokeHandlers.get(channel);

  if (handler === undefined) {
    throw new Error(`Missing invoke handler: ${channel}`);
  }

  return handler;
};
