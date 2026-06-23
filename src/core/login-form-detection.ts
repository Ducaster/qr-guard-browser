export type LoginInputType = "email" | "password" | "search" | "tel" | "text" | "url" | "unknown";

export interface LoginFormInputDescriptor {
  readonly autocomplete: string;
  readonly formId: string | null;
  readonly index: number;
  readonly type: LoginInputType;
}

export interface LoginFormFieldMatch {
  readonly passwordIndex: number;
  readonly usernameIndex: number;
}

const USERNAME_AUTOCOMPLETE_TOKEN = "username";

export const detectLoginFormFields = (
  inputs: readonly LoginFormInputDescriptor[]
): LoginFormFieldMatch | null => {
  const password = inputs.find((candidate) => candidate.type === "password");

  if (password === undefined) {
    return null;
  }

  const username = findAutocompleteUsername(inputs, password) ?? findPrecedingUsername(inputs, password);

  if (username === undefined) {
    return null;
  }

  return {
    passwordIndex: password.index,
    usernameIndex: username.index
  };
};

const findAutocompleteUsername = (
  inputs: readonly LoginFormInputDescriptor[],
  password: LoginFormInputDescriptor
): LoginFormInputDescriptor | undefined =>
  inputs.find(
    (candidate) =>
      candidate.index < password.index &&
      candidate.formId === password.formId &&
      isUsernameCandidate(candidate) &&
      hasUsernameAutocomplete(candidate.autocomplete)
  );

const findPrecedingUsername = (
  inputs: readonly LoginFormInputDescriptor[],
  password: LoginFormInputDescriptor
): LoginFormInputDescriptor | undefined => {
  for (let inputIndex = inputs.length - 1; inputIndex >= 0; inputIndex -= 1) {
    const candidate = inputs[inputIndex];

    if (
      candidate !== undefined &&
      candidate.index < password.index &&
      candidate.formId === password.formId &&
      isUsernameCandidate(candidate)
    ) {
      return candidate;
    }
  }

  return undefined;
};

const isUsernameCandidate = (input: LoginFormInputDescriptor): boolean => {
  switch (input.type) {
    case "email":
    case "search":
    case "tel":
    case "text":
    case "url":
      return true;
    case "password":
    case "unknown":
      return false;
  }
};

const hasUsernameAutocomplete = (autocomplete: string): boolean =>
  autocomplete
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .includes(USERNAME_AUTOCOMPLETE_TOKEN);
