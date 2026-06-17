import db from './index.js';

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      exhibition_id TEXT REFERENCES exhibitions(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
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

    CREATE INDEX IF NOT EXISTS idx_tasks_exhibition ON tasks(exhibition_id);
    CREATE INDEX IF NOT EXISTS idx_exhibits_exhibition ON exhibits(exhibition_id);
    CREATE INDEX IF NOT EXISTS idx_progress_updates_task ON progress_updates(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_task_id);
  `);

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
