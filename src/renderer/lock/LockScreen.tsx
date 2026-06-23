import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Text,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { Globe24Regular, Key24Regular, Settings24Regular } from "@fluentui/react-icons";
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
  const [adminCode, setAdminCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [siteLoginErrors, setSiteLoginErrors] = useState<readonly string[]>([]);
  const [isSiteLoginOpen, setIsSiteLoginOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitCredentials = (
    action: () => ReturnType<typeof window.qrGuard.submitUnlock>,
    failureMessage: string
  ): void => {
    setIsSubmitting(true);

    void action()
      .then((response) => {
        if (response.ok) {
          setCode("");
          setErrors([]);
          return;
        }

        setErrors(formatUnlockErrors(response.errors, response.retryAfterMs));
      })
      .catch(() => {
        setErrors([failureMessage]);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submitCredentials(() => window.qrGuard.submitUnlock(userId, code), "잠금 해제에 실패했습니다.");
  };

  const submitSiteLogin = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setIsSubmitting(true);

    void window.qrGuard.submitSiteLogin(adminCode)
      .then((response) => {
        if (response.ok) {
          setAdminCode("");
          setSiteLoginErrors([]);
          setIsSiteLoginOpen(false);
          return;
        }

        setSiteLoginErrors(formatUnlockErrors(response.errors, response.retryAfterMs));
      })
      .catch(() => {
        setSiteLoginErrors(["사이트 로그인 모드 진입에 실패했습니다."]);
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
                data-testid="site-login-submit"
                disabled={isSubmitting}
                icon={<Globe24Regular />}
                onClick={() => {
                  setSiteLoginErrors([]);
                  setIsSiteLoginOpen(true);
                }}
                type="button"
              >
                사이트 로그인
              </Button>
              <Button
                appearance="secondary"
                data-testid="settings-open"
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
        <Dialog
          onOpenChange={(_event, data) => {
            setIsSiteLoginOpen(data.open);
            if (!data.open) {
              setAdminCode("");
              setSiteLoginErrors([]);
            }
          }}
          open={isSiteLoginOpen}
        >
          <DialogSurface data-testid="site-login-admin-dialog">
            <form onSubmit={submitSiteLogin}>
              <DialogBody>
                <DialogTitle>사이트 로그인</DialogTitle>
                <DialogContent>
                  <FormGrid>
                    <Field label="관리자 코드">
                      <Input
                        disabled={isSubmitting}
                        input={inputSlot({
                          "data-testid": "site-login-admin-code-input",
                          autoFocus: true
                        })}
                        onChange={(_event, data) => {
                          setAdminCode(data.value);
                        }}
                        type="password"
                        value={adminCode}
                      />
                    </Field>
                    <ErrorList errors={siteLoginErrors} testId="site-login-admin-errors" />
                  </FormGrid>
                </DialogContent>
                <DialogActions>
                  <Button
                    appearance="secondary"
                    disabled={isSubmitting}
                    onClick={() => {
                      setIsSiteLoginOpen(false);
                    }}
                    type="button"
                  >
                    취소
                  </Button>
                  <Button
                    appearance="primary"
                    data-testid="site-login-admin-code-submit"
                    disabled={isSubmitting}
                    icon={<Globe24Regular />}
                    type="submit"
                  >
                    사이트 로그인
                  </Button>
                </DialogActions>
              </DialogBody>
            </form>
          </DialogSurface>
        </Dialog>
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
