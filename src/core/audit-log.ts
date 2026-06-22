export type AuditLockReason = "timer" | "manual" | "idle" | "login-mode";

export interface AuditEvent {
  readonly appVersion: string;
  readonly durationSeconds: number;
  readonly lockedAt: string;
  readonly reason: AuditLockReason;
  readonly unlockedAt: string;
  readonly userId: string;
}

export interface AuditEventInput {
  readonly appVersion: string;
  readonly lockedAtMs: number;
  readonly reason: AuditLockReason;
  readonly unlockedAtMs: number;
  readonly userId: string;
}

export interface LoginModeAuditEventInput {
  readonly appVersion: string;
  readonly enteredAtMs: number;
  readonly lockedAtMs: number;
}

export const buildAuditEvent = (input: AuditEventInput): AuditEvent => ({
  appVersion: input.appVersion,
  durationSeconds: Math.max(0, Math.round((input.lockedAtMs - input.unlockedAtMs) / 1_000)),
  lockedAt: new Date(input.lockedAtMs).toISOString(),
  reason: input.reason,
  unlockedAt: new Date(input.unlockedAtMs).toISOString(),
  userId: input.userId
});

export const buildLoginModeAuditEvent = (input: LoginModeAuditEventInput): AuditEvent =>
  buildAuditEvent({
    appVersion: input.appVersion,
    lockedAtMs: input.lockedAtMs,
    reason: "login-mode",
    unlockedAtMs: input.enteredAtMs,
    userId: "login-mode"
  });

export const serializeAuditEvent = (event: AuditEvent): string =>
  `${JSON.stringify({
    userId: event.userId,
    unlockedAt: event.unlockedAt,
    lockedAt: event.lockedAt,
    durationSeconds: event.durationSeconds,
    reason: event.reason,
    appVersion: event.appVersion
  })}\n`;

export const appendAuditEvent = (jsonl: string, event: AuditEvent): string =>
  `${jsonl}${serializeAuditEvent(event)}`;

export const parseAuditLog = (jsonl: string): readonly AuditEvent[] =>
  jsonl.split("\n").flatMap((line) => parseAuditLogLine(line));

const parseAuditLogLine = (line: string): readonly AuditEvent[] => {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(trimmedLine);

    return isAuditEvent(parsed) ? [parsed] : [];
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
};

const isAuditEvent = (value: unknown): value is AuditEvent => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["appVersion"] === "string" &&
    typeof value["durationSeconds"] === "number" &&
    Number.isFinite(value["durationSeconds"]) &&
    typeof value["lockedAt"] === "string" &&
    isAuditReason(value["reason"]) &&
    typeof value["unlockedAt"] === "string" &&
    typeof value["userId"] === "string"
  );
};

const isAuditReason = (value: unknown): value is AuditLockReason =>
  value === "timer" || value === "manual" || value === "idle" || value === "login-mode";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
