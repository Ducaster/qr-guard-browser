import { app, BaseWindow, nativeTheme, session, WebContentsView, type Rectangle } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { cleanQrUserAgent } from "../core/qr-user-agent";
import { APP_NAME } from "../core/sanity";
import type { QrLoadFailure } from "../core/state-machine";
import {
  CONTROL_TOOLBAR_HEIGHT,
  CONTROL_VIEW_WEB_PREFERENCES,
  CREDENTIAL_PROMPT_BAND_HEIGHT,
  QR_SESSION_PARTITION,
  QR_VIEW_WEB_PREFERENCES
} from "../core/shell-config";
import { formatUnknownError, mainLogger } from "./logger";
import { attachQrNetDiagnostics, getQrNetDiagnosticsLogPath } from "./qr-net-diagnostics";
import { isQrBlankFallbackUrl, loadQrUrlOrBlank } from "./qr-url-loader";
import {
  denyDisallowedControlNavigations,
  denyDisallowedQrNavigations,
  hardenControlWebContents,
  hardenQrWebContents
} from "./windows-permissions";

export interface ShellWindow {
  readonly window: BaseWindow;
  readonly qrView: WebContentsView;
  readonly controlView: WebContentsView;
  readonly load: () => Promise<void>;
  readonly setCredentialPromptVisible: (visible: boolean) => void;
  readonly setQrVisible: (visible: boolean) => void;
  readonly isQrVisible: () => boolean;
}

export interface ShellWindowOptions {
  readonly controlDevServerUrl?: string;
  readonly controlHtmlPath: string;
  readonly disableDevTools: boolean;
  readonly initialBounds?: Rectangle;
  readonly onQrLoadStatusChanged?: (failure: QrLoadFailure | null) => void;
  readonly preloadPath: string;
  readonly qrPreloadPath: string;
  readonly qrUrl?: string;
}

const INITIAL_BOUNDS = {
  height: 800,
  width: 1280
} as const;

const RENDERER_HANG_RECOVERY_MS = 15_000;
const DARK_NEUTRAL_BACKGROUND = "#1f1f1f" as const;
const LIGHT_NEUTRAL_BACKGROUND = "#f3f2f1" as const;

const isQrNetDiagnosticsEnabled = (): boolean => process.env["QR_GUARD_NET_DIAGNOSTICS"] === "1";

const getContentBounds = (window: BaseWindow): Rectangle => {
  const [width, height] = window.getContentSize();

  return {
    height: height ?? INITIAL_BOUNDS.height,
    width: width ?? INITIAL_BOUNDS.width,
    x: 0,
    y: 0
  };
};

const applyFullWindowLayout = (
  window: BaseWindow,
  qrView: WebContentsView,
  controlView: WebContentsView,
  qrVisible: boolean,
  credentialPromptVisible = false
): void => {
  const bounds = getContentBounds(window);

  qrView.setBounds(bounds);
  controlView.setBounds(
    qrVisible
      ? {
          height: CONTROL_TOOLBAR_HEIGHT + (credentialPromptVisible ? CREDENTIAL_PROMPT_BAND_HEIGHT : 0),
          width: bounds.width,
          x: 0,
          y: 0
        }
      : bounds
  );
};

const getSystemNeutralBackground = (): string =>
  nativeTheme.shouldUseDarkColors ? DARK_NEUTRAL_BACKGROUND : LIGHT_NEUTRAL_BACKGROUND;

