import { useState, type JSX, type SyntheticEvent } from "react";

interface LockScreenProps {
  readonly onOpenSettings: () => void;
}

export const LockScreen = ({ onOpenSettings }: LockScreenProps): JSX.Element => {
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setIsSubmitting(true);

    void window.qrGuard.submitUnlock(userId, code)
      .then((response) => {
        if (response.ok) {
          setCode("");
          setErrors([]);
          return;
        }

        setErrors(formatUnlockErrors(response.errors, response.retryAfterMs));
      })
      .catch(() => {
        setErrors(["잠금 해제에 실패했습니다."]);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <main className="app-shell app-shell--center">
      <section className="operator-panel operator-panel--narrow" aria-label="잠김">
        <div className="status-rail" aria-hidden="true" />
        <div className="panel-header">
          <p className="eyebrow">QR 가드 브라우저</p>
          <h1>QR 숨김</h1>
        </div>
        <div className="lock-status" data-testid="locked-screen">
          <span className="status-dot" aria-hidden="true" />
          <span>잠김</span>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>지역</span>
            <input
              autoFocus
              data-testid="unlock-user-id"
              disabled={isSubmitting}
              onChange={(event) => {
                setUserId(event.target.value);
              }}
              value={userId}
            />
          </label>
          <label className="field">
            <span>인증 코드</span>
            <input
              data-testid="unlock-code"
              disabled={isSubmitting}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              type="password"
              value={code}
            />
          </label>
          {errors.length > 0 ? (
            <ul className="error-list" data-testid="unlock-errors">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          <div className="button-row">
            <button className="button button--primary" data-testid="unlock-submit" disabled={isSubmitting} type="submit">
              잠금 해제
            </button>
            <button className="button button--ghost" disabled={isSubmitting} onClick={onOpenSettings} type="button">
              설정
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};

const formatUnlockErrors = (
  errors: readonly string[],
  retryAfterMs: number | null
): readonly string[] => {
  if (retryAfterMs === null) {
    return errors;
  }

  return [...errors, `${String(Math.ceil(retryAfterMs / 1_000))}초 후 다시 시도하세요.`];
};
