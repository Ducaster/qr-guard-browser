import { BaseWindow, session, WebContentsView, type Rectangle } from "electron";
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
  readonly preloadPath: string;
  readonly qrUrl?: string;
}

const INITIAL_BOUNDS = {
  height: 800,
  width: 1280
} as const;

const transparentColor = "#00000000" as const;

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
  controlView: WebContentsView
): void => {
  const bounds = getContentBounds(window);

  qrView.setBounds(bounds);
  controlView.setBounds(bounds);
};

const getQrUrl = (qrUrl: string | undefined): string => qrUrl ?? DEFAULT_FIXTURE_QR_URL;

export const createShellWindow = (options: ShellWindowOptions): ShellWindow => {
  const window = new BaseWindow({
    height: INITIAL_BOUNDS.height,
    show: false,
    title: APP_NAME,
    width: INITIAL_BOUNDS.width
  });

  const qrSession = session.fromPartition(QR_SESSION_PARTITION);
  const qrView = new WebContentsView({
    webPreferences: {
      ...QR_VIEW_WEB_PREFERENCES,
      session: qrSession
    }
  });
  const controlView = new WebContentsView({
    webPreferences: {
      ...CONTROL_VIEW_WEB_PREFERENCES,
      preload: options.preloadPath
    }
  });

  hardenWebContents(qrView.webContents, qrSession);
  denyDisallowedQrNavigations(qrView.webContents);
  hardenWebContents(controlView.webContents);

  controlView.setBackgroundColor(transparentColor);
  qrView.setVisible(false);

  window.contentView.addChildView(qrView);
  window.contentView.addChildView(controlView);
  // TODO(Todo 5): handle pointer-event passthrough and toolbar-strip resize when QR becomes visible.
  applyFullWindowLayout(window, qrView, controlView);

  window.on("resize", () => {
    applyFullWindowLayout(window, qrView, controlView);
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
