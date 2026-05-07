import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createSessionToken, normalizeLoginKey } from './auth.js';
import { dataDir, databasePath, uploadsDir } from './config.js';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    full_name_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'user')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_number TEXT NOT NULL UNIQUE,
    applicant_full_name TEXT NOT NULL,
    applicant_full_name_normalized TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_normalized TEXT NOT NULL,
    email TEXT NOT NULL,
    object_address TEXT NOT NULL,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('standard', 'temporary')),
    status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'completed', 'rejected')),
    received_at TEXT NOT NULL,
    responsible_name TEXT NOT NULL,
    notes TEXT NOT NULL,
    appendix_data TEXT NOT NULL DEFAULT '{}',
    customer_user_id INTEGER,
    chat_id INTEGER NOT NULL UNIQUE,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS application_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    stage_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed', 'not_required')),
    started_at TEXT,
    completed_at TEXT,
    public_note TEXT NOT NULL,
    is_visible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (application_id, stage_key),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    stage_id INTEGER,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('prepared', 'skipped', 'sent')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (stage_id) REFERENCES application_stages(id) ON DELETE SET NULL
  );
`);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all();

if (!userColumns.some((column) => column.name === 'deleted_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN deleted_at TEXT`);
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

ensureColumn('applications', 'appendix_data', "appendix_data TEXT NOT NULL DEFAULT '{}'");

export const connectionStageTemplates = [
  {
    key: 'contract_terms_invoice_ready',
    title: 'Готовність проекту договору на приєднання, проекту технічних умов на приєднання та рахунку щодо оплати вартості послуги з надання замовнику технічних умов на приєднання.',
    description: 'Етап підготовки проекту договору, технічних умов та рахунку на оплату послуги з надання технічних умов.',
  },
  {
    key: 'land_relations_design',
    title: 'Проектування та здійснення заходів стосовно оформлення земельних відносин щодо траси прокладання МО (мереж Оператора) (за необхідності).',
    description: 'Оформлення земельних питань щодо траси прокладання мереж Оператора, якщо це потрібно для конкретного об’єкта.',
  },
  {
    key: 'urban_conditions',
    title: 'Отримання містобудівних умов та обмежень забудови земельної ділянки, де планується прокладання МО (за необхідності).',
    description: 'Етап отримання містобудівних умов та обмежень для земельної ділянки, якщо цього потребує процедура приєднання.',
  },
  {
    key: 'engineering_surveys',
    title: 'Виконання інженерних вишукувань.',
    description: 'Виконання інженерних вишукувань для підготовки проектної документації.',
  },
  {
    key: 'network_project_estimate',
    title: 'Розробка та затвердження проекту МО та його кошторисної частини.',
    description: 'Розробка та затвердження проекту мереж Оператора і кошторисної частини проекту.',
  },
  {
    key: 'project_expertise_approval',
    title: 'Експертиза та погодження проектної документації з іншими заінтересованими сторонами.',
    description: 'Проведення експертизи і погодження проектної документації із заінтересованими сторонами.',
  },
  {
    key: 'customer_network_connection',
    title: 'Підключення МЗ (мереж Замовника).',
    description: 'Підключення мереж Замовника до теплових мереж Оператора.',
  },
  {
    key: 'primary_heat_carrier_launch',
    title: 'Первинний пуск теплоносія.',
    description: 'Первинний пуск теплоносія після виконання необхідних робіт та погоджень.',
  },
];

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

