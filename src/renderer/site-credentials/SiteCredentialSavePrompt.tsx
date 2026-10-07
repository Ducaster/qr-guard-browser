import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Text,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { ArrowSync24Regular, Save24Regular } from "@fluentui/react-icons";
import { useState, type JSX } from "react";

import type {
  SiteCredentialSaveDecision,
  SiteCredentialSaveOffer
} from "../../core/site-credential-messages";
import { CONTROL_TOOLBAR_HEIGHT, CREDENTIAL_PROMPT_BAND_HEIGHT } from "../../core/shell-config";

interface SiteCredentialSavePromptProps {
  readonly docked: boolean;
  readonly offer: SiteCredentialSaveOffer;
  readonly onClose: () => void;
}

export const SiteCredentialSavePrompt = ({
  docked,
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
      className={docked ? styles.docked : styles.floating}
      data-testid="site-credential-save-prompt"
      intent={error.length > 0 ? "error" : "info"}
      layout={docked ? "singleline" : "auto"}
      role="status"
    >
      <MessageBarBody>
        <div className={styles.body}>
          <Text weight="semibold">
            {offer.isUpdate ? "저장된 비밀번호를 새 비밀번호로 바꿀까요?" : "이 사이트의 로그인 정보를 저장할까요?"}
          </Text>
          <Text className={styles.identity} size={200}>
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
          icon={offer.isUpdate ? <ArrowSync24Regular /> : <Save24Regular />}
          onClick={() => {
            respond("save");
          }}
          size="small"
        >
          {offer.isUpdate ? "업데이트" : "저장"}
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
        {offer.isUpdate ? null : (
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
        )}
      </MessageBarActions>
    </MessageBar>
  );
};

const usePromptStyles = makeStyles({
  body: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
    minWidth: 0
  },
  docked: {
    borderRadius: 0,
    boxSizing: "border-box",
    height: `${String(CREDENTIAL_PROMPT_BAND_HEIGHT)}px`,
    left: 0,
    position: "fixed",
    right: 0,
    top: `${String(CONTROL_TOOLBAR_HEIGHT)}px`,
    zIndex: 20
  },
  floating: {
    bottom: tokens.spacingVerticalL,
    boxShadow: tokens.shadow16,
    maxWidth: "680px",
    position: "fixed",
    right: tokens.spacingHorizontalL,
    zIndex: 20
  },
  identity: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }
});
