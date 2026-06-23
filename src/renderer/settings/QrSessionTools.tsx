import { Button, Field, Input } from "@fluentui/react-components";
import { Delete24Regular } from "@fluentui/react-icons";
import { useState, type JSX } from "react";

import { SectionCard, WrapGrid } from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
import { validateAdminCode } from "./validation";

interface QrSessionToolsProps {
  readonly isBusy: boolean;
  readonly onSetBusy: (isBusy: boolean) => void;
  readonly onSetErrors: (errors: readonly string[]) => void;
  readonly onSetMessage: (message: string) => void;
}

export const QrSessionTools = ({
  isBusy,
  onSetBusy,
  onSetErrors,
  onSetMessage
}: QrSessionToolsProps): JSX.Element => {
  const [clearAdminCode, setClearAdminCode] = useState("");

  const clearQrSession = (): void => {
    const validationErrors = validateAdminCode(clearAdminCode);

    if (validationErrors.length > 0) {
      onSetErrors(validationErrors);
      return;
    }

    onSetBusy(true);
    void window.qrGuard.clearQrSession(clearAdminCode.trim())
      .then((response) => {
        if (!response.ok) {
          onSetErrors(response.errors ?? ["QR 세션을 초기화할 수 없습니다."]);
          return;
        }

        onSetErrors([]);
        onSetMessage("QR 세션이 초기화되었습니다.");
        setClearAdminCode("");
      })
      .catch(() => {
        onSetErrors(["QR 세션을 초기화할 수 없습니다."]);
      })
      .finally(() => {
        onSetBusy(false);
      });
  };

  return (
    <SectionCard ariaLabel="QR 세션" title="QR 세션">
      <WrapGrid>
        <Field label="관리자 코드">
          <Input
            disabled={isBusy}
            input={inputSlot({ "data-testid": "clear-session-admin-code" })}
            onChange={(_event, data) => {
              setClearAdminCode(data.value);
            }}
            type="password"
            value={clearAdminCode}
          />
        </Field>
        <Button appearance="subtle" disabled={isBusy} icon={<Delete24Regular />} onClick={clearQrSession} type="button">
          QR 세션 초기화
        </Button>
      </WrapGrid>
    </SectionCard>
  );
};
