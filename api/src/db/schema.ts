import db from './index.js';

function columnExists(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return rows.some((r) => r.name === columnName);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('curator', 'worker', 'director')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exhibitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_date TEXT,
      end_date TEXT,
      opening_confirmed INTEGER NOT NULL DEFAULT 0,
      opening_confirmed_at TEXT,
      opening_confirmed_by TEXT REFERENCES users(id),
      read_only INTEGER NOT NULL DEFAULT 0,
      anomaly_readonly INTEGER NOT NULL DEFAULT 0,
      anomaly_reason TEXT,
      anomaly_at TEXT,
      anomaly_by TEXT REFERENCES users(id),
      teardown_responsible TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      exhibition_id TEXT REFERENCES exhibitions(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      phase TEXT NOT NULL DEFAULT 'pre_exhibition' CHECK(phase IN ('pre_exhibition', 'opening', 'teardown')),
      category TEXT NOT NULL CHECK(category IN (
        'planning', 'design', 'construction', 'installation',
        'lighting', 'exhibit_placement', 'quality_check', 'opening_preparation'
      )),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked')),
      progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
      assignee_role TEXT NOT NULL CHECK(assignee_role IN ('curator', 'worker', 'director')),
      assigned_to TEXT REFERENCES users(id),
      due_date TEXT,
      started_at TEXT,
      completed_at TEXT,
      transport_window_start TEXT,
      transport_window_end TEXT,
      insurance_status TEXT NOT NULL DEFAULT 'not_insured' CHECK(insurance_status IN ('not_insured', 'insured', 'claim_in_progress')),
      lighting_check TEXT NOT NULL DEFAULT 'pending' CHECK(lighting_check IN ('pending', 'passed', 'failed')),
      hoisting_order INTEGER,
      earliest_start TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
      depends_on_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(task_id, depends_on_task_id)
    );

    CREATE TABLE IF NOT EXISTS exhibits (
      id TEXT PRIMARY KEY,
      exhibition_id TEXT REFERENCES exhibitions(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      artist TEXT,
      year TEXT,
      is_key_exhibit INTEGER NOT NULL DEFAULT 0,
      needs_thermostat INTEGER NOT NULL DEFAULT 0,
      thermostat_confirmed INTEGER NOT NULL DEFAULT 0,
      thermostat_confirmed_at TEXT,
      thermostat_confirmed_by TEXT REFERENCES users(id),
      restoration_confirmed INTEGER NOT NULL DEFAULT 0,
      restoration_confirmed_at TEXT,
      restoration_confirmed_by TEXT REFERENCES users(id),
      placement_task_id TEXT REFERENCES tasks(id),
      status TEXT NOT NULL DEFAULT 'not_arrived' CHECK(status IN ('not_arrived', 'in_storage', 'placed', 'in_position')),
      position TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_updates (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
      progress INTEGER NOT NULL CHECK(progress >= 0 AND progress <= 100),
      status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked')),
      comment TEXT,
      updated_by TEXT REFERENCES users(id) NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_audit_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
      exhibition_id TEXT REFERENCES exhibitions(id) ON DELETE CASCADE NOT NULL,
      log_type TEXT NOT NULL CHECK(log_type IN ('reschedule', 'review', 'closure', 'anomaly', 'phase_change')),
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      changed_by TEXT REFERENCES users(id) NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_exhibition ON tasks(exhibition_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase);
    CREATE INDEX IF NOT EXISTS idx_tasks_hoisting ON tasks(hoisting_order);
    CREATE INDEX IF NOT EXISTS idx_exhibits_exhibition ON exhibits(exhibition_id);
    CREATE INDEX IF NOT EXISTS idx_progress_updates_task ON progress_updates(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_task ON task_audit_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_exhibition ON task_audit_logs(exhibition_id);
  `);

  // Migrate: add exhibitions columns
  if (!columnExists('exhibitions', 'anomaly_readonly')) {
    db.exec(`ALTER TABLE exhibitions ADD COLUMN anomaly_readonly INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists('exhibitions', 'anomaly_reason')) {
    db.exec(`ALTER TABLE exhibitions ADD COLUMN anomaly_reason TEXT`);
  }
  if (!columnExists('exhibitions', 'anomaly_at')) {
    db.exec(`ALTER TABLE exhibitions ADD COLUMN anomaly_at TEXT`);
  }
  if (!columnExists('exhibitions', 'anomaly_by')) {
    db.exec(`ALTER TABLE exhibitions ADD COLUMN anomaly_by TEXT REFERENCES users(id)`);
  }
  if (!columnExists('exhibitions', 'teardown_responsible')) {
    db.exec(`ALTER TABLE exhibitions ADD COLUMN teardown_responsible TEXT REFERENCES users(id)`);
  }

  // Migrate: add tasks columns
  if (!columnExists('tasks', 'phase')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN phase TEXT NOT NULL DEFAULT 'pre_exhibition' CHECK(phase IN ('pre_exhibition', 'opening', 'teardown'))`);
  }
  if (!columnExists('tasks', 'transport_window_start')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN transport_window_start TEXT`);
  }
  if (!columnExists('tasks', 'transport_window_end')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN transport_window_end TEXT`);
  }
  if (!columnExists('tasks', 'insurance_status')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN insurance_status TEXT NOT NULL DEFAULT 'not_insured' CHECK(insurance_status IN ('not_insured', 'insured', 'claim_in_progress'))`);
  }
  if (!columnExists('tasks', 'lighting_check')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN lighting_check TEXT NOT NULL DEFAULT 'pending' CHECK(lighting_check IN ('pending', 'passed', 'failed'))`);
  }
  if (!columnExists('tasks', 'hoisting_order')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN hoisting_order INTEGER`);
  }
  if (!columnExists('tasks', 'earliest_start')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN earliest_start TEXT`);
  }

  // Migrate: add exhibits columns
  if (!columnExists('exhibits', 'restoration_confirmed')) {
    db.exec(`ALTER TABLE exhibits ADD COLUMN restoration_confirmed INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists('exhibits', 'restoration_confirmed_at')) {
    db.exec(`ALTER TABLE exhibits ADD COLUMN restoration_confirmed_at TEXT`);
  }
  if (!columnExists('exhibits', 'restoration_confirmed_by')) {
    db.exec(`ALTER TABLE exhibits ADD COLUMN restoration_confirmed_by TEXT REFERENCES users(id)`);
  }

  seedData();
}

function seedData(): void {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) return;

  const insertUser = db.prepare(
    'INSERT INTO users (id, username, name, role) VALUES (?, ?, ?, ?)'
  );

  insertUser.run('user_curator_001', 'curator1', '李策展', 'curator');
  insertUser.run('user_worker_001', 'worker1', '张施工', 'worker');
  insertUser.run('user_director_001', 'director1', '王馆长', 'director');
}
