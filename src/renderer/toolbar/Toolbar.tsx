import { useEffect, useState, type JSX } from "react";

import type { StateSnapshot } from "../../core/state-machine";
import "./toolbar.css";

interface ToolbarProps {
  readonly state: StateSnapshot;
}

interface ToolbarActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

export const Toolbar = ({ state }: ToolbarProps): JSX.Element => {
  const [actionError, setActionError] = useState("");
  const [remainingMs, setRemainingMs] = useState(state.remainingMs);
  const isLoginMode = state.state === "loginMode";

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
    <main className="toolbar-shell" data-testid="unlock-toolbar">
      <div className="toolbar-status">
        <span className="toolbar-dot" aria-hidden="true" />
        <strong>{isLoginMode ? "로그인 모드 (인증 없이 표시 중)" : "잠금 해제됨"}</strong>
        {isLoginMode ? (
          <span data-testid="login-mode-indicator">로그인 화면 표시 중</span>
        ) : (
          <span data-testid="unlock-countdown">{formatRemaining(remainingMs)}</span>
        )}
      </div>
      <div className="toolbar-actions">
        {isLoginMode ? (
          <button
            className="toolbar-button toolbar-button--secondary"
            data-testid="manual-login-complete"
            onClick={() => {
              runToolbarAction(() => window.qrGuard.manualLoginComplete());
            }}
            type="button"
          >
            로그인 완료 후 잠금
          </button>
        ) : null}
        <button
          className="toolbar-button"
          data-testid="manual-lock"
          onClick={() => {
            runToolbarAction(() => window.qrGuard.manualLock());
          }}
          type="button"
        >
          지금 잠그기
        </button>
      </div>
      {actionError.length > 0 ? (
        <span className="toolbar-error" data-testid="toolbar-action-error" role="alert">
          {actionError}
        </span>
      ) : null}
    </main>
  );
};

const formatRemaining = (remainingMs: number | null): string => {
  if (remainingMs === null) {
    return "표시 중";
  }

  return `${String(Math.ceil(remainingMs / 1_000))}초`;
};
