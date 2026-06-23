import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SiteCredentialAutofill,
  type SiteCredentialInput,
  type SiteCredentialRepository
} from "../core/site-credentials";
import { IPC_CHANNELS } from "../core/shell-config";

interface TestWebContents {
  readonly id: number;
  readonly sentMessages: SentMessage[];
  readonly getURL: () => string;
  readonly send: (channel: string, ...payloads: readonly unknown[]) => void;
}

interface TestIpcEvent {
  readonly sender: TestWebContents;
}

interface SentMessage {
  readonly channel: string;
  readonly payloads: readonly unknown[];
}

interface ParsedSaveOffer {
  readonly offerId: string;
  readonly origin: string;
  readonly username: string;
}

type InvokeHandler = (event: TestIpcEvent, ...args: readonly unknown[]) => unknown;
type EventHandler = (event: TestIpcEvent, payload: unknown) => void;

const invokeHandlers = new Map<string, InvokeHandler>();
const eventHandlers = new Map<string, EventHandler>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: InvokeHandler): void => {
      invokeHandlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: EventHandler): void => {
      eventHandlers.set(channel, handler);
    })
  }
}));

describe("site credential IPC", () => {
  beforeEach(() => {
    invokeHandlers.clear();
    eventHandlers.clear();
    vi.resetModules();
  });

  it("uses the QR sender URL for autofill instead of the renderer supplied origin", async () => {
    // Given
    const { registerSiteCredentialIpc } = await import("./site-credential-ipc");
    const repository = new RecordingSiteCredentialRepository();
    const qrWebContents = createWebContents(10, "https://real.example.test/login");
    const controlWebContents = createWebContents(20, "file:///control.html");
    repository.setAutofillCredential("https://real.example.test", {
      password: "saved-password",
      username: "operator01"
    });
    registerSiteCredentialIpc({
      getControlWebContents: () => controlWebContents,
      getQrWebContents: () => qrWebContents,
      repository
    });

    // When
    const response = getInvokeHandler(IPC_CHANNELS.siteCredentialAutofillRequest)(
      { sender: qrWebContents },
      "https://spoofed.example.test"
    );

    // Then
    expect(repository.autofillLookups).toEqual(["https://real.example.test"]);
    expect(response).toEqual({
      credential: {
        password: "saved-password",
        username: "operator01"
      },
      ok: true
    });
  });

  it("uses the QR sender URL for captured credentials instead of payload origin", async () => {
    // Given
    const { registerSiteCredentialIpc } = await import("./site-credential-ipc");
    const repository = new RecordingSiteCredentialRepository();
    const qrWebContents = createWebContents(10, "https://real.example.test/login");
    const controlWebContents = createWebContents(20, "file:///control.html");
    registerSiteCredentialIpc({
      getControlWebContents: () => controlWebContents,
      getQrWebContents: () => qrWebContents,
      repository
    });

    // When
    getEventHandler(IPC_CHANNELS.siteCredentialCaptured)({ sender: qrWebContents }, {
      origin: "https://spoofed.example.test",
      password: "captured-password",
      username: " operator01 "
    });
    const offer = readSaveOffer(controlWebContents.sentMessages[0]?.payloads[0]);
    getInvokeHandler(IPC_CHANNELS.siteCredentialSaveDecision)({ sender: controlWebContents }, {
      decision: "save",
      offerId: offer?.offerId
    });

    // Then
    expect(repository.offerChecks).toEqual(["https://real.example.test"]);
    expect(offer).toEqual({
      offerId: offer?.offerId,
      origin: "https://real.example.test",
      username: "operator01"
    });
    expect(repository.savedCredentials).toEqual([
      {
        origin: "https://real.example.test",
        password: "captured-password",
        username: "operator01"
      }
    ]);
  });
});

class RecordingSiteCredentialRepository implements SiteCredentialRepository {
  readonly autofillLookups: string[] = [];
  readonly offerChecks: string[] = [];
  readonly savedCredentials: SiteCredentialInput[] = [];

  private readonly autofillCredentials = new Map<string, SiteCredentialAutofill>();

  blockSavePromptsForOrigin(_origin: string): void {
    return;
  }

  deleteCredential(_id: string): void {
    return;
  }

  getAutofillCredential(origin: string): SiteCredentialAutofill | null {
    this.autofillLookups.push(origin);

    return this.autofillCredentials.get(origin) ?? null;
  }

  listCredentials(): readonly [] {
    return [];
  }

  saveCredential(credential: SiteCredentialInput, _updatedAt: string): void {
    this.savedCredentials.push(credential);
  }

  setAutofillCredential(origin: string, credential: SiteCredentialAutofill): void {
    this.autofillCredentials.set(origin, credential);
  }

  shouldOfferToSave(origin: string): boolean {
    this.offerChecks.push(origin);

    return true;
  }
}

const createWebContents = (id: number, url: string): TestWebContents => {
  const sentMessages: SentMessage[] = [];

  return {
    getURL: () => url,
    id,
    send: (channel: string, ...payloads: readonly unknown[]): void => {
      sentMessages.push({ channel, payloads });
    },
    sentMessages
  };
};

const getInvokeHandler = (channel: string): InvokeHandler => {
  const handler = invokeHandlers.get(channel);

  if (handler === undefined) {
    throw new Error(`Missing invoke handler: ${channel}`);
  }

  return handler;
};

const getEventHandler = (channel: string): EventHandler => {
  const handler = eventHandlers.get(channel);

  if (handler === undefined) {
    throw new Error(`Missing event handler: ${channel}`);
  }

  return handler;
};

const readSaveOffer = (value: unknown): ParsedSaveOffer | null => {
  if (!isRecord(value)) {
    return null;
  }

  const offerId = readString(value, "offerId");
  const origin = readString(value, "origin");
  const username = readString(value, "username");

  return offerId === null || origin === null || username === null
    ? null
    : {
        offerId,
        origin,
        username
      };
};

const readString = (
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = record[key];

  return typeof value === "string" ? value : null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
