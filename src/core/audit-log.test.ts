import { describe, expect, it } from "vitest";

import {
  appendAuditEvent,
  buildAuditEvent,
  parseAuditLog,
  serializeAuditEvent,
  type AuditEvent
} from "./audit-log";

describe("audit log JSONL", () => {
  it("serializes successful unlock sessions as one JSONL event", () => {
    // Given
    const event = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 3_000,
      reason: "timer",
      unlockedAtMs: 1_000,
      userId: "staff01"
    });

    // When
    const line = serializeAuditEvent(event);

    // Then
    expect(event).toEqual({
      appVersion: "0.1.0",
      durationSeconds: 2,
      lockedAt: "1970-01-01T00:00:03.000Z",
      reason: "timer",
      unlockedAt: "1970-01-01T00:00:01.000Z",
      userId: "staff01"
    } satisfies AuditEvent);
    expect(line).toBe(
      '{"userId":"staff01","unlockedAt":"1970-01-01T00:00:01.000Z","lockedAt":"1970-01-01T00:00:03.000Z","durationSeconds":2,"reason":"timer","appVersion":"0.1.0"}\n'
    );
  });

  it("appends and reads basic JSONL audit events", () => {
    // Given
    const firstEvent = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 2_000,
      reason: "manual",
      unlockedAtMs: 1_000,
      userId: "staff01"
    });
    const secondEvent = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 5_000,
      reason: "idle",
      unlockedAtMs: 3_000,
      userId: "staff02"
    });

    // When
    const jsonl = appendAuditEvent(appendAuditEvent("", firstEvent), secondEvent);
    const events = parseAuditLog(jsonl);

    // Then
    expect(events).toEqual([firstEvent, secondEvent]);
  });
});
