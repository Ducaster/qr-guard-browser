import { Menu, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from "electron";

import {
  nextZoomLevel,
  resolveBrowserShortcut,
  type BrowserShortcut,
  type ZoomShortcut
} from "../core/browser-shortcuts";

export interface BrowserShortcutHandlers {
  readonly isQrVisible: () => boolean;
  readonly run: (shortcut: BrowserShortcut) => void;
}

export const attachBrowserShortcuts = (
  webContents: WebContents,
  handlers: BrowserShortcutHandlers
): void => {
  webContents.on("before-input-event", (event, input) => {
    if (!handlers.isQrVisible()) {
      return;
    }

    const shortcut = resolveBrowserShortcut(input);

    if (shortcut !== null) {
      event.preventDefault();
      handlers.run(shortcut);
    }
  });
};

export const applyZoomShortcut = (webContents: WebContents, shortcut: ZoomShortcut): void => {
  webContents.setZoomLevel(nextZoomLevel(webContents.getZoomLevel(), shortcut));
};

export const attachCtrlWheelZoom = (webContents: WebContents): void => {
  webContents.on("zoom-changed", (_event, direction) => {
    applyZoomShortcut(webContents, direction === "in" ? "zoomIn" : "zoomOut");
  });
};

export const attachEditContextMenu = (webContents: WebContents): void => {
  webContents.on("context-menu", (_event, params) => {
    const template = buildEditMenuTemplate(params);

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup();
    }
  });
};

const buildEditMenuTemplate = (
  params: Pick<ContextMenuParams, "editFlags" | "isEditable" | "selectionText">
): MenuItemConstructorOptions[] => {
  if (params.isEditable) {
    return [
      { enabled: params.editFlags.canUndo, label: "실행 취소", role: "undo" },
      { type: "separator" },
      { enabled: params.editFlags.canCut, label: "잘라내기", role: "cut" },
      { enabled: params.editFlags.canCopy, label: "복사", role: "copy" },
      { enabled: params.editFlags.canPaste, label: "붙여넣기", role: "paste" },
      { type: "separator" },
      { enabled: params.editFlags.canSelectAll, label: "모두 선택", role: "selectAll" }
    ];
  }

  return params.selectionText.trim().length > 0 ? [{ label: "복사", role: "copy" }] : [];
};
