import { describe, expect, it } from "vitest";

import { isDevToolsShortcut } from "./windows-permissions";

describe("isDevToolsShortcut", () => {
  it("detects production DevTools accelerators", () => {
    // Given
    const shortcuts = [
      { key: "F12" },
      { control: true, key: "I", shift: true },
      { control: true, key: "J", shift: true },
      { control: true, key: "C", shift: true },
      { alt: true, key: "I", meta: true },
      { alt: true, key: "J", meta: true },
      { alt: true, key: "C", meta: true }
    ] as const;

    // When / Then
    expect(shortcuts.every((input) => isDevToolsShortcut(input))).toBe(true);
  });

  it("ignores normal app shortcuts", () => {
    // Given
    const shortcuts = [
      { key: "I" },
      { control: true, key: "I" },
      { key: "R", meta: true },
      { alt: true, key: "ArrowLeft", meta: true }
    ] as const;

    // When / Then
    expect(shortcuts.some((input) => isDevToolsShortcut(input))).toBe(false);
  });
});