export const createShellWindow = (options: ShellWindowOptions): ShellWindow => {
  const window = new BaseWindow({
    backgroundColor: getSystemNeutralBackground(),
    show: false,
    title: APP_NAME,
    ...(options.initialBounds ?? INITIAL_BOUNDS)
  });
  window.setMinimumSize(720, 540);
  let credentialPromptVisible = false;

  const qrSession = session.fromPartition(QR_SESSION_PARTITION);
  if (isQrNetDiagnosticsEnabled()) {
    attachQrNetDiagnostics(qrSession, {
      logFilePath: getQrNetDiagnosticsLogPath(app.getPath("userData"))
    });
  }
  const qrView = new WebContentsView({
    webPreferences: {
      ...QR_VIEW_WEB_PREFERENCES,
      preload: options.qrPreloadPath,
      session: qrSession
    }
  });
  qrView.webContents.setUserAgent(cleanQrUserAgent(qrView.webContents.getUserAgent()));
  const controlView = new WebContentsView({
    webPreferences: {
      ...CONTROL_VIEW_WEB_PREFERENCES,
      preload: options.preloadPath
    }
  });

  const reportQrLoadFailure = (message: string, qrUrl: string, error: unknown): void => {
    mainLogger.warn(message, {
      error: formatUnknownError(error),
      url: qrUrl
    });
    options.onQrLoadStatusChanged?.({
      errorCode: null,
      errorDescription: formatQrLoadErrorDescription(error),
      url: qrUrl
    });
  };
  const loadAllowedQrPopupUrl = (popupUrl: string): void => {
    void loadQrUrlOrBlank(qrView.webContents, popupUrl)
      .then(() => {
        options.onQrLoadStatusChanged?.(null);
      })
      .catch((error: unknown) => {
        reportQrLoadFailure("QR popup URL failed to load.", popupUrl, error);
      });
  };

  hardenQrWebContents(qrView.webContents, qrSession, {
    disableDevTools: options.disableDevTools,
    openAllowedPopupUrl: loadAllowedQrPopupUrl
  });
  denyDisallowedQrNavigations(qrView.webContents);
  hardenControlWebContents(controlView.webContents, {
    disableDevTools: options.disableDevTools
  });
  denyDisallowedControlNavigations(controlView.webContents, {
    controlHtmlUrl: pathToFileURL(options.controlHtmlPath).href,
    ...(options.controlDevServerUrl === undefined ? {} : { controlDevServerUrl: options.controlDevServerUrl })
  });

  qrView.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || isQrBlankFallbackUrl(validatedUrl)) {
        return;
      }

      options.onQrLoadStatusChanged?.({
        errorCode,
        errorDescription,
        url: validatedUrl
      });
    }
  );
  qrView.webContents.on("did-finish-load", () => {
    if (!isQrBlankFallbackUrl(qrView.webContents.getURL())) {
      options.onQrLoadStatusChanged?.(null);
    }
  });

  const recoverRenderer = (label: "Control" | "QR", target: Electron.WebContents): void => {
    let hangRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    const clearHangRecovery = (): void => {
      if (hangRecoveryTimer !== null) {
        clearTimeout(hangRecoveryTimer);
        hangRecoveryTimer = null;
      }
    };

    target.on("render-process-gone", (_event, details) => {
      clearHangRecovery();

      if (details.reason === "clean-exit" || target.isDestroyed()) {
        return;
      }

      mainLogger.warn(`${label} renderer process exited; reloading.`, {
        exitCode: details.exitCode,
        reason: details.reason,
        url: target.getURL()
      });
      target.reload();
    });
    target.on("unresponsive", () => {
      mainLogger.warn(`${label} renderer is unresponsive.`, { url: target.getURL() });

      if (hangRecoveryTimer !== null) {
        return;
      }

      hangRecoveryTimer = setTimeout(() => {
        hangRecoveryTimer = null;

        if (target.isDestroyed()) {
          return;
        }

        mainLogger.warn(`${label} renderer remained unresponsive; reloading.`, {
          url: target.getURL()
        });
        target.reload();
      }, RENDERER_HANG_RECOVERY_MS);
    });
    target.on("responsive", clearHangRecovery);
    target.on("destroyed", clearHangRecovery);
  };

  recoverRenderer("QR", qrView.webContents);
  recoverRenderer("Control", controlView.webContents);

  const applyThemeBackground = (): void => {
    const backgroundColor = getSystemNeutralBackground();

    window.setBackgroundColor(backgroundColor);
    controlView.setBackgroundColor(backgroundColor);
  };

  applyThemeBackground();
  nativeTheme.on("updated", applyThemeBackground);
  window.once("closed", () => {
    nativeTheme.off("updated", applyThemeBackground);
  });

  window.contentView.addChildView(qrView);
  window.contentView.addChildView(controlView);
  applyFullWindowLayout(window, qrView, controlView, false);

  const relayout = (): void => {
    applyFullWindowLayout(window, qrView, controlView, qrView.getVisible(), credentialPromptVisible);
  };

  window.on("resize", relayout);

  const load = async (): Promise<void> => {
    if (options.qrUrl !== undefined) {
      const qrUrl = options.qrUrl;

      void loadQrUrlOrBlank(qrView.webContents, qrUrl)
        .then(() => {
          options.onQrLoadStatusChanged?.(null);
        })
        .catch((error: unknown) => {
          reportQrLoadFailure("QR site failed to load.", qrUrl, error);
        });
    }

    await (options.controlDevServerUrl === undefined
      ? controlView.webContents.loadFile(options.controlHtmlPath)
      : controlView.webContents.loadURL(options.controlDevServerUrl));
  };

  const setQrVisible = (visible: boolean): void => {
    qrView.setVisible(visible);
    qrView.webContents.setBackgroundThrottling(!visible);
    qrView.webContents.setAudioMuted(!visible);
    applyFullWindowLayout(window, qrView, controlView, visible, credentialPromptVisible);

    if (!visible) {
      controlView.webContents.focus();
    }
  };

  const isQrVisible = (): boolean => qrView.getVisible();

  return {
    controlView,
    isQrVisible,
    load,
    qrView,
    setCredentialPromptVisible: (visible: boolean) => {
      credentialPromptVisible = visible;
      relayout();
    },
    setQrVisible,
    window
  };
};

export const getRendererHtmlPath = (rendererName: string): string =>
  path.join(__dirname, `../renderer/${rendererName}/index.html`);

const formatQrLoadErrorDescription = (error: unknown): string =>
  error instanceof Error ? error.message : formatUnknownError(error);
