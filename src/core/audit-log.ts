export type AuditLockReason = "timer" | "manual" | "idle" | "qr-title";
export type AuditExportFormat = "jsonl" | "csv";
export const ADMIN_SITE_LOGIN_AUDIT_USER_ID = "관리자";

export interface AuditEvent {
  readonly appVersion: string;
  readonly durationSeconds: number;
  readonly lockedAt: string;
  readonly reason: AuditLockReason;
  readonly unlockedAt: string;
  readonly userId: string;
}

export interface AuditLogFilter {
  readonly userId?: string;
}

export interface AuditLogReadResult {
  readonly events: readonly AuditEvent[];
  readonly lastSuccessfulUnlockByUserId: Readonly<Record<string, string>>;
  readonly skippedLines: number;
}

export interface AuditEventInput {
  readonly appVersion: string;
  readonly lockedAtMs: number;
  readonly reason: AuditLockReason;
  readonly unlockedAtMs: number;
  readonly userId: string;
}

export const buildAuditEvent = (input: AuditEventInput): AuditEvent => ({
  appVersion: input.appVersion,
  durationSeconds: Math.max(0, Math.round((input.lockedAtMs - input.unlockedAtMs) / 1_000)),
  lockedAt: new Date(input.lockedAtMs).toISOString(),
  reason: input.reason,
  unlockedAt: new Date(input.unlockedAtMs).toISOString(),
  userId: input.userId
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

export const parseAuditLog = (
  jsonl: string,
  filter: AuditLogFilter = {}
): AuditLogReadResult => {
  const events: AuditEvent[] = [];
  let skippedLines = 0;

  for (const line of jsonl.split("\n")) {
    const parsed = parseAuditLogLine(line);

    switch (parsed.kind) {
      case "empty":
        break;
      case "event":
        events.push(parsed.event);
        break;
      case "skipped":
        skippedLines += 1;
        break;
    }
  }

  const filteredEvents =
    filter.userId === undefined
      ? events
      : events.filter((event) => event.userId === filter.userId);

  return {
    events: filteredEvents,
    // Last-auth is intentionally derived from all parsed events, not the user-filtered view.
    lastSuccessfulUnlockByUserId: deriveLastSuccessfulUnlocks(events),
    skippedLines
  };
};

export const toJsonl = (events: readonly AuditEvent[]): string =>
  events.map((event) => serializeAuditEvent(event)).join("");

export const toCsv = (events: readonly AuditEvent[]): string => {
  const rows = events.map((event) =>
    AUDIT_CSV_FIELDS.map((field) => escapeCsvField(String(event[field]))).join(",")
  );

  return `${[AUDIT_CSV_FIELDS.join(","), ...rows].join("\n")}\n`;
};

type ParsedAuditLogLine =
  | { readonly event: AuditEvent; readonly kind: "event" }
  | { readonly kind: "empty" }
  | { readonly kind: "skipped" };

const AUDIT_CSV_FIELDS = [
  "userId",
  "unlockedAt",
  "lockedAt",
  "durationSeconds",
  "reason",
  "appVersion"
] as const satisfies readonly (keyof AuditEvent)[];
const CSV_FORMULA_PREFIX_PATTERN = /^[\t\r=+\-@]/;

const parseAuditLogLine = (line: string): ParsedAuditLogLine => {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    return { kind: "empty" };
  }

  try {
    const parsed: unknown = JSON.parse(trimmedLine);

    return isAuditEvent(parsed) ? { event: parsed, kind: "event" } : { kind: "skipped" };
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return { kind: "skipped" };
    }

    throw error;
  }
};

const deriveLastSuccessfulUnlocks = (
  events: readonly AuditEvent[]
): Readonly<Record<string, string>> => {
  const lastSuccessfulUnlockByUserId: Record<string, string> = {};

  for (const event of events) {
    const previousUnlockedAt = lastSuccessfulUnlockByUserId[event.userId];

    if (!isSystemAuditUserId(event.userId) && (previousUnlockedAt === undefined || event.unlockedAt > previousUnlockedAt)) {
      lastSuccessfulUnlockByUserId[event.userId] = event.unlockedAt;
    }
  }

  return lastSuccessfulUnlockByUserId;
};

export const isSystemAuditUserId = (userId: string): boolean =>
  userId === ADMIN_SITE_LOGIN_AUDIT_USER_ID;

const escapeCsvField = (value: string): string => {
  const neutralizedValue = CSV_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;

  if (!/[",\n\r]/.test(neutralizedValue)) {
    return neutralizedValue;
  }

  return `"${neutralizedValue.replaceAll('"', '""')}"`;
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
  value === "timer" ||
  value === "manual" ||
  value === "idle" ||
  value === "qr-title";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
