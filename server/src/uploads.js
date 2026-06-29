import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import {
  uploadFileLimit,
  uploadFilesPerMessage,
  uploadsDir,
} from './config.js';
import { normalizeUploadedFileName } from './filenameEncoding.js';

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsDir);
  },
  filename: (_request, file, callback) => {
    file.originalname = normalizeUploadedFileName(file.originalname);
    const extension = path.extname(file.originalname);
    const randomName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    callback(null, randomName);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: uploadFileLimit,
    files: uploadFilesPerMessage,
  },
});

export async function removeUploadedFiles(files = []) {
  await Promise.all(
    files.map((file) => fs.rm(file.path, { force: true })),
  );
}

export async function removeStoredFiles(fileNames = []) {
  await Promise.all(
    fileNames.map((fileName) =>
      fs.rm(path.join(uploadsDir, fileName), { force: true }),
    ),
  );
}
