import { screen, type BaseWindow, type Rectangle } from "electron";

import { formatUnknownError, mainLogger } from "./logger";
import { readOptionalTextFile, writeAtomicTextFile } from "./text-file-io";

export interface WindowState {
  readonly bounds: Rectangle;
  readonly maximized: boolean;
}

export const loadWindowState = (filePath: string): WindowState | null => {
  try {
    const parsed: unknown = JSON.parse(readOptionalTextFile(filePath) ?? "null");

    if (!isWindowState(parsed)) {
      return null;
    }

    // Drop positions left on a monitor that is no longer attached.
    const onScreen = screen.getAllDisplays().some((display) => intersects(display.workArea, parsed.bounds));

    return onScreen ? parsed : null;
  } catch (error: unknown) {
    mainLogger.warn("Ignoring unreadable window state.", { error: formatUnknownError(error) });

    return null;
  }
};

export const persistWindowStateOnClose = (window: BaseWindow, filePath: string): void => {
  window.on("close", () => {
    try {
      writeAtomicTextFile(
        filePath,
        JSON.stringify({ bounds: window.getNormalBounds(), maximized: window.isMaximized() })
      );
    } catch (error: unknown) {
      mainLogger.warn("Failed to save window state.", { error: formatUnknownError(error) });
    }
  });
};

const intersects = (area: Rectangle, bounds: Rectangle): boolean =>
  bounds.x < area.x + area.width &&
  bounds.x + bounds.width > area.x &&
  bounds.y < area.y + area.height &&
  bounds.y + bounds.height > area.y;

const isWindowState = (value: unknown): value is WindowState => {
  if (typeof value !== "object" || value === null || !("bounds" in value) || !("maximized" in value)) {
    return false;
  }

  const bounds: unknown = value.bounds;

  return (
    typeof value.maximized === "boolean" &&
    typeof bounds === "object" &&
    bounds !== null &&
    ["x", "y", "width", "height"].every((key) => Number.isFinite((bounds as Record<string, unknown>)[key]))
  );
};
