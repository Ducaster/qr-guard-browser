import type {
  OnBeforeSendHeadersListenerDetails,
  OnCompletedListenerDetails,
  OnErrorOccurredListenerDetails,
  Session,
  WebRequestFilter
} from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { formatUnknownError, mainLogger, type MainLogger } from "./logger";
import { rotateQrDiagnosticsLogIfNeeded } from "./qr-net-diagnostics-log";

export const QR_NET_DIAGNOSTICS_LOG_FILE = "qr-net-diagnostics.log" as const;

export interface QrRequestHeaderMetrics {
  readonly cookieHeaderBytes: number;
  readonly requestHeaderBytes: number;
}

export interface QrDiagnosticsRequestIdentity {
  readonly method: string;
  readonly resourceType: string;
}

interface UploadDataBytes {
  readonly bytes?: Uint8Array;
}

interface PendingQrDiagnostics {
  readonly cookieHeaderBytes: number | null;
  readonly method: string;
  readonly requestBodyBytes: number | null;
  readonly requestHeaderBytes: number | null;
  readonly resourceType: string;
  readonly url: string;
}

interface QrDiagnosticsRecord extends PendingQrDiagnostics {
  readonly netError: string | null;
  readonly statusCode: number | null;
  readonly timestamp: string;
}

interface QrDiagnosticsWebRequest {
  readonly onBeforeSendHeaders: Session["webRequest"]["onBeforeSendHeaders"];
  readonly onCompleted: Session["webRequest"]["onCompleted"];
  readonly onErrorOccurred: Session["webRequest"]["onErrorOccurred"];
}

interface QrDiagnosticsSession {
  readonly webRequest: QrDiagnosticsWebRequest;
}

export interface QrNetDiagnosticsOptions {
  readonly logFilePath: string;
  readonly logger?: MainLogger;
}

const attachedSessions = new WeakSet<QrDiagnosticsSession>();
const QR_REQUEST_FILTER = {
  urls: ["http://*/*", "https://*/*"]
} as const satisfies WebRequestFilter;

export const getQrNetDiagnosticsLogPath = (userDataPath: string): string =>
  path.join(userDataPath, QR_NET_DIAGNOSTICS_LOG_FILE);

export const attachQrNetDiagnostics = (
  qrSession: QrDiagnosticsSession,
  options: QrNetDiagnosticsOptions
): void => {
  if (attachedSessions.has(qrSession)) {
    return;
  }

  attachedSessions.add(qrSession);
  const pendingRequests = new Map<number, PendingQrDiagnostics>();
  const logger = options.logger ?? mainLogger;

  qrSession.webRequest.onBeforeSendHeaders(QR_REQUEST_FILTER, (details, callback) => {
    if (shouldCaptureQrDiagnosticsRequest(details)) {
      pendingRequests.set(details.id, createPendingDiagnostics(details));
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  qrSession.webRequest.onCompleted(QR_REQUEST_FILTER, (details) => {
    const pending = takePendingDiagnostics(pendingRequests, details);

    if (pending === null) {
      return;
    }

    logDiagnosticsRecord(
      {
        ...pending,
        netError: details.error.length > 0 ? details.error : null,
        statusCode: details.statusCode,
        timestamp: new Date().toISOString()
      },
      options.logFilePath,
      logger
    );
  });

  qrSession.webRequest.onErrorOccurred(QR_REQUEST_FILTER, (details) => {
    const pending = takePendingDiagnostics(pendingRequests, details);

    if (pending === null) {
      return;
    }

    logDiagnosticsRecord(
      {
        ...pending,
        netError: details.error,
        statusCode: null,
        timestamp: new Date().toISOString()
      },
      options.logFilePath,
      logger
    );
  });
};

export const measureQrRequestHeaders = (
  requestHeaders: Readonly<Record<string, string>>
): QrRequestHeaderMetrics => ({
  cookieHeaderBytes: Buffer.byteLength(findHeaderValue(requestHeaders, "cookie") ?? "", "utf8"),
  requestHeaderBytes: Object.entries(requestHeaders).reduce(
    (totalBytes, [name, value]) => totalBytes + Buffer.byteLength(`${name}: ${value}\r\n`, "utf8"),
    0
  )
});

export const measureQrRequestBodyBytes = (
  requestHeaders: Readonly<Record<string, string>>,
  uploadData: readonly UploadDataBytes[] | undefined
): number | null => {
  const uploadBytes = measureUploadBytes(uploadData);

  if (uploadBytes !== null) {
    return uploadBytes;
  }

  const contentLength = findHeaderValue(requestHeaders, "content-length");

  if (contentLength === null || !/^\d+$/.test(contentLength.trim())) {
    return null;
  }

  const parsedContentLength = Number.parseInt(contentLength, 10);

  return Number.isSafeInteger(parsedContentLength) ? parsedContentLength : null;
};

export const shouldCaptureQrDiagnosticsRequest = (
  request: QrDiagnosticsRequestIdentity
): boolean => request.resourceType === "mainFrame" || request.method.toUpperCase() === "POST";

export const formatQrDiagnosticsUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);

    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return stripQueryAndFragment(url);
    }

    throw error;
  }
};

