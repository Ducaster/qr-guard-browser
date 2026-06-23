import type { Settings, SettingsRepository } from "../core/settings-repo";
import { formatUnknownError, mainLogger } from "./logger";

export const loadSettingsForMainEvent = (
  repository: SettingsRepository,
  eventName: string
): Settings | null => {
  try {
    return repository.load();
  } catch (error: unknown) {
    mainLogger.error(`Failed to load settings during ${eventName}; relocking.`, {
      error: formatUnknownError(error)
    });

    return null;
  }
};
