import { Badge, Button, Field, Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import { Key24Regular, Settings24Regular } from "@fluentui/react-icons";
import { useState, type JSX, type SyntheticEvent } from "react";

import { ActionsRow, FormGrid, HeaderBlock, PanelCard, Screen } from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
import { ErrorList } from "../settings/Feedback";

interface LockScreenProps {
  readonly onOpenSettings: () => void;
}

export const LockScreen = ({ onOpenSettings }: LockScreenProps): JSX.Element => {
  const styles = useLockScreenStyles();
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
        setErrors(["잠금 해제에 실패했습니다."]);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <Screen center>
      <PanelCard ariaLabel="잠김" narrow>
        <HeaderBlock title="QR 숨김" />
        <div className={styles.statusLine}>
          <Badge appearance="tint" color="brand" data-testid="locked-screen" shape="rounded">
            잠김
          </Badge>
          <Text size={200}>지역 인증 후 QR 화면을 표시합니다.</Text>
        </div>
        <form onSubmit={submit}>
          <FormGrid>
            <Field label="지역">
              <Input
                disabled={isSubmitting}
                input={inputSlot({ "data-testid": "unlock-user-id", autoFocus: true })}
                onChange={(_event, data) => {
                  setUserId(data.value);
                }}
                value={userId}
              />
            </Field>
            <Field label="인증 코드">
              <Input
                disabled={isSubmitting}
                input={inputSlot({ "data-testid": "unlock-code" })}
                onChange={(_event, data) => {
                  setCode(data.value);
                }}
                type="password"
                value={code}
              />
            </Field>
            <ErrorList errors={errors} testId="unlock-errors" />
            <ActionsRow>
              <Button
                appearance="primary"
                data-testid="unlock-submit"
                disabled={isSubmitting}
                icon={<Key24Regular />}
                type="submit"
              >
                잠금 해제
              </Button>
              <Button
                appearance="secondary"
                disabled={isSubmitting}
                icon={<Settings24Regular />}
                onClick={onOpenSettings}
                type="button"
              >
                설정
              </Button>
            </ActionsRow>
          </FormGrid>
        </form>
      </PanelCard>
    </Screen>
  );
};

const useLockScreenStyles = makeStyles({
  statusLine: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS
  }
});

const formatUnlockErrors = (
  errors: readonly string[],
  retryAfterMs: number | null
): readonly string[] => {
  if (retryAfterMs === null) {
    return errors;
  }

  return [...errors, `${String(Math.ceil(retryAfterMs / 1_000))}초 후 다시 시도하세요.`];
};
