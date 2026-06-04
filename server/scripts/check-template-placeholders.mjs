import assert from 'node:assert/strict';

import PizZip from 'pizzip';

import { generateApplicationDocument } from '../src/documentGenerator.js';

function createApplication(questionnaire) {
  return {
    id: 1,
    applicationNumber: 'PH-001',
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

function dataPageXml(xml) {
  const breakIndex = xml.indexOf('<w:br w:type="page"/>');
  assert.notEqual(breakIndex, -1, 'page break is missing');

  return xml.slice(0, breakIndex);
}

const checks = [
  {
    title: 'Appendix 3 statement',
    documentType: 'appendix3',
    application: consumerApplication,
    expectedValues: ['New connection', 'Representative Test', 'customer@example.com'],
  },
  {
    title: 'Appendix 4 consumer questionnaire',
    documentType: 'appendix4',
    application: consumerApplication,
    expectedValues: ['PA-55', '0.35', 'Existing source'],
  },
  {
    title: 'Appendix 5 generator questionnaire',
    documentType: 'appendix5',
    application: generatorApplication,
    expectedValues: ['0.5', '2.0', 'Generator heat object'],
  },
];

for (const check of checks) {
  const generated = await generateApplicationDocument(check.application, check.documentType);
  const xml = dataPageXml(documentXml(generated.buffer));

  for (const value of check.expectedValues) {
    assert.ok(xml.includes(value), `${check.title}: expected value "${value}" is missing from the data page`);
  }

  assert.ok(!xml.includes('{'), `${check.title}: placeholder syntax should not be rendered`);
  assert.ok(!xml.includes('Плейсхолдер'), `${check.title}: placeholder/source column should not be rendered`);
  assert.ok(!xml.includes('\u2014'), `${check.title}: empty dash values should not be rendered`);

  console.log(`${check.title}: compact data page verified`);
}

console.log('OK: compact data-page checks passed.');
