import type { WebContents } from "electron";

import { isAllowedQrNavigation } from "../core/qr-navigation";
import { mainLogger } from "./logger";

export const QR_BLANK_FALLBACK_URL = "about:blank";

export const isQrBlankFallbackUrl = (url: string): boolean =>
  url === QR_BLANK_FALLBACK_URL || url.length === 0;

export const loadQrUrlOrBlank = async (
  webContents: Pick<WebContents, "loadURL">,
  url: string
): Promise<void> => {
  if (!isAllowedQrNavigation(url)) {
    mainLogger.warn("Refusing to load disallowed QR URL.", { url });
    await webContents.loadURL(QR_BLANK_FALLBACK_URL);
    return;
  }

  await webContents.loadURL(url);
};
