import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import { LOGIN_MODE_AUDIT_USER_ID, type AuditEvent, type AuditExportFormat } from "../../core/audit-log";
import { ErrorList, Message } from "../settings/Feedback";

const AUDIT_REASON_LABELS = {
  idle: "유휴 잠금",
  "login-mode": "로그인 모드",
  manual: "수동 잠금",
  timer: "시간 만료"
} as const satisfies Record<AuditEvent["reason"], string>;

export const AuditLogView = (): JSX.Element => {
  const [events, setEvents] = useState<readonly AuditEvent[]>([]);
  const [lastSuccessfulUnlockByUserId, setLastSuccessfulUnlockByUserId] =
    useState<Readonly<Record<string, string>>>({});
  const [skippedLines, setSkippedLines] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadAuditLog = useCallback(async (userId: string): Promise<void> => {
    setIsLoading(true);
    const response = await window.qrGuard.queryAuditLog(
      userId.length === 0 ? undefined : { userId }
    );

    if (!response.ok) {
      setErrors(response.errors);
      setIsLoading(false);
      return;
    }

    setEvents(response.events);
    setLastSuccessfulUnlockByUserId(response.lastSuccessfulUnlockByUserId);
    setSkippedLines(response.skippedLines);
    setErrors([]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadAuditLog(selectedUserId).catch(() => {
      setErrors(["인증 기록을 불러올 수 없습니다."]);
      setIsLoading(false);
    });
  }, [loadAuditLog, selectedUserId]);

  const userIds = useMemo(() => {
    const ids = new Set<string>();

    for (const userId of Object.keys(lastSuccessfulUnlockByUserId)) {
      ids.add(userId);
    }

    for (const event of events) {
      if (event.userId !== "login-mode") {
        ids.add(event.userId);
      }
    }

    return [...ids].sort((left, right) => left.localeCompare(right));
  }, [events, lastSuccessfulUnlockByUserId]);

  const exportAuditLog = (format: AuditExportFormat): void => {
    setIsExporting(true);
    void window.qrGuard.exportAuditLog(format)
      .then((response) => {
        if (!response.ok) {
          setErrors(response.errors);
          return;
        }

        setErrors([]);
        setMessage(
          response.canceled
            ? "인증 기록 내보내기를 취소했습니다."
            : `인증 기록을 ${format.toUpperCase()} 형식으로 내보냈습니다.`
        );
      })
      .catch(() => {
        setErrors(["인증 기록을 내보낼 수 없습니다."]);
      })
      .finally(() => {
        setIsExporting(false);
      });
  };

  return (
    <section className="form-section audit-log" aria-label="인증 기록">
      <div className="section-heading audit-heading">
        <h2>인증 기록</h2>
        <button
          className="button button--ghost"
          disabled={isLoading}
          onClick={() => {
            void loadAuditLog(selectedUserId).catch(() => {
              setErrors(["인증 기록을 불러올 수 없습니다."]);
              setIsLoading(false);
            });
          }}
          type="button"
        >
          새로고침
        </button>
      </div>

      <div className="audit-controls">
        <label className="field">
          <span>지역 필터</span>
          <select
            data-testid="audit-user-filter"
            disabled={isLoading}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
            }}
            value={selectedUserId}
          >
            <option value="">전체 지역</option>
            {userIds.map((userId) => (
              <option key={userId} value={userId}>
                {userId}
              </option>
            ))}
          </select>
        </label>
        <div className="button-row audit-export-row">
          <button
            className="button button--secondary"
            disabled={isExporting}
            onClick={() => {
              exportAuditLog("jsonl");
            }}
            type="button"
          >
            JSONL 내보내기
          </button>
          <button
            className="button button--secondary"
            disabled={isExporting}
            onClick={() => {
              exportAuditLog("csv");
            }}
            type="button"
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      <div className="audit-last-auth-list" data-testid="audit-last-auth-list">
        {userIds.length === 0 ? <p className="muted">성공한 인증 기록이 없습니다.</p> : null}
        {userIds.map((userId) => (
          <div className="audit-last-auth-item" data-testid={`audit-last-auth-${userId}`} key={userId}>
            <strong>{userId}</strong>
            <span>
              마지막 인증 시각: {formatTimestamp(lastSuccessfulUnlockByUserId[userId] ?? null)}
            </span>
          </div>
        ))}
      </div>

      {skippedLines > 0 ? (
        <p className="audit-warning" data-testid="audit-skipped-lines">
          잘못된 인증 기록 줄을 건너뜀: {skippedLines}
        </p>
      ) : null}

      <div className="audit-table-wrap">
        <table className="audit-table" data-testid="audit-log-table">
          <thead>
            <tr>
              <th>지역</th>
              <th>잠금 해제 시각</th>
              <th>잠금 시각</th>
              <th>노출 시간(초)</th>
              <th>사유</th>
              <th>버전</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="audit-empty-cell" colSpan={6}>
                  인증 기록이 없습니다.
                </td>
              </tr>
            ) : null}
            {events.map((event, index) => (
              <tr
                data-testid="audit-event-row"
                key={`${event.userId}-${event.unlockedAt}-${event.lockedAt}-${String(index)}`}
              >
                <td>{formatAuditUserId(event.userId)}</td>
                <td>{formatTimestamp(event.unlockedAt)}</td>
                <td>{formatTimestamp(event.lockedAt)}</td>
                <td>{event.durationSeconds}초</td>
                <td>{AUDIT_REASON_LABELS[event.reason]}</td>
                <td>{event.appVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Message text={message} />
      <ErrorList errors={errors} />
    </section>
  );
};

const formatTimestamp = (value: string | null): string => {
  if (value === null) {
    return "없음";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "올바르지 않은 시각";
  }

  return parsedDate.toLocaleString("ko-KR");
};

const formatAuditUserId = (userId: string): string =>
  userId === LOGIN_MODE_AUDIT_USER_ID ? "로그인 모드" : userId;
