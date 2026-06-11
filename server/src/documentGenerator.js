import fs from 'node:fs/promises';

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import {
  mapApplicationToConnectionAgreement,
  mapApplicationToConsumerQuestionnaire,
  mapApplicationToGeneratorQuestionnaire,
  mapApplicationToStatementDocument,
  mapApplicationToTechnicalConditions,
  valueOrEmpty,
} from './documentFieldMapper.js';
import { prependDocumentDataPage } from './documentDataPage.js';
import { fillDocumentTemplatePlaceholders } from './documentTemplateFiller.js';
import {
  getMissingDocumentFields,
  prepareDocumentTemplateData,
  usesDocumentTemplatePlaceholders,
} from './documentTemplateValues.js';
import { getStaticDocumentPath } from './documentTemplateRegistry.js';

const documentTitles = {
  appendix1: 'Додаток 1. Типовий договір на приєднання до теплових мереж',
  appendix2: 'Додаток 2. Технічні умови на приєднання до теплових мереж',
  appendix3: 'Додаток 3. Заява на приєднання',
  appendix4: 'Додаток 4. Опитувальний лист для тепловикористальних установок',
  appendix5: 'Додаток 5. Опитувальний лист для теплогенеруючих/когенераційних установок',
};

function valueOrDash(value) {
  const text = valueOrEmpty(value);
  return text || '________________';
}

function para(text, options = {}) {
  return new Paragraph({
    ...options,
    children: [
      new TextRun({
        text,
        bold: Boolean(options.bold),
      }),
    ],
  });
}

function line(label, value) {
  return para(`${label}: ${valueOrDash(value)}`);
}

function sectionTitle(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });
}

function title(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 260 },
  });
}

function signatureBlock() {
  return [
    para(''),
    para('Дата: ____________________'),
    para('Підпис: ____________________'),
    para('М.П. (за наявності)'),
  ];
}

function commonStationLines(station) {
  return [
    line('Станція/компанія', station.name),
    line('ЄДРПОУ', station.edrpou),
    line('Адреса станції/компанії', station.address),
    line('Телефон', station.phone),
    line('Email', station.email),
    line('Керівник', station.directorName),
  ];
}

function buildAppendix3(application) {
  const data = mapApplicationToStatementDocument(application);

  return [
    title(documentTitles.appendix3),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Реквізити заявника'),
    line('Керівнику / найменування Оператора', data.operator.recipient),
    line('Від', data.applicant.name),
    line('Адреса для листування', data.applicant.mailingAddress),
    line('Електронна адреса', data.applicant.email),
    line('Телефон', data.applicant.phone),
    sectionTitle('Заява на приєднання'),
    line('Прошу надати послугу з приєднання до теплових мереж Оператора', data.operator.name),
    line('Найменування об’єкта', data.object.name),
    line('Адреса об’єкта', data.object.address),
    line('Причина приєднання', data.request.reason),
    sectionTitle('Представник замовника'),
    line('Прізвище та ініціали відповідальної особи', data.representative.name),
    line('Контактний телефон', data.representative.phone),
    line('e-mail', data.representative.email),
    line('Дата подання заяви', data.request.date),
    line('ПІБ / ініціали для підпису', data.signatureName),
    ...signatureBlock(),
  ];
}

function buildQuestionnaire(application, type) {
  const isGeneration = type === 'appendix5';
  const data = isGeneration
    ? mapApplicationToGeneratorQuestionnaire(application)
    : mapApplicationToConsumerQuestionnaire(application);

  const rows = [
    title(documentTitles[type]),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Дані замовника'),
    line('Найменування / ПІБ замовника', data.customer.name),
    line('Адреса замовника', data.customer.address),
    line('Адміністративний район', data.customer.district),
    line('Електронна адреса', data.customer.email),
    line('Телефон', data.customer.phone),
    sectionTitle('Дані проєктної організації'),
    line('Найменування проєктної організації', data.designOrganization.name || data.designOrganization.summary),
    line('Адреса проєктної організації', data.designOrganization.address),
    line('Електронна адреса проєктної організації', data.designOrganization.email),
    line('Телефон проєктної організації', data.designOrganization.phone),
    sectionTitle('Дані об’єкта'),
    line('Будівництво / реконструкція об’єкта', data.object.plannedWorks || data.object.constructionSummary),
    line('Найменування об’єкта', data.object.name),
    line('Адреса об’єкта', data.object.address),
    line('Рік початку будівництва / реконструкції', data.object.constructionStartYear),
    line('Рік введення в експлуатацію', data.object.commissioningYear),
  ];

  if (isGeneration) {
    rows.push(
      sectionTitle('Технічна / пропускна потужність'),
      line('Дозволене теплове навантаження за договором', data.capacity.permittedHeatLoad),
      line('Договір постачання (купівлі-продажу) / транспортування теплової енергії №', data.capacity.heatSupplyContractNumber),
      line('Додаткова величина технічної (пропускної) потужності в точці приєднання', data.capacity.additionalCapacity),
      line('Загальна величина технічної (пропускної) потужності в точці приєднання', data.capacity.totalCapacity),
    );
  } else {
    rows.push(
      sectionTitle('Теплове навантаження'),
      line('Дозволене теплове навантаження за договором', data.heatLoad.permittedHeatLoad),
      line('Договір про користування тепловою енергією №', data.heatLoad.heatSupplyContractNumber),
      line('Особовий рахунок №', data.heatLoad.personalAccountNumber),
      line('Додаткове теплове навантаження', data.heatLoad.additionalHeatLoad),
      line('Загальне теплове навантаження', data.heatLoad.totalHeatLoad),
      sectionTitle('Навантаження за видами теплоспоживання'),
      line('Опалення', data.heatLoad.heatingLoad),
      line('Гаряче водопостачання максимальне', data.heatLoad.hotWaterMaxLoad),
      line('Гаряче водопостачання середнє', data.heatLoad.hotWaterAverageLoad),
      line('Вентиляція', data.heatLoad.ventilationLoad),
      line('Технологія', data.heatLoad.technologyLoad),
    );
  }

  rows.push(
    sectionTitle('Проєктування та будівельні роботи'),
    line('Розробку проєкту мереж Оператора забезпечує', data.project.developer),
    line('Виконавець будівельних робіт', data.project.constructionExecutor),
    sectionTitle('Технічний опис'),
  );

  if (!isGeneration) {
    rows.push(line('Стислі дані про існуюче джерело теплопостачання', data.technical.existingHeatSource));
  }

  rows.push(
    line('Стислі дані про об’єкт теплофікації', data.technical.heatObjectDescription),
    line('Підключення третіх осіб', data.technical.thirdPartyConnection),
    sectionTitle('Спосіб відповіді'),
    line('За місцем подання заяви', data.response.atSubmissionPlace),
    line('Електронною поштою', data.response.byEmail),
    line('Поштою', data.response.byPost),
    line('Адреса або email для відповіді', data.response.contact || data.response.method),
    ...signatureBlock(),
  );

  return rows;
}

