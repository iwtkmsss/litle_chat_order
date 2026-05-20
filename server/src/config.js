import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const sourceDir = path.dirname(currentFile);
export const serverRoot = path.resolve(sourceDir, '..');

function resolveFromServerRoot(targetPath, fallback) {
  if (!targetPath) {
    return fallback;
  }

  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(serverRoot, targetPath);
}

export const dataDir = path.join(serverRoot, 'data');
export const uploadsDir = resolveFromServerRoot(
  process.env.UPLOADS_DIR,
  path.join(serverRoot, 'uploads'),
);
export const generatedDocumentsDir = resolveFromServerRoot(
  process.env.GENERATED_DOCUMENTS_DIR,
  path.join(serverRoot, 'generated-documents'),
);
export const databasePath = resolveFromServerRoot(
  process.env.DATABASE_PATH,
  path.join(dataDir, 'chat-storage.db'),
);
export const sessionCookieName = 'lco_session';
export const pendingSessionCookieName = 'lco_pending_access';
export const sessionDurationMs = 1000 * 60 * 60 * 24 * 30;
export const uploadFileLimit = 20 * 1024 * 1024;
export const uploadFilesPerMessage = 5;
