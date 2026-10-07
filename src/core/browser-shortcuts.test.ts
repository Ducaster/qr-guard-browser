import { describe, expect, it } from "vitest";

import { nextZoomLevel, resolveBrowserShortcut } from "./browser-shortcuts";

describe("browser shortcuts", () => {
  it("maps common browser keys and ignores plain typing", () => {
    // Given
    const inputs = [
      { key: "F5" },
      { control: true, key: "r" },
      { alt: true, key: "ArrowLeft" },
      { alt: true, key: "ArrowRight" },
      { control: true, key: "l" },
      { key: "Escape" },
      { control: true, key: "=" },
      { control: true, key: "-" },
      { control: true, key: "0" },
      { key: "r" },
      { key: "0" },
      { control: true, key: "r", type: "keyUp" }
    ];

    // When
    const shortcuts = inputs.map((input) => resolveBrowserShortcut(input));

    // Then
    expect(shortcuts).toEqual([
      "reload",
      "reload",
      "back",
      "forward",
      "focusAddress",
      "lock",
      "zoomIn",
      "zoomOut",
      "zoomReset",
      null,
      null,
      null
    ]);
  });

  it("clamps zoom levels", () => {
    expect(nextZoomLevel(4.8, "zoomIn")).toBe(5);
    expect(nextZoomLevel(-3, "zoomOut")).toBe(-3);
    expect(nextZoomLevel(2, "zoomReset")).toBe(0);
  });
});
