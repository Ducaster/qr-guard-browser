import { BaseWindow, nativeTheme, session, WebContentsView, type Rectangle } from "electron";
import path from "node:path";

import { APP_NAME } from "../core/sanity";
import {
  CONTROL_VIEW_WEB_PREFERENCES,
  DEFAULT_FIXTURE_QR_URL,
  QR_SESSION_PARTITION,
  QR_VIEW_WEB_PREFERENCES
} from "../core/shell-config";
import { denyDisallowedQrNavigations, hardenWebContents } from "./windows-permissions";

export interface ShellWindow {
  readonly window: BaseWindow;
  readonly qrView: WebContentsView;
  readonly controlView: WebContentsView;
  readonly load: () => Promise<void>;
  readonly setQrVisible: (visible: boolean) => void;
  readonly isQrVisible: () => boolean;
}

export interface ShellWindowOptions {
  readonly controlDevServerUrl?: string;
  readonly controlHtmlPath: string;
  readonly disableDevTools: boolean;
  readonly preloadPath: string;
  readonly qrPreloadPath: string;
  readonly qrUrl?: string;
}

const INITIAL_BOUNDS = {
  height: 800,
  width: 1280
} as const;

const CONTROL_TOOLBAR_HEIGHT = 64;
const DARK_NEUTRAL_BACKGROUND = "#1f1f1f" as const;
const LIGHT_NEUTRAL_BACKGROUND = "#f3f2f1" as const;

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
  qrVisible: boolean
): void => {
  const bounds = getContentBounds(window);

  qrView.setBounds(bounds);
  controlView.setBounds(
    qrVisible
      ? {
          height: CONTROL_TOOLBAR_HEIGHT,
          width: bounds.width,
          x: 0,
          y: 0
        }
      : bounds
  );
};

const getQrUrl = (qrUrl: string | undefined): string => qrUrl ?? DEFAULT_FIXTURE_QR_URL;

const getSystemNeutralBackground = (): string =>
  nativeTheme.shouldUseDarkColors ? DARK_NEUTRAL_BACKGROUND : LIGHT_NEUTRAL_BACKGROUND;

export const createShellWindow = (options: ShellWindowOptions): ShellWindow => {
  const window = new BaseWindow({
    backgroundColor: getSystemNeutralBackground(),
    height: INITIAL_BOUNDS.height,
    show: false,
    title: APP_NAME,
    width: INITIAL_BOUNDS.width
  });

  const qrSession = session.fromPartition(QR_SESSION_PARTITION);
  const qrView = new WebContentsView({
    webPreferences: {
      ...QR_VIEW_WEB_PREFERENCES,
      preload: options.qrPreloadPath,
      session: qrSession
    }
  });
  const controlView = new WebContentsView({
    webPreferences: {
      ...CONTROL_VIEW_WEB_PREFERENCES,
      preload: options.preloadPath
    }
  });

  hardenWebContents(qrView.webContents, qrSession, options.disableDevTools);
  denyDisallowedQrNavigations(qrView.webContents);
  hardenWebContents(controlView.webContents, controlView.webContents.session, options.disableDevTools);

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

  window.on("resize", () => {
    applyFullWindowLayout(window, qrView, controlView, qrView.getVisible());
  });

  const load = async (): Promise<void> => {
    await Promise.all([
      qrView.webContents.loadURL(getQrUrl(options.qrUrl)),
      options.controlDevServerUrl === undefined
        ? controlView.webContents.loadFile(options.controlHtmlPath)
        : controlView.webContents.loadURL(options.controlDevServerUrl)
    ]);
  };

  const setQrVisible = (visible: boolean): void => {
    qrView.setVisible(visible);
    applyFullWindowLayout(window, qrView, controlView, visible);

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
    setQrVisible,
    window
  };
};

export const getRendererHtmlPath = (rendererName: string): string =>
  path.join(__dirname, `../renderer/${rendererName}/index.html`);
