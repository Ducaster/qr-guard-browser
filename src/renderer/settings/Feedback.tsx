import type { JSX } from "react";

export const Message = ({ text }: { readonly text: string }): JSX.Element | null =>
  text.length === 0 ? null : <p className="success-message">{text}</p>;

export const ErrorList = ({
  errors,
  testId
}: {
  readonly errors: readonly string[];
  readonly testId?: string;
}): JSX.Element | null =>
  errors.length === 0 ? null : (
    <ul className="error-list" data-testid={testId}>
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
