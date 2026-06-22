import { useState, type JSX } from "react";

import { validateAdminCode } from "./validation";

interface QrSessionToolsProps {
  readonly isBusy: boolean;
  readonly onSetBusy: (isBusy: boolean) => void;
  readonly onSetErrors: (errors: readonly string[]) => void;
  readonly onSetMessage: (message: string) => void;
}

export const QrSessionTools = ({
  isBusy,
  onSetBusy,
  onSetErrors,
  onSetMessage
}: QrSessionToolsProps): JSX.Element => {
  const [clearAdminCode, setClearAdminCode] = useState("");

  const clearQrSession = (): void => {
    const validationErrors = validateAdminCode(clearAdminCode);

    if (validationErrors.length > 0) {
      onSetErrors(validationErrors);
      return;
    }

    onSetBusy(true);
    void window.qrGuard.clearQrSession(clearAdminCode.trim())
      .then((response) => {
        if (!response.ok) {
          onSetErrors(response.errors ?? ["QR session could not be cleared."]);
          return;
        }

        onSetErrors([]);
        onSetMessage("QR session cleared.");
        setClearAdminCode("");
      })
      .catch(() => {
        onSetErrors(["QR session could not be cleared."]);
      })
      .finally(() => {
        onSetBusy(false);
      });
  };

  return (
    <section className="form-section" aria-label="QR session">
      <div className="section-heading">
        <h2>QR session</h2>
      </div>
      <div className="inline-form">
        <label className="field">
          <span>Admin code</span>
          <input
            data-testid="clear-session-admin-code"
            disabled={isBusy}
            onChange={(event) => {
              setClearAdminCode(event.target.value);
            }}
            type="password"
            value={clearAdminCode}
          />
        </label>
        <button className="button button--danger" disabled={isBusy} onClick={clearQrSession} type="button">
          Clear QR session
        </button>
      </div>
    </section>
  );
};
