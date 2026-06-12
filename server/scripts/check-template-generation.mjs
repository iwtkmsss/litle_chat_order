import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import PizZip from 'pizzip';

import { generateApplicationDocument } from '../src/documentGenerator.js';
import {
  getRegisteredPublicDocumentEntries,
  getTemplateDocumentPath,
} from '../src/documentTemplateRegistry.js';

function createApplication(questionnaire) {
  return {
    id: 1,
    applicationNumber: 'TPL-001',
    applicantFullName: 'Customer Test',
    phone: '+380501112233',
    email: 'customer@example.com',
    objectAddress: 'Object address, 1',
    objectRegion: 'Test region',
    connectionType: 'standard',
    receivedAt: '2026-05-20',
    responsibleName: 'Manager Test',
    stationName: 'Station Test',
    station: {
      name: 'Station Test',
      edrpou: '12345678',
      address: 'Station address',
      phone: '+380542000000',
      email: 'operator@example.com',
      directorName: 'Director Test',
    },
    appendixData: {
      appendix3: {
        operatorRecipient: 'Director Test',
        mailingAddress: 'Customer mailing address',
        operatorName: 'Station Test',
        objectName: 'Object Test',
        connectionReason: 'New connection',
        representativeName: 'Representative Test',
        representativePhone: '+380501112233',
        representativeEmail: 'representative@example.com',
      },
      questionnaire,
    },
  };
}

const consumerApplication = createApplication({
  type: 'heat_consumer',
  customerName: 'Customer Test',
  customerAddress: 'Customer address',
  customerDistrict: 'District Test',
  customerEmail: 'customer@example.com',
  customerPhone: '+380501112233',
  designOrganizationName: 'Design Org',
  designOrganizationAddress: 'Design address',
  designOrganizationEmail: 'design@example.com',
  designOrganizationPhone: '+380542111111',
  objectName: 'Object Test',
  objectAddress: 'Object address, 1',
  plannedWorks: 'Construction',
  constructionStartYear: '2026',
  commissioningYear: '2027',
  permittedHeatLoad: '0.25',
  heatSupplyContractNumber: 'D-123',
  personalAccountNumber: 'PA-55',
  additionalHeatLoad: '0.10',
  totalHeatLoad: '0.35',
  heatingLoad: '0.20',
  hotWaterMaxLoad: '0.08',
  hotWaterAverageLoad: '0.05',
  ventilationLoad: '0.03',
  technologyLoad: '0.02',
  projectDeveloper: 'Customer',
  constructionExecutor: 'Operator',
  existingHeatSource: 'Existing source',
  heatObjectDescription: 'Heat object',
  thirdPartyConnection: 'yes',
  responseMethod: 'email',
  notificationMethod: 'customer@example.com',
});

const generatorApplication = createApplication({
  type: 'heat_generator',
  customerName: 'Generator Test',
  customerAddress: 'Generator address',
  customerDistrict: 'Generator district',
  customerEmail: 'generator@example.com',
  customerPhone: '+380501110000',
  designOrganizationName: 'Generator Design Org',
  designOrganizationAddress: 'Generator design address',
  designOrganizationEmail: 'generator-design@example.com',
  designOrganizationPhone: '+380542222222',
  objectName: 'Generator Object',
  objectAddress: 'Generator object address',
  plannedWorks: 'Reconstruction',
  constructionStartYear: '2026',
  commissioningYear: '2028',
  permittedHeatLoad: '1.5',
  heatSupplyContractNumber: 'G-987',
  additionalCapacity: '0.5',
  totalCapacity: '2.0',
  projectDeveloper: 'Operator',
  constructionExecutor: 'Contractor',
  heatObjectDescription: 'Generator heat object',
  thirdPartyConnection: 'no',
  responseMethod: 'post',
  notificationMethod: 'Generator address',
});

