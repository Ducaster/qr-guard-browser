import type { WebContents } from "electron";

import { isAllowedQrNavigation } from "../core/qr-navigation";

type PermissionRequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (permissionGranted: boolean) => void
) => void;
type PermissionCheckHandler = (
  webContents: unknown,
  permission: string,
  requestingOrigin: string,
  details: unknown
) => boolean;

interface PermissionSession {
  readonly setPermissionCheckHandler: (handler: PermissionCheckHandler | null) => void;
  readonly setPermissionRequestHandler: (handler: PermissionRequestHandler | null) => void;
}

interface PreventableEvent {
  readonly preventDefault: () => void;
}

interface GuestWebViewTarget {
  readonly on: (eventName: "will-attach-webview", listener: (event: PreventableEvent) => void) => void;
}

type NavigationGuardTarget = Pick<WebContents, "on">;

interface DevToolsTarget {
  readonly closeDevTools: () => void;
  readonly isDevToolsOpened: () => boolean;
  readonly on: {
    (eventName: "before-input-event", listener: (event: PreventableEvent, input: DevToolsShortcutInput) => void): void;
    (eventName: "devtools-opened", listener: () => void): void;
  };
}

interface WindowOpenDetails {
  readonly url: string;
}

type WindowOpenResult = Readonly<{ readonly action: "deny" }>;
type WindowOpenHandler = (details: WindowOpenDetails) => WindowOpenResult;

interface PopupTarget {
  readonly setWindowOpenHandler: (handler: WindowOpenHandler) => void;
}

interface QrPopupTarget extends PopupTarget {
  readonly loadURL: (url: string) => Promise<void>;
}

interface PermissionedTarget {
  readonly session: PermissionSession;
}

type ControlHardeningWebContents = DevToolsTarget & GuestWebViewTarget & PermissionedTarget & PopupTarget;
type QrHardeningWebContents = DevToolsTarget & GuestWebViewTarget & QrPopupTarget;

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

export interface BrowserHardeningOptions {
  readonly disableDevTools: boolean;
}

export interface QrBrowserHardeningOptions extends BrowserHardeningOptions {
  readonly openAllowedPopupUrl?: (url: string) => void;
}

export const denyUnexpectedNewWindows = (webContents: PopupTarget): void => {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
};

export const redirectAllowedQrPopupsToCurrentView = (
  webContents: QrPopupTarget,
  openAllowedPopupUrl: (url: string) => void = (url) => {
    void webContents.loadURL(url);
  }
): void => {
  webContents.setWindowOpenHandler((details) => {
    if (isAllowedQrNavigation(details.url)) {
      // Keep login popups inside the covered QR view; uncovered OS windows would bypass the lock overlay.
      openAllowedPopupUrl(details.url);
    }

    return { action: "deny" };
  });
};

export const denyPermissionRequestsByDefault = (targetSession: PermissionSession): void => {
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  targetSession.setPermissionCheckHandler(() => false);
};

export const allowBrowserPermissionRequests = (targetSession: PermissionSession): void => {
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });
  targetSession.setPermissionCheckHandler(() => true);
};

export const disableGuestWebViews = (webContents: GuestWebViewTarget): void => {
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

export const disableDevToolsAccess = (webContents: DevToolsTarget): void => {
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

export const denyDisallowedQrNavigations = (webContents: NavigationGuardTarget): void => {
  const preventIfDisallowed = (event: PreventableEvent, navigationUrl: string): void => {
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
  webContents: NavigationGuardTarget,
  options: ControlNavigationGuardOptions
): void => {
  const preventIfDisallowed = (event: PreventableEvent, navigationUrl: string): void => {
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

export const hardenQrWebContents = (
  webContents: QrHardeningWebContents,
  permissionSession: PermissionSession,
  options: QrBrowserHardeningOptions
): void => {
  redirectAllowedQrPopupsToCurrentView(webContents, options.openAllowedPopupUrl);
  disableGuestWebViews(webContents);
  allowBrowserPermissionRequests(permissionSession);

  if (options.disableDevTools) {
    disableDevToolsAccess(webContents);
  }
};

export const hardenControlWebContents = (
  webContents: ControlHardeningWebContents,
  options: BrowserHardeningOptions
): void => {
  hardenWebContents(webContents, webContents.session, options.disableDevTools);
};

export const hardenWebContents = (
  webContents: ControlHardeningWebContents,
  permissionSession: PermissionSession = webContents.session,
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
