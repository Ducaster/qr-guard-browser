import { Button, Field, Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import { Add24Regular, Delete24Regular, Key24Regular, Save24Regular } from "@fluentui/react-icons";
import { useState, type JSX, type SyntheticEvent } from "react";

import type { SettingsSafeUserView } from "../../core/settings-validation";
import { SectionCard, Stack, WrapGrid } from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
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
    <SectionCard ariaLabel="지역 관리" title="지역 관리">
      <Stack>
        {users.map((user) => (
          <UserRow
            isBusy={isBusy}
            key={user.userId}
            onChanged={onChanged}
            onSetBusy={setIsBusy}
            user={user}
          />
        ))}
      </Stack>
      <form onSubmit={addUser}>
        <WrapGrid>
          <Field label="지역">
            <Input
              disabled={isBusy}
              input={inputSlot({ "data-testid": "settings-add-user-id" })}
              onChange={(_event, data) => {
                setNewUserId(data.value);
              }}
              value={newUserId}
            />
          </Field>
          <Field label="인증 코드">
            <Input
              disabled={isBusy}
              input={inputSlot({ "data-testid": "settings-add-user-code" })}
              onChange={(_event, data) => {
                setNewCode(data.value);
              }}
              type="password"
              value={newCode}
            />
          </Field>
          <Button appearance="primary" disabled={isBusy} icon={<Add24Regular />} type="submit">
            지역 추가
          </Button>
        </WrapGrid>
      </form>
      <Message text={message} />
      <ErrorList errors={errors} />
    </SectionCard>
  );
};

interface UserRowProps {
  readonly isBusy: boolean;
  readonly onChanged: () => Promise<void>;
  readonly onSetBusy: (isBusy: boolean) => void;
  readonly user: SettingsSafeUserView;
}

const UserRow = ({ isBusy, onChanged, onSetBusy, user }: UserRowProps): JSX.Element => {
  const styles = useUserManagementStyles();
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
    <div className={styles.userRow}>
      <div className={styles.userMeta}>
        <Text weight="semibold">{user.userId}</Text>
        <Text size={200}>{formatLastAuthenticated(user.lastAuthenticatedAt)}</Text>
      </div>
      <WrapGrid>
        <Field label="이름 변경">
          <Input
            disabled={isBusy}
            onChange={(_event, data) => {
              setNextUserId(data.value);
            }}
            value={nextUserId}
          />
        </Field>
        <Button
          appearance="secondary"
          disabled={isBusy || nextUserId.trim().length === 0}
          icon={<Save24Regular />}
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
        </Button>
        <Field label="새 인증 코드">
          <Input
            disabled={isBusy}
            onChange={(_event, data) => {
              setNextCode(data.value);
            }}
            type="password"
            value={nextCode}
          />
        </Field>
        <Button
          appearance="secondary"
          disabled={isBusy || nextCode.trim().length === 0}
          icon={<Key24Regular />}
          onClick={() => {
            resetCode();
          }}
          type="button"
        >
          인증 코드 재설정
        </Button>
        <Button
          appearance="subtle"
          disabled={isBusy}
          icon={<Delete24Regular />}
          onClick={() => {
            runAction(() => window.qrGuard.deleteUser({ userId: user.userId }));
          }}
          type="button"
        >
          삭제
        </Button>
      </WrapGrid>
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

const useUserManagementStyles = makeStyles({
  userMeta: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    justifyContent: "space-between"
  },
  userRow: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: "grid",
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`
  }
});
