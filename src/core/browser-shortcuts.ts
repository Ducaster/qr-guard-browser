export type ZoomShortcut = "zoomIn" | "zoomOut" | "zoomReset";
export type BrowserShortcut = "back" | "focusAddress" | "forward" | "lock" | "reload" | ZoomShortcut;

export interface BrowserShortcutInput {
  readonly alt?: boolean;
  readonly control?: boolean;
  readonly key: string;
  readonly meta?: boolean;
  readonly type?: string;
}

const ZOOM_STEP = 0.5;
const MIN_ZOOM_LEVEL = -3;
const MAX_ZOOM_LEVEL = 5;

export const resolveBrowserShortcut = (input: BrowserShortcutInput): BrowserShortcut | null => {
  if (input.type !== undefined && input.type !== "keyDown") {
    return null;
  }

  const key = input.key.toLowerCase();
  const command = input.control === true || input.meta === true;

  if (key === "f5" || (command && key === "r")) {
    return "reload";
  }

  if (input.alt === true && key === "arrowleft") {
    return "back";
  }

  if (input.alt === true && key === "arrowright") {
    return "forward";
  }

  if (key === "escape") {
    return "lock";
  }

  if (!command) {
    return null;
  }

  switch (key) {
    case "l":
      return "focusAddress";
    case "=":
    case "+":
      return "zoomIn";
    case "-":
      return "zoomOut";
    case "0":
      return "zoomReset";
    default:
      return null;
  }
};

export const nextZoomLevel = (currentLevel: number, shortcut: ZoomShortcut): number => {
  switch (shortcut) {
    case "zoomIn":
      return Math.min(MAX_ZOOM_LEVEL, currentLevel + ZOOM_STEP);
    case "zoomOut":
      return Math.max(MIN_ZOOM_LEVEL, currentLevel - ZOOM_STEP);
    case "zoomReset":
      return 0;
  }
};
