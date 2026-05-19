const APPLICATION_TYPES = {
  heatConsumer: 'heat_consumer',
  heatGenerator: 'heat_generator',
};

const LEGACY_TYPES = {
  heatConsumer: 'heat_use',
  heatGenerator: 'generation',
};

const typeAliases = {
  [APPLICATION_TYPES.heatConsumer]: APPLICATION_TYPES.heatConsumer,
  [LEGACY_TYPES.heatConsumer]: APPLICATION_TYPES.heatConsumer,
  [APPLICATION_TYPES.heatGenerator]: APPLICATION_TYPES.heatGenerator,
  [LEGACY_TYPES.heatGenerator]: APPLICATION_TYPES.heatGenerator,
};

export function valueOrEmpty(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return yesNo(value);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    return '';
  }

  return String(value).trim();
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const text = valueOrEmpty(value);

    if (text) {
      return text;
    }
  }

  return '';
}

export function yesNo(value) {
  if (value === true) {
    return 'так';
  }

  if (value === false) {
    return 'ні';
  }

  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase();

  if (['так', 'yes', 'true', '1', '+'].includes(normalized)) {
    return 'так';
  }

  if (['ні', 'нi', 'no', 'false', '0', '-'].includes(normalized)) {
    return 'ні';
  }

  return text;
}

export function normalizeApplicationType(type) {
  return typeAliases[type] ?? APPLICATION_TYPES.heatConsumer;
}

function isGeneratorType(type) {
  return normalizeApplicationType(type) === APPLICATION_TYPES.heatGenerator;
}

function questionnaireOf(application) {
  return application?.appendixData?.questionnaire ?? {};
}

function appendix3Of(application) {
  return application?.appendixData?.appendix3 ?? {};
}

function stationOf(application) {
  return application?.station ?? {};
}

function joinParts(parts) {
  return parts.map(valueOrEmpty).filter(Boolean).join('; ');
}

function responseFlags(method) {
  const text = valueOrEmpty(method).toLowerCase();

  if (!text) {
    return {
      atSubmissionPlace: '',
      byEmail: '',
      byPost: '',
    };
  }

  return {
    atSubmissionPlace: yesNo(text.includes('місц')),
    byEmail: yesNo(text.includes('email') || text.includes('електрон')),
    byPost: yesNo(text.includes('пошт')),
  };
}

function responseContact(questionnaire) {
  const method = valueOrEmpty(questionnaire.responseMethod);
  const contact = valueOrEmpty(questionnaire.notificationMethod);

  if (method && contact.toLowerCase().startsWith(`${method.toLowerCase()}:`)) {
    return contact.slice(method.length + 1).trim();
  }

  return contact;
}

function mapCommonQuestionnaire(application) {
  const questionnaire = questionnaireOf(application);
  const appendix3 = appendix3Of(application);
  const responseMethod = firstNonEmpty(questionnaire.responseMethod, questionnaire.notificationMethod);
  const flags = responseFlags(responseMethod);
  const customerName = firstNonEmpty(questionnaire.customerName, application?.applicantFullName);
  const customerAddress = firstNonEmpty(questionnaire.customerAddress, appendix3.mailingAddress);
  const customerEmail = firstNonEmpty(questionnaire.customerEmail, application?.email);
  const customerPhone = firstNonEmpty(questionnaire.customerPhone, application?.phone);
  const objectName = firstNonEmpty(questionnaire.objectName, appendix3.objectName, application?.objectAddress);
  const objectAddress = firstNonEmpty(questionnaire.objectAddress, application?.objectAddress);
  const designOrganization = firstNonEmpty(
    questionnaire.designOrganization,
    joinParts([
      questionnaire.designOrganizationName,
      questionnaire.designOrganizationAddress,
      questionnaire.designOrganizationEmail,
      questionnaire.designOrganizationPhone,
    ]),
  );
  const constructionObject = firstNonEmpty(
    questionnaire.constructionObject,
    joinParts([objectName, objectAddress, questionnaire.plannedWorks]),
  );

  return {
    type: normalizeApplicationType(questionnaire.type),
    rawLegacyType: valueOrEmpty(questionnaire.type),
    customer: {
      name: customerName,
      address: customerAddress,
      district: valueOrEmpty(questionnaire.customerDistrict),
      email: customerEmail,
      phone: customerPhone,
      summary: firstNonEmpty(
        questionnaire.customerInfo,
        joinParts([customerName, customerAddress, questionnaire.customerDistrict, customerEmail, customerPhone]),
      ),
    },
    designOrganization: {
      name: valueOrEmpty(questionnaire.designOrganizationName),
      address: valueOrEmpty(questionnaire.designOrganizationAddress),
      email: valueOrEmpty(questionnaire.designOrganizationEmail),
      phone: valueOrEmpty(questionnaire.designOrganizationPhone),
      summary: designOrganization,
    },
    object: {
      name: objectName,
      address: objectAddress,
      plannedWorks: valueOrEmpty(questionnaire.plannedWorks),
      constructionSummary: constructionObject,
      constructionStartYear: valueOrEmpty(questionnaire.constructionStartYear),
      commissioningYear: valueOrEmpty(questionnaire.commissioningYear),
    },
    project: {
      developer: valueOrEmpty(questionnaire.projectDeveloper),
      constructionExecutor: valueOrEmpty(questionnaire.constructionExecutor),
    },
    technical: {
      heatObjectDescription: valueOrEmpty(questionnaire.heatObjectDescription),
      thirdPartyConnection: yesNo(questionnaire.thirdPartyConnection),
    },
    response: {
      method: responseMethod,
      contact: responseContact(questionnaire),
      ...flags,
    },
  };
}

