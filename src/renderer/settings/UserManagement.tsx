import { useState, type JSX, type SyntheticEvent } from "react";

import type { SettingsSafeUserView } from "../../core/settings-validation";
import { ErrorList, Message } from "./Feedback";
import { validateUserCode } from "./validation";

interface UserManagementProps {
  readonly onChanged: () => Promise<void>;
  readonly users: readonly SettingsSafeUserView[];
}

export const UserManagement = ({ onChanged, users }: UserManagementProps): JSX.Element => {
  const [newUserId, setNewUserId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const addUser = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const validationErrors = validateNewUser(newUserId, newCode);

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsBusy(true);
    void window.qrGuard.addUser({ code: newCode.trim(), userId: newUserId.trim() })
      .then(async (response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["지역을 추가할 수 없습니다."]);
          return;
        }

        setNewUserId("");
        setNewCode("");
        setErrors([]);
        setMessage("지역이 추가되었습니다.");
        await onChanged();
      })
      .catch(() => {
        setErrors(["지역을 추가할 수 없습니다."]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <section className="form-section" aria-label="지역 관리">
      <div className="section-heading">
        <h2>지역 관리</h2>
      </div>
      <div className="user-stack">
        {users.map((user) => (
          <UserRow
            isBusy={isBusy}
            key={user.userId}
            onChanged={onChanged}
            onSetBusy={setIsBusy}
            user={user}
          />
        ))}
      </div>
      <form className="inline-form" onSubmit={addUser}>
        <label className="field">
          <span>지역</span>
          <input
            data-testid="settings-add-user-id"
            disabled={isBusy}
            onChange={(event) => {
              setNewUserId(event.target.value);
            }}
            value={newUserId}
          />
        </label>
        <label className="field">
          <span>인증 코드</span>
          <input
            data-testid="settings-add-user-code"
            disabled={isBusy}
            onChange={(event) => {
              setNewCode(event.target.value);
            }}
            type="password"
            value={newCode}
          />
        </label>
        <button className="button button--secondary" disabled={isBusy} type="submit">
          지역 추가
        </button>
      </form>
      <Message text={message} />
      <ErrorList errors={errors} />
    </section>
  );
};

interface UserRowProps {
  readonly isBusy: boolean;
  readonly onChanged: () => Promise<void>;
  readonly onSetBusy: (isBusy: boolean) => void;
  readonly user: SettingsSafeUserView;
}

const UserRow = ({ isBusy, onChanged, onSetBusy, user }: UserRowProps): JSX.Element => {
  const [nextUserId, setNextUserId] = useState(user.userId);
  const [nextCode, setNextCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);

  const runAction = (action: () => Promise<{ readonly errors?: readonly string[]; readonly ok: boolean }>): void => {
    onSetBusy(true);
    void action()
      .then(async (response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["지역 변경사항을 저장할 수 없습니다."]);
          return;
        }

        setErrors([]);
        setNextCode("");
        await onChanged();
      })
      .catch(() => {
        setErrors(["지역 변경사항을 저장할 수 없습니다."]);
      })
      .finally(() => {
        onSetBusy(false);
      });
  };

  const resetCode = (): void => {
    const validationErrors = validateUserCode(nextCode);

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    runAction(() => window.qrGuard.resetUserCode({ code: nextCode.trim(), userId: user.userId }));
  };

  return (
    <div className="user-card">
      <div className="user-meta">
        <strong>{user.userId}</strong>
        <span>{formatLastAuthenticated(user.lastAuthenticatedAt)}</span>
      </div>
      <div className="inline-form">
        <label className="field">
          <span>이름 변경</span>
          <input
            disabled={isBusy}
            onChange={(event) => {
              setNextUserId(event.target.value);
            }}
            value={nextUserId}
          />
        </label>
        <button
          className="button button--secondary"
          disabled={isBusy || nextUserId.trim().length === 0}
          onClick={() => {
            runAction(() =>
              window.qrGuard.updateUser({
                nextUserId: nextUserId.trim(),
                userId: user.userId
              })
            );
          }}
          type="button"
        >
          변경
        </button>
        <label className="field">
          <span>새 인증 코드</span>
          <input
            disabled={isBusy}
            onChange={(event) => {
              setNextCode(event.target.value);
            }}
            type="password"
            value={nextCode}
          />
        </label>
        <button
          className="button button--secondary"
          disabled={isBusy || nextCode.trim().length === 0}
          onClick={() => {
            resetCode();
          }}
          type="button"
        >
          인증 코드 재설정
        </button>
        <button
          className="button button--danger"
          disabled={isBusy}
          onClick={() => {
            runAction(() => window.qrGuard.deleteUser({ userId: user.userId }));
          }}
          type="button"
        >
          삭제
        </button>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
};

const validateNewUser = (userId: string, code: string): readonly string[] => {
  const errors: string[] = [];

  if (userId.trim().length === 0) {
    errors.push("지역을 입력하세요.");
  }

  errors.push(...validateUserCode(code));

  return errors;
};

const formatLastAuthenticated = (value: string | null): string => {
  if (value === null) {
    return "마지막 인증 시각: 없음";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "마지막 인증 시각: 올바르지 않은 날짜";
  }

  return `마지막 인증 시각: ${parsedDate.toLocaleString("ko-KR")}`;
};
