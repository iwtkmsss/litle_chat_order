import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

const documentTitles = {
  appendix1: 'Додаток 1. Типовий договір на приєднання до теплових мереж',
  appendix2: 'Додаток 2. Технічні умови на приєднання до теплових мереж',
  appendix3: 'Додаток 3. Заява на приєднання',
  appendix4: 'Додаток 4. Опитувальний лист для тепловикористальних установок',
  appendix5: 'Додаток 5. Опитувальний лист для теплогенеруючих/когенераційних установок',
};

function valueOrDash(value) {
  const text = String(value ?? '').trim();
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

function commonStationLines(application) {
  return [
    line('Станція/компанія', application.station?.name || application.stationName),
    line('ЄДРПОУ', application.station?.edrpou),
    line('Адреса станції/компанії', application.station?.address),
    line('Телефон', application.station?.phone),
    line('Email', application.station?.email),
    line('Керівник', application.station?.directorName),
  ];
}

function buildAppendix3(application) {
  const appendix = application.appendixData?.appendix3 ?? {};

  return [
    title(documentTitles.appendix3),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Реквізити заявника'),
    line('Керівнику / найменування Оператора', appendix.operatorRecipient || application.station?.directorName || application.stationName),
    line('Від', application.applicantFullName),
    line('Адреса для листування', appendix.mailingAddress),
    line('Електронна адреса', application.email),
    line('Телефон', application.phone),
    sectionTitle('Заява на приєднання'),
    line('Прошу надати послугу з приєднання до теплових мереж Оператора', appendix.operatorName || application.stationName),
    line('Об’єкт замовника', appendix.objectName || application.objectAddress),
    line('Причина приєднання', appendix.connectionReason),
    sectionTitle('Представник замовника'),
    line('Прізвище та ініціали відповідальної особи', appendix.representativeName),
    line('Контактний телефон', appendix.representativePhone),
    line('e-mail', appendix.representativeEmail),
    ...signatureBlock(),
  ];
}

function buildQuestionnaire(application, type) {
  const questionnaire = application.appendixData?.questionnaire ?? {};
  const isGeneration = type === 'appendix5';

  const rows = [
    title(documentTitles[type]),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Дані замовника та об’єкта'),
    line('Найменування, адреса, адмінрайон, електронна адреса, телефон замовника', questionnaire.customerInfo || `${application.applicantFullName}, ${application.email}, ${application.phone}`),
    line('Проєктна організація', questionnaire.designOrganization),
    line('Об’єкт будівництва / реконструкції', questionnaire.constructionObject || application.objectAddress),
    line('Рік початку будівництва', questionnaire.constructionStartYear),
    line('Рік введення в експлуатацію', questionnaire.commissioningYear),
    line('Дозволене теплове навантаження', questionnaire.permittedHeatLoad),
  ];

  if (isGeneration) {
    rows.push(
      line('Договір постачання / купівлі-продажу / транспортування теплової енергії №', questionnaire.heatSupplyContractNumber),
      line('Додаткова величина технічної потужності в точці приєднання', questionnaire.additionalCapacity),
      line('Загальна величина технічної потужності в точці приєднання', questionnaire.totalCapacity),
    );
  } else {
    rows.push(
      line('Договір про користування тепловою енергією №', questionnaire.heatSupplyContractNumber),
      line('Особовий рахунок №', questionnaire.personalAccountNumber),
      line('Додаткове теплове навантаження', questionnaire.additionalHeatLoad),
      line('Загальне теплове навантаження', questionnaire.totalHeatLoad),
      sectionTitle('Навантаження за видами теплоспоживання'),
      line('Опалення', questionnaire.heatingLoad),
      line('Гаряче водопостачання максимальне', questionnaire.hotWaterMaxLoad),
      line('Гаряче водопостачання середнє', questionnaire.hotWaterAverageLoad),
      line('Вентиляція', questionnaire.ventilationLoad),
      line('Технологія', questionnaire.technologyLoad),
    );
  }

  rows.push(
    sectionTitle('Проєктування та будівельні роботи'),
    line('Розробку проєкту мереж Оператора забезпечує', questionnaire.projectDeveloper),
    line('Виконавець будівельних робіт', questionnaire.constructionExecutor),
  );

  if (!isGeneration) {
    rows.push(line('Стислі дані про існуюче джерело теплопостачання', questionnaire.existingHeatSource));
  }

  rows.push(
    line('Стислі дані про об’єкт теплофікації', questionnaire.heatObjectDescription),
    line('Підключення третіх осіб', questionnaire.thirdPartyConnection),
    line('Повідомлення надати', questionnaire.notificationMethod),
    ...signatureBlock(),
  );

  return rows;
}

function buildAppendix1(application) {
  return [
    title(documentTitles.appendix1),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Сторони договору'),
    ...commonStationLines(application),
    line('Замовник', application.applicantFullName),
    line('Об’єкт замовника', application.objectAddress),
    sectionTitle('Предмет договору'),
    line('Технічні умови на приєднання', application.applicationNumber),
    line('Тип приєднання', application.connectionType === 'temporary' ? 'Тимчасове приєднання' : 'Приєднання до теплових мереж'),
    line('Місце забезпечення потужності', application.appendixData?.appendix3?.objectName || application.objectAddress),
    line('Прогнозована точка вимірювання', ''),
    line('Вартість послуги з приєднання', ''),
    ...signatureBlock(),
  ];
}

function buildAppendix2(application) {
  const questionnaire = application.appendixData?.questionnaire ?? {};

  return [
    title(documentTitles.appendix2),
    para('до Порядку приєднання до теплових мереж', { alignment: AlignmentType.CENTER }),
    sectionTitle('Характеристика об’єкта замовника'),
    line('Замовник приєднання', application.applicantFullName),
    line('Назва об’єкта', questionnaire.constructionObject || application.objectAddress),
    line('Адреса об’єкта', application.objectAddress),
    line('Термін введення в експлуатацію', questionnaire.commissioningYear),
    sectionTitle('Розрахункові параметри приєднання'),
    line('Дозволене теплове навантаження', questionnaire.permittedHeatLoad),
    line('Опалення', questionnaire.heatingLoad),
    line('Гаряче водопостачання середнє', questionnaire.hotWaterAverageLoad),
    line('Гаряче водопостачання максимальне', questionnaire.hotWaterMaxLoad),
    line('Вентиляція', questionnaire.ventilationLoad),
    line('Технологія', questionnaire.technologyLoad),
    sectionTitle('Вихідні дані для проєктування'),
    line('Проєкт МО забезпечує', questionnaire.projectDeveloper),
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

export async function generateApplicationDocument(application, type) {
  const titleText = documentTitles[type];

  if (!titleText) {
    throw new Error('Невідомий тип документа.');
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: buildDocumentChildren(application, type),
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  const originalName = `${sanitizeFilePart(application.applicationNumber)}-${type}.docx`;

  return {
    buffer,
    title: titleText,
    originalName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
