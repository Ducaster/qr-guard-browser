import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildAuditEvent, serializeAuditEvent } from "../core/audit-log";
import { createFileAuditLogStore } from "./settings-adapters";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("file audit log store", () => {
  it("rotates a full log and reads the retained files asynchronously", async () => {
    // Given
    const directory = await mkdtemp(path.join(os.tmpdir(), "qr-guard-audit-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "audit-log.jsonl");
    const firstEvent = buildAuditEvent({
      appVersion: "0.1.6",
      lockedAtMs: 2_000,
      reason: "manual",
      unlockedAtMs: 1_000,
      userId: "staff01"
    });
    const secondEvent = buildAuditEvent({
      appVersion: "0.1.6",
      lockedAtMs: 4_000,
      reason: "timer",
      unlockedAtMs: 3_000,
      userId: "staff02"
    });
    const store = createFileAuditLogStore(filePath, 1);
    store.append(firstEvent);

    // When
    store.append(secondEvent);
    const readResult = store.read();

    // Then
    expect(readResult).toBeInstanceOf(Promise);
    await expect(readFile(`${filePath}.1`, "utf8")).resolves.toBe(serializeAuditEvent(firstEvent));
    await expect(readFile(filePath, "utf8")).resolves.toBe(serializeAuditEvent(secondEvent));
    await expect(readResult).resolves.toMatchObject({
      events: [firstEvent, secondEvent],
      skippedLines: 0
    });
  });
});
