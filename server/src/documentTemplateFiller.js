import PizZip from 'pizzip';

import { valueOrEmpty } from './documentFieldMapper.js';

const placeholderPattern = /\{\{([a-zA-Z0-9_.-]+)\}\}/g;
const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/g;
const textNodePattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const emptyValuePlaceholder = '________________';

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraphText(paragraphXml) {
  return Array.from(
    paragraphXml.matchAll(textNodePattern),
    (match) => decodeXml(match[1]),
  ).join('');
}

function makeSingleTextParagraph(paragraphXml, text) {
  const open = paragraphXml.match(/^<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
  const properties = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? '';

  return `${open}${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function replacePlaceholders(text, values) {
  return text.replace(placeholderPattern, (_, key) => {
    const value = valueOrEmpty(values[key]);

    return value || emptyValuePlaceholder;
  });
}

function documentText(documentXml) {
  return Array.from(
    documentXml.matchAll(textNodePattern),
    (match) => decodeXml(match[1]),
  ).join('');
}

export function fillDocumentTemplatePlaceholders(buffer, values) {
  const zip = new PizZip(buffer);
  const documentFile = zip.file('word/document.xml');

  if (!documentFile) {
    throw new Error('DOCX-шаблон не містить word/document.xml.');
  }

  const documentXml = documentFile.asText();
  const filledXml = documentXml.replace(paragraphPattern, (paragraphXml) => {
    const text = paragraphText(paragraphXml);

    if (!/\{\{[a-zA-Z0-9_.-]+\}\}/.test(text)) {
      return paragraphXml;
    }

    return makeSingleTextParagraph(paragraphXml, replacePlaceholders(text, values));
  });

  if (/\{\{([a-zA-Z0-9_.-]+)\}\}/.test(documentText(filledXml))) {
    throw new Error('Не всі плейсхолдери документа були заповнені.');
  }

  zip.file('word/document.xml', filledXml);

  return zip.generate({
    compression: 'DEFLATE',
    type: 'nodebuffer',
  });
}