const createUserStatement = db.prepare(`
  INSERT INTO users (full_name, full_name_normalized, password_hash, role, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const findUserByNormalizedNameStatement = db.prepare(`
  SELECT id, full_name, full_name_normalized, password_hash, role, created_at, deleted_at
  FROM users
  WHERE full_name_normalized = ? AND deleted_at IS NULL
`);

const getUserByIdStatement = db.prepare(`
  SELECT id, full_name, full_name_normalized, password_hash, role, created_at, deleted_at
  FROM users
  WHERE id = ?
`);

const listUsersStatement = db.prepare(`
  SELECT id, full_name, role, created_at
  FROM users
  WHERE role = 'user' AND deleted_at IS NULL
  ORDER BY full_name COLLATE NOCASE ASC
`);

const managerCountStatement = db.prepare(`
  SELECT COUNT(*) AS count
  FROM users
  WHERE role = 'manager'
`);

const createSessionStatement = db.prepare(`
  INSERT INTO sessions (token, user_id, created_at, last_seen_at)
  VALUES (?, ?, ?, ?)
`);

const findSessionStatement = db.prepare(`
  SELECT sessions.token, sessions.user_id, users.id, users.full_name, users.role, users.created_at
  FROM sessions
  JOIN users ON users.id = sessions.user_id
  WHERE sessions.token = ? AND users.deleted_at IS NULL
`);

const updateSessionSeenStatement = db.prepare(`
  UPDATE sessions
  SET last_seen_at = ?
  WHERE token = ?
`);

const deleteSessionStatement = db.prepare(`
  DELETE FROM sessions
  WHERE token = ?
`);

const createChatStatement = db.prepare(`
  INSERT INTO chats (title, description, created_by, created_at)
  VALUES (?, ?, ?, ?)
`);

const updateChatStatement = db.prepare(`
  UPDATE chats
  SET title = ?, description = ?
  WHERE id = ?
`);

const getChatByIdStatement = db.prepare(`
  SELECT id, title, description, created_by, created_at
  FROM chats
  WHERE id = ?
`);

const listAllChatsStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  LEFT JOIN messages ON messages.chat_id = chats.id
  GROUP BY chats.id
  ORDER BY updatedAt DESC, chats.id DESC
`);

const listUserChatsStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  JOIN chat_members ON chat_members.chat_id = chats.id
  LEFT JOIN messages ON messages.chat_id = chats.id
  WHERE chat_members.user_id = ?
  GROUP BY chats.id
  ORDER BY updatedAt DESC, chats.id DESC
`);

const listChatMembersStatement = db.prepare(`
  SELECT chat_id AS chatId, user_id AS userId
  FROM chat_members
`);

const listChatMembersForChatStatement = db.prepare(`
  SELECT user_id AS userId
  FROM chat_members
  WHERE chat_id = ?
`);

const deleteChatMembersStatement = db.prepare(`
  DELETE FROM chat_members
  WHERE chat_id = ?
`);

const addChatMemberStatement = db.prepare(`
  INSERT INTO chat_members (chat_id, user_id, created_at)
  VALUES (?, ?, ?)
`);

const listValidUserIdsStatement = db.prepare(`
  SELECT id
  FROM users
  WHERE role = 'user' AND deleted_at IS NULL
`);

const deleteUserSessionsStatement = db.prepare(`
  DELETE FROM sessions
  WHERE user_id = ?
`);

const deleteUserChatMembersStatement = db.prepare(`
  DELETE FROM chat_members
  WHERE user_id = ?
`);

const softDeleteUserStatement = db.prepare(`
  UPDATE users
  SET full_name_normalized = ?, deleted_at = ?
  WHERE id = ? AND role = 'user' AND deleted_at IS NULL
`);

const chatAttachmentFilesStatement = db.prepare(`
  SELECT attachments.stored_name AS storedName
  FROM attachments
  JOIN messages ON messages.id = attachments.message_id
  WHERE messages.chat_id = ?
`);

const deleteChatStatement = db.prepare(`
  DELETE FROM chats
  WHERE id = ?
`);

const chatAccessStatement = db.prepare(`
  SELECT 1 AS allowed
  FROM chat_members
  WHERE chat_id = ? AND user_id = ?
`);

const listMessagesStatement = db.prepare(`
  SELECT
    messages.id,
    messages.chat_id AS chatId,
    messages.body,
    messages.created_at AS createdAt,
    users.id AS authorId,
    users.full_name AS authorName,
    users.role AS authorRole
  FROM messages
  JOIN users ON users.id = messages.user_id
  WHERE messages.chat_id = ?
  ORDER BY messages.created_at ASC, messages.id ASC
`);

const insertMessageStatement = db.prepare(`
  INSERT INTO messages (chat_id, user_id, body, created_at)
  VALUES (?, ?, ?, ?)
