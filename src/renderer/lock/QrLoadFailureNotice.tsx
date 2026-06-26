import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Text,
  makeStyles,
  tokens
} from "@fluentui/react-components";
import { ArrowClockwise24Regular } from "@fluentui/react-icons";
import { useEffect, useState, type JSX } from "react";

import type { QrLoadFailure } from "../../core/state-machine";

interface ActionResponse {
  readonly errors?: readonly string[];
  readonly ok: boolean;
}

interface QrLoadFailureNoticeProps {
  readonly failure: QrLoadFailure | null;
  readonly onRetry: () => Promise<ActionResponse>;
}

export const QrLoadFailureNotice = ({
  failure,
  onRetry
}: QrLoadFailureNoticeProps): JSX.Element | null => {
  const styles = useQrLoadFailureNoticeStyles();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    setIsRetrying(false);
    setRetryError("");
  }, [failure]);

  if (failure === null) {
    return null;
  }

  const retry = (): void => {
    setIsRetrying(true);
    setRetryError("");

    void onRetry()
      .then((response) => {
        if (!response.ok) {
          setRetryError(response.errors?.[0] ?? "QR 사이트 다시 시도에 실패했습니다.");
        }
      })
      .catch(() => {
        setRetryError("QR 사이트 다시 시도에 실패했습니다.");
      })
      .finally(() => {
        setIsRetrying(false);
      });
  };

  return (
    <MessageBar data-testid="qr-load-failure-message" intent="error">
      <MessageBarBody>
        <div className={styles.body}>
          <Text weight="semibold">QR 사이트를 불러오지 못했습니다.</Text>
          <Text className={styles.url} size={200}>
            {failure.url}
          </Text>
          {retryError.length > 0 ? <Text size={200}>{retryError}</Text> : null}
        </div>
      </MessageBarBody>
      <MessageBarActions>
        <Button
          data-testid="qr-load-retry"
          disabled={isRetrying}
          icon={<ArrowClockwise24Regular />}
          onClick={retry}
          size="small"
        >
          다시 시도
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
};

const useQrLoadFailureNoticeStyles = makeStyles({
  body: {
    display: "grid",
    gap: tokens.spacingVerticalXXS
  },
  url: {
    overflowWrap: "anywhere"
  }
});
