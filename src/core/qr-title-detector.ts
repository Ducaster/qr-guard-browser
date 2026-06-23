const WHITESPACE_PATTERN = /\s+/g;

export const matchesQrTitle = (currentTitle: string, qrTitlePattern: string): boolean => {
  const normalizedPattern = normalizeTitle(qrTitlePattern);

  if (normalizedPattern.length === 0) {
    return false;
  }

  return normalizeTitle(currentTitle).includes(normalizedPattern);
};

const normalizeTitle = (value: string): string =>
  value.trim().replace(WHITESPACE_PATTERN, " ").toLocaleLowerCase();
