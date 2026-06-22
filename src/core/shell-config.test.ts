import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  QR_SESSION_PARTITION,
  QR_SURFACE_KIND,
  QR_VIEW_WEB_PREFERENCES
} from "./shell-config";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const SOURCE_DIRS = ["src", "fixtures"] as const;
const SCANNED_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".html"];

const listSourceFiles = (directory: string): readonly string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolutePath));
      continue;
    }

    if (SCANNED_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
};

describe("Todo 2 shell invariants", () => {
  it("uses the dedicated persistent QR session partition when creating the QR view", () => {
    // Given
    const expectedPartition = "persist:qr-site";

    // When
    const actualPartition = QR_SESSION_PARTITION;

    // Then
    expect(actualPartition).toBe(expectedPartition);
  });

  it("disables background throttling when configuring the QR view", () => {
    // Given
    const expectedBackgroundThrottling = false;

    // When
    const actualBackgroundThrottling = QR_VIEW_WEB_PREFERENCES.backgroundThrottling;

    // Then
    expect(actualBackgroundThrottling).toBe(expectedBackgroundThrottling);
  });

  it("models QR hosting as a WebContentsView surface instead of an iframe", () => {
    // Given
    const expectedSurfaceKind = "webContentsView";

    // When
    const actualSurfaceKind = QR_SURFACE_KIND;

    // Then
    expect(actualSurfaceKind).toBe(expectedSurfaceKind);
  });

  it("does not use iframe markup or iframe creation in QR-related source", () => {
    // Given
    const sourceFiles = SOURCE_DIRS.flatMap((directory) =>
      listSourceFiles(path.join(PROJECT_ROOT, directory))
    ).filter((filePath) => !filePath.endsWith(".test.ts"));
    const forbiddenPatterns = [/<\s*iframe\b/i, /createElement\(\s*["']iframe["']\s*\)/i];

    // When
    const matches = sourceFiles.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");

      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path.relative(PROJECT_ROOT, filePath)} matched ${pattern.source}`);
    });

    // Then
    expect(matches).toEqual([]);
  });
});
