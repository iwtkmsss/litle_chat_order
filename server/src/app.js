import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import {
  canAccessApplication,
  canAccessChat,
  canAccessGeneratedDocument,
  createApplication,
  createChat,
  createGeneratedDocumentRecord,
  createMessage,
  createSession,
  createStation,
  createUser,
  deleteApplication,
  deleteChat,
  deleteUser,
  findUserByFullName,
  getApplicationById,
  getAttachmentById,
  getChatById,
  getGeneratedDocumentById,
  getSessionUser,
  getStationById,
  getUserById,
  hasAdmin,
  listApplicationsForUser,
  listAuditLog,
  listChatsForUser,
  listDeadlineRules,
  listMessages,
  listSettings,
  listStageTemplates,
  listStations,
  listUsersForUser,
  lookupPublicApplication,
  removeSession,
  replaceChatAccess,
  updateApplication,
  updateApplicationStage,
  updateDeadlineRule,
  updateSetting,
  updateStageTemplate,
  updateStation,
} from './database.js';
import {
  hashPassword,
  userToClient,
  validateFullName,
  validatePassword,
  verifyPassword,
} from './auth.js';
import {
  generatedDocumentsDir,
  sessionCookieName,
  sessionDurationMs,
  uploadsDir,
} from './config.js';
import { generateApplicationDocument } from './documentGenerator.js';
import { removeStoredFiles, removeUploadedFiles, upload } from './uploads.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const documentTypes = new Set(['appendix1', 'appendix2', 'appendix3', 'appendix4', 'appendix5']);
const durationUnits = new Set(['calendar_days', 'business_days', 'months']);

function isUniqueConstraintError(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function sendError(response, status, message) {
  response.status(status).json({ error: message });
}

function validateOptionalText(value, maxLength, fieldName) {
  const text = String(value ?? '').trim();

  if (text.length > maxLength) {
    throw new Error(`${fieldName} має містити не більше ${maxLength} символів.`);
  }

  return text;
}

function validateRequiredText(value, minLength, maxLength, fieldName) {
  const text = validateOptionalText(value, maxLength, fieldName);

  if (text.length < minLength) {
    throw new Error(`${fieldName} має містити щонайменше ${minLength} символи.`);
  }

  return text;
}

function validatePhone(value) {
  const phone = validateRequiredText(value, 7, 40, 'Номер телефону');
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 7) {
    throw new Error('Номер телефону має містити щонайменше 7 цифр.');
  }

  return phone;
}

function validateEmail(value, { required = false } = {}) {
  const email = validateOptionalText(value, 160, 'Email').toLowerCase();

  if (required && !email) {
    throw new Error('Email є обов’язковим.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Вкажіть коректну адресу електронної пошти.');
  }

  return email;
}

function validateDateValue(value, fieldName, { required = true } = {}) {
  const date = String(value ?? '').trim();

  if (!date) {
    if (required) {
      throw new Error(`${fieldName} є обов’язковою датою.`);
    }

    return '';
  }

  if (!datePattern.test(date)) {
    throw new Error(`${fieldName} має бути у форматі РРРР-ММ-ДД.`);
  }

  return date;
}

function validateInteger(value, fieldName, { min = 0, required = true } = {}) {
  if ((value === null || value === undefined || value === '') && !required) {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number < min) {
    throw new Error(`${fieldName} має бути цілим числом.`);
  }

  return number;
}

function validateBoolean(value) {
  return Boolean(value);
}

function validateStationPayload(input) {
  return {
    name: validateRequiredText(input?.name, 2, 180, 'Назва станції/компанії'),
    edrpou: validateOptionalText(input?.edrpou, 30, 'ЄДРПОУ'),
    address: validateOptionalText(input?.address, 500, 'Адреса'),
    phone: validateOptionalText(input?.phone, 80, 'Телефон'),
    email: validateEmail(input?.email),
    directorName: validateOptionalText(input?.directorName, 180, 'ПІБ керівника'),
    notes: validateOptionalText(input?.notes, 2000, 'Примітки'),
    isActive: input?.isActive === undefined ? true : validateBoolean(input.isActive),
  };
}