const createPendingDiagnostics = (
  details: OnBeforeSendHeadersListenerDetails
): PendingQrDiagnostics => {
  const headerMetrics = measureQrRequestHeaders(details.requestHeaders);

  return {
    cookieHeaderBytes: headerMetrics.cookieHeaderBytes,
    method: details.method,
    requestBodyBytes: measureQrRequestBodyBytes(details.requestHeaders, details.uploadData),
    requestHeaderBytes: headerMetrics.requestHeaderBytes,
    resourceType: details.resourceType,
    url: formatQrDiagnosticsUrl(details.url)
  };
};

const takePendingDiagnostics = (
  pendingRequests: Map<number, PendingQrDiagnostics>,
  details: OnCompletedListenerDetails | OnErrorOccurredListenerDetails
): PendingQrDiagnostics | null => {
  const pending = pendingRequests.get(details.id);

  if (pending !== undefined) {
    pendingRequests.delete(details.id);

    return pending;
  }

  return shouldCaptureQrDiagnosticsRequest(details)
    ? {
        cookieHeaderBytes: null,
        method: details.method,
        requestBodyBytes: null,
        requestHeaderBytes: null,
        resourceType: details.resourceType,
        url: formatQrDiagnosticsUrl(details.url)
      }
    : null;
};

const logDiagnosticsRecord = (
  record: QrDiagnosticsRecord,
  logFilePath: string,
  logger: MainLogger
): void => {
  logger.warn("QR network diagnostics.", toLoggerContext(record));
  void appendDiagnosticsRecord(logFilePath, record, logger);
};

const appendDiagnosticsRecord = async (
  logFilePath: string,
  record: QrDiagnosticsRecord,
  logger: MainLogger
): Promise<void> => {
  try {
    await mkdir(path.dirname(logFilePath), { recursive: true });
    await rotateQrDiagnosticsLogIfNeeded(logFilePath);
    await appendFile(logFilePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw error;
    }

    logger.warn("QR network diagnostics log write failed.", {
      error: formatUnknownError(error),
      logFilePath
    });
  }
};

const toLoggerContext = (record: QrDiagnosticsRecord): Readonly<Record<string, unknown>> => ({
  cookieHeaderBytes: record.cookieHeaderBytes,
  method: record.method,
  netError: record.netError,
  requestBodyBytes: record.requestBodyBytes,
  requestHeaderBytes: record.requestHeaderBytes,
  resourceType: record.resourceType,
  statusCode: record.statusCode,
  timestamp: record.timestamp,
  url: record.url
});

const measureUploadBytes = (uploadData: readonly UploadDataBytes[] | undefined): number | null => {
  if (uploadData === undefined || uploadData.length === 0) {
    return null;
  }

  let totalBytes = 0;
  let hasByteData = false;

  for (const item of uploadData) {
    if (item.bytes !== undefined) {
      totalBytes += item.bytes.byteLength;
      hasByteData = true;
    }
  }

  return hasByteData ? totalBytes : null;
};

const findHeaderValue = (
  requestHeaders: Readonly<Record<string, string>>,
  headerName: string
): string | null => {
  const normalizedHeaderName = headerName.toLowerCase();

  for (const [name, value] of Object.entries(requestHeaders)) {
    if (name.toLowerCase() === normalizedHeaderName) {
      return value;
    }
  }

  return null;
};

const stripQueryAndFragment = (url: string): string => {
  const hashIndex = url.indexOf("#");
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");

  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
};
