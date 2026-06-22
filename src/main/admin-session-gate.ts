import type { IpcMainInvokeEvent, WebContents } from "electron";

import { ADMIN_SESSION_TIMEOUT_MS, isAuthorizationValid } from "../core/admin-session";

interface AuthorizedSender {
  readonly authorizedAtMs: number;
  readonly webContents: WebContents;
}

const authorizedSenders = new Map<number, AuthorizedSender>();

export const authorizeSender = (event: IpcMainInvokeEvent): void => {
  const senderId = event.sender.id;

  authorizedSenders.set(senderId, {
    authorizedAtMs: Date.now(),
    webContents: event.sender
  });
  event.sender.once("destroyed", () => {
    const entry = authorizedSenders.get(senderId);

    if (entry?.webContents === event.sender) {
      authorizedSenders.delete(senderId);
    }
  });
};

export const revokeSender = (event: IpcMainInvokeEvent): void => {
  const entry = authorizedSenders.get(event.sender.id);

  if (entry?.webContents === event.sender) {
    authorizedSenders.delete(event.sender.id);
  }
};

export const isSenderAuthorized = (event: IpcMainInvokeEvent): boolean => {
  const entry = authorizedSenders.get(event.sender.id);

  if (entry === undefined) {
    return false;
  }

  if (entry.webContents !== event.sender) {
    authorizedSenders.delete(event.sender.id);
    return false;
  }

  if (!isAuthorizationValid(entry.authorizedAtMs, Date.now(), ADMIN_SESSION_TIMEOUT_MS)) {
    authorizedSenders.delete(event.sender.id);
    return false;
  }

  return true;
};
