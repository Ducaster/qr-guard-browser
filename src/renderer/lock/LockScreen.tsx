import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Text,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { Globe24Regular, Key24Regular, Settings24Regular } from "@fluentui/react-icons";
import { useEffect, useState, type JSX, type SyntheticEvent } from "react";

import type { QrLoadFailure } from "../../core/state-machine";
import { ActionsRow, FormGrid, HeaderBlock, PanelCard, Screen } from "../fluentLayout";
import { buttonSlot, inputSlot } from "../fluentSlots";
import { ErrorList } from "../settings/Feedback";
import { QrLoadFailureNotice } from "./QrLoadFailureNotice";

interface LockScreenProps {
  readonly qrLoadFailure: QrLoadFailure | null;
  readonly onOpenSettings: () => void;
  readonly onRetryQrLoad: () => ReturnType<typeof window.qrGuard.retryQrLoad>;
}

export const LockScreen = ({
  onOpenSettings,
  onRetryQrLoad,
  qrLoadFailure
}: LockScreenProps): JSX.Element => {
  const styles = useLockScreenStyles();
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [siteLoginErrors, setSiteLoginErrors] = useState<readonly string[]>([]);
  const [isSiteLoginOpen, setIsSiteLoginOpen] = useState(false);
  const [isLoadingRegions, setIsLoadingRegions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regions, setRegions] = useState<readonly string[]>([]);
  const emptyRegionsHint =
    !isLoadingRegions && regions.length === 0
      ? "설정된 지역이 없습니다. 설정에서 지역을 추가하세요."
      : undefined;

  useEffect(() => {
    let isMounted = true;

    void window.qrGuard.listUnlockRegions()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        if (!response.ok) {
          setRegions([]);
          setUserId("");
          setErrors(response.errors);
          return;
        }

        setRegions(response.regions);
        setUserId(response.regions.length === 1 ? response.regions[0] ?? "" : "");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setRegions([]);
        setUserId("");
        setErrors(["지역 목록을 불러올 수 없습니다."]);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingRegions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
    if (userId.length === 0) {
      setErrors(["지역을 선택하세요."]);
      return;
    }

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
        <QrLoadFailureNotice failure={qrLoadFailure} onRetry={onRetryQrLoad} />
        <form onSubmit={submit}>
          <FormGrid>
            <Field
              {...(emptyRegionsHint === undefined ? {} : { hint: emptyRegionsHint })}
              label="지역"
            >
              <Dropdown
                button={buttonSlot({ "data-testid": "unlock-user-id", autoFocus: true })}
                disabled={isSubmitting || isLoadingRegions || regions.length === 0}
                inlinePopup
                onOptionSelect={(_event, data) => {
                  const selectedUserId = data.optionValue ?? "";
                  setUserId(selectedUserId);
                  setErrors([]);
                }}
                placeholder="지역 선택"
                selectedOptions={userId.length === 0 ? [] : [userId]}
                value={userId}
              >
                {regions.map((region) => (
                  <Option key={region} text={region} value={region}>
                    {region}
                  </Option>
                ))}
              </Dropdown>
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
