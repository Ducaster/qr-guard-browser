import { useCallback, useEffect, useState, type JSX, type SyntheticEvent } from "react";

import type { SettingsSafeView } from "../../core/settings-validation";
import { ErrorList, Message } from "./Feedback";
import { isValidHttpUrl, parseSeconds, validateAdminCode } from "./validation";
import { UserManagement } from "./UserManagement";

interface SettingsViewProps {
  readonly onClose: () => void;
}

export const SettingsView = ({ onClose }: SettingsViewProps): JSX.Element => {
  const [settings, setSettings] = useState<SettingsSafeView | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [unlockDurationSeconds, setUnlockDurationSeconds] = useState("10");
  const [idleAutoLockSeconds, setIdleAutoLockSeconds] = useState("30");
  const [loginUrlPattern, setLoginUrlPattern] = useState("");
  const [loggedInUrlPattern, setLoggedInUrlPattern] = useState("");
  const [titleContains, setTitleContains] = useState("");
  const [clearAdminCode, setClearAdminCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const lockSettings = useCallback((): void => {
    void window.qrGuard.closeSettings().then(onClose, onClose);
  }, [onClose]);

  const loadSettings = useCallback(async (): Promise<void> => {
    const response = await window.qrGuard.getSettingsView();

    if (!response.ok) {
      setErrors(response.errors);
      return;
    }

    const nextSettings = response.settings;
    setSettings(nextSettings);
    setQrUrl(nextSettings.qrUrl);
    setUnlockDurationSeconds(String(nextSettings.unlockDurationSeconds));
    setIdleAutoLockSeconds(String(nextSettings.idleAutoLockSeconds));
    setLoginUrlPattern(nextSettings.loginDetection.loginUrlPattern);
    setLoggedInUrlPattern(nextSettings.loginDetection.loggedInUrlPattern);
    setTitleContains(nextSettings.loginDetection.titleContains);
  }, []);

  useEffect(() => {
    void loadSettings().catch(() => {
      setErrors(["Settings could not be loaded."]);
    });
  }, [loadSettings]);

  useEffect(() => () => {
    void window.qrGuard.closeSettings().then(undefined, () => undefined);
  }, []);

  const saveSettings = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const unlockSeconds = parseSeconds(unlockDurationSeconds);
    const idleSeconds = parseSeconds(idleAutoLockSeconds);
    const validationErrors = validateSettingsForm(qrUrl, unlockSeconds, idleSeconds);

    if (validationErrors.length > 0 || unlockSeconds === null || idleSeconds === null) {
      setErrors(validationErrors);
      return;
    }

    setIsBusy(true);
    void window.qrGuard.saveSettings({
      idleAutoLockSeconds: idleSeconds,
      loginDetection: {
        loggedInUrlPattern: loggedInUrlPattern.trim(),
        loginUrlPattern: loginUrlPattern.trim(),
        titleContains: titleContains.trim()
      },
      qrUrl: qrUrl.trim(),
      unlockDurationSeconds: unlockSeconds
    })
      .then(async (response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["Settings could not be saved."]);
          return;
        }

        setErrors([]);
        setMessage("Settings saved.");
        await loadSettings();
      })
      .catch(() => {
        setErrors(["Settings could not be saved."]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  const clearQrSession = (): void => {
    const validationErrors = validateAdminCode(clearAdminCode);

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsBusy(true);
    void window.qrGuard.clearQrSession(clearAdminCode.trim())
      .then((response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["QR session could not be cleared."]);
          return;
        }

        setErrors([]);
        setMessage("QR session cleared.");
        setClearAdminCode("");
      })
      .catch(() => {
        setErrors(["QR session could not be cleared."]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <main className="app-shell">
      <section className="operator-panel settings-layout" aria-label="Settings">
        <div className="panel-header panel-header--split">
          <div>
            <p className="eyebrow">QR Guard Browser</p>
            <h1>Settings</h1>
          </div>
          <button className="button button--ghost" disabled={isBusy} onClick={lockSettings} type="button">
            Lock settings
          </button>
        </div>

        {settings === null ? <p className="muted">Loading settings</p> : null}

        <form className="form-grid" onSubmit={saveSettings}>
          <div className="form-section">
            <label className="field">
              <span>QR URL</span>
              <input
                data-testid="settings-qr-url"
                disabled={isBusy || settings === null}
                onChange={(event) => {
                  setQrUrl(event.target.value);
                }}
                type="url"
                value={qrUrl}
              />
            </label>
          </div>
          <div className="form-section form-section--two">
            <label className="field">
              <span>Unlock seconds</span>
              <input
                data-testid="settings-unlock-duration"
                disabled={isBusy || settings === null}
                min="1"
                onChange={(event) => {
                  setUnlockDurationSeconds(event.target.value);
                }}
                type="number"
                value={unlockDurationSeconds}
              />
            </label>
            <label className="field">
              <span>Idle seconds</span>
              <input
                data-testid="settings-idle-timeout"
                disabled={isBusy || settings === null}
                min="1"
                onChange={(event) => {
                  setIdleAutoLockSeconds(event.target.value);
                }}
                type="number"
                value={idleAutoLockSeconds}
              />
            </label>
          </div>
          <fieldset className="form-section">
            <legend>Login detection</legend>
            <div className="form-section form-section--three">
              <label className="field">
                <span>Login URL pattern</span>
                <input
                  disabled={isBusy || settings === null}
                  onChange={(event) => {
                    setLoginUrlPattern(event.target.value);
                  }}
                  value={loginUrlPattern}
                />
              </label>
              <label className="field">
                <span>Logged-in URL pattern</span>
                <input
                  disabled={isBusy || settings === null}
                  onChange={(event) => {
                    setLoggedInUrlPattern(event.target.value);
                  }}
                  value={loggedInUrlPattern}
                />
              </label>
              <label className="field">
                <span>Title contains</span>
                <input
                  disabled={isBusy || settings === null}
                  onChange={(event) => {
                    setTitleContains(event.target.value);
                  }}
                  value={titleContains}
                />
              </label>
            </div>
          </fieldset>
          <div className="button-row button-row--end">
            <button className="button button--primary" disabled={isBusy || settings === null} type="submit">
              Save settings
            </button>
          </div>
        </form>

        {settings === null ? null : <UserManagement onChanged={loadSettings} users={settings.users} />}

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

        <Message text={message} />
        <ErrorList errors={errors} />
      </section>
    </main>
  );
};

const validateSettingsForm = (
  qrUrl: string,
  unlockSeconds: number | null,
  idleSeconds: number | null
): readonly string[] => {
  const errors: string[] = [];

  if (!isValidHttpUrl(qrUrl)) {
    errors.push(qrUrl.trim().length === 0 ? "QR URL is required." : "QR URL must be valid.");
  }

  if (unlockSeconds === null) {
    errors.push("Unlock duration must be at least 1 second.");
  }

  if (idleSeconds === null) {
    errors.push("Idle timeout must be at least 1 second.");
  }

  return errors;
};
