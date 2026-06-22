import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import type { AuditEvent, AuditExportFormat } from "../../core/audit-log";
import { ErrorList, Message } from "../settings/Feedback";

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
      setErrors(["Audit log could not be loaded."]);
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
        setMessage(response.canceled ? "Audit export canceled." : `Audit log exported as ${format.toUpperCase()}.`);
      })
      .catch(() => {
        setErrors(["Audit log could not be exported."]);
      })
      .finally(() => {
        setIsExporting(false);
      });
  };

  return (
    <section className="form-section audit-log" aria-label="Audit log">
      <div className="section-heading audit-heading">
        <h2>Audit log</h2>
        <button
          className="button button--ghost"
          disabled={isLoading}
          onClick={() => {
            void loadAuditLog(selectedUserId).catch(() => {
              setErrors(["Audit log could not be loaded."]);
              setIsLoading(false);
            });
          }}
          type="button"
        >
          Refresh
        </button>
      </div>

      <div className="audit-controls">
        <label className="field">
          <span>User filter</span>
          <select
            data-testid="audit-user-filter"
            disabled={isLoading}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
            }}
            value={selectedUserId}
          >
            <option value="">All users</option>
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
            Export JSONL
          </button>
          <button
            className="button button--secondary"
            disabled={isExporting}
            onClick={() => {
              exportAuditLog("csv");
            }}
            type="button"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="audit-last-auth-list" data-testid="audit-last-auth-list">
        {userIds.length === 0 ? <p className="muted">No successful unlocks recorded.</p> : null}
        {userIds.map((userId) => (
          <div className="audit-last-auth-item" data-testid={`audit-last-auth-${userId}`} key={userId}>
            <strong>{userId}</strong>
            <span>
              Last successful unlock: {formatTimestamp(lastSuccessfulUnlockByUserId[userId] ?? null)}
            </span>
          </div>
        ))}
      </div>

      {skippedLines > 0 ? (
        <p className="audit-warning" data-testid="audit-skipped-lines">
          Skipped malformed audit log lines: {skippedLines}
        </p>
      ) : null}

      <div className="audit-table-wrap">
        <table className="audit-table" data-testid="audit-log-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Unlocked</th>
              <th>Locked</th>
              <th>Duration</th>
              <th>Reason</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="audit-empty-cell" colSpan={6}>
                  No audit events found.
                </td>
              </tr>
            ) : null}
            {events.map((event, index) => (
              <tr
                data-testid="audit-event-row"
                key={`${event.userId}-${event.unlockedAt}-${event.lockedAt}-${String(index)}`}
              >
                <td>{event.userId}</td>
                <td>{formatTimestamp(event.unlockedAt)}</td>
                <td>{formatTimestamp(event.lockedAt)}</td>
                <td>{event.durationSeconds}s</td>
                <td>{event.reason}</td>
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
    return "none";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Invalid timestamp";
  }

  return parsedDate.toLocaleString();
};
