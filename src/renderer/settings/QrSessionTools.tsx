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
          onSetErrors(response.errors ?? ["QR 세션을 초기화할 수 없습니다."]);
          return;
        }

        onSetErrors([]);
        onSetMessage("QR 세션이 초기화되었습니다.");
        setClearAdminCode("");
      })
      .catch(() => {
        onSetErrors(["QR 세션을 초기화할 수 없습니다."]);
      })
      .finally(() => {
        onSetBusy(false);
      });
  };

  return (
    <section className="form-section" aria-label="QR 세션">
      <div className="section-heading">
        <h2>QR 세션</h2>
      </div>
      <div className="inline-form">
        <label className="field">
          <span>관리자 코드</span>
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
          QR 세션 초기화
        </button>
      </div>
    </section>
  );
};