export function mapApplicationToStatementDocument(application) {
  const appendix = appendix3Of(application);
  const station = stationOf(application);
  const objectName = firstNonEmpty(appendix.objectName, application?.objectAddress);

  return {
    operator: {
      recipient: firstNonEmpty(appendix.operatorRecipient, station.directorName, application?.stationName),
      name: firstNonEmpty(appendix.operatorName, station.name, application?.stationName),
    },
    applicant: {
      name: valueOrEmpty(application?.applicantFullName),
      mailingAddress: valueOrEmpty(appendix.mailingAddress),
      email: valueOrEmpty(application?.email),
      phone: valueOrEmpty(application?.phone),
    },
    object: {
      name: objectName,
      address: valueOrEmpty(application?.objectAddress),
      summary: joinParts([objectName, application?.objectAddress]),
    },
    request: {
      reason: valueOrEmpty(appendix.connectionReason),
      date: valueOrEmpty(application?.receivedAt),
    },
    representative: {
      name: valueOrEmpty(appendix.representativeName),
      phone: valueOrEmpty(appendix.representativePhone),
      email: valueOrEmpty(appendix.representativeEmail),
    },
    signatureName: firstNonEmpty(appendix.representativeName, application?.applicantFullName),
  };
}

export function mapApplicationToConsumerQuestionnaire(application) {
  const questionnaire = questionnaireOf(application);
  const common = mapCommonQuestionnaire(application);

  return {
    ...common,
    type: APPLICATION_TYPES.heatConsumer,
    heatLoad: {
      permittedHeatLoad: valueOrEmpty(questionnaire.permittedHeatLoad),
      heatSupplyContractNumber: valueOrEmpty(questionnaire.heatSupplyContractNumber),
      personalAccountNumber: valueOrEmpty(questionnaire.personalAccountNumber),
      additionalHeatLoad: valueOrEmpty(questionnaire.additionalHeatLoad),
      totalHeatLoad: valueOrEmpty(questionnaire.totalHeatLoad),
      heatingLoad: valueOrEmpty(questionnaire.heatingLoad),
      hotWaterMaxLoad: valueOrEmpty(questionnaire.hotWaterMaxLoad),
      hotWaterAverageLoad: valueOrEmpty(questionnaire.hotWaterAverageLoad),
      ventilationLoad: valueOrEmpty(questionnaire.ventilationLoad),
      technologyLoad: valueOrEmpty(questionnaire.technologyLoad),
    },
    technical: {
      ...common.technical,
      existingHeatSource: valueOrEmpty(questionnaire.existingHeatSource),
    },
  };
}

export function mapApplicationToGeneratorQuestionnaire(application) {
  const questionnaire = questionnaireOf(application);
  const common = mapCommonQuestionnaire(application);

  return {
    ...common,
    type: APPLICATION_TYPES.heatGenerator,
    capacity: {
      permittedHeatLoad: valueOrEmpty(questionnaire.permittedHeatLoad),
      heatSupplyContractNumber: valueOrEmpty(questionnaire.heatSupplyContractNumber),
      additionalCapacity: valueOrEmpty(questionnaire.additionalCapacity),
      totalCapacity: valueOrEmpty(questionnaire.totalCapacity),
    },
  };
}

export function mapApplicationToTechnicalConditions(application) {
  const questionnaire = isGeneratorType(questionnaireOf(application).type)
    ? mapApplicationToGeneratorQuestionnaire(application)
    : mapApplicationToConsumerQuestionnaire(application);

  return {
    applicantName: valueOrEmpty(application?.applicantFullName),
    objectName: firstNonEmpty(questionnaire.object.name, application?.objectAddress),
    objectAddress: firstNonEmpty(questionnaire.object.address, application?.objectAddress),
    commissioningYear: questionnaire.object.commissioningYear,
    permittedHeatLoad: firstNonEmpty(
      questionnaire.heatLoad?.permittedHeatLoad,
      questionnaire.capacity?.permittedHeatLoad,
    ),
    heatingLoad: valueOrEmpty(questionnaire.heatLoad?.heatingLoad),
    hotWaterAverageLoad: valueOrEmpty(questionnaire.heatLoad?.hotWaterAverageLoad),
    hotWaterMaxLoad: valueOrEmpty(questionnaire.heatLoad?.hotWaterMaxLoad),
    ventilationLoad: valueOrEmpty(questionnaire.heatLoad?.ventilationLoad),
    technologyLoad: valueOrEmpty(questionnaire.heatLoad?.technologyLoad),
    projectDeveloper: questionnaire.project.developer,
  };
}

export function mapApplicationToConnectionAgreement(application) {
  const appendix = appendix3Of(application);
  const station = stationOf(application);

  return {
    station: {
      name: firstNonEmpty(station.name, application?.stationName),
      edrpou: valueOrEmpty(station.edrpou),
      address: valueOrEmpty(station.address),
      phone: valueOrEmpty(station.phone),
      email: valueOrEmpty(station.email),
      directorName: valueOrEmpty(station.directorName),
    },
    applicantName: valueOrEmpty(application?.applicantFullName),
    objectName: firstNonEmpty(appendix.objectName, application?.objectAddress),
    objectAddress: valueOrEmpty(application?.objectAddress),
    applicationNumber: valueOrEmpty(application?.applicationNumber),
    connectionType: application?.connectionType === 'temporary'
      ? 'Тимчасове приєднання'
      : 'Приєднання до теплових мереж',
    powerProvisionPlace: firstNonEmpty(appendix.objectName, application?.objectAddress),
    predictedMeteringPoint: '',
    connectionCost: '',
  };
}
