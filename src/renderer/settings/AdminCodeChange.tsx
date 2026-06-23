import { Button, Field, Input } from "@fluentui/react-components";
import { Key24Regular } from "@fluentui/react-icons";
import { useState, type JSX, type SyntheticEvent } from "react";

import { SectionCard, WrapGrid } from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
import { ErrorList, Message } from "./Feedback";
import { validateAdminCode } from "./validation";

export const AdminCodeChange = (): JSX.Element => {
  const [code, setCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const changeAdminCode = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const validationErrors = validateAdminCodeChange(code, confirmCode);

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setMessage("");
      return;
    }

    setIsBusy(true);
    void window.qrGuard.changeAdminCode({ code: code.trim() })
      .then((response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["관리자 코드를 변경할 수 없습니다."]);
          setMessage("");
          return;
        }

        setCode("");
        setConfirmCode("");
        setErrors([]);
        setMessage("관리자 코드가 변경되었습니다.");
      })
      .catch(() => {
        setErrors(["관리자 코드를 변경할 수 없습니다."]);
        setMessage("");
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <SectionCard ariaLabel="관리자 코드 변경" title="관리자 코드 변경">
      <form onSubmit={changeAdminCode}>
        <WrapGrid>
          <Field label="새 관리자 코드">
            <Input
              disabled={isBusy}
              input={inputSlot({ "data-testid": "change-admin-code" })}
              onChange={(_event, data) => {
                setCode(data.value);
              }}
              type="password"
              value={code}
            />
          </Field>
          <Field label="새 관리자 코드 확인">
            <Input
              disabled={isBusy}
              input={inputSlot({ "data-testid": "change-admin-code-confirm" })}
              onChange={(_event, data) => {
                setConfirmCode(data.value);
              }}
              type="password"
              value={confirmCode}
            />
          </Field>
          <Button
            appearance="primary"
            data-testid="change-admin-code-submit"
            disabled={isBusy}
            icon={<Key24Regular />}
            type="submit"
          >
            관리자 코드 변경
          </Button>
        </WrapGrid>
      </form>
      <Message text={message} />
      <ErrorList errors={errors} testId="change-admin-code-errors" />
    </SectionCard>
  );
};

const validateAdminCodeChange = (
  code: string,
  confirmCode: string
): readonly string[] => {
  const errors: string[] = [...validateAdminCode(code)];

  if (code.trim() !== confirmCode.trim()) {
    errors.push("관리자 코드 확인이 일치하지 않습니다.");
  }

  return errors;
};
