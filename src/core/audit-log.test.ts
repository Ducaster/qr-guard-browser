import { describe, expect, it } from "vitest";

import {
  appendAuditEvent,
  buildAuditEvent,
  parseAuditLog,
  serializeAuditEvent,
  toCsv,
  toJsonl,
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
    const result = parseAuditLog(jsonl);

    // Then
    expect(result).toEqual({
      events: [firstEvent, secondEvent],
      lastSuccessfulUnlockByUserId: {
        staff01: "1970-01-01T00:00:01.000Z",
        staff02: "1970-01-01T00:00:03.000Z"
      },
      skippedLines: 0
    });
  });

  it("filters read events by user ID while keeping per-user last successful unlocks", () => {
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
    const thirdEvent = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 8_000,
      reason: "timer",
      unlockedAtMs: 6_000,
      userId: "staff01"
    });
    const jsonl = toJsonl([firstEvent, secondEvent, thirdEvent]);

    // When
    const result = parseAuditLog(jsonl, { userId: "staff01" });

    // Then
    expect(result).toEqual({
      events: [firstEvent, thirdEvent],
      lastSuccessfulUnlockByUserId: {
        staff01: "1970-01-01T00:00:06.000Z",
        staff02: "1970-01-01T00:00:03.000Z"
      },
      skippedLines: 0
    });
  });

  it("keeps the latest successful unlock when audit events are out of order", () => {
    // Given
    const latestEvent = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 12_000,
      reason: "manual",
      unlockedAtMs: 10_000,
      userId: "staff01"
    });
    const earlierEvent = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 5_000,
      reason: "idle",
      unlockedAtMs: 3_000,
      userId: "staff01"
    });

    // When
    const result = parseAuditLog(toJsonl([latestEvent, earlierEvent]));

    // Then
    expect(result.lastSuccessfulUnlockByUserId).toEqual({
      staff01: "1970-01-01T00:00:10.000Z"
    });
  });

  it("skips malformed and wrong-shape lines while reporting the skipped count", () => {
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
    const jsonl = [
      serializeAuditEvent(firstEvent).trimEnd(),
      "{not-json",
      '{"userId":"staff03","unlockedAt":"1970-01-01T00:00:04.000Z"}',
      serializeAuditEvent(secondEvent).trimEnd()
    ].join("\n");

    // When
    const result = parseAuditLog(jsonl);

    // Then
    expect(result).toEqual({
      events: [firstEvent, secondEvent],
      lastSuccessfulUnlockByUserId: {
        staff01: "1970-01-01T00:00:01.000Z",
        staff02: "1970-01-01T00:00:03.000Z"
      },
      skippedLines: 2
    });
  });

  it("exports audit events as JSONL", () => {
    // Given
    const event = buildAuditEvent({
      appVersion: "0.1.0",
      lockedAtMs: 2_000,
      reason: "manual",
      unlockedAtMs: 1_000,
      userId: "staff01"
    });

    // When
    const jsonl = toJsonl([event]);

    // Then
    expect(jsonl).toBe(
      '{"userId":"staff01","unlockedAt":"1970-01-01T00:00:01.000Z","lockedAt":"1970-01-01T00:00:02.000Z","durationSeconds":1,"reason":"manual","appVersion":"0.1.0"}\n'
    );
  });

  it("exports audit events as escaped CSV", () => {
    // Given
    const event = {
      appVersion: "0.1.0",
      durationSeconds: 1,
      lockedAt: "1970-01-01T00:00:02.000Z",
      reason: "manual",
      unlockedAt: "1970-01-01T00:00:01.000Z",
      userId: 'staff, "ops"'
    } satisfies AuditEvent;

    // When
    const csv = toCsv([event]);

    // Then
    expect(csv).toBe(
      'userId,unlockedAt,lockedAt,durationSeconds,reason,appVersion\n"staff, ""ops""",1970-01-01T00:00:01.000Z,1970-01-01T00:00:02.000Z,1,manual,0.1.0\n'
    );
  });

  it.each([
    ['=HYPERLINK("http://evil")', '"\'=HYPERLINK(""http://evil"")"'],
    ["+cmd", "'+cmd"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"]
  ])("neutralizes CSV formula injection for user ID %s", (userId, escapedUserId) => {
    // Given
    const event = eventWithUserId(userId);

    // When
    const csv = toCsv([event]);

    // Then
    expect(csv).toBe(
      `userId,unlockedAt,lockedAt,durationSeconds,reason,appVersion\n${escapedUserId},1970-01-01T00:00:01.000Z,1970-01-01T00:00:02.000Z,1,manual,0.1.0\n`
    );
  });

  it("quotes a neutralized CSV field when it also contains a comma", () => {
    // Given
    const event = eventWithUserId("=SUM(A1),staff");

    // When
    const csv = toCsv([event]);

    // Then
    expect(csv).toBe(
      'userId,unlockedAt,lockedAt,durationSeconds,reason,appVersion\n"\'=SUM(A1),staff",1970-01-01T00:00:01.000Z,1970-01-01T00:00:02.000Z,1,manual,0.1.0\n'
    );
  });

});

const eventWithUserId = (userId: string): AuditEvent => ({
  appVersion: "0.1.0",
  durationSeconds: 1,
  lockedAt: "1970-01-01T00:00:02.000Z",
  reason: "manual",
  unlockedAt: "1970-01-01T00:00:01.000Z",
  userId
});