function documentXml(buffer) {
  const zip = new PizZip(buffer);
  const file = zip.file('word/document.xml');

  assert.ok(file, 'word/document.xml is missing');

  return file.asText();
}

function visibleText(xml) {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function templateStartText(xml) {
  const text = visibleText(xml).trim();
  const placeholderIndex = text.indexOf('{{');
  const stablePrefix = placeholderIndex === -1 ? text : text.slice(0, placeholderIndex).trim();

  return stablePrefix.slice(0, 120);
}

function bodyContentWithoutSection(xml) {
  const open = xml.match(/<w:body\b[^>]*>/);
  assert.ok(open?.index !== undefined, 'document body is missing');

  const bodyStart = open.index + open[0].length;
  const bodyEnd = xml.lastIndexOf('</w:body>');
  assert.notEqual(bodyEnd, -1, 'document body is not closed');

  const body = xml.slice(bodyStart, bodyEnd);
  const section = body.match(/<w:sectPr\b[\s\S]*<\/w:sectPr>\s*$/)?.[0] ?? '';

  return section ? body.slice(0, -section.length) : body;
}

const checks = [
  { documentType: 'appendix1', application: consumerApplication },
  { documentType: 'appendix2', application: consumerApplication },
  { documentType: 'appendix3', application: consumerApplication, expectedGeneratedValues: ['New connection', 'Representative Test'] },
  { documentType: 'appendix4', application: consumerApplication, expectedGeneratedValues: ['PA-55', 'Existing source'] },
  { documentType: 'appendix5', application: generatorApplication, expectedGeneratedValues: ['0.5', 'Generator heat object'] },
];

const results = [];

for (const entry of getRegisteredPublicDocumentEntries()) {
  const publicXml = documentXml(await fs.readFile(entry.documentPath));
  const publicText = visibleText(publicXml);

  assert.ok(
    !publicXml.includes('{{'),
    `Public document ${entry.fileName} should be a clean original without template placeholders`,
  );
  assert.ok(
    !/\?{3,}/.test(publicText),
    `Public document ${entry.fileName} contains broken question-mark text`,
  );
}

for (const check of checks) {
  const templateDocumentPath = getTemplateDocumentPath(check.documentType);
  assert.ok(templateDocumentPath, `Template document path is missing for ${check.documentType}`);
  await fs.access(templateDocumentPath);

  const templateXml = documentXml(await fs.readFile(templateDocumentPath));
  const templateText = visibleText(templateXml);
  const templateBody = bodyContentWithoutSection(templateXml).trim();
  const templatePrefix = templateStartText(templateXml);
  assert.ok(templateBody, `Template body is empty for ${check.documentType}`);
  assert.ok(templatePrefix, `Template start text is empty for ${check.documentType}`);
  assert.ok(!/\?{3,}/.test(templateText), `${check.documentType} template contains broken question-mark text`);

  const generated = await generateApplicationDocument(check.application, check.documentType);
  assert.ok(Buffer.isBuffer(generated.buffer));
  assert.ok(generated.buffer.length > 0);

  const generatedXml = documentXml(generated.buffer);
  const generatedText = visibleText(generatedXml).trim();
  assert.ok(
    generatedText.startsWith(templatePrefix),
    `${check.documentType} should start directly from the document template`,
  );
  assert.ok(
    !generatedText.includes('Службові дані для заповнення документа'),
    `${check.documentType} still prepends the service data page`,
  );
  assert.ok(!generatedXml.includes('{{'), `${check.documentType} still contains unresolved template placeholders`);

  if (check.expectedGeneratedValues) {
    for (const value of check.expectedGeneratedValues) {
      assert.ok(
        generatedText.includes(value),
        `${check.documentType} does not fill expected value "${value}" inside the document template`,
      );
    }
  }

  results.push(`${check.documentType}: ${path.basename(templateDocumentPath)}`);
}

console.log('OK: document generation checks passed.');
for (const result of results) {
  console.log(`- ${result}`);
}
