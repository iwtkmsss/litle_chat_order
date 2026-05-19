export const APPLICATION_TYPE_IDS = {
  heatConsumer: 'heat_consumer',
  heatGenerator: 'heat_generator',
};

export const LEGACY_QUESTIONNAIRE_TYPES = {
  heatConsumer: 'heat_use',
  heatGenerator: 'generation',
};

const responseMethodOptions = [
  { value: 'За місцем подання заяви', label: 'За місцем подання заяви' },
  { value: 'Електронною поштою', label: 'Електронною поштою' },
  { value: 'Поштою', label: 'Поштою' },
];

const yesNoOptions = [
  { value: 'Так', label: 'Так' },
  { value: 'Ні', label: 'Ні' },
];

const projectOwnerOptions = [
  { value: 'Оператор', label: 'Оператор' },
  { value: 'Замовник', label: 'Замовник' },
];

const constructionExecutorOptions = [
  { value: 'Оператор', label: 'Оператор' },
  { value: 'Інший суб’єкт господарювання', label: 'Інший суб’єкт господарювання' },
];

const commonGroups = [
  {
    id: 'customer',
    title: 'Дані замовника',
    fields: [
      {
        name: 'customerName',
        label: 'Найменування / ПІБ замовника',
        type: 'text',
        required: false,
        placeholder: 'Наприклад: Іваненко Іван Іванович',
      },
      {
        name: 'customerAddress',
        label: 'Адреса замовника',
        type: 'text',
        required: false,
      },
      {
        name: 'customerDistrict',
        label: 'Адміністративний район',
        type: 'text',
        required: false,
      },
      {
        name: 'customerEmail',
        label: 'Електронна адреса',
        type: 'email',
        required: false,
      },
      {
        name: 'customerPhone',
        label: 'Телефон',
        type: 'tel',
        required: false,
      },
    ],
  },
  {
    id: 'designOrganization',
    title: 'Дані проєктної організації',
    fields: [
      {
        name: 'designOrganizationName',
        label: 'Найменування проєктної організації',
        type: 'text',
        required: false,
      },
      {
        name: 'designOrganizationAddress',
        label: 'Адреса проєктної організації',
        type: 'text',
        required: false,
      },
      {
        name: 'designOrganizationEmail',
        label: 'Електронна адреса проєктної організації',
        type: 'email',
        required: false,
      },
      {
        name: 'designOrganizationPhone',
        label: 'Телефон проєктної організації',
        type: 'tel',
        required: false,
      },
    ],
  },
  {
    id: 'object',
    title: 'Дані об’єкта',
    fields: [
      {
        name: 'objectName',
        label: 'Найменування об’єкта',
        type: 'text',
        required: true,
      },
      {
        name: 'objectAddress',
        label: 'Адреса об’єкта',
        type: 'text',
        required: true,
      },
      {
        name: 'plannedWorks',
        label: 'Планується будівництво або реконструкція',
        type: 'select',
        required: false,
        options: [
          { value: '', label: 'Не вказано' },
          { value: 'Будівництво', label: 'Будівництво' },
          { value: 'Реконструкція', label: 'Реконструкція' },
          { value: 'Будівництво та реконструкція', label: 'Будівництво та реконструкція' },
        ],
      },
      {
        name: 'constructionStartYear',
        label: 'Рік початку будівництва / реконструкції',
        type: 'number',
        required: false,
        placeholder: 'Наприклад: 2026',
      },
      {
        name: 'commissioningYear',
        label: 'Рік введення в експлуатацію',
        type: 'number',
        required: false,
        placeholder: 'Наприклад: 2027',
      },
    ],
  },
  {
    id: 'projectAndWorks',
    title: 'Проєктування і будівельні роботи',
    fields: [
      {
        name: 'projectDeveloper',
        label: 'Хто забезпечує розробку проєкту мереж Оператора',
        type: 'radio',
        required: false,
        options: projectOwnerOptions,
      },
      {
        name: 'constructionExecutor',
        label: 'Хто виконує будівельні роботи з прокладання теплових мереж',
        type: 'radio',
        required: false,
        options: constructionExecutorOptions,
      },
    ],
  },
  {
    id: 'thirdParties',
    title: 'Треті особи',
    fields: [
      {
        name: 'thirdPartyConnection',
        label: 'Чи передбачається підключення третіх осіб до мереж замовника',
        type: 'radio',
        required: false,
        options: yesNoOptions,
      },
    ],
  },
  {
    id: 'responseMethod',
    title: 'Спосіб отримання відповіді',
    fields: [
      {
        name: 'responseMethod',
        label: 'Спосіб отримання відповіді',
        type: 'select',
        required: false,
        options: responseMethodOptions,
      },
      {
        name: 'notificationMethod',
        label: 'Контактна адреса або email для відповіді',
        type: 'text',
        required: false,
        placeholder: 'Наприклад: name@example.com або поштова адреса',
      },
    ],
  },
];

