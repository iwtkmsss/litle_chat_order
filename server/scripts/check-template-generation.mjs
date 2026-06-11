import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import PizZip from 'pizzip';

import { generateApplicationDocument } from '../src/documentGenerator.js';
import { getStaticDocumentPath } from '../src/documentTemplateRegistry.js';

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
  { documentType: 'appendix1', application: consumerApplication, expectedValue: 'Station Test' },
  { documentType: 'appendix2', application: consumerApplication, expectedValue: 'TPL-001' },
  { documentType: 'appendix3', application: consumerApplication, expectedValue: 'New connection', expectedTemplateValue: 'Representative Test' },
  { documentType: 'appendix4', application: consumerApplication, expectedValue: 'PA-55', expectedTemplateValue: 'Existing source' },
  { documentType: 'appendix5', application: generatorApplication, expectedValue: '0.5', expectedTemplateValue: 'Generator heat object' },
];

const results = [];

for (const check of checks) {
  const staticDocumentPath = getStaticDocumentPath(check.documentType);
  assert.ok(staticDocumentPath, `Static document path is missing for ${check.documentType}`);
  await fs.access(staticDocumentPath);

  const staticXml = documentXml(await fs.readFile(staticDocumentPath));
  const staticSignature = bodyContentWithoutSection(staticXml).trim().slice(0, 300);
  assert.ok(staticSignature, `Static body is empty for ${check.documentType}`);

  const generated = await generateApplicationDocument(check.application, check.documentType);
  assert.ok(Buffer.isBuffer(generated.buffer));
  assert.ok(generated.buffer.length > 0);

  const generatedXml = documentXml(generated.buffer);
  const breakIndex = generatedXml.indexOf('<w:br w:type="page"/>');
  assert.notEqual(breakIndex, -1, `${check.documentType} has no page break before the static document`);

  const dataIndex = generatedXml.indexOf(check.application.applicationNumber);
  assert.ok(dataIndex !== -1 && dataIndex < breakIndex, `${check.documentType} does not put application data before the page break`);

  const dataPageXml = generatedXml.slice(0, breakIndex);
  assert.ok(dataPageXml.includes(check.expectedValue), `${check.documentType} does not expose expected data on the data page`);
  assert.ok(!dataPageXml.includes('{'), `${check.documentType} still exposes placeholder syntax on the data page`);
  assert.ok(!dataPageXml.includes('Плейсхолдер'), `${check.documentType} still renders the placeholder/source column`);
  assert.ok(!dataPageXml.includes('\u2014'), `${check.documentType} still renders empty dash values on the data page`);

  const staticIndex = generatedXml.indexOf(staticSignature);
  assert.ok(staticIndex > breakIndex, `${check.documentType} does not preserve static body after the page break`);
  assert.ok(!generatedXml.includes('{{'), `${check.documentType} still contains unresolved template placeholders`);

  if (check.expectedTemplateValue) {
    const templateXml = generatedXml.slice(breakIndex);
    assert.ok(
      templateXml.includes(check.expectedTemplateValue),
      `${check.documentType} does not fill expected value inside the static template body`,
    );
  }

  results.push(`${check.documentType}: ${path.basename(staticDocumentPath)}`);
}

console.log('OK: document generation checks passed.');
for (const result of results) {
  console.log(`- ${result}`);
}
