import {
  Badge,
  MessageBar,
  MessageBarBody,
  Text,
  Toolbar as FluentToolbar,
  ToolbarButton,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { LockClosed24Regular, QrCode24Regular } from "@fluentui/react-icons";
import { useEffect, useState, type JSX } from "react";

import type { StateSnapshot } from "../../core/state-machine";

interface ToolbarProps {
  readonly state: StateSnapshot;
}

interface ToolbarActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

export const Toolbar = ({ state }: ToolbarProps): JSX.Element => {
  const styles = useToolbarStyles();
  const [actionError, setActionError] = useState("");
  const [remainingMs, setRemainingMs] = useState(state.remainingMs);
  const isLoginMode = state.state === "loginMode";
  const isSiteLogin = state.state === "siteLogin";

  const runToolbarAction = (action: () => Promise<ToolbarActionResponse>): void => {
    setActionError("");
    void action()
      .then((response) => {
        if (!response.ok) {
          setActionError(response.errors?.[0] ?? "작업에 실패했습니다.");
        }
      })
      .catch(() => {
        setActionError("작업에 실패했습니다.");
      });
  };

  useEffect(() => {
    const updateRemainingMs = (): void => {
      if (state.unlockExpiresAt === null) {
        setRemainingMs(null);
        return;
      }

      setRemainingMs(Math.max(0, Date.parse(state.unlockExpiresAt) - Date.now()));
    };

    updateRemainingMs();
    const intervalId = window.setInterval(updateRemainingMs, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state.unlockExpiresAt]);

  return (
    <main className={styles.shell} data-testid="unlock-toolbar">
      <div className={styles.status}>
        <Badge appearance="tint" color={isSiteLogin || isLoginMode ? "warning" : "danger"} shape="rounded">
          {isSiteLogin ? "사이트 로그인 중" : isLoginMode ? "로그인 화면 표시 중" : "잠금 해제됨"}
        </Badge>
        <Text weight="semibold">
          {isSiteLogin ? "사이트 로그인 중" : isLoginMode ? "로그인 모드 (인증 없이 표시 중)" : "잠금 해제됨"}
        </Text>
        {isLoginMode ? (
          <Badge appearance="outline" color="warning" data-testid="login-mode-indicator" shape="rounded">
            로그인 화면 표시 중
          </Badge>
        ) : isSiteLogin ? (
          <Badge appearance="outline" color="warning" data-testid="site-login-indicator" shape="rounded">
            사이트 로그인 중
          </Badge>
        ) : (
          <Badge appearance="outline" color="danger" data-testid="unlock-countdown" shape="rounded">
            {formatRemaining(remainingMs)}
          </Badge>
        )}
      </div>
      <FluentToolbar aria-label="잠금 도구" className={styles.actions} size="small">
        {isLoginMode ? (
          <ToolbarButton
            appearance="primary"
            data-testid="manual-login-complete"
            icon={<LockClosed24Regular />}
            onClick={() => {
              runToolbarAction(() => window.qrGuard.manualLoginComplete());
            }}
            type="button"
          >
            로그인 완료 후 잠금
          </ToolbarButton>
        ) : null}
        {isSiteLogin ? (
          <ToolbarButton
            appearance="subtle"
            data-testid="learn-qr-title"
            icon={<QrCode24Regular />}
            onClick={() => {
              runToolbarAction(() => window.qrGuard.learnCurrentQrTitle());
            }}
            type="button"
          >
            이 화면이 QR입니다
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          appearance="primary"
          data-testid="manual-lock"
          icon={<LockClosed24Regular />}
          onClick={() => {
            runToolbarAction(() => window.qrGuard.manualLock());
          }}
          type="button"
        >
          지금 잠그기
        </ToolbarButton>
      </FluentToolbar>
      {actionError.length > 0 ? (
        <MessageBar className={styles.error} data-testid="toolbar-action-error" intent="error" role="alert">
          <MessageBarBody>{actionError}</MessageBarBody>
        </MessageBar>
      ) : null}
    </main>
  );
};

const useToolbarStyles = makeStyles({
  actions: {
    flexShrink: 0
  },
  error: {
    maxWidth: "320px"
  },
  shell: {
    alignItems: "center",
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderBottomStyle: "solid",
    borderBottomWidth: tokens.strokeWidthThin,
    color: tokens.colorNeutralForeground1,
    display: "flex",
    gap: tokens.spacingHorizontalM,
    height: "64px",
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    width: "100vw"
  },
  status: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    minWidth: 0
  }
});

const formatRemaining = (remainingMs: number | null): string => {
  if (remainingMs === null) {
    return "표시 중";
  }

  return `${String(Math.ceil(remainingMs / 1_000))}초`;
};