`);

const insertAttachmentStatement = db.prepare(`
  INSERT INTO attachments (message_id, original_name, stored_name, mime_type, size, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const attachmentByIdStatement = db.prepare(`
  SELECT
    attachments.id,
    attachments.message_id AS messageId,
    attachments.original_name AS originalName,
    attachments.stored_name AS storedName,
    attachments.mime_type AS mimeType,
    attachments.size,
    attachments.created_at AS createdAt,
    messages.chat_id AS chatId
  FROM attachments
  JOIN messages ON messages.id = attachments.message_id
  WHERE attachments.id = ?
`);

const createApplicationStatement = db.prepare(`
  INSERT INTO applications (
    application_number,
    applicant_full_name,
    applicant_full_name_normalized,
    phone,
    phone_normalized,
    email,
    object_address,
    connection_type,
    status,
    received_at,
    responsible_name,
    notes,
    appendix_data,
    customer_user_id,
    chat_id,
    created_by,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertApplicationStageStatement = db.prepare(`
  INSERT INTO application_stages (
    application_id,
    stage_key,
    title,
    description,
    sort_order,
    status,
    started_at,
    completed_at,
    public_note,
    is_visible,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listApplicationsStatement = db.prepare(`
  SELECT
    applications.id,
    applications.application_number AS applicationNumber,
    applications.applicant_full_name AS applicantFullName,
    applications.phone,
    applications.email,
    applications.object_address AS objectAddress,
    applications.connection_type AS connectionType,
    applications.status,
    applications.received_at AS receivedAt,
    applications.responsible_name AS responsibleName,
    applications.notes,
    applications.appendix_data AS appendixData,
    applications.customer_user_id AS customerUserId,
    applications.chat_id AS chatId,
    applications.created_by AS createdBy,
    applications.created_at AS createdAt,
    applications.updated_at AS updatedAt,
    users.full_name AS customerUserName
  FROM applications
  LEFT JOIN users ON users.id = applications.customer_user_id
  ORDER BY applications.updated_at DESC, applications.id DESC
`);

const listUserApplicationsStatement = db.prepare(`
  SELECT DISTINCT
    applications.id,
    applications.application_number AS applicationNumber,
    applications.applicant_full_name AS applicantFullName,
    applications.phone,
    applications.email,
    applications.object_address AS objectAddress,
    applications.connection_type AS connectionType,
    applications.status,
    applications.received_at AS receivedAt,
    applications.responsible_name AS responsibleName,
    applications.notes,
    applications.appendix_data AS appendixData,
    applications.customer_user_id AS customerUserId,
    applications.chat_id AS chatId,
    applications.created_by AS createdBy,
    applications.created_at AS createdAt,
    applications.updated_at AS updatedAt,
    users.full_name AS customerUserName
  FROM applications
  LEFT JOIN users ON users.id = applications.customer_user_id
  LEFT JOIN chat_members ON chat_members.chat_id = applications.chat_id
  WHERE applications.customer_user_id = ? OR chat_members.user_id = ?
  ORDER BY applications.updated_at DESC, applications.id DESC
`);

const getApplicationByIdStatement = db.prepare(`
  SELECT
    applications.id,
    applications.application_number AS applicationNumber,
    applications.applicant_full_name AS applicantFullName,
    applications.phone,
    applications.email,
    applications.object_address AS objectAddress,
    applications.connection_type AS connectionType,
    applications.status,
    applications.received_at AS receivedAt,
    applications.responsible_name AS responsibleName,
    applications.notes,
    applications.appendix_data AS appendixData,
    applications.customer_user_id AS customerUserId,
    applications.chat_id AS chatId,
    applications.created_by AS createdBy,
    applications.created_at AS createdAt,
    applications.updated_at AS updatedAt,
    users.full_name AS customerUserName
  FROM applications
  LEFT JOIN users ON users.id = applications.customer_user_id
  WHERE applications.id = ?
`);

const applicationAccessStatement = db.prepare(`
  SELECT 1 AS allowed
  FROM applications
  LEFT JOIN chat_members ON chat_members.chat_id = applications.chat_id
  WHERE applications.id = ?
    AND (applications.customer_user_id = ? OR chat_members.user_id = ?)
`);

const listApplicationStagesStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_key AS stageKey,
    title,
    description,
    sort_order AS sortOrder,
    status,
    started_at AS startedAt,
    completed_at AS completedAt,
    public_note AS publicNote,
    is_visible AS isVisible,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM application_stages
  WHERE application_id = ?
  ORDER BY sort_order ASC, id ASC
`);

const getApplicationStageByIdStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_key AS stageKey,
    title,
    description,
    sort_order AS sortOrder,
    status,
    started_at AS startedAt,
    completed_at AS completedAt,
    public_note AS publicNote,
    is_visible AS isVisible,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM application_stages
  WHERE id = ? AND application_id = ?
`);

const updateApplicationStageStatement = db.prepare(`
  UPDATE application_stages
  SET status = ?,
      started_at = ?,
      completed_at = ?,
      public_note = ?,
      is_visible = ?,
      updated_at = ?
  WHERE id = ? AND application_id = ?
`);

const updateApplicationTouchedStatement = db.prepare(`
  UPDATE applications
  SET updated_at = ?
  WHERE id = ?
`);

const updateApplicationStatement = db.prepare(`
  UPDATE applications
  SET application_number = ?,
      applicant_full_name = ?,
      applicant_full_name_normalized = ?,
      phone = ?,
      phone_normalized = ?,
      email = ?,
      object_address = ?,
      connection_type = ?,
      status = ?,
      received_at = ?,
      responsible_name = ?,
      notes = ?,
      appendix_data = ?,
      customer_user_id = ?,
      updated_at = ?
  WHERE id = ?
`);

const insertEmailNotificationStatement = db.prepare(`
  INSERT INTO email_notifications (
    application_id,
    stage_id,
    recipient_email,
    recipient_name,
    subject,
    body,
    status,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const listEmailNotificationsStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_id AS stageId,
    recipient_email AS recipientEmail,
    recipient_name AS recipientName,
    subject,
    body,
    status,
    created_at AS createdAt
  FROM email_notifications
  WHERE application_id = ?
  ORDER BY created_at DESC, id DESC
`);

const publicApplicationLookupStatement = db.prepare(`
  SELECT id
  FROM applications
  WHERE phone_normalized = ?
    AND (
      applicant_full_name_normalized = ?
      OR application_number = ?
    )
  ORDER BY updated_at DESC, id DESC
  LIMIT 1
`);

const chatSummaryByIdStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  LEFT JOIN messages ON messages.chat_id = chats.id
  WHERE chats.id = ?
  GROUP BY chats.id
`);

const applicationChatByIdStatement = db.prepare(`
  SELECT chat_id AS chatId
  FROM applications
  WHERE id = ?
`);

const deleteApplicationStatement = db.prepare(`
  DELETE FROM applications
  WHERE id = ?
`);

function getTimestamp() {
  return new Date().toISOString();
}

function mapChatMembers(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.chatId)) {
      map.set(row.chatId, []);
    }

    map.get(row.chatId).push(row.userId);
  }

  return map;
}

function enrichChats(rows, memberRows = []) {
  const memberMap = mapChatMembers(memberRows);

  return rows.map((chat) => ({
    id: chat.id,
    title: chat.title,
    description: chat.description,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    createdBy: chat.createdBy,
    messageCount: Number(chat.messageCount),
    accessUserIds: memberMap.get(chat.id) ?? [],
  }));
}

function mapApplicationStage(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    stageKey: row.stageKey,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    publicNote: row.publicNote,
    isVisible: Boolean(row.isVisible),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listStagesForApplication(applicationId) {
  return listApplicationStagesStatement
    .all(applicationId)
    .map(mapApplicationStage);
}

function getChatSummary(chatId) {
  const chat = chatSummaryByIdStatement.get(chatId);

  if (!chat) {
    return null;
  }

  return enrichChats([chat], listChatMembersForChatStatement.all(chatId).map((row) => ({
    chatId,
    userId: row.userId,
  })))[0];
}

function mapEmailNotification(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    stageId: row.stageId,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapApplication(row, { includePrivate = true } = {}) {
  const stages = listStagesForApplication(row.id);
  const visibleStages = includePrivate
    ? stages
    : stages.filter((stage) => stage.isVisible);
  const completedCount = visibleStages.filter((stage) => stage.status === 'completed').length;
  const activeCount = visibleStages.filter((stage) => stage.status !== 'not_required').length;

  return {
    id: row.id,
    applicationNumber: row.applicationNumber,
    applicantFullName: row.applicantFullName,
    phone: includePrivate ? row.phone : undefined,
    email: includePrivate ? row.email : undefined,
    objectAddress: row.objectAddress,
    connectionType: row.connectionType,
    status: row.status,
    receivedAt: row.receivedAt,
    responsibleName: includePrivate ? row.responsibleName : undefined,
    notes: includePrivate ? row.notes : undefined,
    appendixData: includePrivate ? parseJsonObject(row.appendixData) : undefined,
    customerUserId: includePrivate ? row.customerUserId : undefined,
    customerUserName: includePrivate ? row.customerUserName : undefined,
    chatId: includePrivate ? row.chatId : undefined,
    createdBy: includePrivate ? row.createdBy : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stageSummary: {
      completed: completedCount,
      total: activeCount,
    },
    stages: visibleStages,
    chat: includePrivate ? getChatSummary(row.chatId) : undefined,
    notifications: includePrivate
      ? listEmailNotificationsStatement.all(row.id).map(mapEmailNotification)
      : undefined,
  };
}

function generateApplicationNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `PR-${datePart}-${timePart}`;
}

function createStageNotification(application, stage, timestamp) {
  const hasEmail = application.email.includes('@');
  const subject = `Оновлено етап заяви ${application.applicationNumber}`;
  const body = [
    `За заявою ${application.applicationNumber} оновлено етап приєднання до теплових мереж.`,
    `Етап: ${stage.title}`,
    `Статус: ${stage.status === 'completed' ? 'виконано' : stage.status}`,
    stage.completedAt ? `Дата виконання: ${stage.completedAt}` : '',
    stage.publicNote ? `Коментар: ${stage.publicNote}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  insertEmailNotificationStatement.run(
    application.id,
    stage.id,
    application.email,
    application.applicantFullName,
    subject,
    body,
    hasEmail ? 'prepared' : 'skipped',
    timestamp,
  );
}

export function hasManager() {
  const row = managerCountStatement.get();
  return row.count > 0;
}

export function createUser({ fullName, passwordHash, role }) {
  const createdAt = getTimestamp();
  const normalized = normalizeLoginKey(fullName);
  const result = createUserStatement.run(
    fullName,
    normalized,
    passwordHash,
    role,
    createdAt,
  );

  return getUserById(Number(result.lastInsertRowid));
}

export function listUsers() {
  return listUsersStatement.all().map((user) => ({
    id: user.id,
    fullName: user.full_name,
    role: user.role,
    createdAt: user.created_at,
  }));
}

export function findUserByFullName(fullName) {
  return findUserByNormalizedNameStatement.get(normalizeLoginKey(fullName)) ?? null;
}

export function getUserById(userId) {
  return getUserByIdStatement.get(userId) ?? null;
}

export function createSession(userId) {
  const token = createSessionToken();
  const timestamp = getTimestamp();
  createSessionStatement.run(token, userId, timestamp, timestamp);
  return token;
}

export function getSessionUser(token) {
  const session = findSessionStatement.get(token);

  if (!session) {
    return null;
  }

  updateSessionSeenStatement.run(getTimestamp(), token);

  return {
    token: session.token,
    user: {
      id: session.id,
      full_name: session.full_name,
      role: session.role,
      created_at: session.created_at,
    },
  };
}

export function removeSession(token) {
  deleteSessionStatement.run(token);
}

export function createChat({ title, description, createdBy }) {
  const createdAt = getTimestamp();
  const result = createChatStatement.run(title, description, createdBy, createdAt);
  return getChatById(Number(result.lastInsertRowid));
}

export function getChatById(chatId) {
  const chat = getChatByIdStatement.get(chatId);

  if (!chat) {
    return null;
  }

  return {
    id: chat.id,
    title: chat.title,
    description: chat.description,
    createdAt: chat.created_at,
    createdBy: chat.created_by,
    accessUserIds: listChatMembersForChatStatement.all(chatId).map((row) => row.userId),
  };
}

export function listChatsForUser(user) {
  if (user.role === 'manager') {
    return enrichChats(
      listAllChatsStatement.all(),
      listChatMembersStatement.all(),
    );
  }

  return enrichChats(listUserChatsStatement.all(user.id));
}

const createApplicationTransaction = db.transaction((input) => {
  const timestamp = getTimestamp();
  const applicationNumber = input.applicationNumber || generateApplicationNumber();
  const chatTitle = `Заява ${applicationNumber}: ${input.applicantFullName}`;
  const chatDescription = input.objectAddress;
  const chatResult = createChatStatement.run(
    chatTitle,
    chatDescription,
    input.createdBy,
    timestamp,
  );
  const chatId = Number(chatResult.lastInsertRowid);
  const customerUserId = input.customerUserId || null;

  if (customerUserId) {
    addChatMemberStatement.run(chatId, customerUserId, timestamp);
  }

  const applicationResult = createApplicationStatement.run(
    applicationNumber,
    input.applicantFullName,
    normalizeLoginKey(input.applicantFullName),
    input.phone,
    normalizePhone(input.phone),
    input.email,
    input.objectAddress,
    input.connectionType,
    input.status || 'in_progress',
    input.receivedAt,
    input.responsibleName,
    input.notes,
    JSON.stringify(input.appendixData || {}),
    customerUserId,
    chatId,
    input.createdBy,
    timestamp,
    timestamp,
  );
  const applicationId = Number(applicationResult.lastInsertRowid);

  connectionStageTemplates.forEach((stage, index) => {
    insertApplicationStageStatement.run(
      applicationId,
      stage.key,
      stage.title,
      stage.description,
      index + 1,
      'not_started',
      null,
      null,
      '',
      1,
      timestamp,
      timestamp,
    );
  });

  return applicationId;
});

export function createApplication(input) {
  const applicationId = createApplicationTransaction(input);
  return getApplicationById(applicationId);
}

export function listApplicationsForUser(user) {
  const rows = user.role === 'manager'
    ? listApplicationsStatement.all()
    : listUserApplicationsStatement.all(user.id, user.id);

  return rows.map((row) => mapApplication(row));
}

export function getApplicationById(applicationId) {
  const application = getApplicationByIdStatement.get(applicationId);

  if (!application) {
    return null;
  }

  return mapApplication(application);
}

export function canAccessApplication(user, applicationId) {
  if (user.role === 'manager') {
    return true;
  }

  return Boolean(applicationAccessStatement.get(applicationId, user.id, user.id));
}

const updateApplicationTransaction = db.transaction((applicationId, input) => {
  const current = getApplicationByIdStatement.get(applicationId);

  if (!current) {
    return null;
  }

  const timestamp = getTimestamp();
  const customerUserId = input.customerUserId || null;
  const applicationNumber = input.applicationNumber || current.applicationNumber;

  updateApplicationStatement.run(
    applicationNumber,
    input.applicantFullName,
    normalizeLoginKey(input.applicantFullName),
    input.phone,
    normalizePhone(input.phone),
    input.email,
    input.objectAddress,
    input.connectionType,
    input.status,
    input.receivedAt,
    input.responsibleName,
    input.notes,
    JSON.stringify(input.appendixData || {}),
    customerUserId,
    timestamp,
    applicationId,
  );

  updateChatStatement.run(
    `Заява ${applicationNumber}: ${input.applicantFullName}`,
    input.objectAddress,
    current.chatId,
  );
  deleteChatMembersStatement.run(current.chatId);

  if (customerUserId) {
    addChatMemberStatement.run(current.chatId, customerUserId, timestamp);
  }

  return applicationId;
});

export function updateApplication(applicationId, input) {
  const updatedId = updateApplicationTransaction(applicationId, input);
  return updatedId ? getApplicationById(updatedId) : null;
}

const updateApplicationStageTransaction = db.transaction((applicationId, stageId, input) => {
  const currentStage = getApplicationStageByIdStatement.get(stageId, applicationId);

  if (!currentStage) {
    return null;
  }

  const timestamp = getTimestamp();
  updateApplicationStageStatement.run(
    input.status,
    input.startedAt || null,
    input.completedAt || null,
    input.publicNote,
    input.isVisible ? 1 : 0,
    timestamp,
    stageId,
    applicationId,
  );
  updateApplicationTouchedStatement.run(timestamp, applicationId);

  const updatedApplication = getApplicationById(applicationId);
  const updatedStage = updatedApplication.stages.find((stage) => stage.id === stageId);
  const completedNow = input.status === 'completed' && input.completedAt;
  const wasCompleted = currentStage.status === 'completed'
    && currentStage.completedAt === input.completedAt;

  if (completedNow && !wasCompleted) {
    createStageNotification(updatedApplication, updatedStage, timestamp);
  }

  return updatedApplication;
});

export function updateApplicationStage(applicationId, stageId, input) {
  return updateApplicationStageTransaction(applicationId, stageId, input);
}

export function lookupPublicApplication({ phone, fullName, applicationNumber }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedName = normalizeLoginKey(fullName || '');
  const row = publicApplicationLookupStatement.get(
    normalizedPhone,
    normalizedName,
    applicationNumber || '',
  );

  if (!row) {
    return null;
  }

  const application = getApplicationByIdStatement.get(row.id);
  return mapApplication(application, { includePrivate: false });
}

const deleteApplicationTransaction = db.transaction((applicationId) => {
  const application = getApplicationByIdStatement.get(applicationId);

  if (!application) {
    return null;
  }

  const storedFiles = chatAttachmentFilesStatement
    .all(application.chatId)
    .map((file) => file.storedName);

  deleteApplicationStatement.run(applicationId);
  deleteChatStatement.run(application.chatId);

  return {
    id: application.id,
    storedFiles,
  };
});

export function deleteApplication(applicationId) {
  return deleteApplicationTransaction(applicationId);
}

const replaceChatAccessTransaction = db.transaction((chatId, userIds) => {
  deleteChatMembersStatement.run(chatId);

  const createdAt = getTimestamp();

  for (const userId of userIds) {
    addChatMemberStatement.run(chatId, userId, createdAt);
  }
});

export function replaceChatAccess(chatId, userIds) {
  const validUserIds = new Set(
    listValidUserIdsStatement.all().map((user) => Number(user.id)),
  );

  for (const userId of userIds) {
    if (!validUserIds.has(userId)) {
      throw new Error('Один із вибраних користувачів не існує.');
    }
  }

  replaceChatAccessTransaction(chatId, userIds);
  return getChatById(chatId);
}

const softDeleteUserTransaction = db.transaction((userId) => {
  const user = getUserByIdStatement.get(userId);

  if (!user || user.role !== 'user' || user.deleted_at) {
    return null;
  }

  const deletedAt = getTimestamp();
  const normalized = `${user.full_name_normalized}::deleted::${user.id}::${Date.now()}`;

  softDeleteUserStatement.run(normalized, deletedAt, userId);
  deleteUserSessionsStatement.run(userId);
  deleteUserChatMembersStatement.run(userId);

  return {
    id: user.id,
    fullName: user.full_name,
  };
});

export function deleteUser(userId) {
  return softDeleteUserTransaction(userId);
}

const deleteChatTransaction = db.transaction((chatId) => {
  const chat = getChatByIdStatement.get(chatId);

  if (!chat) {
    return null;
  }

  const storedFiles = chatAttachmentFilesStatement
    .all(chatId)
    .map((file) => file.storedName);

  deleteChatStatement.run(chatId);

  return {
    id: chat.id,
    storedFiles,
  };
});

export function deleteChat(chatId) {
  return deleteChatTransaction(chatId);
}

export function canAccessChat(user, chatId) {
  if (user.role === 'manager') {
    return true;
  }

  return Boolean(chatAccessStatement.get(chatId, user.id));
}

const createMessageTransaction = db.transaction((chatId, userId, body, files) => {
  const createdAt = getTimestamp();
  const result = insertMessageStatement.run(chatId, userId, body, createdAt);
  const messageId = Number(result.lastInsertRowid);

  for (const file of files) {
    insertAttachmentStatement.run(
      messageId,
      file.originalName,
      file.storedName,
      file.mimeType,
      file.size,
      createdAt,
    );
  }

  return messageId;
});

export function createMessage({ chatId, userId, body, files }) {
  return createMessageTransaction(chatId, userId, body, files);
}

export function listMessages(chatId) {
  const messages = listMessagesStatement.all(chatId);

  if (messages.length === 0) {
    return [];
  }

  const placeholders = messages.map(() => '?').join(', ');
  const attachmentRows = db
    .prepare(`
      SELECT
        id,
        message_id AS messageId,
        original_name AS originalName,
        mime_type AS mimeType,
        size,
        created_at AS createdAt
      FROM attachments
      WHERE message_id IN (${placeholders})
      ORDER BY id ASC
    `)
    .all(...messages.map((message) => message.id));

  const attachmentMap = new Map();

  for (const row of attachmentRows) {
    if (!attachmentMap.has(row.messageId)) {
      attachmentMap.set(row.messageId, []);
    }

    attachmentMap.get(row.messageId).push({
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt,
    });
  }

  return messages.map((message) => ({
    id: message.id,
    chatId: message.chatId,
    body: message.body,
    createdAt: message.createdAt,
    author: {
      id: message.authorId,
      fullName: message.authorName,
      role: message.authorRole,
    },
    attachments: attachmentMap.get(message.id) ?? [],
  }));
}

export function getAttachmentById(attachmentId) {
  return attachmentByIdStatement.get(attachmentId) ?? null;
}
