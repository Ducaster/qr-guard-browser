import { APP_NAME } from "../core/sanity";

export type LogContext = Readonly<Record<string, unknown>>;

export interface MainLogger {
  readonly error: (message: string, context?: LogContext) => void;
  readonly warn: (message: string, context?: LogContext) => void;
}

export const mainLogger: MainLogger = {
  error: (message, context) => {
    console.error(formatLogMessage("ERROR", message, context));
  },
  warn: (message, context) => {
    console.warn(formatLogMessage("WARN", message, context));
  }
};

export const formatUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

const formatLogMessage = (
  level: "ERROR" | "WARN",
  message: string,
  context: LogContext | undefined
): string => {
  const serializedContext = formatLogContext(context);

  return serializedContext.length === 0
    ? `[${APP_NAME}] ${level}: ${message}`
    : `[${APP_NAME}] ${level}: ${message} ${serializedContext}`;
};

const formatLogContext = (context: LogContext | undefined): string => {
  if (context === undefined) {
    return "";
  }

  return Object.entries(context)
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(" ");
};

const formatLogValue = (value: unknown): string => {
  if (value instanceof Error) {
    return JSON.stringify(value.stack ?? value.message);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  return Object.prototype.toString.call(value);
};
