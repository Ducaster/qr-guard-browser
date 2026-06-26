import {
  createDefaultSettings,
  parseSettingsJson,
  type Sealer,
  type Settings,
  type SettingsRepository
} from "../core/settings-repo";
import { isFirstRunSettings } from "../core/settings-validation";
import { formatUnknownError, mainLogger } from "./logger";
import { moveAsideIfPresent, readOptionalTextFile, writeAtomicTextFile } from "./text-file-io";

type SettingsFileKind = "backup" | "primary";

type ReadSealedSettingsResult =
  | {
      readonly kind: "missing";
    }
  | {
      readonly kind: "readError";
      readonly error: unknown;
    }
  | {
      readonly kind: "settings";
      readonly sealed: string;
      readonly settings: Settings;
    }
  | {
      readonly kind: "settingsError";
      readonly error: unknown;
      readonly sealed: string;
    };

export const settingsBackupPathFor = (filePath: string): string => `${filePath}.bak`;

export const settingsCorruptPathFor = (filePath: string): string => `${filePath}.corrupt`;

export const createRecoverableFileSettingsRepository = (
  filePath: string,
  sealer: Sealer
): SettingsRepository => ({
  load: () => loadSettingsFile(filePath, sealer),
  save: (settings: Settings) => {
    const sealed = sealer.seal(JSON.stringify(settings));

    writeAtomicTextFile(filePath, sealed);
    writeAtomicTextFile(settingsBackupPathFor(filePath), sealed);
  }
});

const loadSettingsFile = (filePath: string, sealer: Sealer): Settings => {
  const backupPath = settingsBackupPathFor(filePath);
  const primaryResult = readSealedSettings(filePath, sealer);

  if (primaryResult.kind === "settings") {
    return recoverFromBackupIfPrimaryLooksReset(filePath, backupPath, primaryResult, sealer);
  }

  logSettingsLoadFailure("primary", filePath, primaryResult);
  quarantinePrimary(filePath);

  const backupResult = readSealedSettings(backupPath, sealer);

  if (backupResult.kind === "settings") {
    writeAtomicTextFile(filePath, backupResult.sealed);
    mainLogger.warn("Restored settings from backup.", { backupPath, filePath });

    return backupResult.settings;
  }

  logSettingsLoadFailure("backup", backupPath, backupResult);
  mainLogger.warn("Falling back to first-run default settings after settings recovery failed.", {
    backupPath,
    filePath
  });

  return createDefaultSettings();
};

const recoverFromBackupIfPrimaryLooksReset = (
  filePath: string,
  backupPath: string,
  primaryResult: Extract<ReadSealedSettingsResult, { readonly kind: "settings" }>,
  sealer: Sealer
): Settings => {
  if (!isFirstRunSettings(primaryResult.settings)) {
    return primaryResult.settings;
  }

  const backupResult = readSealedSettings(backupPath, sealer);

  if (backupResult.kind !== "settings" || isFirstRunSettings(backupResult.settings)) {
    return primaryResult.settings;
  }

  quarantinePrimary(filePath);
  writeAtomicTextFile(filePath, backupResult.sealed);
  mainLogger.warn("Restored configured settings from backup after primary looked reset.", {
    backupPath,
    filePath
  });

  return backupResult.settings;
};

const readSealedSettings = (filePath: string, sealer: Sealer): ReadSealedSettingsResult => {
  let sealed: string | null;

  try {
    sealed = readOptionalTextFile(filePath);
  } catch (error: unknown) {
    return {
      error,
      kind: "readError"
    };
  }

  if (sealed === null) {
    return {
      kind: "missing"
    };
  }

  try {
    return {
      kind: "settings",
      sealed,
      settings: parseSettingsJson(sealer.unseal(sealed))
    };
  } catch (error: unknown) {
    return {
      error,
      kind: "settingsError",
      sealed
    };
  }
};

const quarantinePrimary = (filePath: string): void => {
  try {
    const corruptPath = moveAsideIfPresent(filePath, settingsCorruptPathFor(filePath));

    if (corruptPath !== null) {
      mainLogger.warn("Moved corrupted settings file aside.", { corruptPath, filePath });
    }
  } catch (error: unknown) {
    mainLogger.warn("Failed to move corrupted settings file aside.", {
      error: formatUnknownError(error),
      filePath
    });
  }
};

const logSettingsLoadFailure = (
  kind: SettingsFileKind,
  filePath: string,
  result: Exclude<ReadSealedSettingsResult, { readonly kind: "settings" }>
): void => {
  switch (result.kind) {
    case "missing":
      return;
    case "readError":
    case "settingsError":
      mainLogger.warn(`Failed to load ${kind} settings file.`, {
        error: formatUnknownError(result.error),
        filePath
      });
      return;
  }
};
