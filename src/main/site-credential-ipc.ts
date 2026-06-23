import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";

import {
  type ListSiteCredentialsResponse,
  type SiteCredentialAutofillResponse,
  type SiteCredentialSaveDecision,
  type SiteCredentialSaveDecisionPayload,
  type SiteCredentialSaveOffer
} from "../core/site-credential-messages";
import { getOriginFromUrl, type SiteCredentialRepository } from "../core/site-credentials";
import { IPC_CHANNELS } from "../core/shell-config";
import { isSenderAuthorized } from "./admin-session-gate";

interface ActionOkResponse {
  readonly ok: true;
}

interface ActionErrorResponse {
  readonly errors: readonly string[];
  readonly ok: false;
}

type ActionResponse = ActionOkResponse | ActionErrorResponse;

interface PendingCredentialOffer {
  readonly origin: string;
  readonly password: string;
  readonly username: string;
}

interface CapturedCredentialPayload {
  readonly password: string;
  readonly username: string;
}

interface SiteCredentialWebContents {
  readonly getURL: () => string;
  readonly id: number;
  readonly send: (channel: string, ...payloads: readonly unknown[]) => void;
}

export interface SiteCredentialIpcOptions {
  readonly getControlWebContents: () => SiteCredentialWebContents | undefined;
  readonly getQrWebContents: () => SiteCredentialWebContents | undefined;
  readonly repository: SiteCredentialRepository;
}

export const registerSiteCredentialIpc = (options: SiteCredentialIpcOptions): void => {
  const pendingOffers = new Map<string, PendingCredentialOffer>();

  ipcMain.handle(
    IPC_CHANNELS.siteCredentialAutofillRequest,
    (event: IpcMainInvokeEvent): SiteCredentialAutofillResponse => {
      if (!isFromWebContents(event, options.getQrWebContents())) {
        return { ok: false };
      }

      const origin = getOriginFromUrl(event.sender.getURL());

      if (origin === null) {
        return { ok: false };
      }

      return {
        credential: options.repository.getAutofillCredential(origin),
        ok: true
      };
    }
  );

  ipcMain.on(IPC_CHANNELS.siteCredentialCaptured, (event: IpcMainEvent, payload: unknown) => {
    if (!isFromWebContents(event, options.getQrWebContents())) {
      return;
    }

    const origin = getOriginFromUrl(event.sender.getURL());
    const credentialPayload = parseCapturePayload(payload);

    if (origin === null || credentialPayload === null || !options.repository.shouldOfferToSave(origin)) {
      return;
    }

    const credential = {
      origin,
      password: credentialPayload.password,
      username: credentialPayload.username
    } satisfies PendingCredentialOffer;
    const offerId = randomUUID();
    const offer = {
      offerId,
      origin: credential.origin,
      username: credential.username
    } satisfies SiteCredentialSaveOffer;

    pendingOffers.set(offerId, credential);
    options.getControlWebContents()?.send(IPC_CHANNELS.siteCredentialSaveOffered, offer);
  });

  ipcMain.handle(
    IPC_CHANNELS.siteCredentialSaveDecision,
    (event: IpcMainInvokeEvent, payload: unknown): ActionResponse => {
      if (!isFromWebContents(event, options.getControlWebContents())) {
        return errorResponse(["허용되지 않은 요청입니다."]);
      }

      const decision = parseDecisionPayload(payload);

      if (decision === null) {
        return errorResponse(["저장 선택을 처리할 수 없습니다."]);
      }

      const offer = pendingOffers.get(decision.offerId);
      pendingOffers.delete(decision.offerId);

      if (offer === undefined) {
        return okResponse();
      }

      applySaveDecision(options.repository, offer, decision.decision);

      return okResponse();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.siteCredentialList,
    (event: IpcMainInvokeEvent): ListSiteCredentialsResponse => {
      if (!isSenderAuthorized(event)) {
        return errorResponse(["관리자 인증이 필요합니다."]);
      }

      return {
        credentials: options.repository.listCredentials(),
        ok: true
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.siteCredentialDelete,
    (event: IpcMainInvokeEvent, id: unknown): ActionResponse => {
      if (!isSenderAuthorized(event)) {
        return errorResponse(["관리자 인증이 필요합니다."]);
      }

      if (typeof id !== "string") {
        return errorResponse(["저장된 로그인 항목을 찾을 수 없습니다."]);
      }

      options.repository.deleteCredential(id);

      return okResponse();
    }
  );
};

const applySaveDecision = (
  repository: SiteCredentialRepository,
  offer: PendingCredentialOffer,
  decision: SiteCredentialSaveDecision
): void => {
  switch (decision) {
    case "save":
      repository.saveCredential(offer, new Date().toISOString());
      return;
    case "never":
      repository.blockSavePromptsForOrigin(offer.origin);
      return;
    case "later":
      return;
  }
};

const parseCapturePayload = (payload: unknown): CapturedCredentialPayload | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const username = readString(payload, "username")?.trim() ?? "";
  const password = readString(payload, "password") ?? "";

  if (username.length === 0 || password.length === 0) {
    return null;
  }

  return {
    password,
    username
  };
};

const parseDecisionPayload = (payload: unknown): SiteCredentialSaveDecisionPayload | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const offerId = readString(payload, "offerId");
  const decision = readDecision(payload["decision"]);

  return offerId === null || decision === null
    ? null
    : {
        decision,
        offerId
      };
};

const readDecision = (value: unknown): SiteCredentialSaveDecision | null => {
  switch (value) {
    case "later":
    case "never":
    case "save":
      return value;
    default:
      return null;
  }
};

const isFromWebContents = (
  event: IpcMainEvent | IpcMainInvokeEvent,
  webContents: SiteCredentialWebContents | undefined
): boolean => event.sender.id === webContents?.id;

const readString = (
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = record[key];

  return typeof value === "string" ? value : null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const okResponse = (): ActionOkResponse => ({ ok: true });

const errorResponse = (errors: readonly string[]): ActionErrorResponse => ({
  errors,
  ok: false
});
