import PizZip from 'pizzip';

import { APPLICATION_STATUS_LABELS } from './applicationStatusWorkflow.js';
import { normalizeQuestionnaireType } from './applicationFormSchema.js';
import {
  firstNonEmpty,
  mapApplicationToConnectionAgreement,
  mapApplicationToConsumerQuestionnaireTemplateData,
  mapApplicationToGeneratorQuestionnaireTemplateData,
  mapApplicationToStatementTemplateData,
  mapApplicationToTechnicalConditions,
  valueOrEmpty,
} from './documentFieldMapper.js';

const appendix3FieldLabels = {
  operatorRecipient: 'Керівнику / адресат заяви',
  mailingAddress: 'Адреса для листування',
  operatorName: 'Найменування Оператора',
  objectName: 'Об’єкт у заяві',
  connectionReason: 'Причина приєднання',
  representativeName: 'Відповідальна особа замовника',
  representativePhone: 'Телефон відповідальної особи',
  representativeEmail: 'Email відповідальної особи',
};

const questionnaireFieldLabels = {
  customerName: 'Найменування / ПІБ замовника',
  customerAddress: 'Адреса замовника',
  customerDistrict: 'Адміністративний район',
  customerEmail: 'Електронна адреса замовника',
  customerPhone: 'Телефон замовника',
  customerInfo: 'Зведені дані замовника',
  designOrganizationName: 'Назва проєктної організації',
  designOrganizationAddress: 'Адреса проєктної організації',
  designOrganizationEmail: 'Email проєктної організації',
  designOrganizationPhone: 'Телефон проєктної організації',
  designOrganization: 'Зведені дані проєктної організації',
  objectName: 'Найменування об’єкта',
  objectAddress: 'Адреса об’єкта',
  objectRegion: 'Область об’єкта',
  plannedWorks: 'Будівництво / реконструкція об’єкта',
  constructionObject: 'Зведені дані об’єкта',
  constructionStartYear: 'Рік початку будівництва / реконструкції',
  commissioningYear: 'Рік введення в експлуатацію',
  permittedHeatLoad: 'Дозволене теплове навантаження за договором',
  heatSupplyContractNumber: 'Номер договору користування / постачання / транспортування теплової енергії',
  personalAccountNumber: 'Номер особового рахунку',
  additionalHeatLoad: 'Додаткове теплове навантаження об’єкта',
  totalHeatLoad: 'Загальне теплове навантаження об’єкта',
  heatingLoad: 'Опалення',
  hotWaterMaxLoad: 'Гаряче водопостачання, максимальне',
  hotWaterAverageLoad: 'Гаряче водопостачання, середнє',
  ventilationLoad: 'Вентиляція',
  technologyLoad: 'Технологія',
  additionalCapacity: 'Додаткова технічна / пропускна потужність',
  totalCapacity: 'Загальна технічна / пропускна потужність',
  projectDeveloper: 'Хто забезпечує розробку проєкту мереж Оператора',
  constructionExecutor: 'Хто виконує будівельні роботи',
  thirdPartyConnection: 'Підключення третіх осіб',
  responseMethod: 'Спосіб отримання відповіді',
  notificationMethod: 'Email або поштова адреса для відповіді',
  existingHeatSource: 'Стислі дані про існуюче джерело теплопостачання',
  heatObjectDescription: 'Стислі дані про об’єкт теплофікації',
};

function displayValue(value) {
  return valueOrEmpty(value);
}

function connectionTypeLabel(type) {
  return type === 'temporary'
    ? 'Тимчасове приєднання'
    : 'Приєднання до теплових мереж';
}

function markUsed(usedKeys, ...keys) {
  keys
    .filter(Boolean)
    .map((key) => String(key).replace(/^\{|\}$/g, ''))
    .forEach((key) => {
      usedKeys.add(key);

      const lastPart = key.split('.').pop();
      if (lastPart) {
        usedKeys.add(lastPart);
      }
    });
}

function hasUsed(usedKeys, ...keys) {
  return keys
    .filter(Boolean)
    .some((key) => {
      const normalizedKey = String(key).replace(/^\{|\}$/g, '');
      const lastPart = normalizedKey.split('.').pop();

      return usedKeys.has(normalizedKey) || (lastPart ? usedKeys.has(lastPart) : false);
    });
}

function addRow(rows, usedKeys, label, fieldKey, value, {
  skipIfUsed = false,
  sourceKey = fieldKey,
} = {}) {
  if (skipIfUsed && hasUsed(usedKeys, fieldKey, sourceKey)) {
    return;
  }

  const normalizedValue = displayValue(value);

  if (!normalizedValue) {
    return;
  }

  rows.push({
    label,
    value: normalizedValue,
  });

  markUsed(usedKeys, fieldKey, sourceKey);
}

