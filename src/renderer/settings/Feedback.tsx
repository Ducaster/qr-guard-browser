import { MessageBar, MessageBarBody, makeStyles, tokens } from "@fluentui/react-components";
import type { JSX } from "react";

const useFeedbackStyles = makeStyles({
  list: {
    display: "grid",
    gap: tokens.spacingVerticalXXS,
    marginBottom: 0,
    marginTop: 0,
    padding: `0 0 0 ${tokens.spacingHorizontalL}`
  }
});

export const Message = ({ text }: { readonly text: string }): JSX.Element | null =>
  text.length === 0 ? null : (
    <MessageBar intent="success">
      <MessageBarBody>{text}</MessageBarBody>
    </MessageBar>
  );

export const ErrorList = ({ errors, testId }: {
  readonly errors: readonly string[];
  readonly testId?: string;
}): JSX.Element | null => {
  const styles = useFeedbackStyles();

  return errors.length === 0 ? null : (
    <MessageBar data-testid={testId} intent="error">
      <MessageBarBody>
        <ul className={styles.list}>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </MessageBarBody>
    </MessageBar>
  );
};
