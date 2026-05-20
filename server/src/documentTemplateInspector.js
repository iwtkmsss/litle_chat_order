import fs from 'node:fs/promises';

import PizZip from 'pizzip';

const docxTextFilePattern = /^word\/(document|header\d+|footer\d+)\.xml$/;
const placeholderPattern = /\{([A-Za-z][A-Za-z0-9_.-]*)\}/g;

function collectMatches(text) {
  return [...text.matchAll(placeholderPattern)].map((match) => match[1]);
}

function stripXmlTags(xml) {
  return xml
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '');
}

function compareFields(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((field) => !rightSet.has(field)).sort();
}

export async function inspectTemplatePlaceholders(templatePath, expectedFields, knownFields) {
  const content = await fs.readFile(templatePath);
  const zip = new PizZip(content);
  const xmlParts = Object.keys(zip.files)
    .filter((fileName) => docxTextFilePattern.test(fileName))
    .map((fileName) => zip.file(fileName)?.asText() ?? '');

  const rawXml = xmlParts.join('\n');
  const plainText = stripXmlTags(rawXml);
  const rawFields = collectMatches(rawXml);
  const textFields = collectMatches(plainText);
  const foundFields = [...new Set([...rawFields, ...textFields])].sort();
  const expected = [...new Set(expectedFields)].sort();
  const known = [...new Set(knownFields)].sort();
  const missingFields = compareFields(expected, foundFields);
  const unknownFields = compareFields(foundFields, known);
  const fragmentedFields = compareFields(textFields, rawFields);

  return {
    templatePath,
    foundFields,
    missingFields,
    unknownFields,
    fragmentedFields,
    ready: expected.length > 0
      && missingFields.length === 0
      && unknownFields.length === 0
      && fragmentedFields.length === 0,
  };
}
