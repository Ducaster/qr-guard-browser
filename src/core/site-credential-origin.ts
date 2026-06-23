export const getOriginFromUrl = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.origin;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }
};