function validateStationId(value, fieldName = 'Станція/компанія') {
  const stationId = validateInteger(value, fieldName, { min: 1 });
  const station = getStationById(stationId);

  if (!station) {
    throw new Error('Станцію/компанію не знайдено.');
  }

  if (!station.isActive) {
    throw new Error('Обрана станція/компанія неактивна.');
  }

  return stationId;
}

function validateChatPayload(input, actor) {
  const title = validateRequiredText(input?.title, 3, 120, 'Назва чату');
  const description = validateOptionalText(input?.description, 3000, 'Опис чату');
  const stationId = actor.role === 'admin'
    ? (input?.stationId ? validateStationId(input.stationId) : null)
    : actor.stationId;

  return {
    title,
    description,
    stationId,
  };
}

function validateMessageBody(input) {
  const body = String(input ?? '').trim();

  if (body.length > 10000) {
    throw new Error('Текст повідомлення має містити не більше 10000 символів.');
  }

  return body;
}

function normalizeUserIds(value, actor) {
  if (!Array.isArray(value)) {
    throw new Error('Поле userIds має бути масивом.');
  }

  return [...new Set(value.map((item) => Number(item)).filter(Number.isInteger))]
    .filter((userId) => {
      const user = getUserById(userId);

      if (!user || user.role !== 'customer' || user.deleted_at) {
        return false;
      }

      return actor.role === 'admin' || user.stationId === actor.stationId;
    });
}

function normalizeCustomerUserId(value, stationId) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const userId = validateInteger(value, 'Кабінет замовника', { min: 1 });
  const user = getUserById(userId);

  if (!user || user.role !== 'customer' || user.deleted_at) {
    throw new Error('Обраний кабінет замовника не знайдено.');
  }

  if (user.stationId !== stationId) {
    throw new Error('Кабінет замовника належить іншій станції/компанії.');
  }

  return userId;
}

function validateAppendixText(input, key, maxLength = 500) {
  return validateOptionalText(input?.[key], maxLength, key);
}

function validateAppendixData(input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  return {
    appendix3: {
      operatorRecipient: validateAppendixText(data.appendix3, 'operatorRecipient'),
      mailingAddress: validateAppendixText(data.appendix3, 'mailingAddress', 700),
      operatorName: validateAppendixText(data.appendix3, 'operatorName'),
      objectName: validateAppendixText(data.appendix3, 'objectName', 700),
      connectionReason: validateAppendixText(data.appendix3, 'connectionReason', 700),
      representativeName: validateAppendixText(data.appendix3, 'representativeName'),
      representativePhone: validateAppendixText(data.appendix3, 'representativePhone', 80),
      representativeEmail: validateAppendixText(data.appendix3, 'representativeEmail', 160),
    },
    questionnaire: {
      type: ['heat_use', 'generation'].includes(data.questionnaire?.type)
        ? data.questionnaire.type
        : 'heat_use',
      customerInfo: validateAppendixText(data.questionnaire, 'customerInfo', 1000),
      designOrganization: validateAppendixText(data.questionnaire, 'designOrganization', 1000),
      constructionObject: validateAppendixText(data.questionnaire, 'constructionObject', 1000),
      constructionStartYear: validateAppendixText(data.questionnaire, 'constructionStartYear', 20),
      commissioningYear: validateAppendixText(data.questionnaire, 'commissioningYear', 20),
      permittedHeatLoad: validateAppendixText(data.questionnaire, 'permittedHeatLoad', 120),
      heatSupplyContractNumber: validateAppendixText(data.questionnaire, 'heatSupplyContractNumber', 160),
      personalAccountNumber: validateAppendixText(data.questionnaire, 'personalAccountNumber', 160),
      additionalHeatLoad: validateAppendixText(data.questionnaire, 'additionalHeatLoad', 120),
      totalHeatLoad: validateAppendixText(data.questionnaire, 'totalHeatLoad', 120),
      heatingLoad: validateAppendixText(data.questionnaire, 'heatingLoad', 120),
      hotWaterMaxLoad: validateAppendixText(data.questionnaire, 'hotWaterMaxLoad', 120),
      hotWaterAverageLoad: validateAppendixText(data.questionnaire, 'hotWaterAverageLoad', 120),
      ventilationLoad: validateAppendixText(data.questionnaire, 'ventilationLoad', 120),
      technologyLoad: validateAppendixText(data.questionnaire, 'technologyLoad', 120),
      additionalCapacity: validateAppendixText(data.questionnaire, 'additionalCapacity', 120),
      totalCapacity: validateAppendixText(data.questionnaire, 'totalCapacity', 120),
      projectDeveloper: validateAppendixText(data.questionnaire, 'projectDeveloper', 120),
      constructionExecutor: validateAppendixText(data.questionnaire, 'constructionExecutor', 160),
      existingHeatSource: validateAppendixText(data.questionnaire, 'existingHeatSource', 1200),
      heatObjectDescription: validateAppendixText(data.questionnaire, 'heatObjectDescription', 1200),
      thirdPartyConnection: validateAppendixText(data.questionnaire, 'thirdPartyConnection', 20),
      notificationMethod: validateAppendixText(data.questionnaire, 'notificationMethod', 500),
    },
  };
}

