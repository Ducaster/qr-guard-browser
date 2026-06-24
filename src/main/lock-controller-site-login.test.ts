import { afterEach, describe, expect, it, vi } from "vitest";

import { createLockoutState, hashCode, type LockoutState } from "../core/auth";
import {
  ADMIN_SITE_LOGIN_AUDIT_USER_ID,
  parseAuditLog,
  toJsonl,
  type AuditEvent,
  type AuditLogFilter,
  type AuditLogReadResult
} from "../core/audit-log";
import { createDefaultSettings, type Settings, type SettingsRepository } from "../core/settings-repo";
import type { StateSnapshot } from "../core/state-machine";
import { createLockController, type LockControllerOptions } from "./lock-controller";
import type { AuditLogStore, LockoutStateStore } from "./settings-adapters";

class MemorySettingsRepository implements SettingsRepository {
  loadError: Error | null = null;
  readonly savedSettings: Settings[] = [];

  constructor(private settings: Settings) {}

  load(): Settings {
    if (this.loadError !== null) {
      throw this.loadError;
    }

    return this.settings;
  }

  save(settings: Settings): void {
    this.settings = settings;
    this.savedSettings.push(settings);
  }
}

class MemoryLockoutStateStore implements LockoutStateStore {
  saveCount = 0;

  constructor(private state: LockoutState = createLockoutState()) {}

  load(): LockoutState {
    return this.state;
  }

  save(state: LockoutState): void {
    this.state = state;
    this.saveCount += 1;
  }
}

class MemoryAuditLogStore implements AuditLogStore {
  readonly events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(event);
  }

  read(filter?: AuditLogFilter): AuditLogReadResult {
    return parseAuditLog(toJsonl(this.events), filter);
  }
}

type QrNavigationEvent =
  | "did-navigate"
  | "did-navigate-in-page"
  | "did-redirect-navigation"
  | "did-start-navigation"
  | "page-title-updated";

interface FakeQrNavigationTarget {
  readonly url: string;
}

class FakeQrWebContents {
  private readonly listeners = new Map<QrNavigationEvent, ((details?: FakeQrNavigationTarget) => void)[]>();
  private queuedTitles: string[] = [];

  constructor(
    private url: string,
    private title: string
  ) {}

  getTitle(): string {
    const queuedTitle = this.queuedTitles.shift();

    if (queuedTitle !== undefined) {
      return queuedTitle;
    }

    return this.title;
  }

  getURL(): string {
    return this.url;
  }

  on(event: QrNavigationEvent, listener: (details?: FakeQrNavigationTarget) => void): void {
    const listeners = this.listeners.get(event) ?? [];

    this.listeners.set(event, [...listeners, listener]);
  }

  setLocation(url: string, title: string): void {
    this.url = url;
    this.title = title;
  }

  setTitleReads(titles: readonly string[]): void {
    this.queuedTitles = [...titles];
  }

  trigger(event: QrNavigationEvent, details?: FakeQrNavigationTarget): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(details);
    }
  }
}

