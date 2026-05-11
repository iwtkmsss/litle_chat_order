import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createSessionToken, normalizeLoginKey } from './auth.js';
import {
  dataDir,
  databasePath,
  generatedDocumentsDir,
  uploadsDir,
} from './config.js';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(generatedDocumentsDir, { recursive: true });

const schemaVersion = 3;
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableExists(tableName) {
  return Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function resetLegacyDatabase() {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS email_notifications;
    DROP TABLE IF EXISTS generated_documents;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS application_stages;
    DROP TABLE IF EXISTS applications;
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS chat_members;
    DROP TABLE IF EXISTS chats;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS stage_templates;
    DROP TABLE IF EXISTS deadline_rules;
    DROP TABLE IF EXISTS system_settings;
    DROP TABLE IF EXISTS stations;
  `);
  db.pragma('foreign_keys = ON');
  db.pragma('user_version = 0');
}

const currentVersion = db.pragma('user_version', { simple: true });

if ((currentVersion > 0 && currentVersion < schemaVersion) || (currentVersion === 0 && tableExists('users'))) {
  resetLegacyDatabase();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    edrpou TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    director_name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    full_name_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'customer')),
    station_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK (value_type IN ('text', 'textarea', 'number')),
    group_name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_by INTEGER,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS deadline_rules (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    amount INTEGER NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('calendar_days', 'business_days', 'months')),
    warning_days INTEGER NOT NULL DEFAULT 2,
    description TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_by INTEGER,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS stage_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    default_expected_days INTEGER NOT NULL DEFAULT 0,
    expected_days_type TEXT NOT NULL DEFAULT 'calendar_days' CHECK (expected_days_type IN ('calendar_days', 'business_days', 'months')),
    default_due_days INTEGER NOT NULL DEFAULT 0,
    due_days_type TEXT NOT NULL DEFAULT 'calendar_days' CHECK (due_days_type IN ('calendar_days', 'business_days', 'months')),
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    station_id INTEGER,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
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
    station_id INTEGER NOT NULL,
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
    deadline_data TEXT NOT NULL DEFAULT '{}',
    customer_user_id INTEGER,
    chat_id INTEGER NOT NULL UNIQUE,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE RESTRICT,
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
    expected_at TEXT,
    due_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    public_note TEXT NOT NULL,
    is_visible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (application_id, stage_key),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generated_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    application_number TEXT NOT NULL,
    station_id INTEGER,
    document_type TEXT NOT NULL CHECK (document_type IN ('appendix1', 'appendix2', 'appendix3', 'appendix4', 'appendix5')),
    title TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    station_id INTEGER,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    before_data TEXT NOT NULL DEFAULT '{}',
    after_data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL
  );
`);

db.pragma(`user_version = ${schemaVersion}`);

const defaultDeadlineRules = [
  {
    key: 'contract_terms_preparation',
    label: 'Підготовка договору, технічних умов і рахунку',
    amount: 10,
    unit: 'business_days',
    warningDays: 2,
    description: 'Строк за відсутності зауважень до документів або після їх усунення.',
  },
  {
    key: 'technical_terms_payment',
    label: 'Оплата рахунку за технічні умови',
    amount: 10,
    unit: 'calendar_days',
    warningDays: 2,
    description: 'Контроль оплати з дня отримання замовником рахунку, якщо оплата передбачена законодавством.',
  },
  {
    key: 'signed_contract_return',
    label: 'Повернення підписаного договору',
    amount: 3,
    unit: 'months',
    warningDays: 14,
    description: 'Контроль отримання Оператором підписаного замовником проєкту договору.',
  },
  {
    key: 'temporary_connection_response',
    label: 'Тимчасове приєднання: первинне інформування',
    amount: 1,
    unit: 'calendar_days',
    warningDays: 0,
    description: 'Надання найближчих точок у тепловій мережі та технічної інформації.',
  },
];

export const defaultStageTemplates = [
  {
    key: 'contract_terms_invoice_ready',
    title: 'Готовність проекту договору на приєднання, проекту технічних умов на приєднання та рахунку щодо оплати вартості послуги з надання замовнику технічних умов на приєднання.',
    description: 'Етап підготовки проекту договору, технічних умов та рахунку на оплату послуги з надання технічних умов.',
    expectedDays: 10,
    expectedUnit: 'business_days',
    dueDays: 10,
    dueUnit: 'business_days',
  },
  {
    key: 'land_relations_design',
    title: 'Проектування та здійснення заходів стосовно оформлення земельних відносин щодо траси прокладання МО (мереж Оператора) (за необхідності).',
    description: 'Оформлення земельних питань щодо траси прокладання мереж Оператора, якщо це потрібно для конкретного об’єкта.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
  {
    key: 'urban_conditions',
    title: 'Отримання містобудівних умов та обмежень забудови земельної ділянки, де планується прокладання МО (за необхідності).',
    description: 'Етап отримання містобудівних умов та обмежень для земельної ділянки, якщо цього потребує процедура приєднання.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
  {
    key: 'engineering_surveys',
    title: 'Виконання інженерних вишукувань.',
    description: 'Виконання інженерних вишукувань для підготовки проектної документації.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
  {
    key: 'network_project_estimate',
    title: 'Розробка та затвердження проекту МО та його кошторисної частини.',
    description: 'Розробка та затвердження проекту мереж Оператора і кошторисної частини проекту.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
  {
    key: 'project_expertise_approval',
    title: 'Експертиза та погодження проектної документації з іншими заінтересованими сторонами.',
    description: 'Проведення експертизи і погодження проектної документації із заінтересованими сторонами.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
  {
    key: 'customer_network_connection',
    title: 'Підключення МЗ (мереж Замовника) у точці приєднання.',
    description: 'Підключення мереж Замовника до теплових мереж Оператора у точці приєднання.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
  {
    key: 'primary_heat_carrier_launch',
    title: 'Первинний пуск теплоносія.',
    description: 'Первинний пуск теплоносія після виконання необхідних робіт та погоджень.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
  },
];

const defaultSettings = [
  {
    key: 'operator.default_name',
    label: 'Типова назва Оператора',
    value: 'Оператор теплових мереж',
    valueType: 'text',
    groupName: 'Оператор',
    description: 'Використовується як підказка в документах, якщо у станції не заповнені реквізити.',
  },
  {
    key: 'public.page_title',
    label: 'Заголовок публічної сторінки',
    value: 'Приєднання до теплових мереж',
    valueType: 'text',
    groupName: 'Публічна сторінка',
    description: 'Адмін може змінити без редагування коду.',
  },
  {
    key: 'legal.current_order',
    label: 'Нормативна база: Порядок',
    value: 'Порядок приєднання до теплових мереж, затверджений постановою НКРЕКП від 04.10.2023 № 1823, зі змінами.',
    valueType: 'textarea',
    groupName: 'Нормативна база',
    description: 'Зберігаємо в адмінці, бо редакції нормативної бази можуть змінюватися.',
  },
  {
    key: 'legal.no_sms_note',
    label: 'Примітка щодо SMS',
    value: 'SMS-повідомлення у системі не використовуються; інформування готується через email-заглушку та особистий кабінет.',
    valueType: 'textarea',
    groupName: 'Сповіщення',
    description: 'Фіксує рішення не реалізовувати SMS.',
  },
];

function getTimestamp() {
  return new Date().toISOString();
}

function seedDefaults() {
  const timestamp = getTimestamp();
  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO deadline_rules (
      key, label, amount, unit, warning_days, description, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rule of defaultDeadlineRules) {
    insertRule.run(
      rule.key,
      rule.label,
      rule.amount,
      rule.unit,
      rule.warningDays,
      rule.description,
      timestamp,
    );
  }

  const insertStage = db.prepare(`
    INSERT OR IGNORE INTO stage_templates (
      stage_key,
      title,
      description,
      sort_order,
      default_expected_days,
      expected_days_type,
      default_due_days,
      due_days_type,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  defaultStageTemplates.forEach((stage, index) => {
    insertStage.run(
      stage.key,
      stage.title,
      stage.description,
      index + 1,
      stage.expectedDays,
      stage.expectedUnit,
      stage.dueDays,
      stage.dueUnit,
      timestamp,
      timestamp,
    );
  });

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (
      key, label, value, value_type, group_name, description, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const setting of defaultSettings) {
    insertSetting.run(
      setting.key,
      setting.label,
      setting.value,
      setting.valueType,
      setting.groupName,
      setting.description,
      timestamp,
    );
  }

  const legacyOperatorName = String.fromCharCode(
    1057, 1091, 1084, 1080, 1090, 1077, 1087, 1083, 1086, 1077, 1085, 1077, 1088, 1075, 1086,
  );
  db.prepare(`
    UPDATE system_settings
    SET value = ?
    WHERE key = 'operator.default_name'
      AND value LIKE ?
  `).run('Оператор теплових мереж', `%${legacyOperatorName}%`);
}

seedDefaults();

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeDateInput(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addBusinessDays(startDate, amount) {
  const date = parseIsoDate(startDate);
  let added = 0;

  while (added < amount) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();

    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }

  return toIsoDate(date);
}

function addCalendarDays(startDate, amount) {
  const date = parseIsoDate(startDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

function addMonths(startDate, amount) {
  const date = parseIsoDate(startDate);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toIsoDate(date);
}

function addByRule(startDate, amount, unit) {
  if (!startDate || !amount || amount < 1) {
    return null;
  }

  if (unit === 'business_days') {
    return addBusinessDays(startDate, amount);
  }

  if (unit === 'months') {
    return addMonths(startDate, amount);
  }

  return addCalendarDays(startDate, amount);
}

function daysBetweenToday(targetDate) {
  const today = parseIsoDate(toIsoDate(new Date()));
  const target = parseIsoDate(targetDate);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function getDeadlineStatus({ dueAt, completedAt, warningDays = 2 }) {
  if (!dueAt) {
    return 'not_set';
  }

  if (completedAt) {
    return 'done';
  }

  const daysLeft = daysBetweenToday(dueAt);

  if (daysLeft < 0) {
    return 'overdue';
  }

  if (daysLeft <= warningDays) {
    return 'due_soon';
  }

  return 'normal';
}

function safeJson(value) {
  return JSON.stringify(value ?? {});
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const stationFields = `
  id,
  name,
  edrpou,
  address,
  phone,
  email,
  director_name AS directorName,
  notes,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const userFields = `
  users.id,
  users.full_name AS fullName,
  users.full_name_normalized AS fullNameNormalized,
  users.password_hash AS passwordHash,
  users.role,
  users.station_id AS stationId,
  stations.name AS stationName,
  users.created_by AS createdBy,
  users.created_at AS createdAt,
  users.deleted_at AS deletedAt
`;

const createUserStatement = db.prepare(`
  INSERT INTO users (full_name, full_name_normalized, password_hash, role, station_id, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const findUserByNormalizedNameStatement = db.prepare(`
  SELECT ${userFields}
  FROM users
  LEFT JOIN stations ON stations.id = users.station_id
  WHERE users.full_name_normalized = ? AND users.deleted_at IS NULL
`);

const getUserByIdStatement = db.prepare(`
  SELECT ${userFields}
  FROM users
  LEFT JOIN stations ON stations.id = users.station_id
  WHERE users.id = ?
`);

const adminCountStatement = db.prepare(`
  SELECT COUNT(*) AS count
  FROM users
  WHERE role = 'admin' AND deleted_at IS NULL
`);

const listAllUsersStatement = db.prepare(`
  SELECT ${userFields}
  FROM users
  LEFT JOIN stations ON stations.id = users.station_id
  WHERE users.deleted_at IS NULL
  ORDER BY users.role ASC, users.full_name COLLATE NOCASE ASC
`);

const listStationCustomersStatement = db.prepare(`
  SELECT ${userFields}
  FROM users
  LEFT JOIN stations ON stations.id = users.station_id
  WHERE users.role = 'customer' AND users.station_id = ? AND users.deleted_at IS NULL
  ORDER BY users.full_name COLLATE NOCASE ASC
`);

const listManagersStatement = db.prepare(`
  SELECT ${userFields}
  FROM users
  LEFT JOIN stations ON stations.id = users.station_id
  WHERE users.role = 'manager' AND users.deleted_at IS NULL
  ORDER BY users.full_name COLLATE NOCASE ASC
`);

const createSessionStatement = db.prepare(`
  INSERT INTO sessions (token, user_id, created_at, last_seen_at)
  VALUES (?, ?, ?, ?)
`);

const findSessionStatement = db.prepare(`
  SELECT sessions.token, ${userFields}
  FROM sessions
  JOIN users ON users.id = sessions.user_id
  LEFT JOIN stations ON stations.id = users.station_id
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

const listStationsStatement = db.prepare(`
  SELECT ${stationFields}
  FROM stations
  ORDER BY is_active DESC, name COLLATE NOCASE ASC
`);

const getStationByIdStatement = db.prepare(`
  SELECT ${stationFields}
  FROM stations
  WHERE id = ?
`);

const createStationStatement = db.prepare(`
  INSERT INTO stations (name, edrpou, address, phone, email, director_name, notes, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateStationStatement = db.prepare(`
  UPDATE stations
  SET name = ?,
      edrpou = ?,
      address = ?,
      phone = ?,
      email = ?,
      director_name = ?,
      notes = ?,
      is_active = ?,
      updated_at = ?
  WHERE id = ?
`);

const listSettingsStatement = db.prepare(`
  SELECT key, label, value, value_type AS valueType, group_name AS groupName, description, updated_by AS updatedBy, updated_at AS updatedAt
  FROM system_settings
  ORDER BY group_name ASC, label ASC
`);

const getSettingStatement = db.prepare(`
  SELECT key, label, value, value_type AS valueType, group_name AS groupName, description, updated_by AS updatedBy, updated_at AS updatedAt
  FROM system_settings
  WHERE key = ?
`);

const updateSettingStatement = db.prepare(`
  UPDATE system_settings
  SET value = ?, updated_by = ?, updated_at = ?
  WHERE key = ?
`);

const listDeadlineRulesStatement = db.prepare(`
  SELECT key, label, amount, unit, warning_days AS warningDays, description, is_active AS isActive, updated_by AS updatedBy, updated_at AS updatedAt
  FROM deadline_rules
  ORDER BY rowid ASC
`);

const getDeadlineRuleStatement = db.prepare(`
  SELECT key, label, amount, unit, warning_days AS warningDays, description, is_active AS isActive, updated_by AS updatedBy, updated_at AS updatedAt
  FROM deadline_rules
  WHERE key = ?
`);

const updateDeadlineRuleStatement = db.prepare(`
  UPDATE deadline_rules
  SET amount = ?, unit = ?, warning_days = ?, is_active = ?, updated_by = ?, updated_at = ?
  WHERE key = ?
`);

const listStageTemplatesStatement = db.prepare(`
  SELECT
    id,
    stage_key AS stageKey,
    title,
    description,
    sort_order AS sortOrder,
    default_expected_days AS defaultExpectedDays,
    expected_days_type AS expectedDaysType,
    default_due_days AS defaultDueDays,
    due_days_type AS dueDaysType,
    is_active AS isActive,
    updated_by AS updatedBy,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM stage_templates
  ORDER BY sort_order ASC, id ASC
`);

const getStageTemplateByIdStatement = db.prepare(`
  SELECT
    id,
    stage_key AS stageKey,
    title,
    description,
    sort_order AS sortOrder,
    default_expected_days AS defaultExpectedDays,
    expected_days_type AS expectedDaysType,
    default_due_days AS defaultDueDays,
    due_days_type AS dueDaysType,
    is_active AS isActive,
    updated_by AS updatedBy,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM stage_templates
  WHERE id = ?
`);

const updateStageTemplateStatement = db.prepare(`
  UPDATE stage_templates
  SET title = ?,
      description = ?,
      sort_order = ?,
      default_expected_days = ?,
      expected_days_type = ?,
      default_due_days = ?,
      due_days_type = ?,
      is_active = ?,
      updated_by = ?,
      updated_at = ?
  WHERE id = ?
`);

const createChatStatement = db.prepare(`
  INSERT INTO chats (title, description, station_id, created_by, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const updateChatStatement = db.prepare(`
  UPDATE chats
  SET title = ?, description = ?, station_id = ?
  WHERE id = ?
`);

const getChatByIdStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.station_id AS stationId,
    stations.name AS stationName,
    chats.created_by AS createdBy,
    chats.created_at AS createdAt
  FROM chats
  LEFT JOIN stations ON stations.id = chats.station_id
  WHERE chats.id = ?
`);

const listAllChatsStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.station_id AS stationId,
    stations.name AS stationName,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  LEFT JOIN stations ON stations.id = chats.station_id
  LEFT JOIN messages ON messages.chat_id = chats.id
  GROUP BY chats.id
  ORDER BY updatedAt DESC, chats.id DESC
`);

const listStationChatsStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.station_id AS stationId,
    stations.name AS stationName,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  LEFT JOIN stations ON stations.id = chats.station_id
  LEFT JOIN messages ON messages.chat_id = chats.id
  WHERE chats.station_id = ?
  GROUP BY chats.id
  ORDER BY updatedAt DESC, chats.id DESC
`);

const listUserChatsStatement = db.prepare(`
  SELECT
    chats.id,
    chats.title,
    chats.description,
    chats.station_id AS stationId,
    stations.name AS stationName,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  JOIN chat_members ON chat_members.chat_id = chats.id
  LEFT JOIN stations ON stations.id = chats.station_id
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
  INSERT OR IGNORE INTO chat_members (chat_id, user_id, created_at)
  VALUES (?, ?, ?)
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
  WHERE id = ? AND role != 'admin' AND deleted_at IS NULL
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

const applicationChatAccessStatement = db.prepare(`
  SELECT applications.id, applications.station_id AS stationId, applications.customer_user_id AS customerUserId
  FROM applications
  WHERE applications.chat_id = ?
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
    station_id,
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
    deadline_data,
    customer_user_id,
    chat_id,
    created_by,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertApplicationStageStatement = db.prepare(`
  INSERT INTO application_stages (
    application_id,
    stage_key,
    title,
    description,
    sort_order,
    status,
    expected_at,
    due_at,
    started_at,
    completed_at,
    public_note,
    is_visible,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const applicationSelectFields = `
  applications.id,
  applications.station_id AS stationId,
  stations.name AS stationName,
  stations.edrpou AS stationEdrpou,
  stations.address AS stationAddress,
  stations.phone AS stationPhone,
  stations.email AS stationEmail,
  stations.director_name AS stationDirectorName,
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
  applications.deadline_data AS deadlineData,
  applications.customer_user_id AS customerUserId,
  applications.chat_id AS chatId,
  applications.created_by AS createdBy,
  applications.created_at AS createdAt,
  applications.updated_at AS updatedAt,
  users.full_name AS customerUserName
`;

const listApplicationsStatement = db.prepare(`
  SELECT ${applicationSelectFields}
  FROM applications
  JOIN stations ON stations.id = applications.station_id
  LEFT JOIN users ON users.id = applications.customer_user_id
  ORDER BY applications.updated_at DESC, applications.id DESC
`);

const listStationApplicationsStatement = db.prepare(`
  SELECT ${applicationSelectFields}
  FROM applications
  JOIN stations ON stations.id = applications.station_id
  LEFT JOIN users ON users.id = applications.customer_user_id
  WHERE applications.station_id = ?
  ORDER BY applications.updated_at DESC, applications.id DESC
`);

const listCustomerApplicationsStatement = db.prepare(`
  SELECT DISTINCT ${applicationSelectFields}
  FROM applications
  JOIN stations ON stations.id = applications.station_id
  LEFT JOIN users ON users.id = applications.customer_user_id
  LEFT JOIN chat_members ON chat_members.chat_id = applications.chat_id
  WHERE applications.customer_user_id = ? OR chat_members.user_id = ?
  ORDER BY applications.updated_at DESC, applications.id DESC
`);

const getApplicationByIdStatement = db.prepare(`
  SELECT ${applicationSelectFields}
  FROM applications
  JOIN stations ON stations.id = applications.station_id
  LEFT JOIN users ON users.id = applications.customer_user_id
  WHERE applications.id = ?
`);

const applicationAccessStatement = db.prepare(`
  SELECT station_id AS stationId, customer_user_id AS customerUserId
  FROM applications
  WHERE id = ?
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
    expected_at AS expectedAt,
    due_at AS dueAt,
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
    expected_at AS expectedAt,
    due_at AS dueAt,
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
      expected_at = ?,
      due_at = ?,
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

const updateApplicationDeadlineDataStatement = db.prepare(`
  UPDATE applications
  SET deadline_data = ?, updated_at = ?
  WHERE id = ?
`);

const updateApplicationStatement = db.prepare(`
  UPDATE applications
  SET station_id = ?,
      application_number = ?,
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
      deadline_data = ?,
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
    chats.station_id AS stationId,
    stations.name AS stationName,
    chats.created_at AS createdAt,
    chats.created_by AS createdBy,
    COALESCE(MAX(messages.created_at), chats.created_at) AS updatedAt,
    COUNT(DISTINCT messages.id) AS messageCount
  FROM chats
  LEFT JOIN stations ON stations.id = chats.station_id
  LEFT JOIN messages ON messages.chat_id = chats.id
  WHERE chats.id = ?
  GROUP BY chats.id
`);

const deleteApplicationStatement = db.prepare(`
  DELETE FROM applications
  WHERE id = ?
`);

const insertGeneratedDocumentStatement = db.prepare(`
  INSERT INTO generated_documents (
    application_id,
    application_number,
    station_id,
    document_type,
    title,
    stored_name,
    original_name,
    mime_type,
    size,
    created_by,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listGeneratedDocumentsStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    application_number AS applicationNumber,
    station_id AS stationId,
    document_type AS documentType,
    title,
    stored_name AS storedName,
    original_name AS originalName,
    mime_type AS mimeType,
    size,
    created_by AS createdBy,
    created_at AS createdAt
  FROM generated_documents
  WHERE application_id = ?
  ORDER BY created_at DESC, id DESC
`);

const getGeneratedDocumentByIdStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    application_number AS applicationNumber,
    station_id AS stationId,
    document_type AS documentType,
    title,
    stored_name AS storedName,
    original_name AS originalName,
    mime_type AS mimeType,
    size,
    created_by AS createdBy,
    created_at AS createdAt
  FROM generated_documents
  WHERE id = ?
`);

const insertAuditLogStatement = db.prepare(`
  INSERT INTO audit_log (
    actor_user_id,
    actor_name,
    actor_role,
    station_id,
    entity_type,
    entity_id,
    action,
    summary,
    before_data,
    after_data,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listAuditLogStatement = db.prepare(`
  SELECT
    audit_log.id,
    audit_log.actor_user_id AS actorUserId,
    audit_log.actor_name AS actorName,
    audit_log.actor_role AS actorRole,
    audit_log.station_id AS stationId,
    stations.name AS stationName,
    audit_log.entity_type AS entityType,
    audit_log.entity_id AS entityId,
    audit_log.action,
    audit_log.summary,
    audit_log.before_data AS beforeData,
    audit_log.after_data AS afterData,
    audit_log.created_at AS createdAt
  FROM audit_log
  LEFT JOIN stations ON stations.id = audit_log.station_id
  ORDER BY audit_log.created_at DESC, audit_log.id DESC
  LIMIT ?
`);

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    full_name: row.fullName,
    fullName: row.fullName,
    full_name_normalized: row.fullNameNormalized,
    password_hash: row.passwordHash,
    role: row.role,
    stationId: row.stationId,
    stationName: row.stationName,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    deleted_at: row.deletedAt,
  };
}

function mapStation(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    isActive: Boolean(row.isActive),
  };
}

function mapDeadlineRule(row) {
  return {
    ...row,
    isActive: Boolean(row.isActive),
  };
}

function mapStageTemplate(row) {
  return {
    ...row,
    isActive: Boolean(row.isActive),
  };
}

function mapAudit(row) {
  return {
    ...row,
    beforeData: parseJsonObject(row.beforeData),
    afterData: parseJsonObject(row.afterData),
  };
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
    stationId: chat.stationId,
    stationName: chat.stationName,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    createdBy: chat.createdBy,
    messageCount: Number(chat.messageCount),
    accessUserIds: memberMap.get(chat.id) ?? [],
  }));
}

function getDeadlineRulesMap() {
  return Object.fromEntries(
    listDeadlineRulesStatement.all().map((rule) => [rule.key, mapDeadlineRule(rule)]),
  );
}

function getActiveStageTemplates() {
  return listStageTemplatesStatement
    .all()
    .map(mapStageTemplate)
    .filter((stage) => stage.isActive);
}

function mapApplicationStage(row) {
  const rules = getDeadlineRulesMap();
  const warningDays = rules.contract_terms_preparation?.warningDays ?? 2;

  return {
    id: row.id,
    applicationId: row.applicationId,
    stageKey: row.stageKey,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    status: row.status,
    expectedAt: row.expectedAt,
    dueAt: row.dueAt,
    deadlineStatus: getDeadlineStatus({
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      warningDays,
    }),
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

function mapGeneratedDocument(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    applicationNumber: row.applicationNumber,
    stationId: row.stationId,
    documentType: row.documentType,
    title: row.title,
    storedName: row.storedName,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function buildDeadlineChecks(application, deadlineData, includePrivate) {
  const rules = getDeadlineRulesMap();

  const checks = [
    {
      key: 'contract_terms_preparation',
      label: rules.contract_terms_preparation?.label ?? 'Підготовка договору, технічних умов і рахунку',
      dueAt: application.stages.find((stage) => stage.stageKey === 'contract_terms_invoice_ready')?.dueAt ?? null,
      completedAt: application.stages.find((stage) => stage.stageKey === 'contract_terms_invoice_ready')?.completedAt ?? null,
      warningDays: rules.contract_terms_preparation?.warningDays ?? 2,
    },
    {
      key: 'technical_terms_payment',
      label: rules.technical_terms_payment?.label ?? 'Оплата рахунку за технічні умови',
      dueAt: deadlineData.paymentDueAt ?? null,
      completedAt: deadlineData.paymentCompletedAt ?? null,
      warningDays: rules.technical_terms_payment?.warningDays ?? 2,
    },
    {
      key: 'signed_contract_return',
      label: rules.signed_contract_return?.label ?? 'Повернення підписаного договору',
      dueAt: deadlineData.signedContractDueAt ?? null,
      completedAt: deadlineData.signedContractReceivedAt ?? null,
      warningDays: rules.signed_contract_return?.warningDays ?? 14,
    },
  ];

  if (application.connectionType === 'temporary') {
    checks.push({
      key: 'temporary_connection_response',
      label: rules.temporary_connection_response?.label ?? 'Тимчасове приєднання: первинне інформування',
      dueAt: deadlineData.temporaryResponseDueAt ?? null,
      completedAt: deadlineData.temporaryResponseCompletedAt ?? null,
      warningDays: rules.temporary_connection_response?.warningDays ?? 0,
    });
  }

  return checks
    .filter((check) => includePrivate || check.dueAt)
    .map((check) => ({
      ...check,
      status: getDeadlineStatus(check),
    }));
}

function mapApplication(row, { includePrivate = true } = {}) {
  const stages = listStagesForApplication(row.id);
  const visibleStages = includePrivate
    ? stages
    : stages.filter((stage) => stage.isVisible);
  const completedCount = visibleStages.filter((stage) => stage.status === 'completed').length;
  const activeCount = visibleStages.filter((stage) => stage.status !== 'not_required').length;
  const deadlineData = parseJsonObject(row.deadlineData);
  const application = {
    id: row.id,
    stationId: row.stationId,
    stationName: row.stationName,
    station: includePrivate
      ? {
        id: row.stationId,
        name: row.stationName,
        edrpou: row.stationEdrpou,
        address: row.stationAddress,
        phone: row.stationPhone,
        email: row.stationEmail,
        directorName: row.stationDirectorName,
      }
      : {
        id: row.stationId,
        name: row.stationName,
      },
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
    deadlineData: includePrivate ? deadlineData : undefined,
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
    generatedDocuments: includePrivate
      ? listGeneratedDocumentsStatement.all(row.id).map(mapGeneratedDocument)
      : undefined,
  };

  return {
    ...application,
    deadlineChecks: buildDeadlineChecks(application, deadlineData, includePrivate),
  };
}

function generateApplicationNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `PR-${datePart}-${timePart}`;
}

function actorSnapshot(actor) {
  return {
    id: actor?.id ?? null,
    name: actor?.fullName ?? actor?.full_name ?? 'Система',
    role: actor?.role ?? 'system',
  };
}

export function recordAuditLog({ actor, stationId, entityType, entityId, action, summary, before, after }) {
  const snapshot = actorSnapshot(actor);

  insertAuditLogStatement.run(
    snapshot.id,
    snapshot.name,
    snapshot.role,
    stationId || null,
    entityType,
    String(entityId),
    action,
    summary,
    safeJson(before),
    safeJson(after),
    getTimestamp(),
  );
}

function createStageNotification(application, stage, timestamp) {
  const hasEmail = application.email.includes('@');
  const subject = `Оновлено етап заяви ${application.applicationNumber}`;
  const body = [
    `За заявою ${application.applicationNumber} оновлено етап приєднання до теплових мереж.`,
    `Станція/компанія: ${application.stationName}`,
    `Етап: ${stage.title}`,
    `Статус: ${stage.status === 'completed' ? 'виконано' : stage.status}`,
    stage.completedAt ? `Дата виконання: ${stage.completedAt}` : '',
    stage.publicNote ? `Коментар: ${stage.publicNote}` : '',
    'Це підготовлена email-заглушка. SMS-повідомлення не використовуються.',
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

function buildInitialDeadlineData(input) {
  const rules = getDeadlineRulesMap();
  const data = {};

  if (input.connectionType === 'temporary' && rules.temporary_connection_response?.isActive) {
    data.temporaryResponseDueAt = addByRule(
      input.receivedAt,
      rules.temporary_connection_response.amount,
      rules.temporary_connection_response.unit,
    );
  }

  return data;
}

function updateDeadlineDataForStage(applicationRow, stage, input) {
  if (stage.stageKey !== 'contract_terms_invoice_ready' || input.status !== 'completed' || !input.completedAt) {
    return parseJsonObject(applicationRow.deadlineData);
  }

  const rules = getDeadlineRulesMap();
  const deadlineData = parseJsonObject(applicationRow.deadlineData);

  if (rules.technical_terms_payment?.isActive) {
    deadlineData.invoiceIssuedAt = input.completedAt;
    deadlineData.paymentDueAt = addByRule(
      input.completedAt,
      rules.technical_terms_payment.amount,
      rules.technical_terms_payment.unit,
    );
  }

  if (rules.signed_contract_return?.isActive) {
    deadlineData.contractSentAt = input.completedAt;
    deadlineData.signedContractDueAt = addByRule(
      input.completedAt,
      rules.signed_contract_return.amount,
      rules.signed_contract_return.unit,
    );
  }

  return deadlineData;
}

export function hasAdmin() {
  const row = adminCountStatement.get();
  return row.count > 0;
}

export function createUser({ fullName, passwordHash, role, stationId = null, createdBy = null, actor = null }) {
  const createdAt = getTimestamp();
  const normalized = normalizeLoginKey(fullName);
  const result = createUserStatement.run(
    fullName,
    normalized,
    passwordHash,
    role,
    stationId || null,
    createdBy || null,
    createdAt,
  );
  const user = getUserById(Number(result.lastInsertRowid));

  recordAuditLog({
    actor,
    stationId: user.stationId,
    entityType: 'user',
    entityId: user.id,
    action: 'create',
    summary: `Створено користувача ${user.fullName} (${user.role}).`,
    after: { id: user.id, fullName: user.fullName, role: user.role, stationId: user.stationId },
  });

  return user;
}

export function listUsersForUser(user) {
  if (user.role === 'admin') {
    return listAllUsersStatement.all().map(mapUser);
  }

  if (user.role === 'manager') {
    return listStationCustomersStatement.all(user.stationId).map(mapUser);
  }

  return [];
}

export function listManagers() {
  return listManagersStatement.all().map(mapUser);
}

export function findUserByFullName(fullName) {
  return mapUser(findUserByNormalizedNameStatement.get(normalizeLoginKey(fullName)));
}

export function getUserById(userId) {
  return mapUser(getUserByIdStatement.get(userId));
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
  const user = mapUser(session);

  return {
    token: session.token,
    user,
  };
}

export function removeSession(token) {
  deleteSessionStatement.run(token);
}

export function listStations() {
  return listStationsStatement.all().map(mapStation);
}

export function getStationById(stationId) {
  return mapStation(getStationByIdStatement.get(stationId));
}

export function createStation(input, actor) {
  const timestamp = getTimestamp();
  const result = createStationStatement.run(
    input.name,
    input.edrpou,
    input.address,
    input.phone,
    input.email,
    input.directorName,
    input.notes,
    input.isActive ? 1 : 0,
    timestamp,
    timestamp,
  );
  const station = getStationById(Number(result.lastInsertRowid));

  recordAuditLog({
    actor,
    stationId: station.id,
    entityType: 'station',
    entityId: station.id,
    action: 'create',
    summary: `Створено станцію/компанію "${station.name}".`,
    after: station,
  });

  return station;
}

export function updateStation(stationId, input, actor) {
  const current = getStationById(stationId);

  if (!current) {
    return null;
  }

  updateStationStatement.run(
    input.name,
    input.edrpou,
    input.address,
    input.phone,
    input.email,
    input.directorName,
    input.notes,
    input.isActive ? 1 : 0,
    getTimestamp(),
    stationId,
  );
  const updated = getStationById(stationId);

  recordAuditLog({
    actor,
    stationId,
    entityType: 'station',
    entityId: stationId,
    action: 'update',
    summary: `Оновлено станцію/компанію "${updated.name}".`,
    before: current,
    after: updated,
  });

  return updated;
}

export function listSettings() {
  return listSettingsStatement.all();
}

export function updateSetting(key, value, actor) {
  const current = getSettingStatement.get(key);

  if (!current) {
    return null;
  }

  updateSettingStatement.run(value, actor?.id ?? null, getTimestamp(), key);
  const updated = getSettingStatement.get(key);

  recordAuditLog({
    actor,
    entityType: 'setting',
    entityId: key,
    action: 'update',
    summary: `Оновлено сталий параметр "${updated.label}".`,
    before: current,
    after: updated,
  });

  return updated;
}

export function listDeadlineRules() {
  return listDeadlineRulesStatement.all().map(mapDeadlineRule);
}

export function updateDeadlineRule(key, input, actor) {
  const current = getDeadlineRuleStatement.get(key);

  if (!current) {
    return null;
  }

  updateDeadlineRuleStatement.run(
    input.amount,
    input.unit,
    input.warningDays,
    input.isActive ? 1 : 0,
    actor?.id ?? null,
    getTimestamp(),
    key,
  );
  const updated = mapDeadlineRule(getDeadlineRuleStatement.get(key));

  recordAuditLog({
    actor,
    entityType: 'deadline_rule',
    entityId: key,
    action: 'update',
    summary: `Оновлено правило строку "${updated.label}".`,
    before: mapDeadlineRule(current),
    after: updated,
  });

  return updated;
}

export function listStageTemplates() {
  return listStageTemplatesStatement.all().map(mapStageTemplate);
}

export function updateStageTemplate(templateId, input, actor) {
  const current = getStageTemplateByIdStatement.get(templateId);

  if (!current) {
    return null;
  }

  updateStageTemplateStatement.run(
    input.title,
    input.description,
    input.sortOrder,
    input.defaultExpectedDays,
    input.expectedDaysType,
    input.defaultDueDays,
    input.dueDaysType,
    input.isActive ? 1 : 0,
    actor?.id ?? null,
    getTimestamp(),
    templateId,
  );
  const updated = mapStageTemplate(getStageTemplateByIdStatement.get(templateId));

  recordAuditLog({
    actor,
    entityType: 'stage_template',
    entityId: templateId,
    action: 'update',
    summary: `Оновлено шаблон етапу "${updated.title}".`,
    before: mapStageTemplate(current),
    after: updated,
  });

  return updated;
}

export function listAuditLog(limit = 100) {
  return listAuditLogStatement.all(limit).map(mapAudit);
}

export function createChat({ title, description, stationId = null, createdBy }) {
  const createdAt = getTimestamp();
  const result = createChatStatement.run(title, description, stationId || null, createdBy, createdAt);
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
    stationId: chat.stationId,
    stationName: chat.stationName,
    createdAt: chat.createdAt,
    createdBy: chat.createdBy,
    accessUserIds: listChatMembersForChatStatement.all(chatId).map((row) => row.userId),
  };
}

export function listChatsForUser(user) {
  if (user.role === 'admin') {
    return enrichChats(
      listAllChatsStatement.all(),
      listChatMembersStatement.all(),
    );
  }

  if (user.role === 'manager') {
    return enrichChats(listStationChatsStatement.all(user.stationId), listChatMembersStatement.all());
  }

  return enrichChats(listUserChatsStatement.all(user.id));
}

function createApplicationChat(input, applicationNumber, timestamp) {
  const chatTitle = `Заява ${applicationNumber}: ${input.applicantFullName}`;
  const chatDescription = input.objectAddress;
  const chatResult = createChatStatement.run(
    chatTitle,
    chatDescription,
    input.stationId,
    input.createdBy,
    timestamp,
  );
  const chatId = Number(chatResult.lastInsertRowid);

  if (input.customerUserId) {
    addChatMemberStatement.run(chatId, input.customerUserId, timestamp);
  }

  return chatId;
}

const createApplicationTransaction = db.transaction((input, actor) => {
  const timestamp = getTimestamp();
  const applicationNumber = input.applicationNumber || generateApplicationNumber();
  const chatId = createApplicationChat(input, applicationNumber, timestamp);
  const deadlineData = buildInitialDeadlineData(input);
  const applicationResult = createApplicationStatement.run(
    input.stationId,
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
    safeJson(input.appendixData || {}),
    safeJson(deadlineData),
    input.customerUserId || null,
    chatId,
    input.createdBy,
    timestamp,
    timestamp,
  );
  const applicationId = Number(applicationResult.lastInsertRowid);

  getActiveStageTemplates().forEach((stage) => {
    insertApplicationStageStatement.run(
      applicationId,
      stage.stageKey,
      stage.title,
      stage.description,
      stage.sortOrder,
      'not_started',
      addByRule(input.receivedAt, stage.defaultExpectedDays, stage.expectedDaysType),
      addByRule(input.receivedAt, stage.defaultDueDays, stage.dueDaysType),
      null,
      null,
      '',
      1,
      timestamp,
      timestamp,
    );
  });

  recordAuditLog({
    actor,
    stationId: input.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'create',
    summary: `Створено заяву ${applicationNumber}.`,
    after: { applicationId, applicationNumber, stationId: input.stationId },
  });

  return applicationId;
});

export function createApplication(input, actor) {
  const applicationId = createApplicationTransaction(input, actor);
  return getApplicationById(applicationId);
}

export function listApplicationsForUser(user) {
  const rows = user.role === 'admin'
    ? listApplicationsStatement.all()
    : user.role === 'manager'
      ? listStationApplicationsStatement.all(user.stationId)
      : listCustomerApplicationsStatement.all(user.id, user.id);

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
  if (user.role === 'admin') {
    return true;
  }

  const row = applicationAccessStatement.get(applicationId);

  if (!row) {
    return false;
  }

  if (user.role === 'manager') {
    return row.stationId === user.stationId;
  }

  return row.customerUserId === user.id || Boolean(chatAccessStatement.get(getApplicationById(applicationId)?.chatId, user.id));
}

const updateApplicationTransaction = db.transaction((applicationId, input, actor) => {
  const current = getApplicationByIdStatement.get(applicationId);

  if (!current) {
    return null;
  }

  const timestamp = getTimestamp();
  const applicationNumber = input.applicationNumber || current.applicationNumber;
  const deadlineData = {
    ...parseJsonObject(current.deadlineData),
    ...parseJsonObject(input.deadlineData),
  };

  if (input.connectionType === 'temporary' && !deadlineData.temporaryResponseDueAt) {
    const rule = getDeadlineRulesMap().temporary_connection_response;

    if (rule?.isActive) {
      deadlineData.temporaryResponseDueAt = addByRule(input.receivedAt, rule.amount, rule.unit);
    }
  }

  updateApplicationStatement.run(
    input.stationId,
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
    safeJson(input.appendixData || {}),
    safeJson(deadlineData),
    input.customerUserId || null,
    timestamp,
    applicationId,
  );

  updateChatStatement.run(
    `Заява ${applicationNumber}: ${input.applicantFullName}`,
    input.objectAddress,
    input.stationId,
    current.chatId,
  );
  deleteChatMembersStatement.run(current.chatId);

  if (input.customerUserId) {
    addChatMemberStatement.run(current.chatId, input.customerUserId, timestamp);
  }

  recordAuditLog({
    actor,
    stationId: input.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'update',
    summary: `Оновлено заяву ${applicationNumber}.`,
    before: mapApplication(current),
    after: { applicationId, applicationNumber, stationId: input.stationId },
  });

  return applicationId;
});

export function updateApplication(applicationId, input, actor) {
  const updatedId = updateApplicationTransaction(applicationId, input, actor);
  return updatedId ? getApplicationById(updatedId) : null;
}

const updateApplicationStageTransaction = db.transaction((applicationId, stageId, input, actor) => {
  const currentApplication = getApplicationByIdStatement.get(applicationId);
  const currentStage = getApplicationStageByIdStatement.get(stageId, applicationId);

  if (!currentApplication || !currentStage) {
    return null;
  }

  const timestamp = getTimestamp();
  updateApplicationStageStatement.run(
    input.status,
    normalizeDateInput(input.expectedAt),
    normalizeDateInput(input.dueAt),
    normalizeDateInput(input.startedAt),
    normalizeDateInput(input.completedAt),
    input.publicNote,
    input.isVisible ? 1 : 0,
    timestamp,
    stageId,
    applicationId,
  );

  const deadlineData = updateDeadlineDataForStage(currentApplication, currentStage, input);
  updateApplicationDeadlineDataStatement.run(safeJson(deadlineData), timestamp, applicationId);
  updateApplicationTouchedStatement.run(timestamp, applicationId);

  const updatedApplication = getApplicationById(applicationId);
  const updatedStage = updatedApplication.stages.find((stage) => stage.id === stageId);
  const completedNow = input.status === 'completed' && input.completedAt;
  const wasCompleted = currentStage.status === 'completed'
    && currentStage.completedAt === input.completedAt;

  if (completedNow && !wasCompleted) {
    createStageNotification(updatedApplication, updatedStage, timestamp);
  }

  recordAuditLog({
    actor,
    stationId: updatedApplication.stationId,
    entityType: 'application_stage',
    entityId: stageId,
    action: 'update',
    summary: `Оновлено етап "${updatedStage.title}" у заяві ${updatedApplication.applicationNumber}.`,
    before: mapApplicationStage(currentStage),
    after: updatedStage,
  });

  return updatedApplication;
});

export function updateApplicationStage(applicationId, stageId, input, actor) {
  return updateApplicationStageTransaction(applicationId, stageId, input, actor);
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

const deleteApplicationTransaction = db.transaction((applicationId, actor) => {
  const application = getApplicationByIdStatement.get(applicationId);

  if (!application) {
    return null;
  }

  const storedFiles = chatAttachmentFilesStatement
    .all(application.chatId)
    .map((file) => file.storedName);

  deleteApplicationStatement.run(applicationId);
  deleteChatStatement.run(application.chatId);

  recordAuditLog({
    actor,
    stationId: application.stationId,
    entityType: 'application',
    entityId: application.id,
    action: 'delete',
    summary: `Видалено заяву ${application.applicationNumber}. Згенеровані документи залишені на сервері.`,
    before: mapApplication(application),
  });

  return {
    id: application.id,
    storedFiles,
  };
});

export function deleteApplication(applicationId, actor) {
  return deleteApplicationTransaction(applicationId, actor);
}

const replaceChatAccessTransaction = db.transaction((chatId, userIds) => {
  deleteChatMembersStatement.run(chatId);

  const createdAt = getTimestamp();

  for (const userId of userIds) {
    addChatMemberStatement.run(chatId, userId, createdAt);
  }
});

export function replaceChatAccess(chatId, userIds) {
  replaceChatAccessTransaction(chatId, userIds);
  return getChatById(chatId);
}

const softDeleteUserTransaction = db.transaction((userId, actor) => {
  const user = getUserById(userId);

  if (!user || user.role === 'admin' || user.deleted_at) {
    return null;
  }

  const deletedAt = getTimestamp();
  const normalized = `${user.full_name_normalized}::deleted::${user.id}::${Date.now()}`;

  softDeleteUserStatement.run(normalized, deletedAt, userId);
  deleteUserSessionsStatement.run(userId);
  deleteUserChatMembersStatement.run(userId);

  recordAuditLog({
    actor,
    stationId: user.stationId,
    entityType: 'user',
    entityId: user.id,
    action: 'delete',
    summary: `Видалено користувача ${user.fullName}.`,
    before: { id: user.id, fullName: user.fullName, role: user.role, stationId: user.stationId },
  });

  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    stationId: user.stationId,
  };
});

export function deleteUser(userId, actor) {
  return softDeleteUserTransaction(userId, actor);
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
  if (user.role === 'admin') {
    return true;
  }

  const application = applicationChatAccessStatement.get(chatId);

  if (application) {
    if (user.role === 'manager') {
      return application.stationId === user.stationId;
    }

    return application.customerUserId === user.id || Boolean(chatAccessStatement.get(chatId, user.id));
  }

  if (user.role === 'manager') {
    const chat = getChatById(chatId);
    return chat?.stationId === user.stationId;
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

export function createGeneratedDocumentRecord(input, actor) {
  const timestamp = getTimestamp();
  const result = insertGeneratedDocumentStatement.run(
    input.applicationId,
    input.applicationNumber,
    input.stationId,
    input.documentType,
    input.title,
    input.storedName,
    input.originalName,
    input.mimeType,
    input.size,
    actor?.id ?? null,
    timestamp,
  );
  const document = getGeneratedDocumentById(Number(result.lastInsertRowid));

  recordAuditLog({
    actor,
    stationId: input.stationId,
    entityType: 'generated_document',
    entityId: document.id,
    action: 'create',
    summary: `Згенеровано документ "${document.title}" для заяви ${input.applicationNumber}.`,
    after: document,
  });

  return document;
}

export function getGeneratedDocumentById(documentId) {
  const row = getGeneratedDocumentByIdStatement.get(documentId);
  return row ? mapGeneratedDocument(row) : null;
}

export function canAccessGeneratedDocument(user, document) {
  if (!document) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  if (user.role === 'manager') {
    return document.stationId === user.stationId;
  }

  if (!document.applicationId) {
    return false;
  }

  return canAccessApplication(user, document.applicationId);
}
