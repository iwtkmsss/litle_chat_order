import path from 'node:path';

import { serverRoot } from './config.js';

export const frontendStaticDocumentsDir = path.resolve(serverRoot, '..', 'client', 'public', 'documents');
export const serverDocumentTemplatesDir = path.resolve(serverRoot, 'document-templates');

const templateDocumentFiles = {
  appendix1: 'dodatok-1-typovyi-dohovir.docx',
  appendix2: 'dodatok-2-tekhnichni-umovy.docx',
  appendix3: 'dodatok-3-zayava.docx',
  appendix4: 'dodatok-4-opytuvalnyi-lyst.docx',
  appendix5: 'dodatok-5-opytuvalnyi-lyst.docx',
};

const publicDocumentFiles = { ...templateDocumentFiles };

function resolvePublicDocument(fileName) {
  return path.join(frontendStaticDocumentsDir, fileName);
}

function resolveTemplateDocument(fileName) {
  return path.join(serverDocumentTemplatesDir, fileName);
}

export function getStaticDocumentPath(documentType) {
  return getTemplateDocumentPath(documentType);
}

export function getTemplateDocumentPath(documentType) {
  const fileName = templateDocumentFiles[documentType];

  return fileName ? resolveTemplateDocument(fileName) : null;
}

export function getRegisteredStaticDocumentEntries() {
  return Object.entries(templateDocumentFiles).map(([documentType, fileName]) => ({
    documentType,
    fileName,
    documentPath: resolveTemplateDocument(fileName),
  }));
}

export function getRegisteredPublicDocumentEntries() {
  return Object.entries(publicDocumentFiles).map(([documentType, fileName]) => ({
    documentType,
    fileName,
    documentPath: resolvePublicDocument(fileName),
  }));
}
