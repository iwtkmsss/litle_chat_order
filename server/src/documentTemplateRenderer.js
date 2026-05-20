import fs from 'node:fs/promises';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const placeholderPattern = /\{[#/^]?[A-Za-z0-9_.-]+(?:\s[^}]*)?\}/;

function collectZipText(zip) {
  return Object.keys(zip.files)
    .filter((fileName) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(fileName))
    .map((fileName) => zip.file(fileName)?.asText() ?? '')
    .join('\n');
}

function templateHasPlaceholders(doc, zip) {
  const fullText = typeof doc.getFullText === 'function'
    ? doc.getFullText()
    : collectZipText(zip);

  return placeholderPattern.test(fullText) || placeholderPattern.test(collectZipText(zip));
}

function formatTemplateError(error) {
  const nestedErrors = error?.properties?.errors;

  if (Array.isArray(nestedErrors) && nestedErrors.length > 0) {
    return nestedErrors
      .map((nestedError) => nestedError?.properties?.explanation || nestedError?.message)
      .filter(Boolean)
      .join('; ');
  }

  return error?.properties?.explanation || error?.message || 'невідома помилка шаблонізації';
}

export async function renderDocxTemplate(templatePath, data) {
  let content;

  try {
    content = await fs.readFile(templatePath);
  } catch (error) {
    throw new Error(`Шаблон документа не знайдено: ${templatePath}`, { cause: error });
  }

  let zip;
  let doc;

  try {
    zip = new PizZip(content);
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
  } catch (error) {
    throw new Error(`Не вдалося прочитати docx-шаблон: ${formatTemplateError(error)}`, { cause: error });
  }

  if (!templateHasPlaceholders(doc, zip)) {
    throw new Error('Шаблон не містить плейсхолдерів для заповнення.');
  }

  try {
    doc.render(data);
  } catch (error) {
    throw new Error(`Не вдалося заповнити docx-шаблон: ${formatTemplateError(error)}`, { cause: error });
  }

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}