function compactRows(rows) {
  return rows.filter((row) => row.value);
}

function additionalRowsFromObject(source, labels, prefix, usedKeys) {
  return Object.entries(source ?? {})
    .filter(([key, value]) => key !== 'type' && !usedKeys.has(key) && !usedKeys.has(`${prefix}.${key}`) && displayValue(value))
    .map(([key, value]) => ({
      label: labels[key] ?? key,
      value: displayValue(value),
    }));
}

function buildApplicationRows(application, usedKeys) {
  const rows = [];

  addRow(rows, usedKeys, 'Номер заявки', 'applicationNumber', application.applicationNumber, { skipIfUsed: true, sourceKey: 'application.applicationNumber' });
  addRow(rows, usedKeys, 'Дата заявки', 'receivedAt', application.receivedAt, { skipIfUsed: true, sourceKey: 'application.receivedAt' });
  addRow(rows, usedKeys, 'Статус заявки', 'status', APPLICATION_STATUS_LABELS[application.status] ?? application.status, { skipIfUsed: true, sourceKey: 'application.status' });
  addRow(rows, usedKeys, 'Тип приєднання', 'connectionType', connectionTypeLabel(application.connectionType), { skipIfUsed: true, sourceKey: 'application.connectionType' });
  addRow(rows, usedKeys, 'ПІБ / найменування замовника', 'customerName', application.applicantFullName, { skipIfUsed: true, sourceKey: 'application.applicantFullName' });
  addRow(rows, usedKeys, 'Телефон замовника', 'customerPhone', application.phone, { skipIfUsed: true, sourceKey: 'application.phone' });
  addRow(rows, usedKeys, 'Email замовника', 'customerEmail', application.email, { skipIfUsed: true, sourceKey: 'application.email' });
  addRow(rows, usedKeys, 'Адреса об’єкта', 'objectAddress', application.objectAddress, { skipIfUsed: true, sourceKey: 'application.objectAddress' });
  addRow(rows, usedKeys, 'Область об’єкта', 'objectRegion', application.objectRegion, { skipIfUsed: true, sourceKey: 'application.objectRegion' });
  addRow(rows, usedKeys, 'Відповідальний менеджер', 'responsibleName', application.responsibleName, { skipIfUsed: true, sourceKey: 'application.responsibleName' });
  addRow(rows, usedKeys, 'Примітки по заявці', 'applicationNotes', application.notes, { skipIfUsed: true, sourceKey: 'application.notes' });

  return rows;
}

function buildStationRows(application, usedKeys) {
  const rows = [];
  const station = application?.station ?? {};

  addRow(rows, usedKeys, 'Станція / компанія', 'operatorName', firstNonEmpty(station.name, application.stationName), { skipIfUsed: true, sourceKey: 'station.name' });
  addRow(rows, usedKeys, 'ЄДРПОУ Оператора', 'operatorEdrpou', station.edrpou, { skipIfUsed: true, sourceKey: 'station.edrpou' });
  addRow(rows, usedKeys, 'Адреса Оператора', 'operatorAddress', station.address, { skipIfUsed: true, sourceKey: 'station.address' });
  addRow(rows, usedKeys, 'Телефон Оператора', 'operatorPhone', station.phone, { skipIfUsed: true, sourceKey: 'station.phone' });
  addRow(rows, usedKeys, 'Email Оператора', 'operatorEmail', station.email, { skipIfUsed: true, sourceKey: 'station.email' });
  addRow(rows, usedKeys, 'Керівник Оператора', 'operatorDirectorName', station.directorName, { skipIfUsed: true, sourceKey: 'station.directorName' });

  return rows;
}

