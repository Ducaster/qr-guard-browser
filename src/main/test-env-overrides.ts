export interface TestOverrideEnvironment {
  readonly isPackaged: boolean;
  readonly variables: Readonly<Record<string, string | undefined>>;
}

export const canReadTestOverrideEnv = (environment: TestOverrideEnvironment): boolean =>
  !environment.isPackaged;

export const hasEnabledTestFlag = (
  environment: TestOverrideEnvironment,
  key: string
): boolean => canReadTestOverrideEnv(environment) && environment.variables[key] === "1";

export const readPositiveIntegerTestEnv = (
  environment: TestOverrideEnvironment,
  key: string
): number | undefined => {
  if (!canReadTestOverrideEnv(environment)) {
    return undefined;
  }

  const rawValue = environment.variables[key];

  if (rawValue === undefined) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isInteger(parsedValue) && parsedValue >= 1 ? parsedValue : undefined;
};
