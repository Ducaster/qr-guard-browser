import { rename, rm, stat } from "node:fs/promises";

import { hasErrorCode } from "./text-file-io";

export const QR_NET_DIAGNOSTICS_MAX_LOG_BYTES = 5 * 1024 * 1024;

export const rotateQrDiagnosticsLogIfNeeded = async (
  logFilePath: string,
  maxBytes = QR_NET_DIAGNOSTICS_MAX_LOG_BYTES
): Promise<void> => {
  const logStats = await stat(logFilePath).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  });

  if (logStats === null || logStats.size < maxBytes) {
    return;
  }

  await rm(`${logFilePath}.1`, { force: true });

  await rename(logFilePath, `${logFilePath}.1`).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }

    throw error;
  });
};
