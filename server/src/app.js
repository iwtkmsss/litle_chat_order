import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import {
  createApplication,
  createChat,
  deleteChat,
  deleteApplication,
  deleteUser,
  createMessage,
  createSession,
  createUser,
  findUserByFullName,
  getApplicationById,
  getAttachmentById,
  getChatById,
  getSessionUser,
  getUserById,
  hasManager,
  listApplicationsForUser,
  listChatsForUser,
  listMessages,
  listUsers,
  lookupPublicApplication,
  removeSession,
  updateApplication,
  updateApplicationStage,
  replaceChatAccess,
  canAccessApplication,
  canAccessChat,
} from './database.js';
import {
  hashPassword,
  userToClient,
  validateFullName,
  validatePassword,
  verifyPassword,
} from './auth.js';
import { sessionCookieName, sessionDurationMs, uploadsDir } from './config.js';
import { removeStoredFiles, removeUploadedFiles, upload } from './uploads.js';

function isUniqueConstraintError(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function sendError(response, status, message) {
  response.status(status).json({ error: message });
}

function validateChatPayload(input) {
  const title = String(input?.title ?? '').trim();
  const description = String(input?.description ?? '').trim();

  if (title.length < 3) {
    throw new Error('Назва чату має містити щонайменше 3 символи.');
  }

  if (title.length > 120) {
    throw new Error('Назва чату має містити не більше 120 символів.');
  }

  if (description.length > 3000) {
    throw new Error('Опис чату має містити не більше 3000 символів.');
  }

  return {
    title,
    description,
  };
}

function validateMessageBody(input) {
  const body = String(input ?? '').trim();

  if (body.length > 10000) {
    throw new Error('Текст повідомлення має містити не більше 10000 символів.');
  }

  return body;
}

function normalizeUserIds(value) {
  if (!Array.isArray(value)) {
    throw new Error('Поле userIds має бути масивом.');
  }

  return [...new Set(value.map((item) => Number(item)).filter(Number.isInteger))];
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

function validateEmail(value) {
  const email = validateOptionalText(value, 160, 'Email').toLowerCase();

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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} має бути у форматі РРРР-ММ-ДД.`);
  }

  return date;
}

function normalizeOptionalUserId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const userId = Number(value);

  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error('Некоректний ідентифікатор кабінету замовника.');
  }

  const user = getUserById(userId);

  if (!user || user.role !== 'user' || user.deleted_at) {
    throw new Error('Обраний кабінет замовника не знайдено.');
  }

  return userId;
}

function validateApplicationPayload(input) {
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
  const customerUserId = normalizeOptionalUserId(input?.customerUserId);

  if (!['standard', 'temporary'].includes(connectionType)) {
    throw new Error('Тип приєднання має бути звичайним або тимчасовим.');
  }

  if (!['draft', 'in_progress', 'completed', 'rejected'].includes(status)) {
    throw new Error('Некоректний статус заяви.');
  }

  return {
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
    customerUserId,
  };
}

function validateStagePayload(input) {
  const status = String(input?.status ?? 'not_started');
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

export function createApp({ clientUrl }) {
  const app = express();

  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());

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

  function requireManager(request, response, next) {
    if (request.auth?.user?.role !== 'manager') {
      return sendError(response, 403, 'Потрібна роль менеджера.');
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
      message: 'Chat API готовий',
      managerExists: hasManager(),
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

  app.get('/api/users', requireAuth, requireManager, (_request, response) => {
    response.json({
      users: listUsers(),
    });
  });

  app.post('/api/users', requireAuth, requireManager, async (request, response) => {
    try {
      const fullName = validateFullName(request.body?.fullName ?? '');
      const password = validatePassword(request.body?.password ?? '');
      const passwordHash = await hashPassword(password);
      const user = createUser({
        fullName,
        passwordHash,
        role: 'user',
      });

      response.status(201).json({
        user: userToClient(user),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return sendError(response, 409, "Користувач з таким ім'ям та прізвищем уже існує.");
      }

      return sendError(response, 400, error.message);
    }
  });

  app.delete('/api/users/:userId', requireAuth, requireManager, (request, response) => {
    const userId = Number(request.params.userId);

    if (!Number.isInteger(userId) || userId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор користувача.');
    }

    const deletedUser = deleteUser(userId);

    if (!deletedUser) {
      return sendError(response, 404, 'Користувача не знайдено.');
    }

    return response.status(204).end();
  });

  app.get('/api/applications', requireAuth, (request, response) => {
    response.json({
      applications: listApplicationsForUser(request.auth.user),
    });
  });

  app.post('/api/applications', requireAuth, requireManager, (request, response) => {
    try {
      const payload = validateApplicationPayload(request.body);
      const application = createApplication({
        ...payload,
        createdBy: request.auth.user.id,
      });

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
    requireManager,
    requireApplicationAccess,
    (request, response) => {
      try {
        const payload = validateApplicationPayload(request.body);
        const application = updateApplication(request.application.id, payload);

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
    requireManager,
    requireApplicationAccess,
    async (request, response) => {
      const deletedApplication = deleteApplication(request.application.id);

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
    requireManager,
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

  app.get('/api/chats', requireAuth, (request, response) => {
    response.json({
      chats: listChatsForUser(request.auth.user),
    });
  });

  app.post('/api/chats', requireAuth, requireManager, (request, response) => {
    try {
      const { title, description } = validateChatPayload(request.body);
      const chat = createChat({
        title,
        description,
        createdBy: request.auth.user.id,
      });

      response.status(201).json({
        chat,
      });
    } catch (error) {
      return sendError(response, 400, error.message);
    }
  });

  app.delete('/api/chats/:chatId', requireAuth, requireManager, async (request, response) => {
    const chatId = Number(request.params.chatId);

    if (!Number.isInteger(chatId) || chatId < 1) {
      return sendError(response, 400, 'Некоректний ідентифікатор чату.');
    }

    const deletedChat = deleteChat(chatId);

    if (!deletedChat) {
      return sendError(response, 404, 'Чат не знайдено.');
    }

    await removeStoredFiles(deletedChat.storedFiles);
    return response.status(204).end();
  });

  app.put('/api/chats/:chatId/access', requireAuth, requireManager, (request, response) => {
    try {
      const chatId = Number(request.params.chatId);

      if (!Number.isInteger(chatId) || chatId < 1) {
        return sendError(response, 400, 'Некоректний ідентифікатор чату.');
      }

      const chat = getChatById(chatId);

      if (!chat) {
        return sendError(response, 404, 'Чат не знайдено.');
      }

      const userIds = normalizeUserIds(request.body?.userIds);
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
