export const QUESTIONNAIRE_TYPES = {
  heatConsumer: 'heat_consumer',
  heatGenerator: 'heat_generator',
};

export const LEGACY_QUESTIONNAIRE_TYPES = {
  heatConsumer: 'heat_use',
  heatGenerator: 'generation',
};

const typeAliases = {
  [QUESTIONNAIRE_TYPES.heatConsumer]: LEGACY_QUESTIONNAIRE_TYPES.heatConsumer,
  [LEGACY_QUESTIONNAIRE_TYPES.heatConsumer]: LEGACY_QUESTIONNAIRE_TYPES.heatConsumer,
  [QUESTIONNAIRE_TYPES.heatGenerator]: LEGACY_QUESTIONNAIRE_TYPES.heatGenerator,
  [LEGACY_QUESTIONNAIRE_TYPES.heatGenerator]: LEGACY_QUESTIONNAIRE_TYPES.heatGenerator,
};

const commonFields = [
  'customerName',
  'customerAddress',
  'customerDistrict',
  'customerEmail',
  'customerPhone',
  'customerInfo',
  'designOrganizationName',
  'designOrganizationAddress',
  'designOrganizationEmail',
  'designOrganizationPhone',
  'designOrganization',
  'objectName',
  'objectAddress',
  'objectRegion',
  'plannedWorks',
  'constructionObject',
  'constructionStartYear',
  'commissioningYear',
  'permittedHeatLoad',
  'heatSupplyContractNumber',
  'projectDeveloper',
  'constructionExecutor',
  'thirdPartyConnection',
  'responseMethod',
  'notificationMethod',
  'heatObjectDescription',
];

const heatConsumerFields = [
  'personalAccountNumber',
  'additionalHeatLoad',
  'totalHeatLoad',
  'heatingLoad',
  'hotWaterMaxLoad',
  'hotWaterAverageLoad',
  'ventilationLoad',
  'technologyLoad',
  'existingHeatSource',
];

const heatGeneratorFields = [
  'additionalCapacity',
  'totalCapacity',
];

export const QUESTIONNAIRE_ALLOWED_FIELDS = {
  [LEGACY_QUESTIONNAIRE_TYPES.heatConsumer]: [
    ...commonFields,
    ...heatConsumerFields,
  ],
  [LEGACY_QUESTIONNAIRE_TYPES.heatGenerator]: [
    ...commonFields,
    ...heatGeneratorFields,
  ],
};

export const QUESTIONNAIRE_FIELD_LIMITS = {
  customerInfo: 1000,
  customerName: 300,
  customerAddress: 700,
  customerDistrict: 160,
  customerEmail: 160,
  customerPhone: 80,
  designOrganization: 1000,
  designOrganizationName: 300,
  designOrganizationAddress: 700,
  designOrganizationEmail: 160,
  designOrganizationPhone: 80,
  constructionObject: 1000,
  objectName: 700,
  objectAddress: 700,
  objectRegion: 120,
  plannedWorks: 160,
  constructionStartYear: 20,
  commissioningYear: 20,
  permittedHeatLoad: 120,
  heatSupplyContractNumber: 160,
  personalAccountNumber: 160,
  additionalHeatLoad: 120,
  totalHeatLoad: 120,
  heatingLoad: 120,
  hotWaterMaxLoad: 120,
  hotWaterAverageLoad: 120,
  ventilationLoad: 120,
  technologyLoad: 120,
  additionalCapacity: 120,
  totalCapacity: 120,
  projectDeveloper: 1200,
  constructionExecutor: 1200,
  thirdPartyConnection: 20,
  responseMethod: 160,
  notificationMethod: 500,
  existingHeatSource: 1200,
  heatObjectDescription: 1200,
};

export function normalizeQuestionnaireType(type) {
  return typeAliases[type] ?? LEGACY_QUESTIONNAIRE_TYPES.heatConsumer;
}

export function sanitizeQuestionnairePayload(type, payload) {
  const normalizedType = normalizeQuestionnaireType(type);
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const allowedFields = QUESTIONNAIRE_ALLOWED_FIELDS[normalizedType] ?? [];
  const result = { type: normalizedType };

  for (const fieldName of allowedFields) {
    if (data[fieldName] !== undefined) {
      result[fieldName] = normalizeText(data[fieldName]);
    }
  }

  const customerInfo = result.customerInfo || joinParts([
    result.customerName,
    result.customerAddress,
    result.customerDistrict,
    result.customerEmail,
    result.customerPhone,
  ]);

  if (customerInfo) {
    result.customerInfo = customerInfo;
  }

  const designOrganization = result.designOrganization || joinParts([
    result.designOrganizationName,
    result.designOrganizationAddress,
    result.designOrganizationEmail,
    result.designOrganizationPhone,
  ]);

  if (designOrganization) {
    result.designOrganization = designOrganization;
  }

  const constructionObject = result.constructionObject || joinParts([
    result.objectName,
    result.objectAddress,
    result.plannedWorks,
  ]);

  if (constructionObject) {
    result.constructionObject = constructionObject;
  }

  if (result.responseMethod && result.notificationMethod) {
    result.notificationMethod = `${result.responseMethod}: ${result.notificationMethod}`;
  } else if (result.responseMethod && !result.notificationMethod) {
    result.notificationMethod = result.responseMethod;
  }

  return result;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function joinParts(parts) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join('; ');
}
