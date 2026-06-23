import { Button, Field, Input } from "@fluentui/react-components";
import { Dismiss24Regular, Settings24Regular } from "@fluentui/react-icons";
import { useState, type JSX, type SyntheticEvent } from "react";

import { ActionsRow, FormGrid, HeaderBlock, PanelCard, Screen } from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
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
    <Screen center>
      <PanelCard ariaLabel="관리자 인증" narrow>
        <HeaderBlock title="관리자 인증" />
        <form onSubmit={submit}>
          <FormGrid>
            <Field label="관리자 코드">
              <Input
                disabled={isSubmitting}
                input={inputSlot({ "data-testid": "admin-code-input", autoFocus: true })}
                onChange={(_event, data) => {
                  setAdminCode(data.value);
                }}
                type="password"
                value={adminCode}
              />
            </Field>
            <ErrorList errors={errors} testId="admin-errors" />
            <ActionsRow>
              <Button
                appearance="secondary"
                disabled={isSubmitting}
                icon={<Dismiss24Regular />}
                onClick={onCancel}
                type="button"
              >
                뒤로
              </Button>
              <Button appearance="primary" disabled={isSubmitting} icon={<Settings24Regular />} type="submit">
                설정 열기
              </Button>
            </ActionsRow>
          </FormGrid>
        </form>
      </PanelCard>
    </Screen>
  );
};
