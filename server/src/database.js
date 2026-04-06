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
`);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all();

if (!userColumns.some((column) => column.name === 'deleted_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN deleted_at TEXT`);
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