function buildAppendix1Rows(application, usedKeys) {
  const rows = [];
  const data = mapApplicationToConnectionAgreement(application);
  const questionnaire = application?.appendixData?.questionnaire ?? {};

  addRow(rows, usedKeys, 'Номер договору', 'contractNumber', '', { sourceKey: 'manual.contractNumber' });
  addRow(rows, usedKeys, 'Місце укладення договору', 'contractPlace', '', { sourceKey: 'manual.contractPlace' });
  addRow(rows, usedKeys, 'Дата договору', 'contractDate', '', { sourceKey: 'manual.contractDate' });
  addRow(rows, usedKeys, 'Оператор', 'operatorName', data.station.name, { sourceKey: 'station.name' });
  addRow(rows, usedKeys, 'Представник Оператора', 'operatorRepresentative', data.station.directorName, { sourceKey: 'station.directorName' });
  addRow(rows, usedKeys, 'Підстава повноважень Оператора', 'operatorAuthorityBasis', '', { sourceKey: 'manual.operatorAuthorityBasis' });
  addRow(rows, usedKeys, 'Замовник', 'customerName', data.applicantName, { sourceKey: 'application.applicantFullName' });
  addRow(rows, usedKeys, 'Представник замовника', 'customerRepresentative', application?.appendixData?.appendix3?.representativeName, { sourceKey: 'appendix3.representativeName' });
  addRow(rows, usedKeys, 'Підстава повноважень замовника', 'customerAuthorityBasis', '', { sourceKey: 'manual.customerAuthorityBasis' });
  addRow(rows, usedKeys, 'Номер технічних умов', 'technicalConditionsNumber', data.applicationNumber, { sourceKey: 'application.applicationNumber' });
  addRow(rows, usedKeys, 'Дата технічних умов', 'technicalConditionsDate', '', { sourceKey: 'manual.technicalConditionsDate' });
  addRow(rows, usedKeys, 'Назва об’єкта замовника', 'objectName', data.objectName, { sourceKey: 'appendix3.objectName' });
  addRow(rows, usedKeys, 'Адреса об’єкта замовника', 'objectAddress', data.objectAddress, { sourceKey: 'application.objectAddress' });
  addRow(rows, usedKeys, 'Місце забезпечення потужності', 'powerProvisionPlace', data.powerProvisionPlace, { sourceKey: 'appendix3.objectName' });
  addRow(rows, usedKeys, 'Точка приєднання', 'connectionPoint', '', { sourceKey: 'manual.connectionPoint' });
  addRow(rows, usedKeys, 'Прогнозована точка вимірювання', 'predictedMeteringPoint', data.predictedMeteringPoint, { sourceKey: 'manual.predictedMeteringPoint' });
  addRow(rows, usedKeys, 'Вартість послуги з приєднання', 'connectionCost', data.connectionCost, { sourceKey: 'manual.connectionCost' });
  addRow(rows, usedKeys, 'Сума ПДВ', 'connectionVatAmount', '', { sourceKey: 'manual.connectionVatAmount' });
  addRow(rows, usedKeys, 'Дольова участь', 'participationCost', '', { sourceKey: 'manual.participationCost' });
  addRow(rows, usedKeys, 'Загальне / заявлене теплове навантаження', 'totalHeatLoad', questionnaire.totalHeatLoad || questionnaire.totalCapacity, { sourceKey: 'questionnaire.totalHeatLoad' });

  return rows;
}

function buildAppendix2Rows(application, usedKeys) {
  const rows = [];
  const data = mapApplicationToTechnicalConditions(application);
  const questionnaire = application?.appendixData?.questionnaire ?? {};

  addRow(rows, usedKeys, 'Номер технічних умов', 'technicalConditionsNumber', application.applicationNumber, { sourceKey: 'application.applicationNumber' });
  addRow(rows, usedKeys, 'Дата видачі технічних умов', 'technicalConditionsIssueDate', '', { sourceKey: 'manual.technicalConditionsIssueDate' });
  addRow(rows, usedKeys, 'Замовник приєднання', 'applicantName', data.applicantName, { sourceKey: 'application.applicantFullName' });
  addRow(rows, usedKeys, 'Назва об’єкта', 'objectName', data.objectName, { sourceKey: 'questionnaire.objectName' });
  addRow(rows, usedKeys, 'Адреса об’єкта', 'objectAddress', data.objectAddress, { sourceKey: 'questionnaire.objectAddress' });
  addRow(rows, usedKeys, 'Особовий рахунок', 'personalAccountNumber', questionnaire.personalAccountNumber, { sourceKey: 'questionnaire.personalAccountNumber' });
  addRow(rows, usedKeys, 'Номер договору теплопостачання / транспортування', 'heatSupplyContractNumber', questionnaire.heatSupplyContractNumber, { sourceKey: 'questionnaire.heatSupplyContractNumber' });
  addRow(rows, usedKeys, 'Термін введення в експлуатацію', 'commissioningYear', data.commissioningYear, { sourceKey: 'questionnaire.commissioningYear' });
  addRow(rows, usedKeys, 'Дозволене теплове навантаження', 'permittedHeatLoad', data.permittedHeatLoad, { sourceKey: 'questionnaire.permittedHeatLoad' });
  addRow(rows, usedKeys, 'Додаткове навантаження / потужність', 'additionalLoadOrCapacity', questionnaire.additionalHeatLoad || questionnaire.additionalCapacity, { sourceKey: 'questionnaire.additionalHeatLoad' });
  addRow(rows, usedKeys, 'Загальне навантаження / потужність', 'totalLoadOrCapacity', questionnaire.totalHeatLoad || questionnaire.totalCapacity, { sourceKey: 'questionnaire.totalHeatLoad' });
  addRow(rows, usedKeys, 'Опалення', 'heatingLoad', data.heatingLoad, { sourceKey: 'questionnaire.heatingLoad' });
  addRow(rows, usedKeys, 'Гаряче водопостачання, середнє', 'hotWaterAverageLoad', data.hotWaterAverageLoad, { sourceKey: 'questionnaire.hotWaterAverageLoad' });
  addRow(rows, usedKeys, 'Гаряче водопостачання, максимальне', 'hotWaterMaxLoad', data.hotWaterMaxLoad, { sourceKey: 'questionnaire.hotWaterMaxLoad' });
  addRow(rows, usedKeys, 'Вентиляція', 'ventilationLoad', data.ventilationLoad, { sourceKey: 'questionnaire.ventilationLoad' });
  addRow(rows, usedKeys, 'Технологія', 'technologyLoad', data.technologyLoad, { sourceKey: 'questionnaire.technologyLoad' });
  addRow(rows, usedKeys, 'Місце забезпечення потужності', 'powerProvisionPlace', firstNonEmpty(questionnaire.objectName, application.objectAddress), { sourceKey: 'questionnaire.objectName' });
  addRow(rows, usedKeys, 'Точка приєднання', 'connectionPoint', '', { sourceKey: 'manual.connectionPoint' });
  addRow(rows, usedKeys, 'Проєкт мереж Оператора забезпечує', 'projectDeveloper', data.projectDeveloper, { sourceKey: 'questionnaire.projectDeveloper' });
  addRow(rows, usedKeys, 'Виконавець будівельних робіт', 'constructionExecutor', questionnaire.constructionExecutor, { sourceKey: 'questionnaire.constructionExecutor' });
  addRow(rows, usedKeys, 'Вимоги до оформлення проєкту', 'projectRequirements', '', { sourceKey: 'manual.projectRequirements' });
  addRow(rows, usedKeys, 'Вимоги до кошторисної частини', 'estimateRequirements', '', { sourceKey: 'manual.estimateRequirements' });
  addRow(rows, usedKeys, 'Технічні умови склав', 'technicalConditionsAuthor', application.responsibleName, { sourceKey: 'application.responsibleName' });

  return rows;
}

