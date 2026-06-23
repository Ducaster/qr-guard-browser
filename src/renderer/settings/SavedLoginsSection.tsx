import { Button, Spinner, Text, makeStyles, tokens } from "@fluentui/react-components";
import { Delete24Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState, type JSX } from "react";

import type { SavedSiteCredential } from "../../core/site-credentials";
import { ActionsRow, SectionCard, Stack } from "../fluentLayout";
import { ErrorList, Message } from "./Feedback";

export const SavedLoginsSection = (): JSX.Element => {
  const styles = useSavedLoginsStyles();
  const [credentials, setCredentials] = useState<readonly SavedSiteCredential[]>([]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const loadCredentials = useCallback(async (): Promise<void> => {
    const response = await window.qrGuard.listSiteCredentials();

    if (!response.ok) {
      setErrors(response.errors);
      return;
    }

    setCredentials(response.credentials);
    setErrors([]);
  }, []);

  useEffect(() => {
    void loadCredentials().catch(() => {
      setErrors(["저장된 로그인을 불러올 수 없습니다."]);
    });
  }, [loadCredentials]);

  const deleteCredential = (id: string): void => {
    setIsBusy(true);
    setMessage("");
    void window.qrGuard.deleteSiteCredential(id)
      .then(async (response) => {
        if (!response.ok) {
          setErrors(response.errors ?? ["저장된 로그인을 삭제할 수 없습니다."]);
          return;
        }

        setErrors([]);
        setMessage("저장된 로그인이 삭제되었습니다.");
        await loadCredentials();
      })
      .catch(() => {
        setErrors(["저장된 로그인을 삭제할 수 없습니다."]);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <SectionCard ariaLabel="저장된 로그인" title="저장된 로그인">
      <Stack>
        {credentials.length === 0 && !isBusy ? (
          <Text data-testid="settings-saved-login-empty">저장된 로그인이 없습니다.</Text>
        ) : null}
        {credentials.map((credential) => (
          <div className={styles.row} data-testid="settings-saved-login-row" key={credential.id}>
            <div className={styles.identity}>
              <Text weight="semibold">{credential.origin}</Text>
              <Text size={200}>{credential.username}</Text>
            </div>
            <Button
              data-testid="settings-saved-login-delete"
              disabled={isBusy}
              icon={<Delete24Regular />}
              onClick={() => {
                deleteCredential(credential.id);
              }}
              type="button"
            >
              삭제
            </Button>
          </div>
        ))}
        {isBusy ? <Spinner label="처리 중" size="tiny" /> : null}
        <ActionsRow>
          <Message text={message} />
        </ActionsRow>
        <ErrorList errors={errors} />
      </Stack>
    </SectionCard>
  );
};

const useSavedLoginsStyles = makeStyles({
  identity: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
    minWidth: 0
  },
  row: {
    alignItems: "center",
    borderBottomColor: tokens.colorNeutralStroke2,
    borderBottomStyle: "solid",
    borderBottomWidth: tokens.strokeWidthThin,
    display: "flex",
    gap: tokens.spacingHorizontalM,
    justifyContent: "space-between",
    padding: `${tokens.spacingVerticalS} 0`
  }
});
