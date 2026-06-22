import type { Session, WebContents } from "electron";

import { isAllowedQrNavigation } from "../core/qr-navigation";

export const denyUnexpectedNewWindows = (webContents: WebContents): void => {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
};

export const denyPermissionRequestsByDefault = (targetSession: Session): void => {
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
};

export const disableGuestWebViews = (webContents: WebContents): void => {
  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
};

export const denyDisallowedQrNavigations = (webContents: WebContents): void => {
  const preventIfDisallowed = (event: Electron.Event, navigationUrl: string): void => {
    if (!isAllowedQrNavigation(navigationUrl)) {
      event.preventDefault();
    }
  };

  webContents.on("will-navigate", (event) => {
    preventIfDisallowed(event, event.url);
  });
  webContents.on("will-redirect", (event) => {
    if (event.isMainFrame) {
      preventIfDisallowed(event, event.url);
    }
  });
};

export const hardenWebContents = (
  webContents: WebContents,
  permissionSession: Session = webContents.session
): void => {
  denyUnexpectedNewWindows(webContents);
  disableGuestWebViews(webContents);
  denyPermissionRequestsByDefault(permissionSession);
};