function buildAppendix3Rows(application, usedKeys) {
  const rows = [];
  const data = mapApplicationToStatementTemplateData(application);
  const appendix3 = application?.appendixData?.appendix3 ?? {};

  addRow(rows, usedKeys, 'Керівнику / адресат заяви', 'operatorRecipient', firstNonEmpty(appendix3.operatorRecipient, application?.station?.directorName, application.stationName), { sourceKey: 'appendix3.operatorRecipient' });
  addRow(rows, usedKeys, 'Найменування Оператора', 'operatorName', data.operatorName, { sourceKey: 'appendix3.operatorName' });
  addRow(rows, usedKeys, 'Від / замовник', 'customerName', data.customerName, { sourceKey: 'application.applicantFullName' });
  addRow(rows, usedKeys, 'Адреса для листування', 'mailingAddress', data.mailingAddress, { sourceKey: 'appendix3.mailingAddress' });
  addRow(rows, usedKeys, 'Електронна адреса', 'customerEmail', data.customerEmail, { sourceKey: 'application.email' });
  addRow(rows, usedKeys, 'Телефон', 'customerPhone', data.customerPhone, { sourceKey: 'application.phone' });
  addRow(rows, usedKeys, 'Об’єкт замовника', 'objectName', data.objectName, { sourceKey: 'appendix3.objectName' });
  addRow(rows, usedKeys, 'Адреса об’єкта', 'objectAddress', data.objectAddress, { sourceKey: 'application.objectAddress' });
  addRow(rows, usedKeys, 'Причина приєднання', 'connectionReason', data.connectionReason, { sourceKey: 'appendix3.connectionReason' });
  addRow(rows, usedKeys, 'Відповідальна особа', 'representativeName', data.representativeName, { sourceKey: 'appendix3.representativeName' });
  addRow(rows, usedKeys, 'Телефон відповідальної особи', 'representativePhone', data.representativePhone, { sourceKey: 'appendix3.representativePhone' });
  addRow(rows, usedKeys, 'Email відповідальної особи', 'representativeEmail', data.representativeEmail, { sourceKey: 'appendix3.representativeEmail' });
  addRow(rows, usedKeys, 'Дата заяви', 'statementDate', data.statementDate, { sourceKey: 'application.receivedAt' });
  addRow(rows, usedKeys, 'Підписант', 'signerName', data.signerName, { sourceKey: 'appendix3.representativeName' });

  return rows;
}

