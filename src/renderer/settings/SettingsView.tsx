import { Button, Field, Input, Spinner } from "@fluentui/react-components";
import { LockClosed24Regular, Save24Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState, type JSX, type SyntheticEvent } from "react";

import type { SettingsSafeView } from "../../core/settings-validation";
import { HeaderBlock, PageStack, Screen, SectionCard, SplitTwo, Stack } from "../fluentLayout";
import { inputSlot } from "../fluentSlots";
import { AuditLogView } from "../logs/AuditLogView";
import { AdminCodeChange } from "./AdminCodeChange";
import { ErrorList, Message } from "./Feedback";
import { QrSessionTools } from "./QrSessionTools";
import { SavedLoginsSection } from "./SavedLoginsSection";
import { UserManagement } from "./UserManagement";
import { isValidHttpUrl, parseSeconds } from "./validation";

interface SettingsViewProps {
  readonly onClose: () => void;
}

export const SettingsView = ({ onClose }: SettingsViewProps): JSX.Element => {
  const [settings, setSettings] = useState<SettingsSafeView | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [unlockDurationSeconds, setUnlockDurationSeconds] = useState("10");
  const [idleAutoLockSeconds, setIdleAutoLockSeconds] = useState("30");
  const [qrTitlePattern, setQrTitlePattern] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const lockSettings = useCallback((): void => {
    void window.qrGuard.closeSettings().then(onClose, onClose);
  }, [onClose]);

  const loadSettings = useCallback(async (): Promise<void> => {
    const response = await window.qrGuard.getSettingsView();

    if (!response.ok) {
      setErrors(response.errors);
      return;
    }

    const nextSettings = response.settings;
    setSettings(nextSettings);
    setQrUrl(nextSettings.qrUrl);
    setUnlockDurationSeconds(String(nextSettings.unlockDurationSeconds));
    setIdleAutoLockSeconds(String(nextSettings.idleAutoLockSeconds));
    setQrTitlePattern(nextSettings.qrTitlePattern);
  }, []);

  useEffect(() => {
    void loadSettings().catch(() => {
      setErrors(["설정을 불러올 수 없습니다."]);
    });
  }, [loadSettings]);

  useEffect(() => () => {
    void window.qrGuard.closeSettings().then(undefined, () => undefined);
  }, []);

  const saveSettings = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const unlockSeconds = parseSeconds(unlockDurationSeconds);
    const idleSeconds = parseSeconds(idleAutoLockSeconds);
    const validationErrors = validateSettingsForm(qrUrl, unlockSeconds, idleSeconds);

    if (validationErrors.length > 0 || unlockSeconds === null || idleSeconds === null) {
      setErrors(validationErrors);
      return;
    }

    setIsBusy(true);
    void window.qrGuard.saveSettings({
      idleAutoLockSeconds: idleSeconds,
      qrTitlePattern: qrTitlePattern.trim(),
      qrUrl: qrUrl.trim(),
      unlockDurationSeconds: unlockSeconds
    })
      .then(async (response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["설정을 저장할 수 없습니다."]);
          return;
        }

        setErrors([]);
        setMessage("설정이 저장되었습니다.");
        await loadSettings();
      })
      .catch(() => {
        setErrors(["설정을 저장할 수 없습니다."]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <Screen>
      <PageStack>
        <HeaderBlock
          action={
            <Button
              appearance="secondary"
              disabled={isBusy}
              icon={<LockClosed24Regular />}
              onClick={lockSettings}
              type="button"
            >
              설정 잠그기
            </Button>
          }
          title="설정"
        />

        <SectionCard ariaLabel="기본 설정" title="기본 설정">
          {settings === null ? <Spinner label="설정 불러오는 중" /> : null}
          <form onSubmit={saveSettings}>
            <Stack>
              <Field label="QR 사이트 주소">
                <Input
                  disabled={isBusy || settings === null}
                  input={inputSlot({ "data-testid": "settings-qr-url" })}
                  onChange={(_event, data) => {
                    setQrUrl(data.value);
                  }}
                  type="url"
                  value={qrUrl}
                />
              </Field>
              <SplitTwo>
                <Field label="노출 시간(초)">
                  <Input
                    disabled={isBusy || settings === null}
                    input={inputSlot({ "data-testid": "settings-unlock-duration", min: 1 })}
                    onChange={(_event, data) => {
                      setUnlockDurationSeconds(data.value);
                    }}
                    type="number"
                    value={unlockDurationSeconds}
                  />
                </Field>
                <Field label="유휴 자동잠금(초)">
                  <Input
                    disabled={isBusy || settings === null}
                    input={inputSlot({ "data-testid": "settings-idle-timeout", min: 1 })}
                    onChange={(_event, data) => {
                      setIdleAutoLockSeconds(data.value);
                    }}
                    type="number"
                    value={idleAutoLockSeconds}
                  />
                </Field>
              </SplitTwo>
              <Field label="QR 화면 제목">
                <Input
                  disabled={isBusy || settings === null}
                  input={inputSlot({ "data-testid": "settings-qr-title-pattern" })}
                  onChange={(_event, data) => {
                    setQrTitlePattern(data.value);
                  }}
                  value={qrTitlePattern}
                />
              </Field>
              <Button
                appearance="primary"
                disabled={isBusy || settings === null}
                icon={<Save24Regular />}
                type="submit"
              >
                설정 저장
              </Button>
            </Stack>
          </form>
        </SectionCard>

        {settings === null ? null : <UserManagement onChanged={loadSettings} users={settings.users} />}
        {settings === null ? null : <AdminCodeChange />}
        {settings === null ? null : <SavedLoginsSection />}
        <AuditLogView />
        <QrSessionTools
          isBusy={isBusy}
          onSetBusy={setIsBusy}
          onSetErrors={setErrors}
          onSetMessage={setMessage}
        />
        <Message text={message} />
        <ErrorList errors={errors} />
      </PageStack>
    </Screen>
  );
};

const validateSettingsForm = (
  qrUrl: string,
  unlockSeconds: number | null,
  idleSeconds: number | null
): readonly string[] => {
  const errors: string[] = [];

  if (!isValidHttpUrl(qrUrl)) {
    errors.push(qrUrl.trim().length === 0 ? "QR 사이트 주소를 입력하세요." : "QR 사이트 주소가 올바르지 않습니다.");
  }

  if (unlockSeconds === null) {
    errors.push("노출 시간은 최소 1초 이상이어야 합니다.");
  }

  if (idleSeconds === null) {
    errors.push("유휴 자동잠금은 최소 1초 이상이어야 합니다.");
  }

  return errors;
};
