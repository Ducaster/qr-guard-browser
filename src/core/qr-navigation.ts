export const isAllowedQrNavigation = (url: string): boolean => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return false;
    }

    throw error;
  }

  return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
};