function buildAppendix4Rows(application, usedKeys) {
  const rows = [];
  const data = mapApplicationToConsumerQuestionnaireTemplateData(application);

  addRow(rows, usedKeys, 'Найменування / ПІБ замовника', 'customerName', data.customerName, { sourceKey: 'questionnaire.customerName' });
  addRow(rows, usedKeys, 'Адреса замовника', 'customerAddress', data.customerAddress, { sourceKey: 'questionnaire.customerAddress' });
  addRow(rows, usedKeys, 'Адміністративний район', 'customerDistrict', data.customerDistrict, { sourceKey: 'questionnaire.customerDistrict' });
  addRow(rows, usedKeys, 'Email замовника', 'customerEmail', data.customerEmail, { sourceKey: 'questionnaire.customerEmail' });
  addRow(rows, usedKeys, 'Телефон замовника', 'customerPhone', data.customerPhone, { sourceKey: 'questionnaire.customerPhone' });
  addRow(rows, usedKeys, 'Назва проєктної організації', 'designOrgName', data.designOrgName, { sourceKey: 'questionnaire.designOrganizationName' });
  addRow(rows, usedKeys, 'Адреса проєктної організації', 'designOrgAddress', data.designOrgAddress, { sourceKey: 'questionnaire.designOrganizationAddress' });
  addRow(rows, usedKeys, 'Email проєктної організації', 'designOrgEmail', data.designOrgEmail, { sourceKey: 'questionnaire.designOrganizationEmail' });
  addRow(rows, usedKeys, 'Телефон проєктної організації', 'designOrgPhone', data.designOrgPhone, { sourceKey: 'questionnaire.designOrganizationPhone' });
  addRow(rows, usedKeys, 'Найменування об’єкта', 'objectName', data.objectName, { sourceKey: 'questionnaire.objectName' });
  addRow(rows, usedKeys, 'Адреса об’єкта', 'objectAddress', data.objectAddress, { sourceKey: 'questionnaire.objectAddress' });
  addRow(rows, usedKeys, 'Будівництво / реконструкція', 'constructionType', data.constructionType, { sourceKey: 'questionnaire.plannedWorks' });
  addRow(rows, usedKeys, 'Рік початку будівництва / реконструкції', 'constructionStartYear', data.constructionStartYear, { sourceKey: 'questionnaire.constructionStartYear' });
  addRow(rows, usedKeys, 'Рік введення в експлуатацію', 'commissioningYear', data.commissioningYear, { sourceKey: 'questionnaire.commissioningYear' });
  addRow(rows, usedKeys, 'Дозволене теплове навантаження', 'permittedHeatLoad', data.permittedHeatLoad, { sourceKey: 'questionnaire.permittedHeatLoad' });
  addRow(rows, usedKeys, 'Договір користування тепловою енергією №', 'heatSupplyContractNumber', data.heatSupplyContractNumber, { sourceKey: 'questionnaire.heatSupplyContractNumber' });
  addRow(rows, usedKeys, 'Особовий рахунок №', 'personalAccountNumber', data.personalAccountNumber, { sourceKey: 'questionnaire.personalAccountNumber' });
  addRow(rows, usedKeys, 'Додаткове теплове навантаження', 'additionalHeatLoad', data.additionalHeatLoad, { sourceKey: 'questionnaire.additionalHeatLoad' });
  addRow(rows, usedKeys, 'Загальне теплове навантаження', 'totalHeatLoad', data.totalHeatLoad, { sourceKey: 'questionnaire.totalHeatLoad' });
  addRow(rows, usedKeys, 'Опалення', 'heatingLoad', data.heatingLoad, { sourceKey: 'questionnaire.heatingLoad' });
  addRow(rows, usedKeys, 'Гаряче водопостачання, максимальне', 'hotWaterMaxLoad', data.hotWaterMaxLoad, { sourceKey: 'questionnaire.hotWaterMaxLoad' });
  addRow(rows, usedKeys, 'Гаряче водопостачання, середнє', 'hotWaterAverageLoad', data.hotWaterAverageLoad, { sourceKey: 'questionnaire.hotWaterAverageLoad' });
  addRow(rows, usedKeys, 'Вентиляція', 'ventilationLoad', data.ventilationLoad, { sourceKey: 'questionnaire.ventilationLoad' });
  addRow(rows, usedKeys, 'Технологія', 'technologyLoad', data.technologyLoad, { sourceKey: 'questionnaire.technologyLoad' });
  addRow(rows, usedKeys, 'Хто забезпечує розробку проєкту', 'projectDeveloper', data.projectDeveloper, { sourceKey: 'questionnaire.projectDeveloper' });
  addRow(rows, usedKeys, 'Хто виконує будівельні роботи', 'constructionExecutor', data.constructionExecutor, { sourceKey: 'questionnaire.constructionExecutor' });
  addRow(rows, usedKeys, 'Існуюче джерело теплопостачання', 'existingHeatSourceDescription', data.existingHeatSourceDescription, { sourceKey: 'questionnaire.existingHeatSource' });
  addRow(rows, usedKeys, 'Об’єкт теплофікації', 'heatObjectDescription', data.heatObjectDescription, { sourceKey: 'questionnaire.heatObjectDescription' });
  addRow(rows, usedKeys, 'Підключення третіх осіб', 'thirdPartyConnection', data.thirdPartyConnection, { sourceKey: 'questionnaire.thirdPartyConnection' });
  addRow(rows, usedKeys, 'Спосіб повідомлення', 'notificationMethod', data.notificationMethod, { sourceKey: 'questionnaire.responseMethod' });
  addRow(rows, usedKeys, 'Адреса / email для відповіді', 'notificationAddress', data.notificationAddress, { sourceKey: 'questionnaire.notificationMethod' });
  addRow(rows, usedKeys, 'Підписант замовника', 'customerSignerName', data.customerSignerName, { sourceKey: 'questionnaire.customerName' });
  addRow(rows, usedKeys, 'Підписант проєктної організації', 'designOrgSignerName', data.designOrgSignerName, { sourceKey: 'questionnaire.designOrganizationName' });

  return rows;
}