interface ControllerHarness {
  readonly auditLogStore: MemoryAuditLogStore;
  readonly controller: ReturnType<typeof createLockController>;
  readonly lockoutStateStore: MemoryLockoutStateStore;
  readonly qrWebContents: FakeQrWebContents;
  readonly repository: MemorySettingsRepository;
  readonly visibilityChanges: readonly boolean[];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("lock controller siteLogin mode", () => {
  it("enters siteLogin only after a valid admin code", () => {
    // Given
    const harness = createHarness();

    // When
    const result = harness.controller.submitSiteLogin("admin-code");

    // Then
    expect(result.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("siteLogin");
    expect(harness.controller.getState().qrVisible).toBe(true);
    expect(harness.controller.getState().remainingMs).toBeNull();
    expect(harness.controller.getState().activeUserId).toBe(ADMIN_SITE_LOGIN_AUDIT_USER_ID);
    expect(harness.visibilityChanges.at(-1)).toBe(true);
  });

  it("keeps QR locked and records a failed admin attempt when siteLogin receives a wrong code", () => {
    // Given
    const harness = createHarness();

    // When
    const result = harness.controller.submitSiteLogin("9999");

    // Then
    expect(result.ok).toBe(false);
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.lockoutStateStore.saveCount).toBe(1);
  });

  it("does not enter siteLogin with a regional code", () => {
    // Given
    const harness = createHarness();

    // When
    const result = harness.controller.submitSiteLogin("2468");

    // Then
    expect(result.ok).toBe(false);
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
  });

  it("applies the admin-code lockout to siteLogin", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness();

    // When
    harness.controller.submitSiteLogin("bad-1");
    harness.controller.submitSiteLogin("bad-2");
    const lockedResult = harness.controller.submitSiteLogin("bad-3");
    const validWhileLockedResult = harness.controller.submitSiteLogin("admin-code");

    // Then
    expect(lockedResult).toEqual({
      errors: ["관리자 코드가 올바르지 않습니다."],
      ok: false,
      retryAfterMs: 31_000
    });
    expect(validWhileLockedResult).toEqual({
      errors: ["실패 횟수가 너무 많습니다. 잠시 후 다시 시도하세요."],
      ok: false,
      retryAfterMs: 31_000
    });
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.lockoutStateStore.saveCount).toBe(3);
  });

  it("does not relock siteLogin when navigation leaves the login URL pattern", () => {
    // Given
    const harness = createHarness({
      qrUrl: "https://example.test/login"
    });
    harness.controller.submitSiteLogin("admin-code");

    // When
    harness.qrWebContents.trigger("did-start-navigation", {
      url: "https://example.test/step-one"
    });

    // Then
    expect(harness.controller.getState().state).toBe("siteLogin");
    expect(harness.controller.getState().qrVisible).toBe(true);
  });

  it("auto-locks siteLogin when the QR title pattern appears", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const harness = createHarness({ qrTitlePattern: "QR 코드" });
    harness.controller.submitSiteLogin("admin-code");

    // When
    vi.setSystemTime(new Date("2026-06-22T00:00:07.000Z"));
    harness.qrWebContents.setLocation("https://example.test/qr?token=random-1", "QR 코드");
    harness.qrWebContents.trigger("page-title-updated");

    // Then
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.auditLogStore.events.at(-1)).toEqual(
      expect.objectContaining({
        durationSeconds: 7,
        reason: "qr-title",
        userId: ADMIN_SITE_LOGIN_AUDIT_USER_ID
      })
    );
  });

  it("auto-locks siteLogin if the QR title pattern appears immediately after entry", () => {
    // Given
    const harness = createHarness({
      qrTitle: "로그인",
      qrTitlePattern: "QR 코드"
    });
    harness.qrWebContents.setTitleReads(["로그인", "QR 코드"]);

    // When
    const result = harness.controller.submitSiteLogin("admin-code");

    // Then
    expect(result.ok).toBe(true);
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.auditLogStore.events.at(-1)?.reason).toBe("qr-title");
  });

  it("fails safe and relocks when settings cannot load during QR navigation", () => {
    // Given
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const harness = createHarness();
    harness.controller.submitSiteLogin("admin-code");
    harness.repository.loadError = new Error("corrupted settings");

    // When
    expect(() => {
      harness.qrWebContents.trigger("page-title-updated");
    }).not.toThrow();

    // Then
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
    expect(harness.auditLogStore.events.at(-1)?.reason).toBe("manual");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load settings during QR navigation")
    );
  });

  it("learns the current QR title into settings and locks", () => {
    // Given
    const harness = createHarness({ qrTitle: "QR 코드 - 12번 창구" });
    harness.controller.submitSiteLogin("admin-code");

    // When
    const result = harness.controller.learnCurrentQrTitle();

    // Then
    expect(result).toEqual({ ok: true });
    expect(harness.repository.load().qrTitlePattern).toBe("QR 코드 - 12번 창구");
    expect(harness.controller.getState().state).toBe("locked");
    expect(harness.controller.getState().qrVisible).toBe(false);
  });

  it("manual lock, idle timeout, and safety cap all exit siteLogin through the gate", () => {
    // Given
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T00:00:00.000Z"));
    const manualHarness = createHarness();
    manualHarness.controller.submitSiteLogin("admin-code");

    // When
    manualHarness.controller.manualLock();

    // Then
    expect(manualHarness.controller.getState().state).toBe("locked");
    expect(manualHarness.auditLogStore.events.at(-1)?.reason).toBe("manual");

    // Given
    const idleHarness = createHarness({
      idleAutoLockSeconds: 5,
      idlePollIntervalMs: 100,
      idleSource: () => 5
    });
    idleHarness.controller.submitSiteLogin("admin-code");

    // When
    vi.advanceTimersByTime(100);

    // Then
    expect(idleHarness.controller.getState().state).toBe("locked");
    expect(idleHarness.auditLogStore.events.at(-1)?.reason).toBe("idle");

    // Given
    const capHarness = createHarness({ siteLoginTimeoutOverrideMs: 1_000 });
    capHarness.controller.submitSiteLogin("admin-code");

    // When
    vi.advanceTimersByTime(1_000);

    // Then
    expect(capHarness.controller.getState().state).toBe("locked");
    expect(capHarness.auditLogStore.events.at(-1)?.reason).toBe("timer");
  });
});

