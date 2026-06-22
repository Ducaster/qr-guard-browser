import { useState, type JSX, type SyntheticEvent } from "react";

import { ErrorList } from "./Feedback";
import { createUserRow, validateSetupForm, type SetupUserRow } from "./first-run-model";

interface FirstRunSetupProps {
  readonly onComplete: () => void;
}

export const FirstRunSetup = ({ onComplete }: FirstRunSetupProps): JSX.Element => {
  const [qrUrl, setQrUrl] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [unlockDurationSeconds, setUnlockDurationSeconds] = useState("10");
  const [idleAutoLockSeconds, setIdleAutoLockSeconds] = useState("30");
  const [loginUrlPattern, setLoginUrlPattern] = useState("");
  const [loggedInUrlPattern, setLoggedInUrlPattern] = useState("");
  const [titleContains, setTitleContains] = useState("");
  const [users, setUsers] = useState<readonly SetupUserRow[]>([createUserRow()]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const updateUser = (rowId: string, field: "code" | "userId", value: string): void => {
    setUsers((currentUsers) =>
      currentUsers.map((user) => (user.rowId === rowId ? { ...user, [field]: value } : user))
    );
  };

  const removeUser = (rowId: string): void => {
    setUsers((currentUsers) => currentUsers.filter((user) => user.rowId !== rowId));
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const validation = validateSetupForm({
      adminCode,
      idleAutoLockSeconds,
      loggedInUrlPattern,
      loginUrlPattern,
      qrUrl,
      titleContains,
      unlockDurationSeconds,
      users
    });

    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    void window.qrGuard.completeFirstRunSetup(validation.payload)
      .then((response) => {
        if (response.ok) {
          setErrors([]);
          onComplete();
          return;
        }

          setErrors(response.errors ?? ["초기 설정을 저장할 수 없습니다."]);
      })
      .catch(() => {
        setErrors(["초기 설정을 저장할 수 없습니다."]);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  return (
    <main className="app-shell">
      <section className="operator-panel setup-layout" aria-label="초기 설정">
        <div className="panel-header">
          <p className="eyebrow">QR 가드 브라우저</p>
          <h1>초기 설정</h1>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <div className="form-section">
            <label className="field">
              <span>QR 사이트 주소</span>
              <input
                autoFocus
                data-testid="setup-qr-url"
                disabled={isSaving}
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
              <span>관리자 코드</span>
              <input
                data-testid="setup-admin-code"
                disabled={isSaving}
                onChange={(event) => {
                  setAdminCode(event.target.value);
                }}
                type="password"
                value={adminCode}
              />
            </label>
            <label className="field">
              <span>노출 시간(초)</span>
              <input
                data-testid="setup-unlock-duration"
                disabled={isSaving}
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
                data-testid="setup-idle-timeout"
                disabled={isSaving}
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
                  data-testid="setup-login-pattern"
                  disabled={isSaving}
                  onChange={(event) => {
                    setLoginUrlPattern(event.target.value);
                  }}
                  value={loginUrlPattern}
                />
              </label>
              <label className="field">
                <span>로그인 완료 URL 패턴</span>
                <input
                  data-testid="setup-logged-in-pattern"
                  disabled={isSaving}
                  onChange={(event) => {
                    setLoggedInUrlPattern(event.target.value);
                  }}
                  value={loggedInUrlPattern}
                />
              </label>
              <label className="field">
                <span>제목 포함 문구</span>
                <input
                  data-testid="setup-title-contains"
                  disabled={isSaving}
                  onChange={(event) => {
                    setTitleContains(event.target.value);
                  }}
                  value={titleContains}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>지역 관리</legend>
            <div className="user-stack">
              {users.map((user) => (
                <div className="user-edit-row" key={user.rowId}>
                  <label className="field">
                    <span>지역</span>
                    <input
                      data-testid="setup-user-id"
                      disabled={isSaving}
                      onChange={(event) => {
                        updateUser(user.rowId, "userId", event.target.value);
                      }}
                      value={user.userId}
                    />
                  </label>
                  <label className="field">
                    <span>인증 코드</span>
                    <input
                      data-testid="setup-user-code"
                      disabled={isSaving}
                      onChange={(event) => {
                        updateUser(user.rowId, "code", event.target.value);
                      }}
                      type="password"
                      value={user.code}
                    />
                  </label>
                  <button
                    className="button button--ghost"
                    disabled={isSaving || users.length === 1}
                    onClick={() => {
                      removeUser(user.rowId);
                    }}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <button
              className="button button--secondary"
              disabled={isSaving}
              onClick={() => {
                setUsers((currentUsers) => [...currentUsers, createUserRow()]);
              }}
              type="button"
            >
              지역 추가
            </button>
          </fieldset>

          <ErrorList errors={errors} testId="setup-errors" />
          <div className="button-row button-row--end">
            <button className="button button--primary" data-testid="setup-submit" disabled={isSaving} type="submit">
              초기 설정 저장
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};
