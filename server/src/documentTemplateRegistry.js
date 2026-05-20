import path from 'node:path';

import { serverRoot } from './config.js';
import { normalizeApplicationType } from './documentFieldMapper.js';

export const documentTemplatesDir = path.join(serverRoot, 'document-templates');

const templateFiles = {
  appendix3: 'appendix3.template.docx',
  appendix4: 'appendix4.template.docx',
  appendix5: 'appendix5.template.docx',
};

const documentTypeAliases = {
  statement: 'appendix3',
  appendix3: 'appendix3',
  consumerQuestionnaire: 'appendix4',
  appendix4: 'appendix4',
  generatorQuestionnaire: 'appendix5',
  appendix5: 'appendix5',
};

function resolveTemplate(fileName) {
  return path.join(documentTemplatesDir, fileName);
}

export function normalizeTemplateDocumentType(documentType) {
  return documentTypeAliases[documentType] ?? null;
}

export function getTemplatePath(documentType, applicationType) {
  const normalizedDocumentType = normalizeTemplateDocumentType(documentType);

  if (!normalizedDocumentType) {
    return null;
  }

  if (normalizedDocumentType === 'appendix3') {
    return resolveTemplate(templateFiles.appendix3);
  }

  const normalizedApplicationType = normalizeApplicationType(applicationType);

  if (normalizedDocumentType === 'appendix4' && normalizedApplicationType === 'heat_consumer') {
    return resolveTemplate(templateFiles.appendix4);
  }

  if (normalizedDocumentType === 'appendix5' && normalizedApplicationType === 'heat_generator') {
    return resolveTemplate(templateFiles.appendix5);
  }

  return null;
}

export function getRegisteredTemplateEntries() {
  return Object.entries(templateFiles).map(([documentType, fileName]) => ({
    documentType,
    fileName,
    templatePath: resolveTemplate(fileName),
  }));
}
