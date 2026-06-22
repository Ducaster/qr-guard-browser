import { useCallback, useEffect, useState, type JSX, type SyntheticEvent } from "react";

import type { SettingsSafeView } from "../../core/settings-validation";
import { ErrorList, Message } from "./Feedback";
import { AuditLogView } from "../logs/AuditLogView";
import { isValidHttpUrl, parseSeconds } from "./validation";
import { QrSessionTools } from "./QrSessionTools";
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
      setErrors(["설정을 불러올 수 없습니다."]);
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
          setErrors(response.errors ?? ["설정을 저장할 수 없습니다."]);
          return;
        }

        setErrors([]);
        setMessage("설정이 저장되었습니다.");
        await loadSettings();
      })
      .catch(() => {
        setErrors(["설정을 저장할 수 없습니다."]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <main className="app-shell">
      <section className="operator-panel settings-layout" aria-label="설정">
        <div className="panel-header panel-header--split">
          <div>
            <p className="eyebrow">QR 가드 브라우저</p>
            <h1>설정</h1>
          </div>
          <button className="button button--ghost" disabled={isBusy} onClick={lockSettings} type="button">
            설정 잠그기
          </button>
        </div>

        {settings === null ? <p className="muted">설정 불러오는 중</p> : null}

        <form className="form-grid" onSubmit={saveSettings}>
          <div className="form-section">
            <label className="field">
              <span>QR 사이트 주소</span>
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
              <span>노출 시간(초)</span>
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
              <span>유휴 자동잠금(초)</span>
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
            <legend>로그인 감지</legend>
            <div className="form-section form-section--three">
              <label className="field">
                <span>로그인 URL 패턴</span>
                <input
                  disabled={isBusy || settings === null}
                  onChange={(event) => {
                    setLoginUrlPattern(event.target.value);
                  }}
                  value={loginUrlPattern}
                />
              </label>
              <label className="field">
                <span>로그인 완료 URL 패턴</span>
                <input
                  disabled={isBusy || settings === null}
                  onChange={(event) => {
                    setLoggedInUrlPattern(event.target.value);
                  }}
                  value={loggedInUrlPattern}
                />
              </label>
              <label className="field">
                <span>제목 포함 문구</span>
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
              설정 저장
            </button>
          </div>
        </form>

        {settings === null ? null : <UserManagement onChanged={loadSettings} users={settings.users} />}

        <AuditLogView />
        <QrSessionTools
          isBusy={isBusy}
          onSetBusy={setIsBusy}
          onSetErrors={setErrors}
          onSetMessage={setMessage}
        />

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
    errors.push(qrUrl.trim().length === 0 ? "QR 사이트 주소를 입력하세요." : "QR 사이트 주소가 올바르지 않습니다.");
  }

  if (unlockSeconds === null) {
    errors.push("노출 시간은 최소 1초 이상이어야 합니다.");
  }

  if (idleSeconds === null) {
    errors.push("유휴 자동잠금은 최소 1초 이상이어야 합니다.");
  }

  return errors;
};
