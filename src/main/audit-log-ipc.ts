import { dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";

import {
  toCsv,
  toJsonl,
  type AuditExportFormat,
  type AuditLogFilter,
  type AuditLogReadResult
} from "../core/audit-log";
import { IPC_CHANNELS } from "../core/shell-config";
import { isSenderAuthorized } from "./admin-session-gate";
import type { AuditLogStore } from "./settings-adapters";

interface AuditLogIpcOptions {
  readonly auditLogStore: AuditLogStore;
}

type QueryAuditLogResponse =
  | ({ readonly ok: true } & AuditLogReadResult)
  | { readonly errors: readonly string[]; readonly ok: false };

type ExportAuditLogResponse =
  | { readonly canceled: boolean; readonly ok: true }
  | { readonly errors: readonly string[]; readonly ok: false };

export const registerAuditLogIpc = (options: AuditLogIpcOptions): void => {
  ipcMain.handle(
    IPC_CHANNELS.queryAuditLog,
    (event: IpcMainInvokeEvent, payload: unknown): QueryAuditLogResponse => {
      if (!isSenderAuthorized(event)) {
        return unauthorizedResponse();
      }

      return {
        ok: true,
        ...options.auditLogStore.read(readAuditLogFilter(payload))
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.exportAuditLog,
    async (event: IpcMainInvokeEvent, format: unknown): Promise<ExportAuditLogResponse> => {
      if (!isSenderAuthorized(event)) {
        return unauthorizedResponse();
      }

      const exportFormat = readExportFormat(format);

      if (exportFormat === null) {
        return errorResponse(["Audit export format is invalid."]);
      }

      try {
        // Export intentionally covers the full log; the UI user filter is view-only.
        const result = options.auditLogStore.read();
        const data = exportFormat === "jsonl" ? toJsonl(result.events) : toCsv(result.events);
        const saveResult = await dialog.showSaveDialog({
          defaultPath: `qr-guard-audit-log.${exportFormat}`,
          filters: [
            {
              extensions: [exportFormat],
              name: exportFormat === "jsonl" ? "JSON Lines" : "CSV"
            }
          ]
        });

        if (saveResult.canceled) {
          return { canceled: true, ok: true };
        }

        const filePath = readSaveFilePath(saveResult.filePath);

        if (filePath === null) {
          return errorResponse(["Export path is unavailable."]);
        }

        fs.writeFileSync(filePath, data, { encoding: "utf8", mode: 0o600 });

        return { canceled: false, ok: true };
      } catch {
        return errorResponse(["Audit log could not be exported."]);
      }
    }
  );
};

const readAuditLogFilter = (value: unknown): AuditLogFilter => {
  if (!isRecord(value) || typeof value["userId"] !== "string") {
    return {};
  }

  const userId = value["userId"].trim();

  return userId.length === 0 ? {} : { userId };
};

const readExportFormat = (value: unknown): AuditExportFormat | null => {
  if (value === "jsonl" || value === "csv") {
    return value;
  }

  return null;
};

const readSaveFilePath = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const unauthorizedResponse = (): { readonly errors: readonly string[]; readonly ok: false } =>
  errorResponse(["Admin authorization is required."]);

const errorResponse = (
  errors: readonly string[]
): { readonly errors: readonly string[]; readonly ok: false } => ({
  errors,
  ok: false
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
