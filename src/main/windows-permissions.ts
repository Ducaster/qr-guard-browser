import type { Session, WebContents } from "electron";

import { isAllowedQrNavigation } from "../core/qr-navigation";

export interface ControlNavigationGuardOptions {
  readonly controlDevServerUrl?: string;
  readonly controlHtmlUrl: string;
}

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

export const isAllowedControlNavigation = (
  navigationUrl: string,
  options: ControlNavigationGuardOptions
): boolean => {
  const parsedUrl = parseUrl(navigationUrl);

  if (parsedUrl === null) {
    return false;
  }

  if (options.controlDevServerUrl !== undefined) {
    const devServerUrl = parseUrl(options.controlDevServerUrl);

    return devServerUrl !== null && parsedUrl.origin === devServerUrl.origin;
  }

  const controlHtmlUrl = parseUrl(options.controlHtmlUrl);

  return (
    controlHtmlUrl !== null &&
    parsedUrl.protocol === "file:" &&
    parsedUrl.protocol === controlHtmlUrl.protocol &&
    parsedUrl.pathname === controlHtmlUrl.pathname
  );
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

export const denyDisallowedControlNavigations = (
  webContents: WebContents,
  options: ControlNavigationGuardOptions
): void => {
  const preventIfDisallowed = (event: Electron.Event, navigationUrl: string): void => {
    if (!isAllowedControlNavigation(navigationUrl, options)) {
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

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }
};
