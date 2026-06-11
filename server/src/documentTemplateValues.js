import {
  firstNonEmpty,
  mapApplicationToConsumerQuestionnaireTemplateData,
  mapApplicationToGeneratorQuestionnaireTemplateData,
  mapApplicationToStatementTemplateData,
  valueOrEmpty,
} from './documentFieldMapper.js';

const placeholderDocumentTypes = new Set(['appendix3', 'appendix4', 'appendix5']);

const connectionReasonOptions = [
  'об’єкт, що не був підключений до теплових мереж',
  'збільшення теплового навантаження',
  'зміни вимог до надійності транспортування та якості теплової енергії',
  'зміни вимог нормативно-правових актів',
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

const projectDeveloperOptions = ['Оператор', 'замовник'].map((value) => ({ value, label: value }));

const constructionExecutorOptions = [
  'Оператор',
  'інший суб’єкт господарювання',
].map((value) => ({ value, label: value }));

const yesNoOptions = ['так', 'ні'].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

const responseMethodOptions = [
  'за місцем подання заяви',
  'електронною поштою',
  'поштою',
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

function cloneApplication(application) {
  return JSON.parse(JSON.stringify(application ?? {}));
}

function joinParts(parts) {
  return parts.map(valueOrEmpty).filter(Boolean).join('; ');
}

function getPath(source, path) {
  return String(path)
    .split('.')
    .reduce((current, part) => current?.[part], source);
}

function setPath(target, path, value) {
  const parts = String(path).split('.');
  let current = target;

  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts.at(-1)] = value;
}

function normalizeOptionValue(value, options) {
  const text = valueOrEmpty(value);

  if (!text || !options?.length) {
    return text;
  }

  const normalized = text.toLocaleLowerCase('uk-UA');
  const option = options.find((item) =>
    item.value.toLocaleLowerCase('uk-UA') === normalized
    || item.label.toLocaleLowerCase('uk-UA') === normalized
  );

  return option?.value ?? text;
}

function field(key, label, targetPath, options = {}) {
  return {
    inputType: options.inputType ?? 'text',
    isMissing: options.isMissing,
    key,
    label,
    maxLength: options.maxLength ?? 240,
    options: options.options,
    targetPath,
  };
}

function notificationContactRequired(values) {
  const method = valueOrEmpty(values.notificationMethod).toLocaleLowerCase('uk-UA');

  return method.includes('email')
    || method.includes('електрон')
    || method.includes('пошт');
}

const questionnaireRequiredFields = [
  field('customerSummary', 'Дані замовника', 'appendixData.questionnaire.customerInfo', {
    inputType: 'textarea',
    maxLength: 700,
  }),
  field('designOrgSummary', 'Дані проєктної організації', 'appendixData.questionnaire.designOrganization', {
    inputType: 'textarea',
    maxLength: 700,
  }),
  field('constructionObjectSummary', 'Дані об’єкта будівництва / реконструкції', 'appendixData.questionnaire.constructionObject', {
    inputType: 'textarea',
    maxLength: 700,
  }),
  field('constructionStartYear', 'Рік початку будівництва / реконструкції', 'appendixData.questionnaire.constructionStartYear', { maxLength: 20 }),
  field('commissioningYear', 'Рік введення в експлуатацію', 'appendixData.questionnaire.commissioningYear', { maxLength: 20 }),
  field('permittedHeatLoad', 'Дозволене теплове навантаження за договором', 'appendixData.questionnaire.permittedHeatLoad'),
  field('projectDeveloper', 'Хто забезпечує розробку проєкту мереж Оператора', 'appendixData.questionnaire.projectDeveloper', {
    options: projectDeveloperOptions,
  }),
  field('constructionExecutor', 'Виконавець будівельних робіт', 'appendixData.questionnaire.constructionExecutor', {
    options: constructionExecutorOptions,
  }),
  field('heatObjectDescription', 'Стислі дані про об’єкт теплофікації', 'appendixData.questionnaire.heatObjectDescription', {
    inputType: 'textarea',
    maxLength: 1000,
  }),
  field('thirdPartyConnection', 'Чи передбачається підключення третіх осіб', 'appendixData.questionnaire.thirdPartyConnection', {
    options: yesNoOptions,
  }),
  field('notificationMethod', 'Спосіб отримання повідомлення', 'appendixData.questionnaire.responseMethod', {
    options: responseMethodOptions,
  }),
  field('notificationAddress', 'Email або поштова адреса для повідомлення', 'appendixData.questionnaire.notificationMethod', {
    isMissing: (values) => notificationContactRequired(values) && !valueOrEmpty(values.notificationAddress),
    maxLength: 500,
  }),
];

const requiredFieldsByDocumentType = {
  appendix3: [
    field('operatorRecipient', 'Керівнику / адресат заяви', 'appendixData.appendix3.operatorRecipient'),
    field('customerName', 'ПІБ / найменування заявника', 'applicantFullName'),
    field('mailingAddress', 'Адреса для листування', 'appendixData.appendix3.mailingAddress', { maxLength: 500 }),
    field('customerEmail', 'Email заявника', 'email'),
    field('customerPhone', 'Телефон заявника', 'phone'),
    field('operatorName', 'Найменування Оператора', 'appendixData.appendix3.operatorName'),
    field('objectSummary', 'Найменування та адреса об’єкта', 'appendixData.appendix3.objectName', { maxLength: 700 }),
    field('connectionReason', 'Причина приєднання', 'appendixData.appendix3.connectionReason', {
      options: connectionReasonOptions,
      maxLength: 500,
    }),
    field('representativeName', 'Відповідальна особа замовника', 'appendixData.appendix3.representativeName'),
    field('representativePhone', 'Телефон відповідальної особи', 'appendixData.appendix3.representativePhone'),
    field('representativeEmail', 'Email відповідальної особи', 'appendixData.appendix3.representativeEmail'),
    field('statementDate', 'Дата заяви', 'receivedAt', { maxLength: 40 }),
    field('signerName', 'Прізвище та ініціали для підпису', 'appendixData.appendix3.representativeName'),
  ],
  appendix4: [
    ...questionnaireRequiredFields,
    field('heatSupplyContractNumber', 'Номер договору про користування тепловою енергією', 'appendixData.questionnaire.heatSupplyContractNumber'),
    field('personalAccountNumber', 'Номер особового рахунку', 'appendixData.questionnaire.personalAccountNumber'),
    field('additionalHeatLoad', 'Додаткове теплове навантаження об’єкта', 'appendixData.questionnaire.additionalHeatLoad'),
    field('totalHeatLoad', 'Загальне теплове навантаження об’єкта', 'appendixData.questionnaire.totalHeatLoad'),
    field('heatingLoad', 'Опалення', 'appendixData.questionnaire.heatingLoad'),
    field('hotWaterMaxLoad', 'Гаряче водопостачання, максимальне', 'appendixData.questionnaire.hotWaterMaxLoad'),
    field('hotWaterAverageLoad', 'Гаряче водопостачання, середнє', 'appendixData.questionnaire.hotWaterAverageLoad'),
    field('ventilationLoad', 'Вентиляція', 'appendixData.questionnaire.ventilationLoad'),
    field('technologyLoad', 'Технологія', 'appendixData.questionnaire.technologyLoad'),
    field('existingHeatSourceDescription', 'Стислі дані про існуюче джерело теплопостачання', 'appendixData.questionnaire.existingHeatSource', {
      inputType: 'textarea',
      maxLength: 1000,
    }),
  ],
  appendix5: [
    ...questionnaireRequiredFields,
    field('supplyOrTransportContractNumber', 'Номер договору постачання / транспортування теплової енергії', 'appendixData.questionnaire.heatSupplyContractNumber'),
    field('additionalCapacity', 'Додаткова технічна / пропускна потужність', 'appendixData.questionnaire.additionalCapacity'),
    field('totalCapacity', 'Загальна технічна / пропускна потужність', 'appendixData.questionnaire.totalCapacity'),
  ],
};

function promptField(fieldConfig) {
  return {
    inputType: fieldConfig.inputType,
    key: fieldConfig.key,
    label: fieldConfig.label,
    maxLength: fieldConfig.maxLength,
    options: fieldConfig.options,
  };
}

function buildNotificationSummary(values) {
  const method = valueOrEmpty(values.notificationMethod);
  const address = valueOrEmpty(values.notificationAddress);

  if (method && address) {
    return `${method}: ${address}`;
  }

  return method || address;
}

function stripLeadingNumberSign(value) {
  return valueOrEmpty(value).replace(/^№\s*/u, '');
}

function buildAppendix3Values(application) {
  const data = mapApplicationToStatementTemplateData(application);

  return {
    ...data,
    operatorRecipient: firstNonEmpty(
      getPath(application, 'appendixData.appendix3.operatorRecipient'),
      getPath(application, 'station.directorName'),
      application?.stationName,
    ),
    objectSummary: joinParts([data.objectName, data.objectAddress]),
    representativeName: firstNonEmpty(data.representativeName, data.customerName),
    representativePhone: firstNonEmpty(data.representativePhone, data.customerPhone),
    representativeEmail: firstNonEmpty(data.representativeEmail, data.customerEmail),
    signerName: firstNonEmpty(data.signerName, data.representativeName, data.customerName),
  };
}

function buildQuestionnaireSummaries(application, data) {
  const questionnaire = application?.appendixData?.questionnaire ?? {};
  const values = {
    ...data,
    customerSummary: firstNonEmpty(
      questionnaire.customerInfo,
      joinParts([data.customerName, data.customerAddress, data.customerDistrict, data.customerEmail, data.customerPhone]),
    ),
    designOrgSummary: firstNonEmpty(
      questionnaire.designOrganization,
      joinParts([data.designOrgName, data.designOrgAddress, data.designOrgEmail, data.designOrgPhone]),
    ),
    constructionObjectSummary: firstNonEmpty(
      questionnaire.constructionObject,
      joinParts([data.constructionType, data.objectName, data.objectAddress]),
    ),
  };

  return {
    ...values,
    heatSupplyContractNumber: stripLeadingNumberSign(values.heatSupplyContractNumber),
    personalAccountNumber: stripLeadingNumberSign(values.personalAccountNumber),
    supplyOrTransportContractNumber: stripLeadingNumberSign(values.supplyOrTransportContractNumber),
    notificationSummary: buildNotificationSummary(values),
  };
}

export function usesDocumentTemplatePlaceholders(documentType) {
  return placeholderDocumentTypes.has(documentType);
}

export function buildDocumentTemplateValues(application, documentType) {
  if (documentType === 'appendix3') {
    return buildAppendix3Values(application);
  }

  if (documentType === 'appendix4') {
    return buildQuestionnaireSummaries(application, mapApplicationToConsumerQuestionnaireTemplateData(application));
  }

  if (documentType === 'appendix5') {
    return buildQuestionnaireSummaries(application, mapApplicationToGeneratorQuestionnaireTemplateData(application));
  }

  return {};
}

export function sanitizeDocumentManualValues(documentType, input) {
  const fields = requiredFieldsByDocumentType[documentType] ?? [];
  const fieldByKey = new Map(fields.map((item) => [item.key, item]));
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};

  for (const [key, rawValue] of Object.entries(source)) {
    const fieldConfig = fieldByKey.get(key);

    if (!fieldConfig) {
      continue;
    }

    const value = normalizeOptionValue(rawValue, fieldConfig.options);

    if (value.length > fieldConfig.maxLength) {
      throw new Error(`Поле "${fieldConfig.label}" має бути не довше ${fieldConfig.maxLength} символів.`);
    }

    if (fieldConfig.options?.length && value) {
      const allowed = fieldConfig.options.some((option) => option.value === value);

      if (!allowed) {
        throw new Error(`Поле "${fieldConfig.label}" має некоректне значення.`);
      }
    }

    result[key] = value;
  }

  return result;
}

