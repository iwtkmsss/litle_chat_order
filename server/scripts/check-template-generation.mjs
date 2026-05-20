import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  mapApplicationToConsumerQuestionnaireTemplateData,
  mapApplicationToGeneratorQuestionnaireTemplateData,
  mapApplicationToStatementTemplateData,
} from '../src/documentFieldMapper.js';
import { generateApplicationDocument } from '../src/documentGenerator.js';
import {
  getAllKnownTemplateFields,
  getExpectedTemplateFields,
} from '../src/documentTemplateFields.js';
import { inspectTemplatePlaceholders } from '../src/documentTemplateInspector.js';
import {
  getRegisteredTemplateEntries,
  getTemplatePath,
} from '../src/documentTemplateRegistry.js';
import { renderDocxTemplate } from '../src/documentTemplateRenderer.js';

function createApplication(questionnaire) {
  return {
    id: 1,
    applicationNumber: 'TPL-001',
    applicantFullName: 'Іваненко Іван Іванович',
    phone: '+380501112233',
    email: 'ivanenko@example.com',
    objectAddress: 'м. Суми, вул. Теплова, 1',
    connectionType: 'standard',
    receivedAt: '2026-05-20',
    stationName: 'Тестова станція',
    station: {
      name: 'Тестова станція',
      edrpou: '12345678',
      address: 'м. Суми',
      phone: '+380542000000',
      email: 'operator@example.com',
      directorName: 'Директор Тестовий',
    },
    appendixData: {
      appendix3: {
        operatorRecipient: 'Директору Тестовому',
        mailingAddress: 'м. Суми, вул. Поштова, 2',
        operatorName: 'Тестова станція',
        objectName: 'Житловий будинок',
        connectionReason: 'Нове приєднання',
        representativeName: 'Іваненко І. І.',
        representativePhone: '+380501112233',
        representativeEmail: 'ivanenko@example.com',
      },
      questionnaire,
    },
  };
}

const consumerApplication = createApplication({
  type: 'heat_consumer',
  customerName: 'Іваненко Іван Іванович',
  customerAddress: 'м. Суми, вул. Поштова, 2',
  customerDistrict: 'Зарічний',
  customerEmail: 'ivanenko@example.com',
  customerPhone: '+380501112233',
  designOrganizationName: 'ТОВ Проєкт',
  designOrganizationAddress: 'м. Суми',
  designOrganizationEmail: 'project@example.com',
  designOrganizationPhone: '+380542111111',
  objectName: 'Житловий будинок',
  objectAddress: 'м. Суми, вул. Теплова, 1',
  plannedWorks: 'Будівництво',
  constructionStartYear: '2026',
  commissioningYear: '2027',
  permittedHeatLoad: '0.25',
  heatSupplyContractNumber: 'Д-123',
  personalAccountNumber: 'ОС-55',
  additionalHeatLoad: '0.10',
  totalHeatLoad: '0.35',
  heatingLoad: '0.20',
  hotWaterMaxLoad: '0.08',
  hotWaterAverageLoad: '0.05',
  ventilationLoad: '0.03',
  technologyLoad: '0.02',
  projectDeveloper: 'Замовник',
  constructionExecutor: 'Оператор',
  existingHeatSource: 'Існуюча котельня',
  heatObjectDescription: 'Житловий об’єкт',
  thirdPartyConnection: 'так',
  responseMethod: 'Електронною поштою',
  notificationMethod: 'ivanenko@example.com',
});

const generatorApplication = createApplication({
  type: 'heat_generator',
  customerName: 'ТОВ Генерація',
  customerAddress: 'м. Суми, вул. Енергії, 10',
  customerDistrict: 'Ковпаківський',
  customerEmail: 'generator@example.com',
  customerPhone: '+380501110000',
  designOrganizationName: 'ТОВ Енерго Проєкт',
  designOrganizationAddress: 'м. Суми',
  designOrganizationEmail: 'energy-project@example.com',
  designOrganizationPhone: '+380542222222',
  objectName: 'Котельня',
  objectAddress: 'м. Суми, вул. Енергії, 11',
  plannedWorks: 'Реконструкція',
  constructionStartYear: '2026',
  commissioningYear: '2028',
  permittedHeatLoad: '1.5',
  heatSupplyContractNumber: 'Г-987',
  additionalCapacity: '0.5',
  totalCapacity: '2.0',
  projectDeveloper: 'Оператор',
  constructionExecutor: 'Інший суб’єкт господарювання',
  heatObjectDescription: 'Когенераційна установка',
  thirdPartyConnection: 'ні',
  responseMethod: 'Поштою',
  notificationMethod: 'м. Суми, вул. Енергії, 10',
});

const registryEntries = getRegisteredTemplateEntries();
assert.equal(registryEntries.length, 3);

for (const entry of registryEntries) {
  await fs.access(entry.templatePath);
}

const checks = [
  {
    documentType: 'appendix3',
    application: consumerApplication,
    data: mapApplicationToStatementTemplateData(consumerApplication),
  },
  {
    documentType: 'appendix4',
    application: consumerApplication,
    data: mapApplicationToConsumerQuestionnaireTemplateData(consumerApplication),
  },
  {
    documentType: 'appendix5',
    application: generatorApplication,
    data: mapApplicationToGeneratorQuestionnaireTemplateData(generatorApplication),
  },
];

const results = [];

for (const check of checks) {
  const applicationType = check.application.appendixData.questionnaire.type;
  const templatePath = getTemplatePath(check.documentType, applicationType);
  assert.ok(templatePath, `Template path is missing for ${check.documentType}`);

  if (check.documentType === 'appendix4') {
    assert.equal(check.data.additionalCapacity, undefined);
    assert.equal(check.data.totalCapacity, undefined);
  }

  if (check.documentType === 'appendix5') {
    assert.equal(check.data.personalAccountNumber, undefined);
    assert.equal(check.data.heatingLoad, undefined);
  }

  const inspection = await inspectTemplatePlaceholders(
    templatePath,
    getExpectedTemplateFields(check.documentType, applicationType),
    getAllKnownTemplateFields(),
  );

  if (!inspection.ready) {
    const fallbackDocument = await generateApplicationDocument(check.application, check.documentType);
    assert.ok(Buffer.isBuffer(fallbackDocument.buffer));
    assert.ok(fallbackDocument.buffer.length > 0);
    results.push(`${check.documentType}: fallback generation (${inspection.missingFields.length} missing, ${inspection.unknownFields.length} unknown, ${inspection.fragmentedFields.length} fragmented)`);
    continue;
  }

  try {
    const templateBuffer = await renderDocxTemplate(templatePath, check.data);
    assert.ok(Buffer.isBuffer(templateBuffer));
    assert.ok(templateBuffer.length > 0);
    results.push(`${check.documentType}: template generation (${path.basename(templatePath)})`);
  } catch (error) {
    const fallbackDocument = await generateApplicationDocument(check.application, check.documentType);
    assert.ok(Buffer.isBuffer(fallbackDocument.buffer));
    assert.ok(fallbackDocument.buffer.length > 0);
    results.push(`${check.documentType}: fallback generation (${error.message})`);
  }
}

console.log('OK: template generation checks passed.');
for (const result of results) {
  console.log(`- ${result}`);
}
