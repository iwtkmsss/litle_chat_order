const mojibakeMarkersPattern = /[ÃÂÐÑ]/;
const cyrillicPattern = /[А-Яа-яІіЇїЄєҐґ]/;

export function normalizeUploadedFileName(value) {
  const original = String(value ?? '').normalize('NFC');

  if (!mojibakeMarkersPattern.test(original)) {
    return original;
  }

  const decoded = Buffer.from(original, 'latin1').toString('utf8').normalize('NFC');

  if (!decoded || decoded.includes('\uFFFD')) {
    return original;
  }

  return cyrillicPattern.test(decoded) ? decoded : original;
}
