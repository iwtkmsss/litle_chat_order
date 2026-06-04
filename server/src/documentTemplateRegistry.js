import path from 'node:path';

import { serverRoot } from './config.js';

export const frontendStaticDocumentsDir = path.resolve(serverRoot, '..', 'client', 'public', 'documents');

const staticDocumentFiles = {
  appendix1: 'dodatok-1-typovyi-dohovir.docx',
  appendix2: 'dodatok-2-tekhnichni-umovy.docx',
  appendix3: 'dodatok-3-zayava.docx',
  appendix4: 'dodatok-4-opytuvalnyi-lyst.docx',
  appendix5: 'dodatok-5-opytuvalnyi-lyst.docx',
};

function resolveStaticDocument(fileName) {
  return path.join(frontendStaticDocumentsDir, fileName);
}

export function getStaticDocumentPath(documentType) {
  const fileName = staticDocumentFiles[documentType];

  return fileName ? resolveStaticDocument(fileName) : null;
}

export function getRegisteredStaticDocumentEntries() {
  return Object.entries(staticDocumentFiles).map(([documentType, fileName]) => ({
    documentType,
    fileName,
    documentPath: resolveStaticDocument(fileName),
  }));
}
