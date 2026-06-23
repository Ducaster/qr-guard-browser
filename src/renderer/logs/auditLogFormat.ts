import {
  ADMIN_SITE_LOGIN_AUDIT_USER_ID,
  LOGIN_MODE_AUDIT_USER_ID,
  type AuditEvent
} from "../../core/audit-log";

const AUDIT_REASON_LABELS = {
  idle: "유휴 잠금",
  "login-mode": "로그인 모드",
  manual: "수동 잠금",
  "qr-title": "QR 제목 감지",
  timer: "시간 만료"
} as const satisfies Record<AuditEvent["reason"], string>;

export interface AuditGridRow {
  readonly appVersion: string;
  readonly lastAuthenticatedAt: string;
  readonly reason: string;
  readonly rowId: string;
  readonly time: string;
  readonly userId: string;
}

export const createAuditGridRows = (
  events: readonly AuditEvent[],
  lastSuccessfulUnlockByUserId: Readonly<Record<string, string>>
): AuditGridRow[] =>
  events.map((event, index): AuditGridRow => ({
    appVersion: event.appVersion,
    lastAuthenticatedAt: formatTimestamp(lastSuccessfulUnlockByUserId[event.userId] ?? null),
    reason: AUDIT_REASON_LABELS[event.reason],
    rowId: `${event.userId}-${event.unlockedAt}-${event.lockedAt}-${String(index)}`,
    time: formatAuditTime(event),
    userId: formatAuditUserId(event.userId)
  }));

export const getAuditUserIds = (
  events: readonly AuditEvent[],
  lastSuccessfulUnlockByUserId: Readonly<Record<string, string>>
): string[] => {
  const ids = new Set<string>();

  for (const userId of Object.keys(lastSuccessfulUnlockByUserId)) {
    ids.add(userId);
  }

  for (const event of events) {
    if (event.userId !== LOGIN_MODE_AUDIT_USER_ID) {
      ids.add(event.userId);
    }
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
};

export const formatTimestamp = (value: string | null): string => {
  if (value === null) {
    return "없음";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "올바르지 않은 시각";
  }

  return parsedDate.toLocaleString("ko-KR");
};

const formatAuditTime = (event: AuditEvent): string =>
  `잠금 해제: ${formatTimestamp(event.unlockedAt)} / 잠금: ${formatTimestamp(event.lockedAt)} / ${String(event.durationSeconds)}초`;

const formatAuditUserId = (userId: string): string =>
  userId === LOGIN_MODE_AUDIT_USER_ID
    ? "로그인 모드"
    : userId === ADMIN_SITE_LOGIN_AUDIT_USER_ID
      ? "관리자"
      : userId;