function validateDeadlineData(input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  return {
    invoiceIssuedAt: validateDateValue(data.invoiceIssuedAt, 'Дата отримання рахунку', { required: false }),
    paymentDueAt: validateDateValue(data.paymentDueAt, 'Граничний строк оплати', { required: false }),
    paymentCompletedAt: validateDateValue(data.paymentCompletedAt, 'Дата оплати', { required: false }),
    contractSentAt: validateDateValue(data.contractSentAt, 'Дата отримання примірників договору', { required: false }),
    signedContractDueAt: validateDateValue(data.signedContractDueAt, 'Граничний строк повернення договору', { required: false }),
    signedContractReceivedAt: validateDateValue(data.signedContractReceivedAt, 'Дата повернення договору', { required: false }),
    temporaryResponseDueAt: validateDateValue(data.temporaryResponseDueAt, 'Строк тимчасового інформування', { required: false }),
    temporaryResponseCompletedAt: validateDateValue(data.temporaryResponseCompletedAt, 'Дата тимчасового інформування', { required: false }),
  };
}

function validateApplicationPayload(input, actor) {
  const stationId = actor.role === 'admin'
    ? validateStationId(input?.stationId)
    : actor.stationId;
  const applicationNumber = validateOptionalText(input?.applicationNumber, 80, 'Номер заяви');
  const applicantFullName = validateFullName(input?.applicantFullName ?? '');
  const phone = validatePhone(input?.phone ?? '');
  const email = validateEmail(input?.email ?? '');
  const objectAddress = validateRequiredText(input?.objectAddress, 3, 500, 'Адреса або назва об’єкта');
  const connectionType = String(input?.connectionType ?? 'standard');
  const status = String(input?.status ?? 'in_progress');
  const receivedAt = validateDateValue(
    input?.receivedAt ?? new Date().toISOString().slice(0, 10),
    'Дата отримання заяви',
  );
  const responsibleName = validateOptionalText(input?.responsibleName, 160, 'Відповідальний працівник');
  const notes = validateOptionalText(input?.notes, 5000, 'Примітки');
  const appendixData = validateAppendixData(input?.appendixData);
  const deadlineData = validateDeadlineData(input?.deadlineData);
  const customerUserId = normalizeCustomerUserId(input?.customerUserId, stationId);

  if (!['standard', 'temporary'].includes(connectionType)) {
    throw new Error('Тип приєднання має бути звичайним або тимчасовим.');
  }

  if (!['draft', 'in_progress', 'completed', 'rejected'].includes(status)) {
    throw new Error('Некоректний статус заяви.');
  }

  return {
    stationId,
    applicationNumber,
    applicantFullName,
    phone,
    email,
    objectAddress,
    connectionType,
    status,
    receivedAt,
    responsibleName,
    notes,
    appendixData,
    deadlineData,
    customerUserId,
  };
}