function buildAppendix5Rows(application, usedKeys) {
  const rows = [];
  const data = mapApplicationToGeneratorQuestionnaireTemplateData(application);

  addRow(rows, usedKeys, 'Найменування / ПІБ замовника', 'customerName', data.customerName, { sourceKey: 'questionnaire.customerName' });
  addRow(rows, usedKeys, 'Адреса замовника', 'customerAddress', data.customerAddress, { sourceKey: 'questionnaire.customerAddress' });
  addRow(rows, usedKeys, 'Адміністративний район', 'customerDistrict', data.customerDistrict, { sourceKey: 'questionnaire.customerDistrict' });
  addRow(rows, usedKeys, 'Email замовника', 'customerEmail', data.customerEmail, { sourceKey: 'questionnaire.customerEmail' });
  addRow(rows, usedKeys, 'Телефон замовника', 'customerPhone', data.customerPhone, { sourceKey: 'questionnaire.customerPhone' });
  addRow(rows, usedKeys, 'Назва проєктної організації', 'designOrgName', data.designOrgName, { sourceKey: 'questionnaire.designOrganizationName' });
  addRow(rows, usedKeys, 'Адреса проєктної організації', 'designOrgAddress', data.designOrgAddress, { sourceKey: 'questionnaire.designOrganizationAddress' });
  addRow(rows, usedKeys, 'Email проєктної організації', 'designOrgEmail', data.designOrgEmail, { sourceKey: 'questionnaire.designOrganizationEmail' });
  addRow(rows, usedKeys, 'Телефон проєктної організації', 'designOrgPhone', data.designOrgPhone, { sourceKey: 'questionnaire.designOrganizationPhone' });
  addRow(rows, usedKeys, 'Найменування об’єкта', 'objectName', data.objectName, { sourceKey: 'questionnaire.objectName' });
  addRow(rows, usedKeys, 'Адреса об’єкта', 'objectAddress', data.objectAddress, { sourceKey: 'questionnaire.objectAddress' });
  addRow(rows, usedKeys, 'Будівництво / реконструкція', 'constructionType', data.constructionType, { sourceKey: 'questionnaire.plannedWorks' });
  addRow(rows, usedKeys, 'Рік початку будівництва / реконструкції', 'constructionStartYear', data.constructionStartYear, { sourceKey: 'questionnaire.constructionStartYear' });
  addRow(rows, usedKeys, 'Рік введення в експлуатацію', 'commissioningYear', data.commissioningYear, { sourceKey: 'questionnaire.commissioningYear' });
  addRow(rows, usedKeys, 'Дозволене теплове навантаження', 'permittedHeatLoad', data.permittedHeatLoad, { sourceKey: 'questionnaire.permittedHeatLoad' });
  addRow(rows, usedKeys, 'Договір постачання / транспортування №', 'supplyOrTransportContractNumber', data.supplyOrTransportContractNumber, { sourceKey: 'questionnaire.heatSupplyContractNumber' });
  addRow(rows, usedKeys, 'Додаткова технічна / пропускна потужність', 'additionalCapacity', data.additionalCapacity, { sourceKey: 'questionnaire.additionalCapacity' });
  addRow(rows, usedKeys, 'Загальна технічна / пропускна потужність', 'totalCapacity', data.totalCapacity, { sourceKey: 'questionnaire.totalCapacity' });
  addRow(rows, usedKeys, 'Хто забезпечує розробку проєкту', 'projectDeveloper', data.projectDeveloper, { sourceKey: 'questionnaire.projectDeveloper' });
  addRow(rows, usedKeys, 'Хто виконує будівельні роботи', 'constructionExecutor', data.constructionExecutor, { sourceKey: 'questionnaire.constructionExecutor' });
  addRow(rows, usedKeys, 'Об’єкт теплофікації', 'heatObjectDescription', data.heatObjectDescription, { sourceKey: 'questionnaire.heatObjectDescription' });
  addRow(rows, usedKeys, 'Підключення третіх осіб', 'thirdPartyConnection', data.thirdPartyConnection, { sourceKey: 'questionnaire.thirdPartyConnection' });
  addRow(rows, usedKeys, 'Спосіб повідомлення', 'notificationMethod', data.notificationMethod, { sourceKey: 'questionnaire.responseMethod' });
  addRow(rows, usedKeys, 'Адреса / email для відповіді', 'notificationAddress', data.notificationAddress, { sourceKey: 'questionnaire.notificationMethod' });
  addRow(rows, usedKeys, 'Підписант замовника', 'customerSignerName', data.customerSignerName, { sourceKey: 'questionnaire.customerName' });
  addRow(rows, usedKeys, 'Підписант проєктної організації', 'designOrgSignerName', data.designOrgSignerName, { sourceKey: 'questionnaire.designOrganizationName' });

  return rows;
}

