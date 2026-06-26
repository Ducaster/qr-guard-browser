import fs from "node:fs";
import path from "node:path";

export const hasErrorCode = (error: unknown, expectedCode: string): boolean => {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === expectedCode;
};

export const readOptionalTextFile = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error: unknown) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }
};

export const writeAtomicTextFile = (filePath: string, data: string): void => {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${String(process.pid)}.${String(Date.now())}.tmp`
  );

  fs.mkdirSync(dirPath, { mode: 0o700, recursive: true });
  fs.writeFileSync(tempPath, data, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
};

export const moveAsideIfPresent = (filePath: string, targetPath: string): string | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const destinationPath = nextAvailablePath(targetPath);

  fs.renameSync(filePath, destinationPath);

  return destinationPath;
};

const nextAvailablePath = (targetPath: string): string => {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  let suffix = 1;
  let candidatePath = `${targetPath}.${String(suffix)}`;

  while (fs.existsSync(candidatePath)) {
    suffix += 1;
    candidatePath = `${targetPath}.${String(suffix)}`;
  }

  return candidatePath;
};