function validateStagePayload(input) {
  const status = String(input?.status ?? 'not_started');
  const expectedAt = validateDateValue(input?.expectedAt, 'Очікуваний строк', { required: false });
  const dueAt = validateDateValue(input?.dueAt, 'Граничний строк', { required: false });
  const startedAt = validateDateValue(input?.startedAt, 'Дата початку', { required: false });
  const completedAt = validateDateValue(input?.completedAt, 'Дата виконання', { required: false });
  const publicNote = validateOptionalText(input?.publicNote, 2000, 'Коментар до етапу');
  const isVisible = Boolean(input?.isVisible);

  if (!['not_started', 'in_progress', 'completed', 'not_required'].includes(status)) {
    throw new Error('Некоректний статус етапу.');
  }

  if (status === 'completed' && !completedAt) {
    throw new Error('Для виконаного етапу потрібно вказати дату виконання.');
  }

  return {
    status,
    expectedAt,
    dueAt,
    startedAt,
    completedAt,
    publicNote,
    isVisible,
  };
}

function validateLookupPayload(input) {
  const phone = validatePhone(input?.phone ?? '');
  const fullName = String(input?.fullName ?? '').trim();
  const applicationNumber = String(input?.applicationNumber ?? '').trim();

  if (!fullName && !applicationNumber) {
    throw new Error('Вкажіть ПІБ або номер заяви.');
  }

  return {
    phone,
    fullName,
    applicationNumber,
  };
}

function validateCreateUserPayload(input, actor) {
  const fullName = validateFullName(input?.fullName ?? '');
  const password = validatePassword(input?.password ?? '');
  const role = actor.role === 'admin' ? String(input?.role ?? 'customer') : 'customer';

  if (!['manager', 'customer'].includes(role)) {
    throw new Error('Адмін може створювати менеджерів і замовників. Перший адмін створюється командою create-admin.');
  }

  const stationId = actor.role === 'admin'
    ? validateStationId(input?.stationId)
    : actor.stationId;

  return {
    fullName,
    password,
    role,
    stationId,
  };
}

function validateDeadlineRulePayload(input) {
  const amount = validateInteger(input?.amount, 'Кількість', { min: 0 });
  const unit = String(input?.unit ?? '');
  const warningDays = validateInteger(input?.warningDays, 'Днів до попередження', { min: 0 });

  if (!durationUnits.has(unit)) {
    throw new Error('Некоректна одиниця строку.');
  }

  return {
    amount,
    unit,
    warningDays,
    isActive: Boolean(input?.isActive),
  };
}

function validateStageTemplatePayload(input) {
  const expectedDaysType = String(input?.expectedDaysType ?? 'calendar_days');
  const dueDaysType = String(input?.dueDaysType ?? 'calendar_days');

  if (!durationUnits.has(expectedDaysType) || !durationUnits.has(dueDaysType)) {
    throw new Error('Некоректна одиниця строку етапу.');
  }

  return {
    title: validateRequiredText(input?.title, 3, 1200, 'Назва етапу'),
    description: validateOptionalText(input?.description, 2000, 'Опис етапу'),
    sortOrder: validateInteger(input?.sortOrder, 'Порядок етапу', { min: 1 }),
    defaultExpectedDays: validateInteger(input?.defaultExpectedDays, 'Типовий очікуваний строк', { min: 0 }),
    expectedDaysType,
    defaultDueDays: validateInteger(input?.defaultDueDays, 'Типовий граничний строк', { min: 0 }),
    dueDaysType,
    isActive: Boolean(input?.isActive),
  };
}

