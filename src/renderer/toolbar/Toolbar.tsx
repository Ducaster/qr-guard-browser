import { useEffect, useState, type JSX } from "react";

import type { StateSnapshot } from "../../core/state-machine";
import "./toolbar.css";

interface ToolbarProps {
  readonly state: StateSnapshot;
}

export const Toolbar = ({ state }: ToolbarProps): JSX.Element => {
  const [remainingMs, setRemainingMs] = useState(state.remainingMs);
  const label = state.state === "loginMode" ? "Login" : "Unlocked";

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
        <strong>{label}</strong>
        <span data-testid="unlock-countdown">{formatRemaining(remainingMs)}</span>
      </div>
      <button
        className="toolbar-button"
        data-testid="manual-lock"
        onClick={() => {
          void window.qrGuard.manualLock();
        }}
        type="button"
      >
        Lock now
      </button>
    </main>
  );
};

const formatRemaining = (remainingMs: number | null): string => {
  if (remainingMs === null) {
    return "Visible";
  }

  return `${String(Math.ceil(remainingMs / 1_000))}s`;
};