const heatConsumerGroups = [
  {
    id: 'heatLoad',
    title: 'Теплове навантаження',
    fields: [
      {
        name: 'permittedHeatLoad',
        label: 'Дозволене теплове навантаження за договором',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
        placeholder: 'Наприклад: 0.25',
        helpText: 'Вкажіть значення з чинного договору, якщо об’єкт уже підключений.',
      },
      {
        name: 'heatSupplyContractNumber',
        label: 'Номер договору про користування тепловою енергією',
        type: 'text',
        required: false,
      },
      {
        name: 'personalAccountNumber',
        label: 'Номер особового рахунку',
        type: 'text',
        required: false,
      },
      {
        name: 'additionalHeatLoad',
        label: 'Додаткове теплове навантаження об’єкта',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'totalHeatLoad',
        label: 'Загальне теплове навантаження об’єкта',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'heatingLoad',
        label: 'Опалення',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'hotWaterMaxLoad',
        label: 'Гаряче водопостачання максимальне',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'hotWaterAverageLoad',
        label: 'Гаряче водопостачання середнє',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'ventilationLoad',
        label: 'Вентиляція',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'technologyLoad',
        label: 'Технологія',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
    ],
  },
  {
    id: 'technicalDescription',
    title: 'Технічний опис',
    fields: [
      {
        name: 'existingHeatSource',
        label: 'Стислі дані про існуюче джерело теплопостачання',
        type: 'textarea',
        required: false,
      },
      {
        name: 'heatObjectDescription',
        label: 'Стислі дані про об’єкт теплофікації',
        type: 'textarea',
        required: false,
      },
    ],
  },
];

const heatGeneratorGroups = [
  {
    id: 'technicalCapacity',
    title: 'Технічна потужність',
    fields: [
      {
        name: 'permittedHeatLoad',
        label: 'Дозволене теплове навантаження за договором',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'heatSupplyContractNumber',
        label: 'Номер договору постачання / купівлі-продажу / транспортування теплової енергії',
        type: 'text',
        required: false,
      },
      {
        name: 'additionalCapacity',
        label: 'Додаткова величина технічної / пропускної потужності в точці приєднання',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
      {
        name: 'totalCapacity',
        label: 'Загальна величина технічної / пропускної потужності в точці приєднання',
        type: 'number',
        required: false,
        unit: 'Гкал/год або МВт',
      },
    ],
  },
  {
    id: 'technicalDescription',
    title: 'Технічний опис',
    fields: [
      {
        name: 'heatObjectDescription',
        label: 'Стислі дані про об’єкт теплофікації',
        type: 'textarea',
        required: false,
      },
    ],
  },
];

export const APPLICATION_TYPES = {
  [APPLICATION_TYPE_IDS.heatConsumer]: {
    id: APPLICATION_TYPE_IDS.heatConsumer,
    legacyType: LEGACY_QUESTIONNAIRE_TYPES.heatConsumer,
    title: 'Тепловикористальна установка',
    userLabel: 'Я підключаю об’єкт для споживання тепла',
    description:
      'Оберіть цей варіант, якщо об’єкт буде використовувати теплову енергію для опалення, гарячого водопостачання, вентиляції або технологічних потреб.',
    appendix: 'Додаток 4',
    documentType: 'appendix4',
    documentTitle:
      'Опитувальний лист для надання послуги з приєднання до теплових мереж для тепловикористальних установок',
    groups: [...commonGroups, ...heatConsumerGroups],
  },
  [APPLICATION_TYPE_IDS.heatGenerator]: {
    id: APPLICATION_TYPE_IDS.heatGenerator,
    legacyType: LEGACY_QUESTIONNAIRE_TYPES.heatGenerator,
    title: 'Теплогенеруюча / когенераційна установка',
    userLabel: 'Я підключаю установку, яка виробляє тепло',
    description:
      'Оберіть цей варіант, якщо йдеться про теплогенеруючу або когенераційну установку, яка виробляє чи передає теплову енергію.',
    appendix: 'Додаток 5',
    documentType: 'appendix5',
    documentTitle:
      'Опитувальний лист для надання послуги з приєднання до теплових мереж для теплогенеруючих/когенераційних установок',
    groups: [...commonGroups, ...heatGeneratorGroups],
  },
};

export const DEFAULT_APPLICATION_TYPE_ID = APPLICATION_TYPE_IDS.heatConsumer;

const typeAliases = {
  [APPLICATION_TYPE_IDS.heatConsumer]: APPLICATION_TYPE_IDS.heatConsumer,
  [LEGACY_QUESTIONNAIRE_TYPES.heatConsumer]: APPLICATION_TYPE_IDS.heatConsumer,
  [APPLICATION_TYPE_IDS.heatGenerator]: APPLICATION_TYPE_IDS.heatGenerator,
  [LEGACY_QUESTIONNAIRE_TYPES.heatGenerator]: APPLICATION_TYPE_IDS.heatGenerator,
};

export function normalizeApplicationTypeId(type) {
  return typeAliases[type] ?? DEFAULT_APPLICATION_TYPE_ID;
}

export function getApplicationTypeConfig(type) {
  return APPLICATION_TYPES[normalizeApplicationTypeId(type)];
}

export function getApplicationTypeOptions() {
  return Object.values(APPLICATION_TYPES);
}

export function getLegacyQuestionnaireType(type) {
  return getApplicationTypeConfig(type).legacyType;
}

export function getApplicationTypeFields(type) {
  return getApplicationTypeConfig(type).groups.flatMap((group) => group.fields);
}

export function createEmptyQuestionnaireValues(type = DEFAULT_APPLICATION_TYPE_ID) {
  return Object.fromEntries([
    ['type', normalizeApplicationTypeId(type)],
    ...getApplicationTypeFields(type).map((field) => [field.name, '']),
  ]);
}