const createHarness = (options: {
  readonly idleAutoLockSeconds?: number;
  readonly idlePollIntervalMs?: number;
  readonly idleSource?: () => number;
  readonly qrTitle?: string;
  readonly qrTitlePattern?: string;
  readonly qrUrl?: string;
  readonly siteLoginTimeoutOverrideMs?: number;
} = {}): ControllerHarness => {
  const repository = new MemorySettingsRepository(createSettingsWithUser(options));
  const lockoutStateStore = new MemoryLockoutStateStore();
  const auditLogStore = new MemoryAuditLogStore();
  const visibilityChanges: boolean[] = [];
  const qrWebContents = new FakeQrWebContents(
    options.qrUrl ?? "https://example.test/home",
    options.qrTitle ?? "Home"
  );
  const controllerOptions = {
    appVersion: "test-version",
    auditLogStore,
    lockoutStateStore,
    repository,
    shellWindow: {
      controlView: {
        webContents: {
          send: (_channel: string, _state: StateSnapshot): void => undefined
        }
      },
      setQrVisible: (visible: boolean): void => {
        visibilityChanges.push(visible);
      }
    },
    ...(options.idlePollIntervalMs === undefined
      ? {}
      : { idlePollIntervalMs: options.idlePollIntervalMs }),
    ...(options.idleSource === undefined ? {} : { idleSource: options.idleSource }),
    ...(options.siteLoginTimeoutOverrideMs === undefined
      ? {}
      : { siteLoginTimeoutOverrideMs: options.siteLoginTimeoutOverrideMs }),
    qrWebContents
  } satisfies LockControllerOptions;

  return {
    auditLogStore,
    controller: createLockController(controllerOptions),
    lockoutStateStore,
    qrWebContents,
    repository,
    visibilityChanges
  };
};

const createSettingsWithUser = (
  options: {
    readonly idleAutoLockSeconds?: number;
    readonly qrTitlePattern?: string;
  } = {}
): Settings => {
  const user = hashCode("2468");
  const defaults = createDefaultSettings();

  return {
    ...defaults,
    admin: hashCode("admin-code"),
    idleAutoLockSeconds: options.idleAutoLockSeconds ?? defaults.idleAutoLockSeconds,
    qrTitlePattern: options.qrTitlePattern ?? defaults.qrTitlePattern,
    users: [
      {
        ...user,
        lastAuthenticatedAt: null,
        userId: "staff01"
      }
    ]
  };
};
