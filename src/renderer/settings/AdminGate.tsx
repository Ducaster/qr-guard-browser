import { useState, type JSX, type SyntheticEvent } from "react";

import { ErrorList } from "./Feedback";
import { validateAdminCode } from "./validation";

interface AdminGateProps {
  readonly onAuthorized: () => void;
  readonly onCancel: () => void;
}

export const AdminGate = ({ onAuthorized, onCancel }: AdminGateProps): JSX.Element => {
  const [adminCode, setAdminCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const validationErrors = validateAdminCode(adminCode);

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    void window.qrGuard.openSettings(adminCode.trim())
      .then((response) => {
        if (response.ok) {
          setErrors([]);
          onAuthorized();
          return;
        }

        setErrors(response.errors ?? ["관리자 코드가 올바르지 않습니다."]);
      })
      .catch(() => {
        setErrors(["설정을 열 수 없습니다."]);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <main className="app-shell app-shell--center">
      <section className="operator-panel operator-panel--narrow" aria-label="관리자 인증">
        <div className="panel-header">
          <p className="eyebrow">QR 가드 브라우저</p>
          <h1>관리자 인증</h1>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>관리자 코드</span>
            <input
              autoFocus
              data-testid="admin-code-input"
              disabled={isSubmitting}
              onChange={(event) => {
                setAdminCode(event.target.value);
              }}
              type="password"
              value={adminCode}
            />
          </label>
          <ErrorList errors={errors} testId="admin-errors" />
          <div className="button-row">
            <button className="button button--ghost" disabled={isSubmitting} onClick={onCancel} type="button">
              뒤로
            </button>
            <button className="button button--primary" disabled={isSubmitting} type="submit">
              설정 열기
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};
