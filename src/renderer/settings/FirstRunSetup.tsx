import { Button, Field, Input } from "@fluentui/react-components";
import { Add24Regular, Delete24Regular, Save24Regular } from "@fluentui/react-icons";
import { useState, type JSX, type SyntheticEvent } from "react";

import {
  ActionsRow,
  FormGrid,
  HeaderBlock,
  PanelCard,
  Screen,
  SplitThree,
  SplitTwo,
  Stack
} from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
import { ErrorList } from "./Feedback";
import { createUserRow, validateSetupForm, type SetupUserRow } from "./first-run-model";
import { useFirstRunStyles } from "./firstRunSetupStyles";

interface FirstRunSetupProps {
  readonly onComplete: () => void;
}

export const FirstRunSetup = ({ onComplete }: FirstRunSetupProps): JSX.Element => {
  const styles = useFirstRunStyles();
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
    <Screen>
      <PanelCard ariaLabel="초기 설정">
        <HeaderBlock title="초기 설정" />
        <form onSubmit={submit}>
          <FormGrid>
            <Field label="QR 사이트 주소">
              <Input
                disabled={isSaving}
                input={inputSlot({ "data-testid": "setup-qr-url", autoFocus: true })}
                onChange={(_event, data) => {
                  setQrUrl(data.value);
                }}
                type="url"
                value={qrUrl}
              />
            </Field>

            <SplitThree>
              <Field label="관리자 코드">
                <Input
                  disabled={isSaving}
                  input={inputSlot({ "data-testid": "setup-admin-code" })}
                  onChange={(_event, data) => {
                    setAdminCode(data.value);
                  }}
                  type="password"
                  value={adminCode}
                />
              </Field>
              <Field label="노출 시간(초)">
                <Input
                  disabled={isSaving}
                  input={inputSlot({ "data-testid": "setup-unlock-duration", min: 1 })}
                  onChange={(_event, data) => {
                    setUnlockDurationSeconds(data.value);
                  }}
                  type="number"
                  value={unlockDurationSeconds}
                />
              </Field>
              <Field label="유휴 자동잠금(초)">
                <Input
                  disabled={isSaving}
                  input={inputSlot({ "data-testid": "setup-idle-timeout", min: 1 })}
                  onChange={(_event, data) => {
                    setIdleAutoLockSeconds(data.value);
                  }}
                  type="number"
                  value={idleAutoLockSeconds}
                />
              </Field>
            </SplitThree>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>로그인 감지</legend>
              <SplitThree>
                <Field label="로그인 URL 패턴">
                  <Input
                    disabled={isSaving}
                    input={inputSlot({ "data-testid": "setup-login-pattern" })}
                    onChange={(_event, data) => {
                      setLoginUrlPattern(data.value);
                    }}
                    value={loginUrlPattern}
                  />
                </Field>
                <Field label="로그인 완료 URL 패턴">
                  <Input
                    disabled={isSaving}
                    input={inputSlot({ "data-testid": "setup-logged-in-pattern" })}
                    onChange={(_event, data) => {
                      setLoggedInUrlPattern(data.value);
                    }}
                    value={loggedInUrlPattern}
                  />
                </Field>
                <Field label="제목 포함 문구">
                  <Input
                    disabled={isSaving}
                    input={inputSlot({ "data-testid": "setup-title-contains" })}
                    onChange={(_event, data) => {
                      setTitleContains(data.value);
                    }}
                    value={titleContains}
                  />
                </Field>
              </SplitThree>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>지역 관리</legend>
              <Stack>
                {users.map((user) => (
                  <div className={styles.userRow} key={user.rowId}>
                    <SplitTwo>
                      <Field label="지역">
                        <Input
                          disabled={isSaving}
                          input={inputSlot({ "data-testid": "setup-user-id" })}
                          onChange={(_event, data) => {
                            updateUser(user.rowId, "userId", data.value);
                          }}
                          value={user.userId}
                        />
                      </Field>
                      <Field label="인증 코드">
                        <Input
                          disabled={isSaving}
                          input={inputSlot({ "data-testid": "setup-user-code" })}
                          onChange={(_event, data) => {
                            updateUser(user.rowId, "code", data.value);
                          }}
                          type="password"
                          value={user.code}
                        />
                      </Field>
                    </SplitTwo>
                    <Button
                      appearance="subtle"
                      disabled={isSaving || users.length === 1}
                      icon={<Delete24Regular />}
                      onClick={() => {
                        removeUser(user.rowId);
                      }}
                      type="button"
                    >
                      삭제
                    </Button>
                  </div>
                ))}
                <ActionsRow>
                  <Button
                    appearance="primary"
                    disabled={isSaving}
                    icon={<Add24Regular />}
                    onClick={() => {
                      setUsers((currentUsers) => [...currentUsers, createUserRow()]);
                    }}
                    type="button"
                  >
                    지역 추가
                  </Button>
                </ActionsRow>
              </Stack>
            </fieldset>

            <ErrorList errors={errors} testId="setup-errors" />
            <ActionsRow alignEnd>
              <Button
                appearance="primary"
                data-testid="setup-submit"
                disabled={isSaving}
                icon={<Save24Regular />}
                type="submit"
              >
                초기 설정 저장
              </Button>
            </ActionsRow>
          </FormGrid>
        </form>
      </PanelCard>
    </Screen>
  );
};