function buildPrimaryRows(application, type, usedKeys) {
  if (type === 'appendix1') {
    return buildAppendix1Rows(application, usedKeys);
  }

  if (type === 'appendix2') {
    return buildAppendix2Rows(application, usedKeys);
  }

  if (type === 'appendix3') {
    return buildAppendix3Rows(application, usedKeys);
  }

  if (type === 'appendix4') {
    return buildAppendix4Rows(application, usedKeys);
  }

  return buildAppendix5Rows(application, usedKeys);
}

function buildDocumentDataGroups(application, type) {
  const usedKeys = new Set();
  const appendix3 = application?.appendixData?.appendix3 ?? {};
  const questionnaire = application?.appendixData?.questionnaire ?? {};
  const normalizedQuestionnaireType = normalizeQuestionnaireType(questionnaire.type);
  const primaryRows = buildPrimaryRows(application, type, usedKeys);
  const applicationRows = buildApplicationRows(application, usedKeys);
  const stationRows = buildStationRows(application, usedKeys);
  const appendixRows = additionalRowsFromObject(appendix3, appendix3FieldLabels, 'appendix3', usedKeys);
  const questionnaireRows = additionalRowsFromObject(questionnaire, questionnaireFieldLabels, 'questionnaire', usedKeys);

  return [
    {
      title: 'Дані, підібрані під цей документ',
      description: 'Це корисні дані з заявки та пов’язаних додатків. Тіло документа нижче не змінюється автоматично.',
      rows: primaryRows,
    },
    {
      title: 'Заявка та замовник',
      rows: applicationRows,
    },
    {
      title: 'Оператор / станція',
      rows: stationRows,
    },
    {
      title: 'Додаткові дані з Додатка 3',
      rows: appendixRows,
    },
    {
      title: normalizedQuestionnaireType === 'generation'
        ? 'Додаткові дані опитувального листа генератора'
        : 'Додаткові дані опитувального листа споживача',
      rows: compactRows(questionnaireRows),
    },
  ].filter((group) => group.rows.length > 0);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textRunXml(text, {
  bold = false,
  color = null,
  size = 18,
} = {}) {
  const escapedParts = String(text ?? '').split(/\r?\n/).map(escapeXml);
  const textXml = escapedParts
    .map((part, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${part}</w:t>`)
    .join('');
  const properties = [
    bold ? '<w:b/>' : '',
    color ? `<w:color w:val="${escapeXml(color)}"/>` : '',
    size ? `<w:sz w:val="${size}"/>` : '',
  ].join('');

  return `<w:r><w:rPr>${properties}</w:rPr>${textXml}</w:r>`;
}

function paragraphXml(text, options = {}) {
  const {
    alignment = null,
    bold = false,
    color = null,
    size = 18,
    spacingAfter = 80,
    spacingBefore = 0,
  } = options;
  const paragraphProperties = [
    alignment ? `<w:jc w:val="${alignment}"/>` : '',
    `<w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}"/>`,
  ].join('');

  return `<w:p><w:pPr>${paragraphProperties}</w:pPr>${textRunXml(text, { bold, color, size })}</w:p>`;
}

function cellXml(text, {
  bold = false,
  fill = null,
  width = 2400,
} = {}) {
  const shading = fill ? `<w:shd w:fill="${fill}"/>` : '';

  return [
    '<w:tc>',
    '<w:tcPr>',
    `<w:tcW w:w="${width}" w:type="dxa"/>`,
    '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>',
    shading,
    '</w:tcPr>',
    paragraphXml(text, {
      bold,
      color: bold ? '102A43' : null,
      size: bold ? 18 : 17,
      spacingAfter: 0,
    }),
    '</w:tc>',
  ].join('');
}

function tableXml(rows) {
  const header = [
    cellXml('Поле', { bold: true, fill: 'E8F1FB', width: 4200 }),
    cellXml('Значення з заявки', { bold: true, fill: 'E8F1FB', width: 7000 }),
  ].join('');
  const body = rows.map((row) => `<w:tr>${[
    cellXml(row.label, { width: 4200 }),
    cellXml(row.value, { width: 7000 }),
  ].join('')}</w:tr>`).join('');

  return [
    '<w:tbl>',
    '<w:tblPr>',
    '<w:tblW w:w="0" w:type="auto"/>',
    '<w:tblBorders>',
    '<w:top w:val="single" w:sz="6" w:color="D8E2EF"/>',
    '<w:left w:val="single" w:sz="6" w:color="D8E2EF"/>',
    '<w:bottom w:val="single" w:sz="6" w:color="D8E2EF"/>',
    '<w:right w:val="single" w:sz="6" w:color="D8E2EF"/>',
    '<w:insideH w:val="single" w:sz="4" w:color="D8E2EF"/>',
    '<w:insideV w:val="single" w:sz="4" w:color="D8E2EF"/>',
    '</w:tblBorders>',
    '</w:tblPr>',
    '<w:tblGrid><w:gridCol w:w="4200"/><w:gridCol w:w="7000"/></w:tblGrid>',
    `<w:tr>${header}</w:tr>`,
    body,
    '</w:tbl>',
  ].join('');
}

function pageBreakXml() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function formatGeneratedAt(date = new Date()) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
  }).format(date).replace(',', '');
}

