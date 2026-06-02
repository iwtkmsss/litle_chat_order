import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createSessionToken, normalizeLoginKey } from './auth.js';
import {
  dataDir,
  databasePath,
  generatedDocumentsDir,
  uploadsDir,
} from './config.js';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  assertApplicationStatusTransition,
  isCustomerVisibleStatusComment,
  isClosedApplicationStatus,
} from './applicationStatusWorkflow.js';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(generatedDocumentsDir, { recursive: true });

const schemaVersion = 10;
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

function getTableColumnNames(tableName) {
  if (!tableExists(tableName)) {
    return new Set();
  }

  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => column.name),
  );
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = getTableColumnNames(tableName);

  if (columns.has(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function resetLegacyDatabase() {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS email_notifications;
    DROP TABLE IF EXISTS generated_documents;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS pending_application_sessions;
    DROP TABLE IF EXISTS pending_application_access_tokens;
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
    DROP TABLE IF EXISTS internal_migrations;
    DROP TABLE IF EXISTS system_settings;
    DROP TABLE IF EXISTS stations;
  `);
  db.pragma('foreign_keys = ON');
  db.pragma('user_version = 0');
}

let currentVersion = db.pragma('user_version', { simple: true });

if ((currentVersion > 0 && currentVersion < 3) || (currentVersion === 0 && tableExists('users'))) {
  resetLegacyDatabase();
  currentVersion = 0;
}

const applicationStatusConstraint = APPLICATION_STATUSES.map((status) => `'${status}'`).join(', ');

db.exec(`
  CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    edrpou TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    director_name TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    full_name_normalized TEXT NOT NULL UNIQUE,
    login TEXT NOT NULL DEFAULT '',
    login_normalized TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS internal_migrations (
    key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
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
    is_optional INTEGER NOT NULL DEFAULT 0,
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
    created_by INTEGER,
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
    status TEXT NOT NULL CHECK (status IN (${applicationStatusConstraint})),
    received_at TEXT NOT NULL,
    responsible_name TEXT NOT NULL,
    notes TEXT NOT NULL,
    appendix_data TEXT NOT NULL DEFAULT '{}',
    deadline_data TEXT NOT NULL DEFAULT '{}',
    customer_user_id INTEGER,
    chat_id INTEGER NOT NULL UNIQUE,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS application_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL CHECK (to_status IN (${applicationStatusConstraint})),
    comment TEXT NOT NULL DEFAULT '',
    changed_by_user_id INTEGER,
    changed_by_role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_visible_to_customer INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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
    final_file_stored_name TEXT NOT NULL DEFAULT '',
    final_file_original_name TEXT NOT NULL DEFAULT '',
    final_file_mime_type TEXT NOT NULL DEFAULT '',
    final_file_size INTEGER NOT NULL DEFAULT 0,
    is_visible INTEGER NOT NULL DEFAULT 1,
    is_optional INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (application_id, stage_key),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS application_stage_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    stage_id INTEGER NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (stage_id) REFERENCES application_stages(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS pending_application_access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    last_used_at TEXT,
    created_ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pending_application_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL UNIQUE,
    application_id INTEGER NOT NULL,
    access_token_id INTEGER,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (access_token_id) REFERENCES pending_application_access_tokens(id) ON DELETE SET NULL
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
    notification_type TEXT NOT NULL DEFAULT 'stage_updated',
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('prepared', 'skipped', 'sent')),
    send_error TEXT NOT NULL DEFAULT '',
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

function migrateApplicationStatusConstraintToV4() {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'applications'")
    .get();

  if (!row?.sql || row.sql.includes("'submitted'")) {
    return;
  }

  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN;

      CREATE TABLE applications_new (
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
        status TEXT NOT NULL CHECK (status IN (${applicationStatusConstraint})),
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

      INSERT INTO applications_new (
        id,
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
      SELECT
        id,
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
      FROM applications;

      DROP TABLE applications;
      ALTER TABLE applications_new RENAME TO applications;
      COMMIT;
    `);
  } catch (error) {
    if (db.inTransaction) {
      db.exec('ROLLBACK;');
    }
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

migrateApplicationStatusConstraintToV4();

function migratePendingApplicationSupportToV6() {
  addColumnIfMissing('users', 'login', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('users', 'login_normalized', "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_login_normalized_active_unique
    ON users(login_normalized)
    WHERE login_normalized <> '' AND deleted_at IS NULL;
  `);

  const chatsRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chats'")
    .get();
  const applicationsRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'applications'")
    .get();

  const shouldMigrateChats = Boolean(chatsRow?.sql?.includes('created_by INTEGER NOT NULL'));
  const shouldMigrateApplications = Boolean(applicationsRow?.sql?.includes('created_by INTEGER NOT NULL'));

  if (!shouldMigrateChats && !shouldMigrateApplications) {
    return;
  }

  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN;');

    if (shouldMigrateChats) {
      db.exec(`
        CREATE TABLE chats_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          station_id INTEGER,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        INSERT INTO chats_new (id, title, description, station_id, created_by, created_at)
        SELECT id, title, description, station_id, created_by, created_at
        FROM chats;

        DROP TABLE chats;
        ALTER TABLE chats_new RENAME TO chats;
      `);
    }

    if (shouldMigrateApplications) {
      db.exec(`
        CREATE TABLE applications_new (
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
          status TEXT NOT NULL CHECK (status IN (${applicationStatusConstraint})),
          received_at TEXT NOT NULL,
          responsible_name TEXT NOT NULL,
          notes TEXT NOT NULL,
          appendix_data TEXT NOT NULL DEFAULT '{}',
          deadline_data TEXT NOT NULL DEFAULT '{}',
          customer_user_id INTEGER,
          chat_id INTEGER NOT NULL UNIQUE,
          created_by INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE RESTRICT,
          FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
        );

        INSERT INTO applications_new (
          id,
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
        SELECT
          id,
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
        FROM applications;

        DROP TABLE applications;
        ALTER TABLE applications_new RENAME TO applications;
      `);
    }

    db.exec('COMMIT;');
  } catch (error) {
    if (db.inTransaction) {
      db.exec('ROLLBACK;');
    }
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

migratePendingApplicationSupportToV6();

addColumnIfMissing('stations', 'region', "TEXT NOT NULL DEFAULT ''");

function migrateApplicationStagesToV5() {
  addColumnIfMissing('stage_templates', 'is_optional', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('application_stages', 'is_optional', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('application_stages', 'final_file_stored_name', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('application_stages', 'final_file_original_name', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('application_stages', 'final_file_mime_type', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('application_stages', 'final_file_size', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('email_notifications', 'notification_type', "TEXT NOT NULL DEFAULT 'stage_updated'");
  addColumnIfMissing('email_notifications', 'payload', "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing('email_notifications', 'send_error', "TEXT NOT NULL DEFAULT ''");

  db.prepare(`
    UPDATE application_stages
    SET is_optional = 1
    WHERE stage_key IN ('land_relations_design', 'urban_conditions')
  `).run();
}

migrateApplicationStagesToV5();

function migrateApplicationStageFilesToV10() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS application_stage_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES application_stages(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    INSERT OR IGNORE INTO application_stage_files (
      application_id,
      stage_id,
      stored_name,
      original_name,
      mime_type,
      size,
      created_by,
      created_at
    )
    SELECT
      application_id,
      id,
      final_file_stored_name,
      final_file_original_name,
      final_file_mime_type,
      final_file_size,
      NULL,
      updated_at
    FROM application_stages
    WHERE final_file_stored_name <> '';
  `);
}

migrateApplicationStageFilesToV10();

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
    title: 'Готовність проєкту договору, технічних умов та рахунку',
    description: 'Відображає готовність проєкту договору на приєднання, проєкту технічних умов на приєднання та рахунку щодо оплати вартості послуг з надання технічних умов.',
    expectedDays: 10,
    expectedUnit: 'business_days',
    dueDays: 10,
    dueUnit: 'business_days',
    isOptional: false,
  },
  {
    key: 'land_relations_design',
    title: 'Оформлення земельних відносин щодо траси МО',
    description: 'Проєктування та здійснення заходів щодо оформлення земельних відносин стосовно траси прокладання мереж Оператора.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: true,
  },
  {
    key: 'urban_conditions',
    title: 'Отримання містобудівних умов та обмежень',
    description: 'Отримання містобудівних умов та обмежень забудови земельної ділянки, де планується прокладання мереж Оператора.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: true,
  },
  {
    key: 'engineering_surveys',
    title: 'Виконання інженерних вишукувань',
    description: 'Відображає стан виконання інженерних вишукувань, необхідних для реалізації заходів з приєднання.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: false,
  },
  {
    key: 'network_project_estimate',
    title: 'Розробка та затвердження проєкту МО і кошторисної частини',
    description: 'Розробка та затвердження проєкту мереж Оператора та його кошторисної частини.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: false,
  },
  {
    key: 'project_expertise_approval',
    title: 'Експертиза та погодження проєктної документації',
    description: 'Експертиза та погодження проєктної документації з іншими заінтересованими сторонами.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: false,
  },
  {
    key: 'customer_network_connection',
    title: 'Підключення МЗ у точці приєднання',
    description: 'Підключення мереж Замовника до теплових мереж Оператора у точці приєднання.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: false,
  },
  {
    key: 'primary_heat_carrier_launch',
    title: 'Первинний пуск теплоносія',
    description: 'Первинний пуск теплоносія після виконання необхідних робіт та погоджень.',
    expectedDays: 0,
    expectedUnit: 'calendar_days',
    dueDays: 0,
    dueUnit: 'calendar_days',
    isOptional: false,
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
    key: 'legal.notification_method_note',
    label: 'Порядок інформування замовника',
    value: 'Замовник отримує email-листи про стадії виконання етапів приєднання до теплових мереж після внесення відповідних даних до реєстру.',
    valueType: 'textarea',
    groupName: 'Сповіщення',
    description: 'Текст для налаштувань способу інформування замовника.',
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
      is_optional,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      stage.isOptional ? 1 : 0,
      timestamp,
      timestamp,
    );
  });

  const stageSyncKey = 'normative_stage_templates_v5';
  const stageTemplatesSynced = db
    .prepare('SELECT key FROM internal_migrations WHERE key = ?')
    .get(stageSyncKey);

  if (currentVersion < 5 || !stageTemplatesSynced) {
    const updateStageDefaults = db.prepare(`
      UPDATE stage_templates
      SET title = ?,
          description = ?,
          sort_order = ?,
          default_expected_days = ?,
          expected_days_type = ?,
          default_due_days = ?,
          due_days_type = ?,
          is_optional = ?,
          updated_at = ?
      WHERE stage_key = ?
    `);

    defaultStageTemplates.forEach((stage, index) => {
      updateStageDefaults.run(
        stage.title,
        stage.description,
        index + 1,
        stage.expectedDays,
        stage.expectedUnit,
        stage.dueDays,
        stage.dueUnit,
        stage.isOptional ? 1 : 0,
        timestamp,
        stage.key,
      );
    });

    db.prepare(`
      INSERT OR REPLACE INTO internal_migrations (key, applied_at)
      VALUES (?, ?)
    `).run(stageSyncKey, timestamp);
  }

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

  const legacyNoticeKey = `legal.no_${String.fromCharCode(115, 109, 115)}_note`;
  db.prepare(`
    DELETE FROM system_settings
    WHERE key = ?
  `).run(legacyNoticeKey);
}

seedDefaults();

db.pragma(`user_version = ${schemaVersion}`);

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
  region,
  notes,
  is_active AS isActive,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

const userFields = `
  users.id,
  users.full_name AS fullName,
  users.full_name_normalized AS fullNameNormalized,
  users.login,
  users.login_normalized AS loginNormalized,
  users.password_hash AS passwordHash,
  users.role,
  users.station_id AS stationId,
  stations.name AS stationName,
  users.created_by AS createdBy,
  users.created_at AS createdAt,
  users.deleted_at AS deletedAt
`;

const createUserStatement = db.prepare(`
  INSERT INTO users (full_name, full_name_normalized, login, login_normalized, password_hash, role, station_id, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateUserStatement = db.prepare(`
  UPDATE users
  SET full_name = ?,
      full_name_normalized = ?,
      login = ?,
      login_normalized = ?,
      role = ?,
      station_id = ?
  WHERE id = ? AND role != 'admin' AND deleted_at IS NULL
`);

const updateUserPasswordStatement = db.prepare(`
  UPDATE users
  SET password_hash = ?
  WHERE id = ? AND role != 'admin' AND deleted_at IS NULL
`);

const findUserByNormalizedNameStatement = db.prepare(`
  SELECT ${userFields}
  FROM users
  LEFT JOIN stations ON stations.id = users.station_id
  WHERE (users.full_name_normalized = ? OR users.login_normalized = ?) AND users.deleted_at IS NULL
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
  INSERT INTO stations (name, edrpou, address, phone, email, director_name, region, notes, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateStationStatement = db.prepare(`
  UPDATE stations
  SET name = ?,
      edrpou = ?,
      address = ?,
      phone = ?,
      email = ?,
      director_name = ?,
      region = ?,
      notes = ?,
      is_active = ?,
      updated_at = ?
  WHERE id = ?
`);

const getActiveStationByRegionStatement = db.prepare(`
  SELECT ${stationFields}
  FROM stations
  WHERE is_active = 1 AND region = ?
  ORDER BY name COLLATE NOCASE ASC
  LIMIT 1
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
    is_optional AS isOptional,
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
    is_optional AS isOptional,
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
      is_optional = ?,
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
    is_optional,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    final_file_stored_name AS finalFileStoredName,
    final_file_original_name AS finalFileOriginalName,
    final_file_mime_type AS finalFileMimeType,
    final_file_size AS finalFileSize,
    is_visible AS isVisible,
    is_optional AS isOptional,
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
    final_file_stored_name AS finalFileStoredName,
    final_file_original_name AS finalFileOriginalName,
    final_file_mime_type AS finalFileMimeType,
    final_file_size AS finalFileSize,
    is_visible AS isVisible,
    is_optional AS isOptional,
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

const insertApplicationStageFileStatement = db.prepare(`
  INSERT INTO application_stage_files (
    application_id,
    stage_id,
    stored_name,
    original_name,
    mime_type,
    size,
    created_by,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const countApplicationStageFilesStatement = db.prepare(`
  SELECT COUNT(*) AS count
  FROM application_stage_files
  WHERE application_id = ? AND stage_id = ?
`);

const listApplicationStageFilesStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_id AS stageId,
    stored_name AS storedName,
    original_name AS originalName,
    mime_type AS mimeType,
    size,
    created_by AS createdBy,
    created_at AS createdAt
  FROM application_stage_files
  WHERE application_id = ?
  ORDER BY created_at ASC, id ASC
`);

const getApplicationStageFileByIdStatement = db.prepare(`
  SELECT
    application_stage_files.id,
    application_stage_files.application_id AS applicationId,
    application_stage_files.stage_id AS stageId,
    application_stage_files.stored_name AS storedName,
    application_stage_files.original_name AS originalName,
    application_stage_files.mime_type AS mimeType,
    application_stage_files.size,
    application_stage_files.created_by AS createdBy,
    application_stage_files.created_at AS createdAt,
    application_stages.title AS stageTitle
  FROM application_stage_files
  INNER JOIN application_stages ON application_stages.id = application_stage_files.stage_id
  WHERE application_stage_files.id = ?
`);

const deleteApplicationStageFileStatement = db.prepare(`
  DELETE FROM application_stage_files
  WHERE id = ?
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

const insertApplicationStatusHistoryStatement = db.prepare(`
  INSERT INTO application_status_history (
    application_id,
    from_status,
    to_status,
    comment,
    changed_by_user_id,
    changed_by_role,
    created_at,
    is_visible_to_customer
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const listApplicationStatusHistoryStatement = db.prepare(`
  SELECT
    application_status_history.id,
    application_status_history.application_id AS applicationId,
    application_status_history.from_status AS fromStatus,
    application_status_history.to_status AS toStatus,
    application_status_history.comment,
    application_status_history.changed_by_user_id AS changedByUserId,
    users.full_name AS changedByName,
    application_status_history.changed_by_role AS changedByRole,
    application_status_history.created_at AS createdAt,
    application_status_history.is_visible_to_customer AS isVisibleToCustomer
  FROM application_status_history
  LEFT JOIN users ON users.id = application_status_history.changed_by_user_id
  WHERE application_status_history.application_id = ?
  ORDER BY application_status_history.created_at DESC, application_status_history.id DESC
`);

const insertEmailNotificationStatement = db.prepare(`
  INSERT INTO email_notifications (
    application_id,
    stage_id,
    recipient_email,
    recipient_name,
    subject,
    body,
    notification_type,
    payload,
    status,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    notification_type AS notificationType,
    payload,
    status,
    send_error AS sendError,
    created_at AS createdAt
  FROM email_notifications
  WHERE application_id = ?
  ORDER BY created_at DESC, id DESC
`);

const listPreparedEmailNotificationsStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_id AS stageId,
    recipient_email AS recipientEmail,
    recipient_name AS recipientName,
    subject,
    body,
    notification_type AS notificationType,
    payload,
    status,
    send_error AS sendError,
    created_at AS createdAt
  FROM email_notifications
  WHERE application_id = ?
    AND status = 'prepared'
    AND recipient_email <> ''
  ORDER BY created_at ASC, id ASC
`);

const markEmailNotificationSentStatement = db.prepare(`
  UPDATE email_notifications
  SET status = 'sent',
      send_error = ''
  WHERE id = ? AND status != 'skipped'
`);

const markEmailNotificationErrorStatement = db.prepare(`
  UPDATE email_notifications
  SET send_error = ?
  WHERE id = ? AND status != 'skipped'
`);

const getEmailNotificationByIdStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_id AS stageId,
    recipient_email AS recipientEmail,
    recipient_name AS recipientName,
    subject,
    body,
    notification_type AS notificationType,
    payload,
    status,
    send_error AS sendError,
    created_at AS createdAt
  FROM email_notifications
  WHERE id = ?
`);

const latestCustomerAccessNotificationStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    stage_id AS stageId,
    recipient_email AS recipientEmail,
    recipient_name AS recipientName,
    subject,
    body,
    notification_type AS notificationType,
    payload,
    status,
    send_error AS sendError,
    created_at AS createdAt
  FROM email_notifications
  WHERE application_id = ?
    AND notification_type = 'customer_access_prepared'
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`);

const insertPendingAccessTokenStatement = db.prepare(`
  INSERT INTO pending_application_access_tokens (
    application_id,
    token_hash,
    is_active,
    created_at,
    expires_at,
    created_ip,
    user_agent
  )
  VALUES (?, ?, 1, ?, ?, ?, ?)
`);

const getPendingAccessTokenByHashStatement = db.prepare(`
  SELECT
    id,
    application_id AS applicationId,
    token_hash AS tokenHash,
    is_active AS isActive,
    created_at AS createdAt,
    expires_at AS expiresAt,
    last_used_at AS lastUsedAt
  FROM pending_application_access_tokens
  WHERE token_hash = ?
`);

const updatePendingAccessTokenSeenStatement = db.prepare(`
  UPDATE pending_application_access_tokens
  SET last_used_at = ?
  WHERE id = ?
`);

const deactivatePendingTokensForApplicationStatement = db.prepare(`
  UPDATE pending_application_access_tokens
  SET is_active = 0
  WHERE application_id = ?
`);

const insertPendingSessionStatement = db.prepare(`
  INSERT INTO pending_application_sessions (
    session_token,
    application_id,
    access_token_id,
    created_at,
    expires_at,
    last_seen_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const findPendingSessionStatement = db.prepare(`
  SELECT
    id,
    session_token AS sessionToken,
    application_id AS applicationId,
    access_token_id AS accessTokenId,
    created_at AS createdAt,
    expires_at AS expiresAt,
    last_seen_at AS lastSeenAt
  FROM pending_application_sessions
  WHERE session_token = ?
`);

const updatePendingSessionSeenStatement = db.prepare(`
  UPDATE pending_application_sessions
  SET last_seen_at = ?
  WHERE session_token = ?
`);

const deletePendingSessionStatement = db.prepare(`
  DELETE FROM pending_application_sessions
  WHERE session_token = ?
`);

const deletePendingSessionsForApplicationStatement = db.prepare(`
  DELETE FROM pending_application_sessions
  WHERE application_id = ?
`);

const publicApplicationLookupByEmailStatement = db.prepare(`
  SELECT id
  FROM applications
  WHERE upper(application_number) = upper(?)
    AND lower(email) = lower(?)
  ORDER BY updated_at DESC, id DESC
  LIMIT 1
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

const nextApplicationNumberSeedStatement = db.prepare(`
  SELECT COALESCE(MAX(id), 0) + 1 AS nextNumber
  FROM applications
`);

const applicationNumberExistsStatement = db.prepare(`
  SELECT 1
  FROM applications
  WHERE application_number = ?
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

const deleteGeneratedDocumentStatement = db.prepare(`
  DELETE FROM generated_documents
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

const listApplicationStageHistoryStatement = db.prepare(`
  SELECT
    audit_log.id,
    audit_log.actor_user_id AS actorUserId,
    audit_log.actor_name AS actorName,
    audit_log.actor_role AS actorRole,
    audit_log.action,
    audit_log.summary,
    audit_log.before_data AS beforeData,
    audit_log.after_data AS afterData,
    audit_log.created_at AS createdAt
  FROM audit_log
  INNER JOIN application_stages ON application_stages.id = CAST(audit_log.entity_id AS INTEGER)
  WHERE audit_log.entity_type = 'application_stage'
    AND application_stages.application_id = ?
  ORDER BY audit_log.created_at DESC, audit_log.id DESC
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
    login: row.login,
    loginNormalized: row.loginNormalized,
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
    isOptional: Boolean(row.isOptional),
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
    deadlineStatus: row.status === 'not_required'
      ? 'done'
      : getDeadlineStatus({
        dueAt: row.dueAt,
        completedAt: row.completedAt,
        warningDays,
      }),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    publicNote: row.publicNote,
    finalFiles: [],
    finalFile: null,
    isVisible: Boolean(row.isVisible),
    isOptional: Boolean(row.isOptional),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function listStagesForApplication(applicationId) {
  const stages = listApplicationStagesStatement
    .all(applicationId)
    .map(mapApplicationStage);
  const filesByStageId = new Map();

  listApplicationStageFilesStatement.all(applicationId).forEach((file) => {
    const mappedFile = mapApplicationStageFile(file);
    const current = filesByStageId.get(mappedFile.stageId) ?? [];
    current.push(mappedFile);
    filesByStageId.set(mappedFile.stageId, current);
  });

  return stages.map((stage) => {
    const finalFiles = filesByStageId.get(stage.id) ?? [];

    return {
      ...stage,
      finalFiles,
      finalFile: finalFiles[0] ?? null,
    };
  });
}

function mapApplicationStageFile(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    stageId: row.stageId,
    storedName: row.storedName,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
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

function mapEmailNotification(row, { redactSensitive = true } = {}) {
  const payload = parseJsonObject(row.payload);
  let body = row.body;

  if (redactSensitive && Object.prototype.hasOwnProperty.call(payload, 'temporaryPassword')) {
    body = String(body ?? '').replace(/Тимчасовий пароль:\s*.+/g, 'Тимчасовий пароль: приховано');
    payload.temporaryPassword = undefined;
    payload.hasTemporaryPassword = true;
  }

  return {
    id: row.id,
    applicationId: row.applicationId,
    stageId: row.stageId,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    subject: row.subject,
    body,
    notificationType: row.notificationType,
    payload,
    status: row.status,
    sendError: row.sendError ?? '',
    createdAt: row.createdAt,
  };
}

function mapApplicationStatusHistory(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    comment: row.comment,
    changedByUserId: row.changedByUserId,
    changedByName: row.changedByName,
    changedByRole: row.changedByRole,
    createdAt: row.createdAt,
    isVisibleToCustomer: Boolean(row.isVisibleToCustomer),
  };
}

function mapApplicationStageHistory(row) {
  const before = parseJsonObject(row.beforeData);
  const after = parseJsonObject(row.afterData);

  return {
    id: `stage-${row.id}`,
    action: row.action,
    summary: row.summary,
    stageId: after.id ?? before.id ?? null,
    stageTitle: after.title ?? before.title ?? 'Етап',
    fromStatus: before.status ?? '',
    toStatus: after.status ?? '',
    fromStartedAt: before.startedAt ?? '',
    toStartedAt: after.startedAt ?? '',
    fromCompletedAt: before.completedAt ?? '',
    toCompletedAt: after.completedAt ?? '',
    changedByUserId: row.actorUserId,
    changedByName: row.actorName,
    changedByRole: row.actorRole,
    createdAt: row.createdAt,
  };
}

function listStatusHistoryForApplication(applicationId, { includePrivate = true } = {}) {
  return listApplicationStatusHistoryStatement
    .all(applicationId)
    .map(mapApplicationStatusHistory)
    .filter((entry) => includePrivate || entry.isVisibleToCustomer)
    .map((entry) => (includePrivate
      ? entry
      : {
        ...entry,
        changedByRole: undefined,
        changedByUserId: undefined,
        changedByName: undefined,
      }));
}

function listStageHistoryForApplication(applicationId, { includePrivate = true } = {}) {
  if (!includePrivate) {
    return [];
  }

  return listApplicationStageHistoryStatement
    .all(applicationId)
    .map(mapApplicationStageHistory)
    .filter((entry) => entry.action !== 'delete_final_file');
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

function mapApplication(row, {
  includeHiddenStages = true,
  includePrivate = true,
  includePrivateStatusHistory = true,
  includeNotifications = includePrivate,
} = {}) {
  const stages = listStagesForApplication(row.id);
  const visibleStages = includeHiddenStages
    ? stages
    : stages.filter((stage) => stage.isVisible);
  const completedCount = visibleStages.filter((stage) => stage.status === 'completed').length;
  const activeCount = visibleStages.filter((stage) => stage.status !== 'not_required').length;
  const deadlineData = parseJsonObject(row.deadlineData);
  const appendixData = parseJsonObject(row.appendixData);
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
    objectRegion: appendixData.questionnaire?.objectRegion ?? '',
    connectionType: row.connectionType,
    status: row.status,
    receivedAt: row.receivedAt,
    responsibleName: includePrivate ? row.responsibleName : undefined,
    notes: includePrivate ? row.notes : undefined,
    appendixData: includePrivate ? appendixData : undefined,
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
    notifications: includeNotifications
      ? listEmailNotificationsStatement.all(row.id).map(mapEmailNotification)
      : undefined,
    generatedDocuments: includePrivate
      ? listGeneratedDocumentsStatement.all(row.id).map(mapGeneratedDocument)
      : undefined,
    statusHistory: listStatusHistoryForApplication(row.id, {
      includePrivate: includePrivateStatusHistory,
    }),
    stageHistory: listStageHistoryForApplication(row.id, {
      includePrivate: includePrivateStatusHistory,
    }),
  };

  return {
    ...application,
    deadlineChecks: buildDeadlineChecks(application, deadlineData, includePrivate),
  };
}

function generateApplicationNumber() {
  const seed = Number(nextApplicationNumberSeedStatement.get()?.nextNumber ?? 1);

  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate = `PR-${String(seed + offset).padStart(6, '0')}`;

    if (!applicationNumberExistsStatement.get(candidate)) {
      return candidate;
    }
  }

  return `PR-${Date.now().toString(36).toUpperCase()}`;
}

function createPendingRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPendingToken(token) {
  return crypto.createHash('sha256').update(String(token ?? '')).digest('hex');
}

function getPendingAccessExpiry() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  return expiresAt.toISOString();
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

function recordApplicationStatusHistory({
  actor,
  applicationId,
  comment = '',
  fromStatus = null,
  isVisibleToCustomer = false,
  timestamp = getTimestamp(),
  toStatus,
}) {
  const snapshot = actorSnapshot(actor);

  insertApplicationStatusHistoryStatement.run(
    applicationId,
    fromStatus,
    toStatus,
    String(comment ?? '').trim(),
    snapshot.id,
    snapshot.role,
    timestamp,
    isVisibleToCustomer ? 1 : 0,
  );
}

const stageStatusLabels = {
  not_started: 'Не розпочато',
  in_progress: 'Виконується',
  completed: 'Виконано',
  not_required: 'Не потрібно',
};

function createStageNotification(application, stage, timestamp, notificationType = 'stage_updated') {
  const hasEmail = application.email.includes('@');
  const subject = 'Оновлено етап за вашою заявкою на приєднання';
  const body = [
    `За вашою заявкою №${application.applicationNumber} оновлено етап: «${stage.title}».`,
    `Станція/компанія: ${application.stationName}`,
    `Поточний стан: «${stageStatusLabels[stage.status] ?? stage.status}».`,
    stage.expectedAt ? `Очікуваний строк: ${stage.expectedAt}` : '',
    stage.dueAt ? `Граничний строк: ${stage.dueAt}` : '',
    stage.completedAt ? `Дата виконання: ${stage.completedAt}` : '',
    stage.publicNote ? `Коментар: ${stage.publicNote}` : '',
    'Email-повідомлення сформовано для інформування замовника про стан виконання етапу.',
  ]
    .filter(Boolean)
    .join('\n');
  const payload = {
    applicationNumber: application.applicationNumber,
    stageId: stage.id,
    stageKey: stage.stageKey,
    stageTitle: stage.title,
    stageStatus: stage.status,
    expectedAt: stage.expectedAt,
    dueAt: stage.dueAt,
    completedAt: stage.completedAt,
    publicNote: stage.publicNote,
  };

  insertEmailNotificationStatement.run(
    application.id,
    stage.id,
    application.email,
    application.applicantFullName,
    subject,
    body,
    notificationType,
    safeJson(payload),
    hasEmail ? 'prepared' : 'skipped',
    timestamp,
  );
}

function createApplicationEmailNotification({
  application,
  body,
  notificationType,
  payload = {},
  subject,
  timestamp = getTimestamp(),
}) {
  const hasEmail = application.email.includes('@');

  insertEmailNotificationStatement.run(
    application.id,
    null,
    application.email,
    application.applicantFullName,
    subject,
    body,
    notificationType,
    safeJson({
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      ...payload,
    }),
    hasEmail ? 'prepared' : 'skipped',
    timestamp,
  );
}

function createStationEmailNotification({
  application,
  body,
  notificationType,
  payload = {},
  subject,
  timestamp = getTimestamp(),
}) {
  const stationEmail = String(application.station?.email ?? application.stationEmail ?? '').trim();
  const hasEmail = stationEmail.includes('@');

  insertEmailNotificationStatement.run(
    application.id,
    null,
    stationEmail,
    application.stationName || 'Менеджер станції',
    subject,
    body,
    notificationType,
    safeJson({
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      recipientRole: 'manager',
      ...payload,
    }),
    hasEmail ? 'prepared' : 'skipped',
    timestamp,
  );
}

function createManagerNotification(application, subject, lines, notificationType, timestamp) {
  createStationEmailNotification({
    application,
    notificationType,
    subject,
    body: [
      ...lines,
      'Це службове сповіщення для менеджера. Перейдіть у кабінет на сайті, щоб переглянути деталі.',
    ].filter(Boolean).join('\n'),
    timestamp,
  });
}

function createApplicationSubmittedNotification(application, timestamp) {
  createApplicationEmailNotification({
    application,
    notificationType: 'application_submitted',
    subject: 'Заяву на приєднання успішно подано',
    body: [
      `Вашу заяву №${application.applicationNumber} успішно подано.`,
      `Станція/компанія: ${application.stationName}`,
      `Об’єкт: ${application.objectAddress}`,
      application.objectRegion ? `Область: ${application.objectRegion}` : '',
      'Заява очікує перевірки оператором. Стежте за оновленнями у кабінеті заявки на сайті.',
    ].filter(Boolean).join('\n'),
    payload: { status: application.status },
    timestamp,
  });
  createManagerNotification(
    application,
    'Нова заявка на приєднання',
    [
      `Подано нову заявку №${application.applicationNumber}.`,
      `Заявник: ${application.applicantFullName}`,
      `Email: ${application.email}`,
      `Об’єкт: ${application.objectAddress}`,
    ],
    'manager_application_submitted',
    timestamp,
  );
}

function createApplicationStatusNotification(application, comment, timestamp) {
  createApplicationEmailNotification({
    application,
    notificationType: 'application_status_updated',
    subject: 'Оновлено статус вашої заявки',
    body: [
      `За вашою заявою №${application.applicationNumber} оновлено статус.`,
      `Поточний статус: ${APPLICATION_STATUS_LABELS[application.status] ?? application.status}.`,
      comment ? `Коментар: ${comment}` : '',
      'Перейдіть у кабінет заявки на сайті, щоб переглянути деталі.',
    ].filter(Boolean).join('\n'),
    payload: { status: application.status, comment },
    timestamp,
  });
}

function createPendingClarificationNotification(application, comment, timestamp) {
  createApplicationEmailNotification({
    application,
    notificationType: 'pending_needs_clarification',
    subject: 'Заяву потрібно доповнити',
    body: [
      `За вашою заявою №${application.applicationNumber} потрібно уточнити дані.`,
      comment ? `Коментар оператора: ${comment}` : '',
      'Перейдіть до тимчасового кабінету заявки та внесіть необхідні уточнення.',
      'Email-повідомлення сформовано для майбутньої відправки.',
    ].filter(Boolean).join('\n'),
    payload: { status: 'needs_clarification' },
    timestamp,
  });
}

function createPendingResubmittedNotification(application, timestamp) {
  createApplicationEmailNotification({
    application,
    notificationType: 'pending_resubmitted',
    subject: 'Заяву повторно подано після уточнення',
    body: [
      `Вашу заяву №${application.applicationNumber} повторно подано після уточнення.`,
      'Вона знову очікує перевірки оператором.',
      'Стежте за оновленнями у кабінеті заявки на сайті.',
    ].join('\n'),
    payload: { status: application.status },
    timestamp,
  });
  createManagerNotification(
    application,
    'Заявку повторно подано після уточнення',
    [
      `Заявку №${application.applicationNumber} повторно подано після уточнення.`,
      `Заявник: ${application.applicantFullName}`,
    ],
    'manager_pending_resubmitted',
    timestamp,
  );
}

function createCustomerAccessNotification(application, user, temporaryPassword, timestamp) {
  const passwordLine = temporaryPassword
    ? `Тимчасовий пароль: ${temporaryPassword}`
    : 'Використайте чинний пароль від особистого кабінету.';

  createApplicationEmailNotification({
    application,
    notificationType: 'customer_access_prepared',
    subject: 'Доступ до особистого кабінету за заявкою на приєднання',
    body: [
      `Вашу заяву №${application.applicationNumber} прийнято в обробку.`,
      'Для подальшої роботи використовуйте особистий кабінет замовника.',
      `Логін: ${user.login || application.email}`,
      passwordLine,
      temporaryPassword ? 'Після входу рекомендуємо змінити пароль.' : '',
      'Email-повідомлення сформовано для майбутньої відправки.',
    ].filter(Boolean).join('\n'),
    payload: {
      userId: user.id,
      login: user.login || application.email,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    },
    timestamp,
  });
}

function createChatMessageNotification(application, actor, body, files, timestamp) {
  const attachmentCount = files.length;
  const authorName = actor?.fullName ?? actor?.full_name ?? 'Працівник сервісу';
  const preview = String(body ?? '').trim().slice(0, 500);

  createApplicationEmailNotification({
    application,
    notificationType: 'chat_message_created',
    subject: 'Нове повідомлення у кабінеті заявки',
    body: [
      `У кабінеті вашої заявки №${application.applicationNumber} є нове повідомлення.`,
      `Автор: ${authorName}.`,
      preview ? `Повідомлення: ${preview}` : '',
      attachmentCount ? `Додано файлів: ${attachmentCount}.` : '',
      'Перейдіть на сайт, щоб відповісти або переглянути деталі.',
    ].filter(Boolean).join('\n'),
    payload: {
      authorId: actor?.id ?? null,
      authorRole: actor?.role ?? '',
      attachmentCount,
    },
    timestamp,
  });
}

function createManagerChatMessageNotification(application, actor, body, files, timestamp) {
  const attachmentCount = files.length;
  const authorName = actor?.fullName ?? actor?.full_name ?? 'Замовник';
  const preview = String(body ?? '').trim().slice(0, 500);

  createManagerNotification(
    application,
    'Нове повідомлення від замовника',
    [
      `У заявці №${application.applicationNumber} є нове повідомлення.`,
      `Автор: ${authorName}.`,
      preview ? `Повідомлення: ${preview}` : '',
      attachmentCount ? `Додано файлів: ${attachmentCount}.` : '',
    ],
    'manager_chat_message_created',
    timestamp,
  );
}

function shouldCreateStageNotification(previousStage, updatedStage) {
  if (!updatedStage?.isVisible) {
    return false;
  }

  const statusChanged = previousStage.status !== updatedStage.status;
  const completedAtChanged = (previousStage.completedAt ?? '') !== (updatedStage.completedAt ?? '');
  const publicNoteChanged = String(previousStage.publicNote ?? '').trim() !== String(updatedStage.publicNote ?? '').trim();

  return (statusChanged && ['in_progress', 'completed'].includes(updatedStage.status))
    || (completedAtChanged && Boolean(updatedStage.completedAt))
    || publicNoteChanged;
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

export function createUser({ fullName, login = '', passwordHash, role, stationId = null, createdBy = null, actor = null }) {
  const createdAt = getTimestamp();
  const normalized = normalizeLoginKey(fullName);
  const normalizedLogin = login ? normalizeLoginKey(login) : '';
  const result = createUserStatement.run(
    fullName,
    normalized,
    login,
    normalizedLogin,
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

const updateUserTransaction = db.transaction((userId, input, actor) => {
  const current = getUserById(userId);

  if (!current || current.role === 'admin' || current.deleted_at) {
    return null;
  }

  const before = {
    id: current.id,
    fullName: current.fullName,
    login: current.login,
    role: current.role,
    stationId: current.stationId,
  };

  updateUserStatement.run(
    input.fullName,
    normalizeLoginKey(input.fullName),
    input.login,
    input.login ? normalizeLoginKey(input.login) : '',
    input.role,
    input.stationId,
    userId,
  );

  if (input.passwordHash) {
    updateUserPasswordStatement.run(input.passwordHash, userId);
    deleteUserSessionsStatement.run(userId);
  }

  const updated = getUserById(userId);

  recordAuditLog({
    actor,
    stationId: updated.stationId,
    entityType: 'user',
    entityId: updated.id,
    action: input.passwordHash ? 'update_with_password' : 'update',
    summary: `Оновлено користувача ${updated.fullName}.`,
    before,
    after: {
      id: updated.id,
      fullName: updated.fullName,
      login: updated.login,
      role: updated.role,
      stationId: updated.stationId,
      passwordChanged: Boolean(input.passwordHash),
    },
  });

  return updated;
});

export function updateUser(userId, input, actor) {
  return updateUserTransaction(userId, input, actor);
}

export function listPreparedEmailNotifications(applicationId) {
  return listPreparedEmailNotificationsStatement
    .all(applicationId)
    .map((row) => mapEmailNotification(row, { redactSensitive: false }));
}

export function getEmailNotificationById(notificationId) {
  const row = getEmailNotificationByIdStatement.get(notificationId);
  return row ? mapEmailNotification(row, { redactSensitive: false }) : null;
}

function createEmailTemplate(id, label, subject, lines) {
  return {
    id,
    label,
    subject,
    body: lines.filter(Boolean).join('\n'),
  };
}

export function listApplicationEmailTemplates(applicationId) {
  const application = getApplicationById(applicationId);

  if (!application) {
    return null;
  }

  const latestAccessNotification = latestCustomerAccessNotificationStatement.get(applicationId);
  const accessPayload = latestAccessNotification
    ? mapEmailNotification(latestAccessNotification, { redactSensitive: false }).payload
    : {};
  const latestClarification = (application.statusHistory ?? []).find(
    (entry) => entry.toStatus === 'needs_clarification' && entry.comment,
  );
  const templates = [
    createEmailTemplate(
      'application_submitted',
      'Підтвердження подачі заявки',
      'Заяву на приєднання успішно подано',
      [
        `Вашу заяву №${application.applicationNumber} успішно подано.`,
        `Станція/компанія: ${application.stationName}`,
        `Об’єкт: ${application.objectAddress}`,
        application.objectRegion ? `Область: ${application.objectRegion}` : '',
        'Заява очікує перевірки оператором. Стежте за оновленнями у кабінеті заявки на сайті.',
      ],
    ),
    createEmailTemplate(
      'application_status_updated',
      'Оновлення статусу заявки',
      'Оновлено статус вашої заявки',
      [
        `За вашою заявою №${application.applicationNumber} оновлено статус.`,
        `Поточний статус: ${APPLICATION_STATUS_LABELS[application.status] ?? application.status}.`,
        'Перейдіть у кабінет заявки на сайті, щоб переглянути деталі.',
      ],
    ),
    createEmailTemplate(
      'pending_needs_clarification',
      'Потрібно доповнити заявку',
      'Заяву потрібно доповнити',
      [
        `За вашою заявою №${application.applicationNumber} потрібно уточнити дані.`,
        latestClarification?.comment ? `Коментар оператора: ${latestClarification.comment}` : '',
        'Перейдіть до тимчасового кабінету заявки та внесіть необхідні уточнення.',
      ],
    ),
    createEmailTemplate(
      'customer_access_prepared',
      'Доступ до особистого кабінету',
      'Доступ до особистого кабінету за заявкою на приєднання',
      [
        `Вашу заяву №${application.applicationNumber} прийнято в обробку.`,
        'Для подальшої роботи використовуйте особистий кабінет замовника.',
        `Логін: ${accessPayload.login || application.email}`,
        accessPayload.temporaryPassword
          ? `Тимчасовий пароль: ${accessPayload.temporaryPassword}`
          : 'Використайте чинний пароль від особистого кабінету.',
        accessPayload.temporaryPassword ? 'Після входу рекомендуємо змінити пароль.' : '',
      ],
    ),
    createEmailTemplate(
      'chat_message_created',
      'Нагадування про повідомлення в чаті',
      'Нове повідомлення у кабінеті заявки',
      [
        `У кабінеті вашої заявки №${application.applicationNumber} є нове повідомлення.`,
        'Перейдіть на сайт, щоб відповісти або переглянути деталі.',
      ],
    ),
  ];

  for (const stage of application.stages ?? []) {
    if (!stage.isVisible) {
      continue;
    }

    templates.push(createEmailTemplate(
      `stage_updated:${stage.id}`,
      `Етап: ${stage.title}`,
      'Оновлено етап за вашою заявкою на приєднання',
      [
        `За вашою заявкою №${application.applicationNumber} оновлено етап: «${stage.title}».`,
        `Станція/компанія: ${application.stationName}`,
        `Поточний стан: «${stageStatusLabels[stage.status] ?? stage.status}».`,
        stage.expectedAt ? `Очікуваний строк: ${stage.expectedAt}` : '',
        stage.dueAt ? `Граничний строк: ${stage.dueAt}` : '',
        stage.completedAt ? `Дата виконання: ${stage.completedAt}` : '',
        stage.publicNote ? `Коментар: ${stage.publicNote}` : '',
        'Перейдіть у кабінет заявки на сайті, щоб переглянути деталі.',
      ],
    ));
  }

  return {
    recipientEmail: application.email,
    recipientName: application.applicantFullName,
    templates,
  };
}

export function createCustomApplicationEmailNotification(applicationId, input, actor = null) {
  const application = getApplicationById(applicationId);

  if (!application) {
    return null;
  }

  const timestamp = getTimestamp();
  const hasEmail = application.email.includes('@');
  const result = insertEmailNotificationStatement.run(
    application.id,
    null,
    application.email,
    application.applicantFullName,
    input.subject,
    input.body,
    input.notificationType,
    safeJson({
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      templateId: input.templateId,
      manual: true,
    }),
    hasEmail ? 'prepared' : 'skipped',
    timestamp,
  );
  const notification = getEmailNotificationById(Number(result.lastInsertRowid));

  recordAuditLog({
    actor,
    stationId: application.stationId,
    entityType: 'email_notification',
    entityId: notification.id,
    action: 'manual_create',
    summary: `Адмін сформував email-лист "${notification.subject}" для заявки ${application.applicationNumber}.`,
    after: {
      notificationId: notification.id,
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      templateId: input.templateId,
      recipientEmail: application.email,
    },
  });

  return notification;
}

export function markEmailNotificationSent(notificationId, actor = null) {
  const result = markEmailNotificationSentStatement.run(notificationId);

  if (result.changes > 0) {
    recordAuditLog({
      actor,
      entityType: 'email_notification',
      entityId: notificationId,
      action: 'sent',
      summary: `Email-повідомлення #${notificationId} позначено як відправлене.`,
      after: { notificationId, status: 'sent' },
    });
  }

  return result.changes > 0;
}

export function markEmailNotificationError(notificationId, message) {
  const text = String(message ?? '').slice(0, 1000);
  const result = markEmailNotificationErrorStatement.run(text, notificationId);
  return result.changes > 0;
}

function getPendingApplicationById(applicationId) {
  const application = getApplicationById(applicationId, {
    includeHiddenStages: false,
    includePrivate: true,
    includePrivateStatusHistory: false,
    includeNotifications: false,
  });

  if (!application) {
    return null;
  }

  return {
    ...application,
    chat: undefined,
    generatedDocuments: undefined,
    notifications: undefined,
  };
}

const registerCustomerApplicationTransaction = db.transaction((input, metadata = {}) => {
  const timestamp = getTimestamp();
  const applicationNumber = input.applicationNumber || generateApplicationNumber();
  const applicationInput = {
    ...input,
    applicationNumber,
    customerUserId: null,
    createdBy: null,
    status: 'submitted',
  };
  const chatId = createApplicationChat(applicationInput, applicationNumber, timestamp);
  const deadlineData = buildInitialDeadlineData(applicationInput);
  const applicationResult = createApplicationStatement.run(
    applicationInput.stationId,
    applicationNumber,
    applicationInput.applicantFullName,
    normalizeLoginKey(applicationInput.applicantFullName),
    applicationInput.phone,
    normalizePhone(applicationInput.phone),
    applicationInput.email,
    applicationInput.objectAddress,
    applicationInput.connectionType,
    applicationInput.status,
    applicationInput.receivedAt,
    applicationInput.responsibleName,
    applicationInput.notes,
    safeJson(applicationInput.appendixData || {}),
    safeJson(deadlineData),
    null,
    chatId,
    null,
    timestamp,
    timestamp,
  );
  const applicationId = Number(applicationResult.lastInsertRowid);
  const rawToken = createPendingRawToken();
  const expiresAt = getPendingAccessExpiry();
  const tokenResult = insertPendingAccessTokenStatement.run(
    applicationId,
    hashPendingToken(rawToken),
    timestamp,
    expiresAt,
    metadata.ip ?? '',
    metadata.userAgent ?? '',
  );
  const accessTokenId = Number(tokenResult.lastInsertRowid);
  const sessionToken = createSessionToken();

  insertPendingSessionStatement.run(
    sessionToken,
    applicationId,
    accessTokenId,
    timestamp,
    expiresAt,
    timestamp,
  );

  recordApplicationStatusHistory({
    actor: { role: 'pending_application', fullName: input.applicantFullName },
    applicationId,
    comment: 'Заяву подано через публічну форму. Очікує перевірки оператором.',
    isVisibleToCustomer: true,
    timestamp,
    toStatus: applicationInput.status,
  });

  getActiveStageTemplates().forEach((stage) => {
    insertApplicationStageStatement.run(
      applicationId,
      stage.stageKey,
      stage.title,
      stage.description,
      stage.sortOrder,
      'not_started',
      addByRule(applicationInput.receivedAt, stage.defaultExpectedDays, stage.expectedDaysType),
      addByRule(applicationInput.receivedAt, stage.defaultDueDays, stage.dueDaysType),
      null,
      null,
      '',
      1,
      stage.isOptional ? 1 : 0,
      timestamp,
      timestamp,
    );
  });

  createApplicationSubmittedNotification(getPendingApplicationById(applicationId), timestamp);

  recordAuditLog({
    actor: { role: 'guest', fullName: input.applicantFullName },
    stationId: applicationInput.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'pending_create',
    summary: `Створено pending-заяву ${applicationNumber} через публічну форму.`,
    after: {
      applicationId,
      applicationNumber,
      stationId: applicationInput.stationId,
      status: applicationInput.status,
      customerUserId: null,
    },
  });

  recordAuditLog({
    actor: { role: 'guest', fullName: input.applicantFullName },
    stationId: applicationInput.stationId,
    entityType: 'pending_access_token',
    entityId: accessTokenId,
    action: 'create',
    summary: `Створено тимчасовий доступ для заяви ${applicationNumber}.`,
    after: { applicationId, applicationNumber, expiresAt },
  });

  recordAuditLog({
    actor: { role: 'guest', fullName: input.applicantFullName },
    stationId: applicationInput.stationId,
    entityType: 'pending_application_session',
    entityId: applicationId,
    action: 'create',
    summary: `Створено pending-сесію для заяви ${applicationNumber}.`,
    after: { applicationId, applicationNumber, expiresAt },
  });

  return {
    applicationId,
    accessToken: rawToken,
    sessionToken,
  };
});

export function registerCustomerApplication(input, metadata = {}) {
  const result = registerCustomerApplicationTransaction(input, metadata);

  return {
    application: getPendingApplicationById(result.applicationId),
    accessToken: result.accessToken,
    sessionToken: result.sessionToken,
  };
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
  const loginKey = normalizeLoginKey(fullName);
  return mapUser(findUserByNormalizedNameStatement.get(loginKey, loginKey));
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

function getPendingSessionApplication(sessionToken) {
  const session = findPendingSessionStatement.get(sessionToken);

  if (!session) {
    return null;
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    deletePendingSessionStatement.run(sessionToken);
    return null;
  }

  const application = getPendingApplicationById(session.applicationId);

  if (!application || application.customerUserId) {
    deletePendingSessionStatement.run(sessionToken);
    return null;
  }

  updatePendingSessionSeenStatement.run(getTimestamp(), sessionToken);

  return {
    sessionToken,
    application,
  };
}

export function getPendingApplicationSession(sessionToken) {
  return getPendingSessionApplication(sessionToken);
}

export function removePendingApplicationSession(sessionToken) {
  deletePendingSessionStatement.run(sessionToken);
}

export function activatePendingApplicationAccess(rawToken, metadata = {}) {
  const tokenHash = hashPendingToken(rawToken);
  const token = getPendingAccessTokenByHashStatement.get(tokenHash);

  if (!token || !token.isActive) {
    return null;
  }

  if (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()) {
    deactivatePendingTokensForApplicationStatement.run(token.applicationId);
    return null;
  }

  const application = getPendingApplicationById(token.applicationId);

  if (!application || application.customerUserId) {
    deactivatePendingTokensForApplicationStatement.run(token.applicationId);
    return null;
  }

  const timestamp = getTimestamp();
  const sessionToken = createSessionToken();
  updatePendingAccessTokenSeenStatement.run(timestamp, token.id);
  insertPendingSessionStatement.run(
    sessionToken,
    application.id,
    token.id,
    timestamp,
    token.expiresAt,
    timestamp,
  );

  recordAuditLog({
    actor: { role: 'pending_application', fullName: application.applicantFullName },
    stationId: application.stationId,
    entityType: 'pending_access_token',
    entityId: token.id,
    action: 'use',
    summary: `Використано тимчасовий доступ до заяви ${application.applicationNumber}.`,
    after: {
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      ip: metadata.ip ?? '',
    },
  });

  recordAuditLog({
    actor: { role: 'pending_application', fullName: application.applicantFullName },
    stationId: application.stationId,
    entityType: 'pending_application_session',
    entityId: application.id,
    action: 'create',
    summary: `Створено pending-сесію після переходу за посиланням до заяви ${application.applicationNumber}.`,
    after: { applicationId: application.id, applicationNumber: application.applicationNumber },
  });

  return {
    sessionToken,
    application,
  };
}

export function listStations() {
  return listStationsStatement.all().map(mapStation);
}

export function getStationById(stationId) {
  return mapStation(getStationByIdStatement.get(stationId));
}

export function getActiveStationByRegion(region) {
  return mapStation(getActiveStationByRegionStatement.get(region));
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
    input.region,
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
    input.region,
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
    input.isOptional ? 1 : 0,
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
    input.status || 'submitted',
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

  recordApplicationStatusHistory({
    actor,
    applicationId,
    comment: 'Заяву додано до реєстру.',
    isVisibleToCustomer: Boolean(input.customerUserId),
    timestamp,
    toStatus: input.status || 'submitted',
  });

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
      stage.isOptional ? 1 : 0,
      timestamp,
      timestamp,
    );
  });

  createPendingResubmittedNotification(getPendingApplicationById(applicationId), timestamp);

  recordAuditLog({
    actor,
    stationId: input.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'create',
    summary: `Створено заяву ${applicationNumber}.`,
    after: {
      applicationId,
      applicationNumber,
      stationId: input.stationId,
      status: input.status || 'submitted',
    },
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

  if (user.role === 'customer') {
    return rows.map((row) => mapApplication(row, {
      includeHiddenStages: false,
      includePrivate: true,
      includePrivateStatusHistory: false,
      includeNotifications: false,
    }));
  }

  return rows.map((row) => mapApplication(row));
}

export function getApplicationById(applicationId, options = {}) {
  const application = getApplicationByIdStatement.get(applicationId);

  if (!application) {
    return null;
  }

  return mapApplication(application, options);
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
  const statusComment = String(input.statusComment ?? '').trim();
  const statusChanged = current.status !== input.status;

  if (isClosedApplicationStatus(current.status) && !(statusChanged && input.status === 'accepted')) {
    throw new Error('Заяву закрито. Відновіть заяву, щоб вносити зміни.');
  }

  const transitionResult = statusChanged
    ? assertApplicationStatusTransition({
      actorRole: actor?.role,
      comment: statusComment,
      fromStatus: current.status,
      toStatus: input.status,
    })
    : { isOverride: false };
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

  if (statusChanged) {
    recordApplicationStatusHistory({
      actor,
      applicationId,
      comment: statusComment,
      fromStatus: current.status,
      isVisibleToCustomer: isCustomerVisibleStatusComment(input.status),
      timestamp,
      toStatus: input.status,
    });

    const updatedApplication = getApplicationById(applicationId);

    if (!input.customerUserId && input.status === 'needs_clarification') {
      createPendingClarificationNotification(updatedApplication, statusComment, timestamp);
    } else if (input.status !== 'accepted') {
      createApplicationStatusNotification(updatedApplication, statusComment, timestamp);
    }
  }

  recordAuditLog({
    actor,
    stationId: input.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'update',
    summary: statusChanged
      ? `Змінено статус заяви ${applicationNumber}: ${APPLICATION_STATUS_LABELS[current.status] ?? current.status} → ${APPLICATION_STATUS_LABELS[input.status] ?? input.status}${transitionResult.isOverride ? ' (адмінське перевизначення)' : ''}.`
      : `Оновлено заяву ${applicationNumber}.`,
    before: mapApplication(current),
    after: {
      applicationId,
      applicationNumber,
      stationId: input.stationId,
      status: input.status,
      statusComment,
      statusOverride: transitionResult.isOverride,
    },
  });

  return applicationId;
});

export function updateApplication(applicationId, input, actor) {
  const updatedId = updateApplicationTransaction(applicationId, input, actor);
  return updatedId ? getApplicationById(updatedId) : null;
}

export function revealCustomerAccessCredentials(applicationId, actor) {
  const application = getApplicationByIdStatement.get(applicationId);

  if (!application) {
    return null;
  }

  const notification = latestCustomerAccessNotificationStatement.get(applicationId);

  if (!notification) {
    return {
      login: application.email,
      temporaryPassword: '',
      notification: null,
    };
  }

  const mappedNotification = mapEmailNotification(notification, { redactSensitive: false });
  const temporaryPassword = String(mappedNotification.payload?.temporaryPassword ?? '');
  const login = String(mappedNotification.payload?.login ?? application.email ?? '');

  recordAuditLog({
    actor,
    stationId: application.stationId,
    entityType: 'application',
    entityId: application.id,
    action: 'customer_access_password_viewed',
    summary: `Переглянуто тимчасовий пароль доступу за заявою ${application.applicationNumber}.`,
    after: {
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      notificationId: notification.id,
      login,
      hasTemporaryPassword: Boolean(temporaryPassword),
    },
  });

  return {
    login,
    temporaryPassword,
    notification: {
      id: mappedNotification.id,
      status: mappedNotification.status,
      createdAt: mappedNotification.createdAt,
      recipientEmail: mappedNotification.recipientEmail,
      hasTemporaryPassword: Boolean(temporaryPassword),
    },
  };
}

const resubmitPendingApplicationTransaction = db.transaction((applicationId, input) => {
  const current = getApplicationByIdStatement.get(applicationId);

  if (!current) {
    return null;
  }

  if (current.customerUserId) {
    throw new Error('Заяву вже прийнято. Подальша робота доступна через особистий кабінет.');
  }

  if (current.status !== 'needs_clarification') {
    throw new Error('Редагування доступне тільки якщо оператор повернув заяву на доповнення.');
  }

  const timestamp = getTimestamp();
  assertApplicationStatusTransition({
    actorRole: 'pending_application',
    comment: 'Заяву повторно подано після уточнення.',
    fromStatus: current.status,
    toStatus: 'submitted',
  });

  const deadlineData = buildInitialDeadlineData(input);

  updateApplicationStatement.run(
    input.stationId,
    current.applicationNumber,
    input.applicantFullName,
    normalizeLoginKey(input.applicantFullName),
    input.phone,
    normalizePhone(input.phone),
    input.email,
    input.objectAddress,
    input.connectionType,
    'submitted',
    input.receivedAt,
    input.responsibleName,
    input.notes,
    safeJson(input.appendixData || {}),
    safeJson(deadlineData),
    null,
    timestamp,
    applicationId,
  );

  updateChatStatement.run(
    `Заява ${current.applicationNumber}: ${input.applicantFullName}`,
    input.objectAddress,
    input.stationId,
    current.chatId,
  );

  recordApplicationStatusHistory({
    actor: { role: 'pending_application', fullName: input.applicantFullName },
    applicationId,
    comment: 'Заяву повторно подано після уточнення.',
    fromStatus: current.status,
    isVisibleToCustomer: true,
    timestamp,
    toStatus: 'submitted',
  });

  recordAuditLog({
    actor: { role: 'pending_application', fullName: input.applicantFullName },
    stationId: input.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'pending_resubmit',
    summary: `Pending-заяву ${current.applicationNumber} повторно подано після уточнення.`,
    before: mapApplication(current),
    after: {
      applicationId,
      applicationNumber: current.applicationNumber,
      status: 'submitted',
      stationId: input.stationId,
    },
  });

  return applicationId;
});

export function resubmitPendingApplication(applicationId, input) {
  const updatedId = resubmitPendingApplicationTransaction(applicationId, input);
  return updatedId ? getPendingApplicationById(updatedId) : null;
}

const acceptPendingApplicationTransaction = db.transaction((applicationId, {
  actor,
  passwordHash,
  temporaryPassword,
}) => {
  const current = getApplicationByIdStatement.get(applicationId);

  if (!current) {
    return null;
  }

  if (current.customerUserId) {
    return {
      applicationId,
      userId: current.customerUserId,
      createdUser: false,
      usedTemporaryPassword: false,
    };
  }

  assertApplicationStatusTransition({
    actorRole: actor?.role,
    comment: '',
    fromStatus: current.status,
    toStatus: 'accepted',
  });

  const timestamp = getTimestamp();
  const login = current.email;
  const loginNormalized = normalizeLoginKey(login);
  let user = findUserByNormalizedNameStatement.get(loginNormalized, loginNormalized);
  let createdUser = false;
  let usedTemporaryPassword = false;

  if (user) {
    user = mapUser(user);

    if (user.role !== 'customer') {
      throw new Error('Користувач з таким email уже існує, але не є замовником.');
    }

    if (user.stationId !== current.stationId) {
      throw new Error('Користувач з таким email належить іншій станції/компанії.');
    }
  } else {
    let fullName = current.applicantFullName;
    const duplicateName = findUserByNormalizedNameStatement.get(normalizeLoginKey(fullName), '__login_not_used__');

    if (duplicateName) {
      fullName = `${fullName} (${current.applicationNumber})`;
    }

    const userResult = createUserStatement.run(
      fullName,
      normalizeLoginKey(fullName),
      login,
      loginNormalized,
      passwordHash,
      'customer',
      current.stationId,
      actor?.id ?? null,
      timestamp,
    );

    user = getUserById(Number(userResult.lastInsertRowid));
    createdUser = true;
    usedTemporaryPassword = true;

    recordAuditLog({
      actor,
      stationId: current.stationId,
      entityType: 'user',
      entityId: user.id,
      action: 'create_from_pending_application',
      summary: `Створено кабінет замовника ${user.fullName} після прийняття pending-заяви ${current.applicationNumber}.`,
      after: { id: user.id, fullName: user.fullName, login: user.login, role: user.role, stationId: user.stationId },
    });
  }

  updateApplicationStatement.run(
    current.stationId,
    current.applicationNumber,
    current.applicantFullName,
    normalizeLoginKey(current.applicantFullName),
    current.phone,
    normalizePhone(current.phone),
    current.email,
    current.objectAddress,
    current.connectionType,
    'accepted',
    current.receivedAt,
    current.responsibleName,
    current.notes,
    current.appendixData,
    current.deadlineData,
    user.id,
    timestamp,
    applicationId,
  );

  addChatMemberStatement.run(current.chatId, user.id, timestamp);
  deactivatePendingTokensForApplicationStatement.run(applicationId);
  deletePendingSessionsForApplicationStatement.run(applicationId);

  recordApplicationStatusHistory({
    actor,
    applicationId,
    comment: createdUser
      ? 'Заяву прийнято. Для замовника підготовлено доступ до особистого кабінету.'
      : 'Заяву прийнято та прив’язано до наявного кабінету замовника.',
    fromStatus: current.status,
    isVisibleToCustomer: true,
    timestamp,
    toStatus: 'accepted',
  });

  const updatedApplication = getApplicationById(applicationId);
  createCustomerAccessNotification(
    updatedApplication,
    user,
    usedTemporaryPassword ? temporaryPassword : '',
    timestamp,
  );

  recordAuditLog({
    actor,
    stationId: current.stationId,
    entityType: 'application',
    entityId: applicationId,
    action: 'accept_pending_application',
    summary: `Pending-заяву ${current.applicationNumber} прийнято в обробку.`,
    before: mapApplication(current),
    after: {
      applicationId,
      applicationNumber: current.applicationNumber,
      status: 'accepted',
      customerUserId: user.id,
      createdUser,
    },
  });

  recordAuditLog({
    actor,
    stationId: current.stationId,
    entityType: 'pending_access_token',
    entityId: applicationId,
    action: 'deactivate',
    summary: `Тимчасовий доступ до заяви ${current.applicationNumber} деактивовано після прийняття.`,
    after: { applicationId, applicationNumber: current.applicationNumber },
  });

  recordAuditLog({
    actor,
    stationId: current.stationId,
    entityType: 'email_notification',
    entityId: applicationId,
    action: 'prepare_access_email',
    summary: `Підготовлено email-повідомлення з доступом до кабінету за заявою ${current.applicationNumber}.`,
    after: { applicationId, applicationNumber: current.applicationNumber, recipientEmail: current.email },
  });

  return {
    applicationId,
    userId: user.id,
    createdUser,
    usedTemporaryPassword,
  };
});

export function acceptPendingApplication(applicationId, input) {
  const result = acceptPendingApplicationTransaction(applicationId, input);

  if (!result) {
    return null;
  }

  return {
    application: getApplicationById(result.applicationId),
    user: getUserById(result.userId),
    createdUser: result.createdUser,
    usedTemporaryPassword: result.usedTemporaryPassword,
  };
}

const updateApplicationStageTransaction = db.transaction((applicationId, stageId, input, actor) => {
  const currentApplication = getApplicationByIdStatement.get(applicationId);
  const currentStage = getApplicationStageByIdStatement.get(stageId, applicationId);

  if (!currentApplication || !currentStage) {
    return null;
  }

  if (isClosedApplicationStatus(currentApplication.status)) {
    throw new Error('Заяву закрито. Відновіть заяву, щоб змінювати етапи.');
  }

  if (input.status === 'not_required' && !currentStage.isOptional) {
    throw new Error('Статус "Не потрібно" можна встановити тільки для етапів за необхідності.');
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
  const previousStage = mapApplicationStage(currentStage);

  if (shouldCreateStageNotification(previousStage, updatedStage)) {
    createStageNotification(
      updatedApplication,
      updatedStage,
      timestamp,
      updatedStage.status === 'completed' ? 'stage_completed' : 'stage_updated',
    );
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

export function lookupPublicApplication({ email, applicationNumber }, metadata = {}) {
  const row = publicApplicationLookupByEmailStatement.get(
    applicationNumber || '',
    email || '',
  );

  if (!row) {
    return null;
  }

  const application = getApplicationByIdStatement.get(row.id);
  const publicApplication = mapApplication(application, {
    includeHiddenStages: false,
    includePrivate: false,
    includePrivateStatusHistory: false,
  });

  if (application.customerUserId) {
    recordAuditLog({
      actor: { role: 'guest', fullName: 'Публічна перевірка' },
      stationId: application.stationId,
      entityType: 'application',
      entityId: application.id,
      action: 'status_lookup_success',
      summary: `Публічна перевірка заяви ${application.applicationNumber}: заяву вже прийнято.`,
      after: { applicationNumber: application.applicationNumber, emailMatched: true },
    });

    return {
      application: publicApplication,
      requiresLogin: true,
      accessToken: '',
    };
  }

  const timestamp = getTimestamp();
  const rawToken = createPendingRawToken();
  const expiresAt = getPendingAccessExpiry();
  const tokenResult = insertPendingAccessTokenStatement.run(
    application.id,
    hashPendingToken(rawToken),
    timestamp,
    expiresAt,
    metadata.ip ?? '',
    metadata.userAgent ?? '',
  );
  const accessTokenId = Number(tokenResult.lastInsertRowid);
  const sessionToken = createSessionToken();

  insertPendingSessionStatement.run(
    sessionToken,
    application.id,
    accessTokenId,
    timestamp,
    expiresAt,
    timestamp,
  );

  recordAuditLog({
    actor: { role: 'guest', fullName: 'Публічна перевірка' },
    stationId: application.stationId,
    entityType: 'application',
    entityId: application.id,
    action: 'status_lookup_success',
    summary: `Публічна перевірка заяви ${application.applicationNumber}: підготовлено нове посилання тимчасового доступу.`,
    after: {
      applicationNumber: application.applicationNumber,
      accessTokenId,
      emailMatched: true,
    },
  });

  recordAuditLog({
    actor: { role: 'guest', fullName: 'Публічна перевірка' },
    stationId: application.stationId,
    entityType: 'pending_application_session',
    entityId: application.id,
    action: 'create',
    summary: `Створено pending-сесію через публічну перевірку заяви ${application.applicationNumber}.`,
    after: { applicationId: application.id, applicationNumber: application.applicationNumber },
  });

  return {
    application: publicApplication,
    requiresLogin: false,
    sessionToken,
  };
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

const createMessageTransaction = db.transaction((chatId, userId, body, files, actor = null) => {
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

  const applicationLink = applicationChatAccessStatement.get(chatId);
  let notificationApplicationId = null;

  if (applicationLink && actor?.role !== 'customer') {
    const application = getApplicationById(applicationLink.id);
    createChatMessageNotification(application, actor, body, files, createdAt);
    notificationApplicationId = application.id;
  } else if (applicationLink && actor?.role === 'customer') {
    const application = getApplicationById(applicationLink.id);
    createManagerChatMessageNotification(application, actor, body, files, createdAt);
    notificationApplicationId = application.id;
  }

  return { messageId, notificationApplicationId };
});

export function createMessage({ chatId, userId, body, files, actor = null }) {
  return createMessageTransaction(chatId, userId, body, files, actor);
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

export function deleteGeneratedDocument(documentId, actor) {
  const document = getGeneratedDocumentById(documentId);

  if (!document) {
    return null;
  }

  deleteGeneratedDocumentStatement.run(documentId);

  recordAuditLog({
    actor,
    stationId: document.stationId,
    entityType: 'generated_document',
    entityId: document.id,
    action: 'delete',
    summary: `Видалено згенерований документ "${document.title}".`,
    before: document,
  });

  return document;
}

export function setApplicationStageFinalFile(applicationId, stageId, file, actor) {
  const currentStage = getApplicationStageByIdStatement.get(stageId, applicationId);

  if (!currentStage) {
    return null;
  }

  const currentApplication = getApplicationByIdStatement.get(applicationId);

  if (isClosedApplicationStatus(currentApplication?.status)) {
    throw new Error('Заяву закрито. Відновіть заяву, щоб змінювати файли етапів.');
  }

  const currentCount = Number(countApplicationStageFilesStatement.get(applicationId, stageId)?.count ?? 0);

  if (currentCount >= 5) {
    throw new Error('До одного етапу можна додати не більше 5 файлів.');
  }

  const timestamp = getTimestamp();
  const result = insertApplicationStageFileStatement.run(
    applicationId,
    stageId,
    file.filename,
    file.originalname,
    file.mimetype || 'application/octet-stream',
    file.size,
    actor?.id ?? null,
    timestamp,
  );
  updateApplicationTouchedStatement.run(timestamp, applicationId);
  const application = getApplicationById(applicationId);
  const updatedStage = application.stages.find((stage) => stage.id === stageId);
  const uploadedFile = getApplicationStageFileById(Number(result.lastInsertRowid));

  recordAuditLog({
    actor,
    stationId: application.stationId,
    entityType: 'application_stage',
    entityId: stageId,
    action: 'upload_final_file',
    summary: `Додано остаточний файл "${uploadedFile.originalName}" до етапу "${updatedStage.title}" у заяві ${application.applicationNumber}.`,
    before: mapApplicationStage(currentStage),
    after: updatedStage,
  });

  return {
    application,
    previousFileName: '',
  };
}

export function clearApplicationStageFinalFile(applicationId, fileId, actor) {
  const currentFile = getApplicationStageFileById(fileId);

  if (!currentFile || currentFile.applicationId !== applicationId) {
    return null;
  }

  const currentApplication = getApplicationByIdStatement.get(applicationId);

  if (isClosedApplicationStatus(currentApplication?.status)) {
    throw new Error('Заяву закрито. Відновіть заяву, щоб змінювати файли етапів.');
  }

  const timestamp = getTimestamp();
  deleteApplicationStageFileStatement.run(fileId);
  updateApplicationTouchedStatement.run(timestamp, applicationId);
  const application = getApplicationById(applicationId);

  recordAuditLog({
    actor,
    stationId: application.stationId,
    entityType: 'application_stage',
    entityId: currentFile.stageId,
    action: 'delete_final_file',
    summary: `Видалено остаточний файл "${currentFile.originalName}" з етапу "${currentFile.stageTitle}" у заяві ${application.applicationNumber}.`,
    before: currentFile,
  });

  return {
    application,
    previousFileName: currentFile.storedName || '',
  };
}

export function getApplicationStageFileById(fileId) {
  const row = getApplicationStageFileByIdStatement.get(fileId);
  return row ? { ...mapApplicationStageFile(row), stageTitle: row.stageTitle } : null;
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