export function createDocumentApplication(application, documentType, manualValues = {}) {
  const nextApplication = cloneApplication(application);
  const fields = requiredFieldsByDocumentType[documentType] ?? [];

  for (const fieldConfig of fields) {
    const manualValue = valueOrEmpty(manualValues[fieldConfig.key]);

    if (manualValue) {
      setPath(nextApplication, fieldConfig.targetPath, manualValue);
    }
  }

  return nextApplication;
}

function getMissingFieldsFromValues(documentType, values) {
  const fields = requiredFieldsByDocumentType[documentType] ?? [];

  return fields
    .filter((fieldConfig) => (
      fieldConfig.isMissing
        ? fieldConfig.isMissing(values)
        : !valueOrEmpty(values[fieldConfig.key])
    ))
    .map(promptField);
}

export function getMissingDocumentFields(application, documentType, manualValues = {}) {
  const documentApplication = createDocumentApplication(application, documentType, manualValues);
  const values = buildDocumentTemplateValues(documentApplication, documentType);

  return getMissingFieldsFromValues(documentType, values);
}

export function prepareDocumentTemplateData(application, documentType, manualValues = {}) {
  const documentApplication = createDocumentApplication(application, documentType, manualValues);
  const values = buildDocumentTemplateValues(documentApplication, documentType);

  return {
    application: documentApplication,
    missingFields: getMissingFieldsFromValues(documentType, values),
    values,
  };
}
