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
        setErrors(["Unlock failed."]);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <main className="app-shell app-shell--center">
      <section className="operator-panel operator-panel--narrow" aria-label="Locked">
        <div className="status-rail" aria-hidden="true" />
        <div className="panel-header">
          <p className="eyebrow">QR Guard Browser</p>
          <h1>QR hidden</h1>
        </div>
        <div className="lock-status" data-testid="locked-screen">
          <span className="status-dot" aria-hidden="true" />
          <span>Locked</span>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>User ID</span>
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
            <span>Code</span>
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
              Unlock
            </button>
            <button className="button button--ghost" disabled={isSubmitting} onClick={onOpenSettings} type="button">
              Settings
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

  return [...errors, `Retry in ${String(Math.ceil(retryAfterMs / 1_000))} seconds.`];
};
