const QR_BROWSER_USER_AGENT_TOKENS = /(?:^|\s)(?:QR Guard Browser|Electron)\/\S+/g;

export const cleanQrUserAgent = (userAgent: string): string =>
  userAgent.replace(QR_BROWSER_USER_AGENT_TOKENS, " ").replace(/\s+/g, " ").trim();
