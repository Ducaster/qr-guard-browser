import type { WebContents } from "electron";

export type QrNavigationEvent =
  | "did-navigate"
  | "did-navigate-in-page"
  | "did-redirect-navigation"
  | "page-title-updated";

export interface QrWebContentsLike {
  readonly getTitle: () => string;
  readonly getURL: () => string;
  readonly on: (event: QrNavigationEvent, listener: () => void) => void;
}

export interface QrNavigationSnapshot {
  readonly title: string;
  readonly url: string;
}

const QR_NAVIGATION_EVENTS = [
  "did-navigate",
  "did-navigate-in-page",
  "did-redirect-navigation",
  "page-title-updated"
] as const satisfies readonly QrNavigationEvent[];

export const readQrNavigationSnapshot = (
  webContents: QrWebContentsLike
): QrNavigationSnapshot => ({
  title: webContents.getTitle(),
  url: webContents.getURL()
});

export const watchQrNavigation = (
  webContents: QrWebContentsLike,
  listener: () => void
): void => {
  for (const event of QR_NAVIGATION_EVENTS) {
    webContents.on(event, listener);
  }
};

export const createQrWebContentsAdapter = (webContents: WebContents): QrWebContentsLike => ({
  getTitle: () => webContents.getTitle(),
  getURL: () => webContents.getURL(),
  on: (event: QrNavigationEvent, listener: () => void): void => {
    switch (event) {
      case "did-navigate":
        webContents.on("did-navigate", listener);
        return;
      case "did-navigate-in-page":
        webContents.on("did-navigate-in-page", listener);
        return;
      case "did-redirect-navigation":
        webContents.on("did-redirect-navigation", listener);
        return;
      case "page-title-updated":
        webContents.on("page-title-updated", listener);
        return;
    }
  }
});