function buildDataPageXml(application, type, titleText) {
  const groups = buildDocumentDataGroups(application, type);
  const generatedAt = formatGeneratedAt();

  return [
    paragraphXml('Службові дані для заповнення документа', {
      alignment: 'center',
      bold: true,
      color: '102A43',
      size: 32,
      spacingAfter: 160,
    }),
    paragraphXml(titleText, {
      alignment: 'center',
      bold: true,
      color: '1F4E79',
      size: 22,
      spacingAfter: 160,
    }),
    paragraphXml(
      `Заявка: ${displayValue(application.applicationNumber)}. Сформовано: ${generatedAt}. Перша сторінка містить дані для ручного заповнення статичного документа.`,
      { size: 18, spacingAfter: 160 },
    ),
    ...groups.flatMap((group) => [
      paragraphXml(group.title, {
        bold: true,
        color: '102A43',
        size: 22,
        spacingBefore: 140,
        spacingAfter: group.description ? 40 : 80,
      }),
      group.description ? paragraphXml(group.description, {
        color: '526D82',
        size: 17,
        spacingAfter: 80,
      }) : '',
      tableXml(group.rows),
    ]),
  ].join('');
}

function splitDocumentBody(documentXml) {
  const bodyOpenMatch = documentXml.match(/<w:body\b[^>]*>/);

  if (!bodyOpenMatch || bodyOpenMatch.index === undefined) {
    throw new Error('DOCX не містить word/document.xml з тілом документа.');
  }

  const bodyStart = bodyOpenMatch.index;
  const bodyOpenEnd = bodyStart + bodyOpenMatch[0].length;
  const bodyEnd = documentXml.lastIndexOf('</w:body>');

  if (bodyEnd === -1) {
    throw new Error('DOCX має некоректне тіло документа.');
  }

  const prefix = documentXml.slice(0, bodyOpenEnd);
  const bodyContent = documentXml.slice(bodyOpenEnd, bodyEnd);
  const suffix = documentXml.slice(bodyEnd);
  const sectPrMatch = bodyContent.match(/<w:sectPr\b[\s\S]*<\/w:sectPr>\s*$/);
  const sectionProperties = sectPrMatch?.[0] ?? '';
  const contentWithoutSection = sectionProperties
    ? bodyContent.slice(0, -sectionProperties.length)
    : bodyContent;

  return {
    contentWithoutSection,
    prefix,
    sectionProperties,
    suffix,
  };
}

export function prependDocumentDataPage(buffer, application, type, titleText) {
  const zip = new PizZip(buffer);
  const documentFile = zip.file('word/document.xml');

  if (!documentFile) {
    throw new Error('DOCX не містить word/document.xml.');
  }

  const documentXml = documentFile.asText();
  const {
    contentWithoutSection,
    prefix,
    sectionProperties,
    suffix,
  } = splitDocumentBody(documentXml);
  const dataPageXml = buildDataPageXml(application, type, titleText);
  const nextDocumentXml = [
    prefix,
    dataPageXml,
    pageBreakXml(),
    contentWithoutSection,
    sectionProperties,
    suffix,
  ].join('');

  zip.file('word/document.xml', nextDocumentXml);

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}
