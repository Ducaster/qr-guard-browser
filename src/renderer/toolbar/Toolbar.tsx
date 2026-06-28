import {
  Badge,
  Input,
  MessageBar,
  MessageBarBody,
  Text,
  Toolbar as FluentToolbar,
  ToolbarButton,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import {
  ArrowClockwise24Regular,
  ArrowLeft24Regular,
  ArrowRight24Regular,
  LockClosed24Regular,
  QrCode24Regular
} from "@fluentui/react-icons";
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
  const [addressValue, setAddressValue] = useState(formatAddressUrl(state.currentUrl));
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [remainingMs, setRemainingMs] = useState(state.remainingMs);
  const isSiteLogin = state.state === "siteLogin";
  const currentAddressUrl = formatAddressUrl(state.currentUrl);

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

  useEffect(() => {
    if (!isEditingAddress) {
      setAddressValue(currentAddressUrl);
    }
  }, [currentAddressUrl, isEditingAddress]);

  const submitAddressNavigation = (): void => {
    const url = addressValue.trim();

    setIsEditingAddress(false);
    runToolbarAction(() => window.qrGuard.qrNavigateToUrl(url));
  };

  return (
    <main className={styles.shell} data-testid="unlock-toolbar">
      <div className={styles.status}>
        <Badge appearance="tint" color={isSiteLogin ? "warning" : "danger"} shape="rounded">
          {isSiteLogin ? "사이트 로그인 중" : "잠금 해제됨"}
        </Badge>
        <Text weight="semibold">
          {isSiteLogin ? "사이트 로그인 중" : "잠금 해제됨"}
        </Text>
        {isSiteLogin ? (
          <Badge appearance="outline" color="warning" data-testid="site-login-indicator" shape="rounded">
            사이트 로그인 중
          </Badge>
        ) : (
          <Badge appearance="outline" color="danger" data-testid="unlock-countdown" shape="rounded">
            {formatRemaining(remainingMs)}
          </Badge>
        )}
      </div>
      <div className={styles.navigation}>
        <FluentToolbar aria-label="잠금 도구" className={styles.actions} size="small">
          <ToolbarButton
            appearance="subtle"
            data-testid="qr-go-back"
            disabled={!state.canGoBack}
            icon={<ArrowLeft24Regular />}
            onClick={() => {
              runToolbarAction(() => window.qrGuard.qrGoBack());
            }}
            type="button"
          >
            뒤로
          </ToolbarButton>
          <ToolbarButton
            appearance="subtle"
            data-testid="qr-go-forward"
            disabled={!state.canGoForward}
            icon={<ArrowRight24Regular />}
            onClick={() => {
              runToolbarAction(() => window.qrGuard.qrGoForward());
            }}
            type="button"
          >
            앞으로
          </ToolbarButton>
          <ToolbarButton
            appearance="subtle"
            data-testid="qr-reload"
            icon={<ArrowClockwise24Regular />}
            onClick={() => {
              runToolbarAction(() => window.qrGuard.qrReload());
            }}
            type="button"
          >
            새로고침
          </ToolbarButton>
        </FluentToolbar>
        <Input
          aria-label="QR 주소"
          className={styles.addressInput}
          data-testid="qr-address-input"
          onBlur={() => {
            setIsEditingAddress(false);
          }}
          onChange={(_event, data) => {
            setAddressValue(data.value);
          }}
          onFocus={() => {
            setIsEditingAddress(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitAddressNavigation();
            }
          }}
          size="small"
          value={addressValue}
        />
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
      </div>
      {actionError.length > 0 ? (
        <MessageBar className={styles.error} data-testid="toolbar-action-error" intent="error" role="alert">
          <MessageBarBody>{actionError}</MessageBarBody>
        </MessageBar>
      ) : null}
    </main>
  );
};

const useToolbarStyles = makeStyles({
  addressInput: {
    flex: "1 1 320px",
    maxWidth: "560px",
    minWidth: "140px"
  },
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
  navigation: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 auto",
    gap: tokens.spacingHorizontalS,
    justifyContent: "flex-end",
    minWidth: 0
  },
  status: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    minWidth: 0
  }
});

const formatAddressUrl = (url: string): string => (url === "about:blank" ? "" : url);

const formatRemaining = (remainingMs: number | null): string => {
  if (remainingMs === null) {
    return "표시 중";
  }

  return `${String(Math.ceil(remainingMs / 1_000))}초`;
};
