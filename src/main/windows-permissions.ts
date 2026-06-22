import type { Session, WebContents } from "electron";

import { isAllowedQrNavigation } from "../core/qr-navigation";

export interface DevToolsShortcutInput {
  readonly alt?: boolean;
  readonly control?: boolean;
  readonly key: string;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

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

export const isDevToolsShortcut = (input: DevToolsShortcutInput): boolean => {
  const key = input.key.toLowerCase();
  const hasControlShift = input.control === true && input.shift === true;
  const hasMacInspectorModifiers = input.meta === true && input.alt === true;
  const isInspectorKey = key === "i" || key === "j" || key === "c";

  return key === "f12" || (isInspectorKey && (hasControlShift || hasMacInspectorModifiers));
};

export const disableDevToolsAccess = (webContents: WebContents): void => {
  webContents.on("before-input-event", (event, input) => {
    if (isDevToolsShortcut(input)) {
      event.preventDefault();
    }
  });
  webContents.on("devtools-opened", () => {
    webContents.closeDevTools();
  });

  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools();
  }
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
  permissionSession: Session = webContents.session,
  disableDevTools = false
): void => {
  denyUnexpectedNewWindows(webContents);
  disableGuestWebViews(webContents);
  denyPermissionRequestsByDefault(permissionSession);

  if (disableDevTools) {
    disableDevToolsAccess(webContents);
  }
};