export function createApp({ clientUrl }) {
  const app = express();

  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.use((request, response, next) => {
    const token = request.cookies?.[sessionCookieName];

    if (!token) {
      request.auth = null;
      return next();
    }

    const session = getSessionUser(token);

    if (!session) {
      response.clearCookie(sessionCookieName);
      request.auth = null;
      return next();
    }

    request.auth = session;
    return next();
  });

  function requireAuth(request, response, next) {
    if (!request.auth?.user) {
      return sendError(response, 401, 'Потрібна авторизація.');
    }

    return next();
  }

  function requireAdmin(request, response, next) {
    if (request.auth?.user?.role !== 'admin') {
      return sendError(response, 403, 'Потрібна роль адміністратора.');
    }

    return next();
  }

  function requireStaff(request, response, next) {
    if (!['admin', 'manager'].includes(request.auth?.user?.role)) {
      return sendError(response, 403, 'Потрібна роль адміністратора або менеджера.');
    }

    return next();
  }

  function requireChatAccess(request, response, next) {
    const chatId = Number(request.params.chatId);

    if (!Number.isInteger(chatId) || chatId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор чату.');
    }

    const chat = getChatById(chatId);

    if (!chat) {
      return sendError(response, 404, 'Чат не знайдено.');
    }

    if (!canAccessChat(request.auth.user, chatId)) {
      return sendError(response, 403, 'Доступ до цього чату заборонено.');
    }

    request.chat = chat;
    return next();
  }

  function requireApplicationAccess(request, response, next) {
    const applicationId = Number(request.params.applicationId);

    if (!Number.isInteger(applicationId) || applicationId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор заяви.');
    }

    const application = getApplicationById(applicationId);

    if (!application) {
      return sendError(response, 404, 'Заяву не знайдено.');
    }

    if (!canAccessApplication(request.auth.user, applicationId)) {
      return sendError(response, 403, 'Доступ до цієї заяви заборонено.');
    }

    request.application = application;
    return next();
  }

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      message: 'Сервіс приєднання готовий',
      adminExists: hasAdmin(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/auth/me', (request, response) => {
    response.json({
      user: request.auth?.user ? userToClient(request.auth.user) : null,
    });
  });

  app.post('/api/auth/login', async (request, response) => {
    try {
      const fullName = validateFullName(request.body?.fullName ?? '');
      const password = validatePassword(request.body?.password ?? '');
      const user = findUserByFullName(fullName);

      if (!user) {
        return sendError(response, 401, "Невірні ім'я, прізвище або пароль.");
      }

      const isValid = await verifyPassword(password, user.password_hash);

      if (!isValid) {
        return sendError(response, 401, "Невірні ім'я, прізвище або пароль.");
      }

      const sessionToken = createSession(user.id);

      response.cookie(sessionCookieName, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: sessionDurationMs,
      });

      response.json({
        user: userToClient(user),
      });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.post('/api/auth/logout', (request, response) => {
    const token = request.cookies?.[sessionCookieName];

    if (token) {
      removeSession(token);
    }

    response.clearCookie(sessionCookieName);
    response.status(204).end();
  });

  app.post('/api/public/applications/lookup', (request, response) => {
    try {
      const payload = validateLookupPayload(request.body);
      const application = lookupPublicApplication(payload);

      if (!application) {
        return sendError(response, 404, 'Заяву не знайдено. Перевірте номер телефону, ПІБ або номер заяви.');
      }

      return response.json({
        application,
      });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.get('/api/users', requireAuth, requireStaff, (request, response) => {
    response.json({
      users: listUsersForUser(request.auth.user).map(userToClient),
    });
  });

  app.post('/api/users', requireAuth, requireStaff, async (request, response) => {
    try {
      const payload = validateCreateUserPayload(request.body, request.auth.user);
      const passwordHash = await hashPassword(payload.password);
      const user = createUser({
        fullName: payload.fullName,
        passwordHash,
        role: payload.role,
        stationId: payload.stationId,
        createdBy: request.auth.user.id,
        actor: request.auth.user,
      });

      response.status(201).json({
        user: userToClient(user),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return sendError(response, 409, "Користувач з таким ПІБ уже існує.");
      }

      return sendError(response, 400, error.message);
    }
  });

  app.delete('/api/users/:userId', requireAuth, requireStaff, (request, response) => {
    const userId = Number(request.params.userId);

    if (!Number.isInteger(userId) || userId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор користувача.');
    }

    const target = getUserById(userId);

    if (!target) {
      return sendError(response, 404, 'Користувача не знайдено.');
    }

    if (request.auth.user.role === 'manager' && (target.role !== 'customer' || target.stationId !== request.auth.user.stationId)) {
      return sendError(response, 403, 'Менеджер може видаляти лише замовників своєї станції.');
    }

    const deletedUser = deleteUser(userId, request.auth.user);

    if (!deletedUser) {
      return sendError(response, 404, 'Користувача не знайдено або його не можна видалити.');
    }

    return response.status(204).end();
  });

  app.get('/api/stations', requireAuth, requireStaff, (_request, response) => {
    response.json({
      stations: listStations(),
    });
  });

  app.post('/api/stations', requireAuth, requireAdmin, (request, response) => {
    try {
      const payload = validateStationPayload(request.body);
      const station = createStation(payload, request.auth.user);
      response.status(201).json({ station });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return sendError(response, 409, 'Станція/компанія з такою назвою вже існує.');
      }

      return sendError(response, 400, error.message);
    }
  });

  app.put('/api/stations/:stationId', requireAuth, requireAdmin, (request, response) => {
    try {
      const stationId = validateInteger(request.params.stationId, 'Ідентифікатор станції', { min: 1 });
      const payload = validateStationPayload(request.body);
      const station = updateStation(stationId, payload, request.auth.user);

      if (!station) {
        return sendError(response, 404, 'Станцію/компанію не знайдено.');
      }

      return response.json({ station });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return sendError(response, 409, 'Станція/компанія з такою назвою вже існує.');
      }

      return sendError(response, 400, error.message);
    }
  });

  app.get('/api/settings', requireAuth, requireAdmin, (_request, response) => {
    response.json({
      settings: listSettings(),
    });
  });

  app.put('/api/settings/:key', requireAuth, requireAdmin, (request, response) => {
    const value = validateOptionalText(request.body?.value, 5000, 'Значення параметра');
    const setting = updateSetting(request.params.key, value, request.auth.user);

    if (!setting) {
      return sendError(response, 404, 'Параметр не знайдено.');
    }

    return response.json({ setting });
  });

  app.get('/api/deadline-rules', requireAuth, requireAdmin, (_request, response) => {
    response.json({
      rules: listDeadlineRules(),
    });
  });

  app.put('/api/deadline-rules/:key', requireAuth, requireAdmin, (request, response) => {
    try {
      const payload = validateDeadlineRulePayload(request.body);
      const rule = updateDeadlineRule(request.params.key, payload, request.auth.user);

      if (!rule) {
        return sendError(response, 404, 'Правило строку не знайдено.');
      }

      return response.json({ rule });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.get('/api/stage-templates', requireAuth, requireAdmin, (_request, response) => {
    response.json({
      templates: listStageTemplates(),
    });
  });

  app.put('/api/stage-templates/:templateId', requireAuth, requireAdmin, (request, response) => {
    try {
      const templateId = validateInteger(request.params.templateId, 'Ідентифікатор шаблону етапу', { min: 1 });
      const payload = validateStageTemplatePayload(request.body);
      const template = updateStageTemplate(templateId, payload, request.auth.user);

      if (!template) {
        return sendError(response, 404, 'Шаблон етапу не знайдено.');
      }

      return response.json({ template });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.get('/api/audit-log', requireAuth, requireAdmin, (request, response) => {
    const limit = validateInteger(request.query.limit ?? 100, 'Кількість записів', { min: 1 });
    response.json({
      entries: listAuditLog(Math.min(limit, 300)),
    });
  });

  app.get('/api/applications', requireAuth, (request, response) => {
    response.json({
      applications: listApplicationsForUser(request.auth.user),
    });
  });

  app.post('/api/applications', requireAuth, requireStaff, (request, response) => {
    try {
      const payload = validateApplicationPayload(request.body, request.auth.user);
      const application = createApplication({
        ...payload,
        createdBy: request.auth.user.id,
      }, request.auth.user);

      response.status(201).json({
        application,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return sendError(response, 409, 'Заява з таким номером уже існує.');
      }

      return sendError(response, 400, error.message);
    }
  });

  app.get(
    '/api/applications/:applicationId',
    requireAuth,
    requireApplicationAccess,
    (request, response) => {
      response.json({
        application: request.application,
      });
    },
  );

  app.put(
    '/api/applications/:applicationId',
    requireAuth,
    requireStaff,
    requireApplicationAccess,
    (request, response) => {
      try {
        const payload = validateApplicationPayload(request.body, request.auth.user);
        const application = updateApplication(request.application.id, payload, request.auth.user);

        if (!application) {
          return sendError(response, 404, 'Заяву не знайдено.');
        }

        response.json({
          application,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return sendError(response, 409, 'Заява з таким номером уже існує.');
        }

        return sendError(response, 400, error.message);
      }
    },
  );

  app.delete(
    '/api/applications/:applicationId',
    requireAuth,
    requireStaff,
    requireApplicationAccess,
    async (request, response) => {
      const deletedApplication = deleteApplication(request.application.id, request.auth.user);

      if (!deletedApplication) {
        return sendError(response, 404, 'Заяву не знайдено.');
      }

      await removeStoredFiles(deletedApplication.storedFiles);
      return response.status(204).end();
    },
  );

  app.put(
    '/api/applications/:applicationId/stages/:stageId',
    requireAuth,
    requireStaff,
    requireApplicationAccess,
    (request, response) => {
      try {
        const stageId = Number(request.params.stageId);

        if (!Number.isInteger(stageId) || stageId < 1) {
          return sendError(response, 400, 'Некоректний ідентифікатор етапу.');
        }

        const payload = validateStagePayload(request.body);
        const application = updateApplicationStage(
          request.application.id,
          stageId,
          payload,
          request.auth.user,
        );

        if (!application) {
          return sendError(response, 404, 'Етап не знайдено.');
        }

        response.json({
          application,
        });
      } catch (error) {
        return sendError(response, 400, error.message);
      }
    },
  );

  app.post(
    '/api/applications/:applicationId/documents',
    requireAuth,
    requireStaff,
    requireApplicationAccess,
    async (request, response) => {
      try {
        const documentType = String(request.body?.documentType ?? '');

        if (!documentTypes.has(documentType)) {
          return sendError(response, 400, 'Некоректний тип документа.');
        }

        const generated = await generateApplicationDocument(request.application, documentType);
        const storedName = `${Date.now()}-${crypto.randomUUID()}-${generated.originalName}`;
        const filePath = path.join(generatedDocumentsDir, storedName);

        await fs.writeFile(filePath, generated.buffer);
        const document = createGeneratedDocumentRecord({
          applicationId: request.application.id,
          applicationNumber: request.application.applicationNumber,
          stationId: request.application.stationId,
          documentType,
          title: generated.title,
          storedName,
          originalName: generated.originalName,
          mimeType: generated.mimeType,
          size: generated.buffer.byteLength,
        }, request.auth.user);

        response.status(201).json({ document });
      } catch (error) {
        return sendError(response, 400, error.message);
      }
    },
  );

  app.get('/api/generated-documents/:documentId', requireAuth, (request, response) => {
    const documentId = Number(request.params.documentId);

    if (!Number.isInteger(documentId) || documentId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор документа.');
    }

    const document = getGeneratedDocumentById(documentId);

    if (!document) {
      return sendError(response, 404, 'Документ не знайдено.');
    }

    if (!canAccessGeneratedDocument(request.auth.user, document)) {
      return sendError(response, 403, 'Доступ до документа заборонено.');
    }

    return response.download(path.join(generatedDocumentsDir, document.storedName), document.originalName);
  });

  app.get('/api/chats', requireAuth, (request, response) => {
    response.json({
      chats: listChatsForUser(request.auth.user),
    });
  });

  app.post('/api/chats', requireAuth, requireStaff, (request, response) => {
    try {
      const { title, description, stationId } = validateChatPayload(request.body, request.auth.user);
      const chat = createChat({
        title,
        description,
        stationId,
        createdBy: request.auth.user.id,
      });

      response.status(201).json({
        chat,
      });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.delete('/api/chats/:chatId', requireAuth, requireStaff, async (request, response) => {
    const chatId = Number(request.params.chatId);

    if (!Number.isInteger(chatId) || chatId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор чату.');
    }

    if (!canAccessChat(request.auth.user, chatId)) {
      return sendError(response, 403, 'Доступ до цього чату заборонено.');
    }

    const deletedChat = deleteChat(chatId);

    if (!deletedChat) {
      return sendError(response, 404, 'Чат не знайдено.');
    }

    await removeStoredFiles(deletedChat.storedFiles);
    return response.status(204).end();
  });

  app.put('/api/chats/:chatId/access', requireAuth, requireStaff, (request, response) => {
    try {
      const chatId = Number(request.params.chatId);

      if (!Number.isInteger(chatId) || chatId < 1) {
        return sendError(response, 400, 'Некоректний ідентифікатор чату.');
      }

      const chat = getChatById(chatId);

      if (!chat) {
        return sendError(response, 404, 'Чат не знайдено.');
      }

      if (!canAccessChat(request.auth.user, chatId)) {
        return sendError(response, 403, 'Доступ до цього чату заборонено.');
      }

      const userIds = normalizeUserIds(request.body?.userIds, request.auth.user);
      const updatedChat = replaceChatAccess(chatId, userIds);

      response.json({
        chat: updatedChat,
      });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.get(
    '/api/chats/:chatId/messages',
    requireAuth,
    requireChatAccess,
    (request, response) => {
      response.json({
        chat: request.chat,
        messages: listMessages(request.chat.id),
      });
    },
  );

  app.post(
    '/api/chats/:chatId/messages',
    requireAuth,
    requireChatAccess,
    upload.array('files'),
    async (request, response) => {
      try {
        const body = validateMessageBody(request.body?.body ?? '');
        const uploadedFiles = request.files ?? [];

        if (!body && uploadedFiles.length === 0) {
          await removeUploadedFiles(uploadedFiles);
          return sendError(response, 400, 'Додайте текст або прикріпіть хоча б один файл.');
        }

        createMessage({
          chatId: request.chat.id,
          userId: request.auth.user.id,
          body,
          files: uploadedFiles.map((file) => ({
            originalName: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype || 'application/octet-stream',
            size: file.size,
          })),
        });

        response.status(201).json({
          ok: true,
        });
      } catch (error) {
        await removeUploadedFiles(request.files ?? []);
        return sendError(response, 400, error.message);
      }
    },
  );

  app.get('/api/files/:attachmentId', requireAuth, (request, response) => {
    const attachmentId = Number(request.params.attachmentId);

    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор вкладення.');
    }

    const attachment = getAttachmentById(attachmentId);

    if (!attachment) {
      return sendError(response, 404, 'Вкладення не знайдено.');
    }

    if (!canAccessChat(request.auth.user, attachment.chatId)) {
      return sendError(response, 403, 'Доступ до цього файлу заборонено.');
    }

    const filePath = path.join(uploadsDir, attachment.storedName);
    return response.download(filePath, attachment.originalName);
  });

  app.use(async (error, request, response, _next) => {
    await removeUploadedFiles(request.files ?? []);

    if (error?.code === 'LIMIT_FILE_SIZE') {
      return sendError(response, 400, 'Один із файлів занадто великий.');
    }

    if (error?.code === 'LIMIT_FILE_COUNT') {
      return sendError(response, 400, 'До одного повідомлення прикріплено забагато файлів.');
    }

    console.error(error);
    return sendError(response, 500, 'Внутрішня помилка сервера.');
  });

  return app;
}
