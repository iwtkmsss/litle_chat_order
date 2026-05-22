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
  acceptPendingApplication,
  activatePendingApplicationAccess,
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
  getPendingApplicationSession,
  getSessionUser,
  getActiveStationByRegion,
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
  recordAuditLog,
  registerCustomerApplication,
  removeSession,
  removePendingApplicationSession,
  replaceChatAccess,
  resubmitPendingApplication,
  revealCustomerAccessCredentials,
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
  pendingSessionCookieName,
  sessionCookieName,
  sessionDurationMs,
  uploadsDir,
} from './config.js';
import { generateApplicationDocument } from './documentGenerator.js';
import {
  QUESTIONNAIRE_FIELD_LIMITS,
  normalizeQuestionnaireType,
  sanitizeQuestionnairePayload,
} from './applicationFormSchema.js';
import { isValidApplicationStatus } from './applicationStatusWorkflow.js';
import { normalizeRegion } from './ukraineRegions.js';
import { removeStoredFiles, removeUploadedFiles, upload } from './uploads.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const documentTypes = new Set(['appendix1', 'appendix2', 'appendix3', 'appendix4', 'appendix5']);
const durationUnits = new Set(['calendar_days', 'business_days', 'months']);
const statusLookupAttempts = new Map();
const statusLookupWindowMs = 10 * 60 * 1000;
const statusLookupMaxAttempts = 8;

