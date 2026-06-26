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

    // Then
    expect(manualLockResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(learnResponse).toEqual({
      errors: ["허용되지 않은 요청입니다."],
      ok: false
    });
    expect(controller.manualLockCalls).toBe(0);
    expect(controller.learnCurrentQrTitleCalls).toBe(0);
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

    // Then
    expect(manualLockResponse).toEqual({ ok: true });
    expect(learnResponse).toEqual({ ok: true });
    expect(controller.manualLockCalls).toBe(1);
    expect(controller.learnCurrentQrTitleCalls).toBe(1);
  });
});

class RecordingLockController implements LockController {
  learnCurrentQrTitleCalls = 0;
  manualLockCalls = 0;

  closeSettings(): void {
    return;
  }

  completeSetup(): void {
    return;
  }

  getState(): StateSnapshot {
    return {
      activeUserId: null,
      now: "2026-06-26T00:00:00.000Z",
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

  manualLock(): void {
    this.manualLockCalls += 1;
  }

  openSettings(): void {
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
