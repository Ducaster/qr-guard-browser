import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Text,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { Save24Regular } from "@fluentui/react-icons";
import { useState, type JSX } from "react";

import type {
  SiteCredentialSaveDecision,
  SiteCredentialSaveOffer
} from "../../core/site-credential-messages";

interface SiteCredentialSavePromptProps {
  readonly offer: SiteCredentialSaveOffer;
  readonly onClose: () => void;
}

export const SiteCredentialSavePrompt = ({
  offer,
  onClose
}: SiteCredentialSavePromptProps): JSX.Element => {
  const styles = usePromptStyles();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const respond = (decision: SiteCredentialSaveDecision): void => {
    setIsBusy(true);
    setError("");
    void window.qrGuard.respondToSiteCredentialSaveOffer({
      decision,
      offerId: offer.offerId
    })
      .then((response) => {
        if (!response.ok) {
          setError(response.errors?.[0] ?? "저장 선택을 처리할 수 없습니다.");
          return;
        }

        onClose();
      })
      .catch(() => {
        setError("저장 선택을 처리할 수 없습니다.");
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  return (
    <MessageBar
      className={styles.prompt}
      data-testid="site-credential-save-prompt"
      intent={error.length > 0 ? "error" : "info"}
      role="status"
    >
      <MessageBarBody>
        <div className={styles.body}>
          <Text weight="semibold">이 사이트의 로그인 정보를 저장할까요?</Text>
          <Text size={200}>
            {offer.origin} · {offer.username}
          </Text>
          {error.length > 0 ? <Text size={200}>{error}</Text> : null}
        </div>
      </MessageBarBody>
      <MessageBarActions>
        <Button
          appearance="primary"
          data-testid="site-credential-save"
          disabled={isBusy}
          icon={<Save24Regular />}
          onClick={() => {
            respond("save");
          }}
          size="small"
        >
          저장
        </Button>
        <Button
          data-testid="site-credential-later"
          disabled={isBusy}
          onClick={() => {
            respond("later");
          }}
          size="small"
        >
          나중에
        </Button>
        <Button
          data-testid="site-credential-never"
          disabled={isBusy}
          onClick={() => {
            respond("never");
          }}
          size="small"
        >
          이 사이트 저장 안 함
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
};

const usePromptStyles = makeStyles({
  body: {
    display: "grid",
    gap: tokens.spacingVerticalXXS
  },
  prompt: {
    bottom: tokens.spacingVerticalL,
    boxShadow: tokens.shadow16,
    maxWidth: "680px",
    position: "fixed",
    right: tokens.spacingHorizontalL,
    zIndex: 20
  }
});
