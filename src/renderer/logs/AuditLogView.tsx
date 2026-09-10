import {
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { ArrowClockwise24Regular, ArrowExportLtr24Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import type { AuditEvent, AuditExportFormat, AuditLogFilter } from "../../core/audit-log";
import { ActionsRow, SectionCard, WrapGrid } from "../fluentLayout";
import { buttonSlot, inputSlot } from "../fluentSlots";
import { ErrorList, Message } from "../settings/Feedback";
import { AuditLogTable } from "./AuditLogTable";
import { createAuditGridRows, formatTimestamp, getAuditUserIds } from "./auditLogFormat";

const ALL_USERS_FILTER = "__all__" as const;

export const AuditLogView = (): JSX.Element => {
  const styles = useAuditStyles();
  const [events, setEvents] = useState<readonly AuditEvent[]>([]);
  const [lastSuccessfulUnlockByUserId, setLastSuccessfulUnlockByUserId] =
    useState<Readonly<Record<string, string>>>({});
  const [skippedLines, setSkippedLines] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [unlockCountByUserId, setUnlockCountByUserId] =
    useState<Readonly<Record<string, number>>>({});
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadAuditLog = useCallback(async (
    userId: string,
    rangeFromDate: string,
    rangeToDate: string
  ): Promise<void> => {
    setIsLoading(true);
    const response = await window.qrGuard.queryAuditLog(
      createAuditLogFilter(userId, rangeFromDate, rangeToDate)
    );

    if (!response.ok) {
      setErrors(response.errors);
      setIsLoading(false);
      return;
    }

    setEvents(response.events);
    setLastSuccessfulUnlockByUserId(response.lastSuccessfulUnlockByUserId);
    setSkippedLines(response.skippedLines);
    setUnlockCountByUserId(response.unlockCountByUserId);
    setErrors([]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (fromDate.length > 0 && toDate.length > 0 && fromDate > toDate) {
      setErrors(["시작일은 종료일보다 늦을 수 없습니다."]);
      return;
    }

    void loadAuditLog(selectedUserId, fromDate, toDate).catch(() => {
      setErrors(["인증 기록을 불러올 수 없습니다."]);
      setIsLoading(false);
    });
  }, [fromDate, loadAuditLog, selectedUserId, toDate]);

  const userIds = useMemo(
    () => getAuditUserIds(events, lastSuccessfulUnlockByUserId),
    [events, lastSuccessfulUnlockByUserId]
  );

  const rows = useMemo(
    () => createAuditGridRows(events, lastSuccessfulUnlockByUserId),
    [events, lastSuccessfulUnlockByUserId]
  );
  const countRows = useMemo(
    () => Object.entries(unlockCountByUserId).sort(([left], [right]) => left.localeCompare(right)),
    [unlockCountByUserId]
  );

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
    <SectionCard
      action={
        <Button
          appearance="secondary"
          disabled={isLoading}
          icon={<ArrowClockwise24Regular />}
          onClick={() => {
            void loadAuditLog(selectedUserId, fromDate, toDate).catch(() => {
              setErrors(["인증 기록을 불러올 수 없습니다."]);
              setIsLoading(false);
            });
          }}
          type="button"
        >
          새로고침
        </Button>
      }
      ariaLabel="인증 기록"
      title="인증 기록"
    >
      <WrapGrid>
        <Field label="지역 필터">
          <Dropdown
            button={buttonSlot({ "data-testid": "audit-user-filter" })}
            disabled={isLoading}
            onOptionSelect={(_event, data) => {
              setSelectedUserId(data.optionValue === ALL_USERS_FILTER ? "" : data.optionValue ?? "");
            }}
            selectedOptions={[selectedUserId.length === 0 ? ALL_USERS_FILTER : selectedUserId]}
            value={selectedUserId.length === 0 ? "전체 지역" : selectedUserId}
          >
            <Option value={ALL_USERS_FILTER}>전체 지역</Option>
            {userIds.map((userId) => (
              <Option key={userId} value={userId}>
                {userId}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="시작일">
          <Input
            disabled={isLoading}
            input={inputSlot({ "data-testid": "audit-date-from" })}
            onChange={(_event, data) => {
              setFromDate(data.value);
            }}
            type="date"
            value={fromDate}
          />
        </Field>
        <Field label="종료일">
          <Input
            disabled={isLoading}
            input={inputSlot({ "data-testid": "audit-date-to" })}
            onChange={(_event, data) => {
              setToDate(data.value);
            }}
            type="date"
            value={toDate}
          />
        </Field>
        <ActionsRow>
          <Button
            appearance="secondary"
            disabled={isExporting}
            icon={<ArrowExportLtr24Regular />}
            onClick={() => {
              exportAuditLog("jsonl");
            }}
            type="button"
          >
            JSONL 내보내기
          </Button>
          <Button
            appearance="secondary"
            disabled={isExporting}
            icon={<ArrowExportLtr24Regular />}
            onClick={() => {
              exportAuditLog("csv");
            }}
            type="button"
          >
            CSV 내보내기
          </Button>
        </ActionsRow>
      </WrapGrid>

      {isLoading ? <Spinner label="인증 기록 불러오는 중" size="small" /> : null}

      <div className={styles.countSection}>
        <Text weight="semibold">기간별 지역 인증 횟수</Text>
        {countRows.length === 0 ? (
          <Text data-testid="audit-count-empty" size={200}>선택한 기간의 지역 인증 기록이 없습니다.</Text>
        ) : (
          <div className={styles.countTableScroller}>
            <table aria-label="기간별 지역 인증 횟수" className={styles.countTable}>
              <thead>
                <tr>
                  <th scope="col">지역</th>
                  <th scope="col">인증 횟수</th>
                </tr>
              </thead>
              <tbody>
                {countRows.map(([userId, count]) => (
                  <tr key={userId}>
                    <td>{userId}</td>
                    <td data-testid={`audit-count-${userId}`}>{count.toLocaleString("ko-KR")}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={styles.lastAuthList} data-testid="audit-last-auth-list">
        {userIds.length === 0 ? <Text size={200}>성공한 인증 기록이 없습니다.</Text> : null}
        {userIds.map((userId) => (
          <div className={styles.lastAuthItem} data-testid={`audit-last-auth-${userId}`} key={userId}>
            <Text weight="semibold">{userId}</Text>
            <Text size={200}>
              마지막 인증 시각: {formatTimestamp(lastSuccessfulUnlockByUserId[userId] ?? null)}
            </Text>
          </div>
        ))}
      </div>

      {skippedLines > 0 ? (
        <MessageBar data-testid="audit-skipped-lines" intent="warning">
          <MessageBarBody>잘못된 인증 기록 줄을 건너뜀: {skippedLines}</MessageBarBody>
        </MessageBar>
      ) : null}

      <AuditLogTable rows={rows} />

      <Message text={message} />
      <ErrorList errors={errors} />
    </SectionCard>
  );
};

const useAuditStyles = makeStyles({
  countSection: {
    display: "grid",
    gap: tokens.spacingVerticalS
  },
  countTable: {
    borderCollapse: "collapse",
    minWidth: "320px",
    width: "100%",
    "& th": {
      backgroundColor: tokens.colorNeutralBackground3,
      fontWeight: tokens.fontWeightSemibold,
      textAlign: "left"
    },
    "& td, & th": {
      borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`
    },
    "& td:last-child, & th:last-child": {
      textAlign: "right"
    }
  },
  countTableScroller: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflowX: "auto"
  },
  lastAuthItem: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: "grid",
    gap: tokens.spacingVerticalXXS,
    minWidth: "220px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`
  },
  lastAuthList: {
    alignItems: "stretch",
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM
  }
});

const createAuditLogFilter = (
  userId: string,
  fromDate: string,
  toDate: string
): AuditLogFilter => ({
  ...(toDate.length === 0 ? {} : { beforeUnlockedAt: startOfNextLocalDate(toDate) }),
  ...(fromDate.length === 0 ? {} : { fromUnlockedAt: startOfLocalDate(fromDate) }),
  ...(userId.length === 0 ? {} : { userId })
});

const startOfLocalDate = (value: string): string => new Date(`${value}T00:00:00`).toISOString();

const startOfNextLocalDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);

  return date.toISOString();
};
