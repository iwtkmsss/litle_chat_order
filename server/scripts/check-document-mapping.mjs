import assert from 'node:assert/strict';
import {
  mapApplicationToConsumerQuestionnaire,
  mapApplicationToGeneratorQuestionnaire,
  mapApplicationToStatementDocument,
  normalizeApplicationType,
  valueOrEmpty,
  yesNo,
} from '../src/documentFieldMapper.js';
import { generateApplicationDocument } from '../src/documentGenerator.js';

function createApplication(questionnaire) {
  return {
    id: 1,
    applicationNumber: 'TEST-001',
    applicantFullName: 'Іваненко Іван Іванович',
    phone: '+380501112233',
    email: 'ivanenko@example.com',
    objectAddress: 'м. Суми, вул. Теплова, 1',
    connectionType: 'standard',
    receivedAt: '2026-05-19',
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
  additionalCapacity: 'не має пройти в Додаток 4',
  projectDeveloper: 'Замовник',
  constructionExecutor: 'Оператор',
  existingHeatSource: 'Існуюча котельня',
  heatObjectDescription: 'Житловий об’єкт',
  thirdPartyConnection: 'Так',
  responseMethod: 'Електронною поштою',
  notificationMethod: 'ivanenko@example.com',
});

const generatorApplication = createApplication({
  type: 'heat_generator',
  customerName: 'ТОВ Генерація',
  customerAddress: 'м. Суми, вул. Енергії, 10',
  customerEmail: 'generator@example.com',
  customerPhone: '+380501110000',
  objectName: 'Котельня',
  objectAddress: 'м. Суми, вул. Енергії, 11',
  plannedWorks: 'Реконструкція',
  constructionStartYear: '2026',
  commissioningYear: '2028',
  permittedHeatLoad: '1.5',
  heatSupplyContractNumber: 'Г-987',
  additionalCapacity: '0.5',
  totalCapacity: '2.0',
  personalAccountNumber: 'не має пройти в Додаток 5',
  projectDeveloper: 'Оператор',
  constructionExecutor: 'Інший суб’єкт господарювання',
  heatObjectDescription: 'Когенераційна установка',
  thirdPartyConnection: 'Ні',
  responseMethod: 'Поштою',
  notificationMethod: 'м. Суми, вул. Енергії, 10',
});

const legacyConsumerApplication = createApplication({
  ...consumerApplication.appendixData.questionnaire,
  type: 'heat_use',
});

const legacyGeneratorApplication = createApplication({
  ...generatorApplication.appendixData.questionnaire,
  type: 'generation',
});

const statement = mapApplicationToStatementDocument(consumerApplication);
assert.equal(statement.applicant.name, 'Іваненко Іван Іванович');
assert.equal(statement.object.name, 'Житловий будинок');

const consumer = mapApplicationToConsumerQuestionnaire(consumerApplication);
assert.equal(consumer.type, 'heat_consumer');
assert.equal(consumer.heatLoad.heatingLoad, '0.20');
assert.equal(consumer.heatLoad.personalAccountNumber, 'ОС-55');
assert.equal(consumer.capacity, undefined);

const generator = mapApplicationToGeneratorQuestionnaire(generatorApplication);
assert.equal(generator.type, 'heat_generator');
assert.equal(generator.capacity.additionalCapacity, '0.5');
assert.equal(generator.capacity.totalCapacity, '2.0');
assert.equal(generator.heatLoad, undefined);

assert.equal(normalizeApplicationType('heat_use'), 'heat_consumer');
assert.equal(normalizeApplicationType('generation'), 'heat_generator');
assert.equal(valueOrEmpty({ unsafe: true }), '');
assert.equal(yesNo(true), 'так');
assert.equal(yesNo(false), 'ні');

await generateApplicationDocument(consumerApplication, 'appendix3');
await generateApplicationDocument(consumerApplication, 'appendix4');
await generateApplicationDocument(legacyConsumerApplication, 'appendix4');
await generateApplicationDocument(generatorApplication, 'appendix5');
await generateApplicationDocument(legacyGeneratorApplication, 'appendix5');

console.log('OK: document mapping checks passed.');