function buildAppendix1(application) {
  const data = mapApplicationToConnectionAgreement(application);

  return [
    title(documentTitles.appendix1),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Сторони договору'),
    ...commonStationLines(data.station),
    line('Замовник', data.applicantName),
    line('Об’єкт замовника', data.objectAddress),
    sectionTitle('Предмет договору'),
    line('Технічні умови на приєднання', data.applicationNumber),
    line('Тип приєднання', data.connectionType),
    line('Місце забезпечення потужності', data.powerProvisionPlace),
    line('Прогнозована точка вимірювання', data.predictedMeteringPoint),
    line('Вартість послуги з приєднання', data.connectionCost),
    ...signatureBlock(),
  ];
}

function buildAppendix2(application) {
  const data = mapApplicationToTechnicalConditions(application);

  return [
    title(documentTitles.appendix2),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Характеристика об’єкта замовника'),
    line('Замовник приєднання', data.applicantName),
    line('Назва об’єкта', data.objectName),
    line('Адреса об’єкта', data.objectAddress),
    line('Термін введення в експлуатацію', data.commissioningYear),
    sectionTitle('Розрахункові параметри приєднання'),
    line('Дозволене теплове навантаження', data.permittedHeatLoad),
    line('Опалення', data.heatingLoad),
    line('Гаряче водопостачання середнє', data.hotWaterAverageLoad),
    line('Гаряче водопостачання максимальне', data.hotWaterMaxLoad),
    line('Вентиляція', data.ventilationLoad),
    line('Технологія', data.technologyLoad),
    sectionTitle('Вихідні дані для проєктування'),
    line('Проєкт МО забезпечує', data.projectDeveloper),
    line('Проєкт МЗ та вимоги до комерційного обліку', ''),
    ...signatureBlock(),
  ];
}

function buildDocumentChildren(application, type) {
  if (type === 'appendix3') {
    return buildAppendix3(application);
  }

  if (type === 'appendix4' || type === 'appendix5') {
    return buildQuestionnaire(application, type);
  }

  if (type === 'appendix1') {
    return buildAppendix1(application);
  }

  return buildAppendix2(application);
}

function sanitizeFilePart(value) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'document';
}

async function tryLoadStaticDocument(type) {
  const staticDocumentPath = getStaticDocumentPath(type);

  if (!staticDocumentPath) {
    return null;
  }

  try {
    return await fs.readFile(staticDocumentPath);
  } catch (error) {
    console.warn(
      `Static document is not available for ${type}, falling back to programmatic generator.`,
      error?.message ?? error,
    );
    return null;
  }
}

async function generateProgrammaticDocument(application, type) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: buildDocumentChildren(application, type),
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export { getMissingDocumentFields, sanitizeDocumentManualValues } from './documentTemplateValues.js';

export async function generateApplicationDocument(application, type, { allowMissing = false, manualValues = {} } = {}) {
  const titleText = documentTitles[type];

  if (!titleText) {
    throw new Error('Невідомий тип документа.');
  }

  let documentApplication = application;
  let templateValues = {};
  const shouldFillPlaceholders = usesDocumentTemplatePlaceholders(type);

  if (shouldFillPlaceholders) {
    const prepared = prepareDocumentTemplateData(application, type, manualValues);

    if (prepared.missingFields.length > 0 && !allowMissing) {
      throw new Error('Потрібно дозаповнити дані для документа.');
    }

    documentApplication = prepared.application;
    templateValues = prepared.values;
  }

  let buffer = await tryLoadStaticDocument(type);

  if (!buffer) {
    buffer = await generateProgrammaticDocument(documentApplication, type);
  } else if (shouldFillPlaceholders) {
    buffer = fillDocumentTemplatePlaceholders(buffer, templateValues);
  }

  buffer = prependDocumentDataPage(buffer, documentApplication, type, titleText);

  const originalName = `${sanitizeFilePart(documentApplication.applicationNumber)}-${type}.docx`;

  return {
    buffer,
    title: titleText,
    originalName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