function isUniqueConstraintError(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function sendError(response, status, message) {
  response.status(status).json({ error: message });
}

function getStatusLookupRateKey(request, payload) {
  const email = String(payload?.email ?? request.body?.email ?? '').trim().toLowerCase();
  const applicationNumber = String(payload?.applicationNumber ?? request.body?.applicationNumber ?? '').trim().toLowerCase();
  return `${request.ip ?? 'unknown'}:${email}:${applicationNumber}`;
}

function isStatusLookupRateLimited(key) {
  const now = Date.now();
  const bucket = statusLookupAttempts.get(key) ?? [];
  const recentAttempts = bucket.filter((timestamp) => now - timestamp < statusLookupWindowMs);

  if (recentAttempts.length >= statusLookupMaxAttempts) {
    statusLookupAttempts.set(key, recentAttempts);
    return true;
  }

  recentAttempts.push(now);
  statusLookupAttempts.set(key, recentAttempts);
  return false;
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

function validatePublicUkrainianPhone(value) {
  const phone = validateRequiredText(value, 13, 24, 'Номер телефону');
  const digits = phone.replace(/\D/g, '');
  let localDigits = '';

  if (digits.startsWith('380')) {
    localDigits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    localDigits = digits.slice(1);
  } else {
    localDigits = digits;
  }

  if (localDigits.length !== 9) {
    throw new Error('Введіть номер телефону у форматі +380 XX XXX XX XX.');
  }

  return `+380${localDigits}`;
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

function generateTemporaryPassword(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';

  for (let index = 0; index < length; index += 1) {
    password += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return password;
}

function getRequestMetadata(request) {
  return {
    ip: request.ip ?? '',
    userAgent: request.get('user-agent') ?? '',
  };
}

function validateStationPayload(input) {
  const region = input?.region ? normalizeRegion(input.region) : '';

  if (input?.region && !region) {
    throw new Error('Оберіть коректну область обслуговування.');
  }

  return {
    name: validateRequiredText(input?.name, 2, 180, 'Назва станції/компанії'),
    edrpou: validateOptionalText(input?.edrpou, 30, 'ЄДРПОУ'),
    address: validateOptionalText(input?.address, 500, 'Адреса'),
    phone: validateOptionalText(input?.phone, 80, 'Телефон'),
    email: validateEmail(input?.email),
    directorName: validateOptionalText(input?.directorName, 180, 'ПІБ керівника'),
    region,
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

function validateQuestionnairePayload(input) {
  const questionnaireType = normalizeQuestionnaireType(input?.type);
  const sanitized = sanitizeQuestionnairePayload(questionnaireType, input);

  return Object.fromEntries(
    Object.entries(sanitized).map(([key, value]) => [
      key,
      key === 'type'
        ? value
        : validateOptionalText(value, QUESTIONNAIRE_FIELD_LIMITS[key] ?? 1200, key),
    ]),
  );
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
    questionnaire: validateQuestionnairePayload(data.questionnaire),
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

function validateApplicationPayload(input, actor, { defaultStatus = 'submitted' } = {}) {
  const stationId = actor.role === 'admin'
    ? validateStationId(input?.stationId)
    : actor.stationId;
  const applicationNumber = validateOptionalText(input?.applicationNumber, 80, 'Номер заяви');
  const applicantFullName = validateFullName(input?.applicantFullName ?? '');
  const phone = validatePhone(input?.phone ?? '');
  const email = validateEmail(input?.email ?? '');
  const objectAddress = validateRequiredText(input?.objectAddress, 3, 500, 'Адреса або назва об’єкта');
  const connectionType = String(input?.connectionType ?? 'standard');
  const status = String(input?.status ?? defaultStatus);
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

  if (!isValidApplicationStatus(status)) {
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
    statusComment: validateOptionalText(input?.statusComment, 2000, 'Коментар до статусу'),
  };
}

function validateStagePayload(input) {
  const status = String(input?.status ?? 'not_started');
  const expectedAt = validateDateValue(input?.expectedAt, 'Очікуваний строк', { required: false });
  const dueAt = validateDateValue(input?.dueAt, 'Граничний строк', { required: false });
  const startedAt = validateDateValue(input?.startedAt, 'Дата початку', { required: false });
  let completedAt = validateDateValue(input?.completedAt, 'Дата виконання', { required: false });
  const publicNote = validateOptionalText(input?.publicNote, 2000, 'Коментар до етапу');
  const isVisible = Boolean(input?.isVisible);

  if (!['not_started', 'in_progress', 'completed', 'not_required'].includes(status)) {
    throw new Error('Некоректний статус етапу.');
  }

  if (status === 'completed' && !completedAt) {
    completedAt = new Date().toISOString().slice(0, 10);
  }

  if (status !== 'completed') {
    completedAt = null;
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
  const email = validateEmail(input?.email ?? '', { required: true });
  const applicationNumber = String(input?.applicationNumber ?? '').trim();

  if (!applicationNumber) {
    throw new Error('Вкажіть номер заяви.');
  }

  return {
    email,
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

function validatePublicRegistrationPayload(input) {
  const objectRegion = normalizeRegion(input?.objectRegion);

  if (!objectRegion) {
    throw new Error('Оберіть область, у якій розташований об’єкт підключення.');
  }

  const station = getActiveStationByRegion(objectRegion);

  if (!station) {
    throw new Error('Наразі для обраної області немає доступного відповідального менеджера. Заяву неможливо подати через електронний сервіс.');
  }

  const stationId = station.id;
  const fullName = validateFullName(input?.fullName ?? '');
  const phone = validatePublicUkrainianPhone(input?.phone ?? '');
  const email = validateEmail(input?.email ?? '', { required: true });
  const objectAddress = validateRequiredText(input?.objectAddress, 3, 500, 'Адреса або назва об’єкта');
  const connectionType = String(input?.connectionType ?? 'standard');
  const mailingAddress = validateRequiredText(input?.mailingAddress, 3, 700, 'Адреса для листування');
  const objectName = validateRequiredText(input?.objectName || objectAddress, 3, 700, 'Об’єкт у заяві');
  const connectionReason = validateOptionalText(input?.connectionReason, 700, 'Причина приєднання');
  const notes = validateOptionalText(input?.notes, 5000, 'Примітки');
  const questionnaireType = normalizeQuestionnaireType(input?.questionnaireType ?? input?.type);

  if (!['standard', 'temporary'].includes(connectionType)) {
    throw new Error('Тип приєднання має бути звичайним або тимчасовим.');
  }

  const appendixData = validateAppendixData({
    appendix3: {
      mailingAddress,
      objectName,
      connectionReason,
      representativeName: fullName,
      representativePhone: phone,
      representativeEmail: email,
    },
    questionnaire: {
      ...input,
      type: questionnaireType,
      customerName: input?.customerName || fullName,
      customerAddress: input?.customerAddress || mailingAddress,
      customerEmail: input?.customerEmail || email,
      customerPhone: input?.customerPhone || phone,
      objectName,
      objectAddress,
      objectRegion,
      notificationMethod: input?.notificationMethod || email,
    },
  });

  return {
    stationId,
    fullName,
    applicantFullName: fullName,
    phone,
    email,
    objectAddress,
    objectRegion,
    connectionType,
    receivedAt: new Date().toISOString().slice(0, 10),
    responsibleName: '',
    notes,
    appendixData,
  };
}

function validateCustomerApplicationPayload(input, user) {
  const stationId = validateStationId(input?.stationId || user.stationId);
  const fullName = validateFullName(user.fullName ?? user.full_name ?? '');
  const phone = validatePhone(input?.phone ?? '');
  const email = validateEmail(input?.email ?? '', { required: true });
  const objectAddress = validateRequiredText(input?.objectAddress, 3, 500, 'Адреса або назва об’єкта');
  const connectionType = String(input?.connectionType ?? 'standard');
  const mailingAddress = validateRequiredText(input?.mailingAddress, 3, 700, 'Адреса для листування');
  const objectName = validateRequiredText(input?.objectName || objectAddress, 3, 700, 'Об’єкт у заяві');
  const connectionReason = validateOptionalText(input?.connectionReason, 700, 'Причина приєднання');
  const notes = validateOptionalText(input?.notes, 5000, 'Примітки');
  const questionnaireType = normalizeQuestionnaireType(input?.questionnaireType ?? input?.type);

  if (!['standard', 'temporary'].includes(connectionType)) {
    throw new Error('Тип приєднання має бути звичайним або тимчасовим.');
  }

  const appendixData = validateAppendixData({
    appendix3: {
      mailingAddress,
      objectName,
      connectionReason,
      representativeName: fullName,
      representativePhone: phone,
      representativeEmail: email,
    },
    questionnaire: {
      ...input,
      type: questionnaireType,
      customerName: input?.customerName || fullName,
      customerAddress: input?.customerAddress || mailingAddress,
      customerEmail: input?.customerEmail || email,
      customerPhone: input?.customerPhone || phone,
      objectName,
      objectAddress,
      notificationMethod: input?.notificationMethod || email,
    },
  });

  return {
    stationId,
    applicationNumber: '',
    applicantFullName: fullName,
    phone,
    email,
    objectAddress,
    connectionType,
    status: 'submitted',
    receivedAt: new Date().toISOString().slice(0, 10),
    responsibleName: '',
    notes,
    appendixData,
    deadlineData: {},
    customerUserId: user.id,
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
    isOptional: Boolean(input?.isOptional),
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
    const pendingToken = request.cookies?.[pendingSessionCookieName];
    request.pendingAccess = null;

    if (!token) {
      request.auth = null;
    } else {
      const session = getSessionUser(token);

      if (!session) {
        response.clearCookie(sessionCookieName);
        request.auth = null;
      } else {
        request.auth = session;
      }
    }

    if (pendingToken) {
      const pendingSession = getPendingApplicationSession(pendingToken);

      if (!pendingSession) {
        response.clearCookie(pendingSessionCookieName);
      } else {
        request.pendingAccess = pendingSession;
      }
    }

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

  function requireCustomer(request, response, next) {
    if (request.auth?.user?.role !== 'customer') {
      return sendError(response, 403, 'Потрібна роль замовника.');
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

    request.application = request.auth.user.role === 'customer'
      ? getApplicationById(applicationId, {
        includeHiddenStages: false,
        includePrivate: true,
        includePrivateStatusHistory: false,
        includeNotifications: false,
      })
      : application;
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
      pendingAccess: request.auth?.user ? null : request.pendingAccess
        ? {
          applicationId: request.pendingAccess.application.id,
          applicationNumber: request.pendingAccess.application.applicationNumber,
          path: '/application-access/session',
        }
        : null,
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

    const pendingToken = request.cookies?.[pendingSessionCookieName];

    if (pendingToken) {
      removePendingApplicationSession(pendingToken);
    }

    response.clearCookie(sessionCookieName);
    response.clearCookie(pendingSessionCookieName);
    response.status(204).end();
  });

  app.get('/api/public/stations', (_request, response) => {
    response.json({
      stations: listStations()
        .filter((station) => station.isActive)
        .map((station) => ({
          id: station.id,
          name: station.name,
        })),
    });
  });

  app.post('/api/public/register', async (request, response) => {
    try {
      const payload = validatePublicRegistrationPayload(request.body);
      const result = registerCustomerApplication(payload, getRequestMetadata(request));

      response.cookie(pendingSessionCookieName, result.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: sessionDurationMs,
      });

      response.status(201).json({
        application: result.application,
        accessToken: result.accessToken,
        accessPath: `/application-access/${result.accessToken}`,
        pendingAccess: {
          applicationId: result.application.id,
          applicationNumber: result.application.applicationNumber,
          path: '/application-access/session',
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return sendError(response, 409, 'Не вдалося створити тимчасовий доступ. Спробуйте подати заяву ще раз.');
      }

      return sendError(response, 400, error.message);
    }
  });

  app.post('/api/public/applications/lookup', (request, response) => {
    try {
      const payload = validateLookupPayload(request.body);
      const rateKey = getStatusLookupRateKey(request, payload);

      if (isStatusLookupRateLimited(rateKey)) {
        recordAuditLog({
          actor: { role: 'guest', fullName: 'Публічна перевірка' },
          entityType: 'application',
          entityId: payload.applicationNumber || 'unknown',
          action: 'status_lookup_rate_limited',
          summary: 'Публічну перевірку заяви обмежено через забагато спроб.',
          after: {
            applicationNumber: payload.applicationNumber,
            ip: request.ip ?? '',
          },
        });
        return sendError(response, 429, 'Забагато спроб перевірки. Спробуйте пізніше.');
      }

      const result = lookupPublicApplication(payload, getRequestMetadata(request));

      if (!result) {
        recordAuditLog({
          actor: { role: 'guest', fullName: 'Публічна перевірка' },
          entityType: 'application',
          entityId: payload.applicationNumber || 'unknown',
          action: 'status_lookup_failed',
          summary: 'Публічна перевірка заяви не знайшла збіг за номером заяви та email.',
          after: { applicationNumber: payload.applicationNumber },
        });
        return sendError(response, 404, 'Заявку не знайдено. Перевірте номер заявки та email.');
      }

      if (result.sessionToken) {
        response.cookie(pendingSessionCookieName, result.sessionToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: sessionDurationMs,
        });
      }

      return response.json({
        application: result.application,
        requiresLogin: result.requiresLogin,
        accessPath: result.sessionToken ? '/application-access/session' : '',
      });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.post('/api/public/application-access/:token', (request, response) => {
    if (request.auth?.user) {
      return sendError(response, 409, 'Ви вже увійшли в систему. Тимчасовий доступ не змішується з особистим кабінетом.');
    }

    const token = String(request.params.token ?? '').trim();

    if (!token || token === 'session') {
      return sendError(response, 400, 'Некоректне посилання тимчасового доступу.');
    }

    const result = activatePendingApplicationAccess(token, getRequestMetadata(request));

    if (!result) {
      return sendError(response, 404, 'Посилання недійсне або заявка вже прийнята. Якщо заявку прийнято, увійдіть в особистий кабінет через сторінку входу.');
    }

    response.cookie(pendingSessionCookieName, result.sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionDurationMs,
    });

    return response.json({
      application: result.application,
      pendingAccess: {
        applicationId: result.application.id,
        applicationNumber: result.application.applicationNumber,
        path: '/application-access/session',
      },
    });
  });

  app.get('/api/pending/application', (request, response) => {
    if (request.auth?.user) {
      return sendError(response, 403, 'Тимчасовий доступ недоступний під час входу в основний кабінет.');
    }

    if (!request.pendingAccess?.application) {
      return sendError(response, 401, 'Потрібен тимчасовий доступ до заявки.');
    }

    recordAuditLog({
      actor: { role: 'pending_application', fullName: request.pendingAccess.application.applicantFullName },
      stationId: request.pendingAccess.application.stationId,
      entityType: 'application',
      entityId: request.pendingAccess.application.id,
      action: 'pending_view',
      summary: `Відкрито тимчасовий кабінет заяви ${request.pendingAccess.application.applicationNumber}.`,
      after: { applicationNumber: request.pendingAccess.application.applicationNumber },
    });

    return response.json({
      application: request.pendingAccess.application,
    });
  });

  app.put('/api/pending/application', (request, response) => {
    if (request.auth?.user) {
      return sendError(response, 403, 'Тимчасовий доступ недоступний під час входу в основний кабінет.');
    }

    if (!request.pendingAccess?.application) {
      return sendError(response, 401, 'Потрібен тимчасовий доступ до заявки.');
    }

    try {
      const payload = validatePublicRegistrationPayload(request.body);
      const application = resubmitPendingApplication(request.pendingAccess.application.id, payload);

      response.json({
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

  app.delete('/api/users/:userId', requireAuth, requireAdmin, (request, response) => {
    const userId = Number(request.params.userId);

    if (!Number.isInteger(userId) || userId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор користувача.');
    }

    const target = getUserById(userId);

    if (!target) {
      return sendError(response, 404, 'Користувача не знайдено.');
    }

    const deletedUser = deleteUser(userId, request.auth.user);

    if (!deletedUser) {
      return sendError(response, 404, 'Користувача не знайдено або його не можна видалити.');
    }

    return response.status(204).end();
  });

  app.get('/api/stations', requireAuth, requireStaff, (request, response) => {
    const stations = request.auth.user.role === 'admin'
      ? listStations()
      : listStations().filter((station) => station.id === request.auth.user.stationId);

    response.json({
      stations,
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

  app.post('/api/customer/applications', requireAuth, requireCustomer, (request, response) => {
    try {
      const payload = validateCustomerApplicationPayload(request.body, request.auth.user);
      const application = createApplication({
        ...payload,
        createdBy: request.auth.user.id,
      }, request.auth.user);
      const safeApplication = getApplicationById(application.id, {
        includeHiddenStages: false,
        includePrivate: true,
        includePrivateStatusHistory: false,
        includeNotifications: false,
      });

      response.status(201).json({
        application: safeApplication,
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

  app.post(
    '/api/applications/:applicationId/customer-access/reveal',
    requireAuth,
    requireStaff,
    requireApplicationAccess,
    (request, response) => {
      if (!request.application.customerUserId) {
        return sendError(response, 400, 'Особистий кабінет замовника ще не створено.');
      }

      const credentials = revealCustomerAccessCredentials(request.application.id, request.auth.user);

      if (!credentials) {
        return sendError(response, 404, 'Заяву не знайдено.');
      }

      if (!credentials.temporaryPassword) {
        return sendError(response, 404, 'Тимчасовий пароль недоступний.');
      }

      return response.json({
        login: credentials.login,
        temporaryPassword: credentials.temporaryPassword,
        notification: credentials.notification,
      });
    },
  );

  app.put(
    '/api/applications/:applicationId',
    requireAuth,
    requireStaff,
    requireApplicationAccess,
    async (request, response) => {
      try {
        const payload = validateApplicationPayload(request.body, request.auth.user, {
          defaultStatus: request.application.status,
        });
        const isAcceptingPendingApplication =
          !request.application.customerUserId
          && request.application.status !== 'accepted'
          && payload.status === 'accepted';

        if (isAcceptingPendingApplication) {
          const temporaryPassword = generateTemporaryPassword(6);
          const passwordHash = await hashPassword(temporaryPassword);
          const result = acceptPendingApplication(request.application.id, {
            actor: request.auth.user,
            passwordHash,
            temporaryPassword,
          });

          if (!result) {
            return sendError(response, 404, 'Заяву не знайдено.');
          }

          return response.json({
            application: result.application,
            accessPrepared: true,
            createdUser: result.createdUser,
          });
        }

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
    requireAdmin,
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

        const questionnaireType = normalizeQuestionnaireType(request.application.appendixData?.questionnaire?.type);

        if (documentType === 'appendix4' && questionnaireType !== 'heat_use') {
          return sendError(response, 400, 'Додаток 4 формується для тепловикористальної установки. Для цієї заявки оберіть Додаток 5.');
        }

        if (documentType === 'appendix5' && questionnaireType !== 'generation') {
          return sendError(response, 400, 'Додаток 5 формується для теплогенеруючої / когенераційної установки. Для цієї заявки оберіть Додаток 4.');
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
