import path from 'node:path';

import {
  getAllKnownTemplateFields,
  getExpectedTemplateFields,
} from '../src/documentTemplateFields.js';
import { inspectTemplatePlaceholders } from '../src/documentTemplateInspector.js';
import { getTemplatePath } from '../src/documentTemplateRegistry.js';

const templateChecks = [
  {
    title: 'Додаток 3. Заява на приєднання',
    documentType: 'appendix3',
    applicationType: 'heat_consumer',
  },
  {
    title: 'Додаток 4. Опитувальний лист для тепловикористальних установок',
    documentType: 'appendix4',
    applicationType: 'heat_consumer',
  },
  {
    title: 'Додаток 5. Опитувальний лист для теплогенеруючих/когенераційних установок',
    documentType: 'appendix5',
    applicationType: 'heat_generator',
  },
];

function formatFields(fields) {
  return fields.length > 0
    ? fields.map((field) => `{${field}}`).join(', ')
    : 'немає';
}

let allTemplatesReady = true;

for (const check of templateChecks) {
  const templatePath = getTemplatePath(check.documentType, check.applicationType);
  const expectedFields = getExpectedTemplateFields(check.documentType, check.applicationType);

  console.log(`\n${check.title}`);
  console.log(`Файл: ${path.basename(templatePath)}`);

  try {
    const inspection = await inspectTemplatePlaceholders(
      templatePath,
      expectedFields,
      getAllKnownTemplateFields(),
    );

    allTemplatesReady = allTemplatesReady && inspection.ready;

    console.log(`Знайдено: ${formatFields(inspection.foundFields)}`);
    console.log(`Не вистачає: ${formatFields(inspection.missingFields)}`);
    console.log(`Зайві або невідомі: ${formatFields(inspection.unknownFields)}`);
    console.log(`Розбиті XML-елементами: ${formatFields(inspection.fragmentedFields)}`);
    console.log(`Готовий до шаблонної генерації: ${inspection.ready ? 'так' : 'ні'}`);
  } catch (error) {
    allTemplatesReady = false;
    process.exitCode = 1;
    console.error(`Не вдалося перевірити шаблон: ${error.message}`);
  }
}

if (process.exitCode) {
  console.error('\nERROR: перевірку шаблонів завершено з помилкою читання файлів.');
} else if (allTemplatesReady) {
  console.log('\nOK: усі шаблони містять очікувані плейсхолдери.');
} else {
  console.log('\nINFO: частина плейсхолдерів ще не вставлена. Це нормально, доки шаблони не підготовлені вручну; генерація використовуватиме fallback.');
}
