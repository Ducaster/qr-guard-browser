import type { Settings } from "./settings-repo";

export const updateLastAuthenticatedAt = (
  settings: Settings,
  userId: string,
  authenticatedAtMs: number
): Settings => ({
  ...settings,
  users: settings.users.map((user) =>
    user.userId === userId
      ? { ...user, lastAuthenticatedAt: new Date(authenticatedAtMs).toISOString() }
      : user
  )
});
