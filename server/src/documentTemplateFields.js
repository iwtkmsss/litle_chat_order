import { normalizeApplicationType } from './documentFieldMapper.js';

export const APPENDIX3_TEMPLATE_FIELDS = [
  'operatorName',
  'customerName',
  'mailingAddress',
  'customerEmail',
  'customerPhone',
  'objectName',
  'objectAddress',
  'connectionReason',
  'representativeName',
  'representativePhone',
  'representativeEmail',
  'statementDate',
  'signerName',
];

export const APPENDIX4_TEMPLATE_FIELDS = [
  'customerName',
  'customerAddress',
  'customerDistrict',
  'customerEmail',
  'customerPhone',
  'designOrgName',
  'designOrgAddress',
  'designOrgEmail',
  'designOrgPhone',
  'objectName',
  'objectAddress',
  'constructionType',
  'constructionStartYear',
  'commissioningYear',
  'permittedHeatLoad',
  'heatSupplyContractNumber',
  'personalAccountNumber',
  'additionalHeatLoad',
  'totalHeatLoad',
  'heatingLoad',
  'hotWaterMaxLoad',
  'hotWaterAverageLoad',
  'ventilationLoad',
  'technologyLoad',
  'projectDeveloper',
  'constructionExecutor',
  'existingHeatSourceDescription',
  'heatObjectDescription',
  'thirdPartyConnection',
  'notificationMethod',
  'notificationAddress',
  'customerSignerName',
  'designOrgSignerName',
];

export const APPENDIX5_TEMPLATE_FIELDS = [
  'customerName',
  'customerAddress',
  'customerDistrict',
  'customerEmail',
  'customerPhone',
  'designOrgName',
  'designOrgAddress',
  'designOrgEmail',
  'designOrgPhone',
  'objectName',
  'objectAddress',
  'constructionType',
  'constructionStartYear',
  'commissioningYear',
  'permittedHeatLoad',
  'supplyOrTransportContractNumber',
  'additionalCapacity',
  'totalCapacity',
  'projectDeveloper',
  'constructionExecutor',
  'heatObjectDescription',
  'thirdPartyConnection',
  'notificationMethod',
  'notificationAddress',
  'customerSignerName',
  'designOrgSignerName',
];

const templateFieldsByDocument = {
  statement: APPENDIX3_TEMPLATE_FIELDS,
  appendix3: APPENDIX3_TEMPLATE_FIELDS,
  consumerQuestionnaire: APPENDIX4_TEMPLATE_FIELDS,
  appendix4: APPENDIX4_TEMPLATE_FIELDS,
  generatorQuestionnaire: APPENDIX5_TEMPLATE_FIELDS,
  appendix5: APPENDIX5_TEMPLATE_FIELDS,
};

export function getExpectedTemplateFields(documentType, applicationType) {
  if (documentType === 'appendix4' || documentType === 'consumerQuestionnaire') {
    return normalizeApplicationType(applicationType) === 'heat_consumer'
      ? [...APPENDIX4_TEMPLATE_FIELDS]
      : [];
  }

  if (documentType === 'appendix5' || documentType === 'generatorQuestionnaire') {
    return normalizeApplicationType(applicationType) === 'heat_generator'
      ? [...APPENDIX5_TEMPLATE_FIELDS]
      : [];
  }

  return [...(templateFieldsByDocument[documentType] ?? [])];
}

export function getAllKnownTemplateFields() {
  return [...new Set([
    ...APPENDIX3_TEMPLATE_FIELDS,
    ...APPENDIX4_TEMPLATE_FIELDS,
    ...APPENDIX5_TEMPLATE_FIELDS,
  ])].sort();
}
